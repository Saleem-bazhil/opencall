#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd "$SCRIPT_DIR/.." && pwd)
MIGRATION_DIR=${MIGRATION_DIR:-"$ROOT_DIR/infra/postgres/migrations"}
POSTGRES_SERVICE=${POSTGRES_SERVICE:-postgres}
POSTGRES_USER=${POSTGRES_USER:-opencall}
POSTGRES_DB=${POSTGRES_DB:-opencall}

if [ -t 1 ]; then
  RED=$(printf '\033[31m')
  GREEN=$(printf '\033[32m')
  YELLOW=$(printf '\033[33m')
  BLUE=$(printf '\033[34m')
  RESET=$(printf '\033[0m')
else
  RED=""
  GREEN=""
  YELLOW=""
  BLUE=""
  RESET=""
fi

log() { printf '%s\n' "$*"; }
info() { log "${BLUE}==>${RESET} $*"; }
ok() { log "${GREEN}OK${RESET} $*"; }
warn() { log "${YELLOW}WARN${RESET} $*"; }
fail() { log "${RED}ERROR${RESET} $*" >&2; exit 1; }

checksum_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$1" | awk '{print $NF}'
  else
    fail "No SHA256 tool found. Install sha256sum, shasum, or openssl."
  fi
}

sql_literal() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"
}

psql_exec() {
  docker compose exec -T "$POSTGRES_SERVICE" \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

psql_scalar() {
  psql_exec -t -A -c "$1" | tr -d '\r'
}

command -v docker >/dev/null 2>&1 || fail "docker command not found"
[ -d "$MIGRATION_DIR" ] || fail "Migration directory not found: $MIGRATION_DIR"

set -- "$MIGRATION_DIR"/*.sql
[ -e "$1" ] || fail "No .sql migration files found in $MIGRATION_DIR"

info "Checking postgres connectivity"
psql_exec -c "SELECT 1;" >/dev/null || fail "Postgres is not reachable via docker compose service '$POSTGRES_SERVICE'"
ok "Postgres reachable"

info "Checking schema_migrations table"
table_exists=$(psql_scalar "SELECT to_regclass('public.schema_migrations') IS NOT NULL;")
[ "$table_exists" = "t" ] || fail "schema_migrations table does not exist. Run scripts/run-migrations.sh first."
ok "schema_migrations exists"

info "Checking duplicate migration filenames"
duplicates=$(find "$MIGRATION_DIR" -maxdepth 1 -type f -name '*.sql' -exec basename {} \; | sort | uniq -d)
[ -z "$duplicates" ] || fail "Duplicate migration filenames found: $duplicates"
ok "No duplicate filenames"

info "Checking sorted migration order"
previous=""
find "$MIGRATION_DIR" -maxdepth 1 -type f -name '*.sql' -exec basename {} \; | sort | while IFS= read -r filename; do
  if [ -n "$previous" ] && [ "$previous" \> "$filename" ]; then
    fail "Migration order error: $previous before $filename"
  fi
  previous=$filename
done
ok "Migration ordering is deterministic"

info "Checking checksum integrity"
MISMATCHES=0

psql_exec -t -A -F '|' -c "SELECT filename, checksum FROM schema_migrations ORDER BY filename;" | while IFS='|' read -r filename stored_checksum; do
  [ -n "$filename" ] || continue
  file="$MIGRATION_DIR/$filename"
  if [ ! -f "$file" ]; then
    warn "Applied migration missing locally: $filename"
    MISMATCHES=$((MISMATCHES + 1))
  else
    current_checksum=$(checksum_file "$file")
    if [ "$current_checksum" != "$stored_checksum" ]; then
      warn "Checksum mismatch: $filename"
      MISMATCHES=$((MISMATCHES + 1))
    fi
  fi
  printf '%s\n' "$MISMATCHES" > /tmp/opencall-migration-check-count.$$
done

if [ -f /tmp/opencall-migration-check-count.$$ ]; then
  MISMATCHES=$(cat /tmp/opencall-migration-check-count.$$)
  rm -f /tmp/opencall-migration-check-count.$$
fi

[ "$MISMATCHES" -eq 0 ] || fail "Migration checksum validation failed with $MISMATCHES issue(s)"
ok "All applied migration checksums are valid"

ok "Migration check complete"
