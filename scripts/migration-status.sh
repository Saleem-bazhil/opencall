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
section() { log ""; log "${BLUE}$*${RESET}"; }
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

psql_exec -c "SELECT 1;" >/dev/null || fail "Postgres is not reachable via docker compose service '$POSTGRES_SERVICE'"

table_exists=$(psql_scalar "SELECT to_regclass('public.schema_migrations') IS NOT NULL;")

section "Applied migrations"
if [ "$table_exists" = "t" ]; then
  psql_exec -P pager=off -c "SELECT filename, checksum, executed_at FROM schema_migrations ORDER BY filename;"
else
  log "${YELLOW}schema_migrations table does not exist${RESET}"
fi

section "Pending migrations"
PENDING=0
find "$MIGRATION_DIR" -maxdepth 1 -type f -name '*.sql' -print | sort | while IFS= read -r file; do
  filename=$(basename "$file")
  filename_sql=$(sql_literal "$filename")
  if [ "$table_exists" != "t" ]; then
    log "$filename"
    PENDING=$((PENDING + 1))
  else
    applied=$(psql_scalar "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = $filename_sql);")
    if [ "$applied" != "t" ]; then
      log "$filename"
      PENDING=$((PENDING + 1))
    fi
  fi
  printf '%s\n' "$PENDING" > /tmp/opencall-migration-pending-count.$$
done

if [ -f /tmp/opencall-migration-pending-count.$$ ]; then
  PENDING=$(cat /tmp/opencall-migration-pending-count.$$)
  rm -f /tmp/opencall-migration-pending-count.$$
fi
[ "$PENDING" -gt 0 ] || log "${GREEN}none${RESET}"

section "Checksum mismatches"
MISMATCHES=0
if [ "$table_exists" = "t" ]; then
  psql_exec -t -A -F '|' -c "SELECT filename, checksum FROM schema_migrations ORDER BY filename;" | while IFS='|' read -r filename stored_checksum; do
    [ -n "$filename" ] || continue
    file="$MIGRATION_DIR/$filename"
    if [ ! -f "$file" ]; then
      log "${RED}$filename missing locally${RESET}"
      MISMATCHES=$((MISMATCHES + 1))
    else
      current_checksum=$(checksum_file "$file")
      if [ "$current_checksum" != "$stored_checksum" ]; then
        log "${RED}$filename checksum changed${RESET}"
        MISMATCHES=$((MISMATCHES + 1))
      fi
    fi
    printf '%s\n' "$MISMATCHES" > /tmp/opencall-migration-mismatch-count.$$
  done
fi

if [ -f /tmp/opencall-migration-mismatch-count.$$ ]; then
  MISMATCHES=$(cat /tmp/opencall-migration-mismatch-count.$$)
  rm -f /tmp/opencall-migration-mismatch-count.$$
fi
[ "$MISMATCHES" -gt 0 ] || log "${GREEN}none${RESET}"

log ""
log "Summary: pending=$PENDING mismatches=$MISMATCHES"
