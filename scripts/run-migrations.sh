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

ensure_ready() {
  command -v docker >/dev/null 2>&1 || fail "docker command not found"
  [ -d "$MIGRATION_DIR" ] || fail "Migration directory not found: $MIGRATION_DIR"

  set -- "$MIGRATION_DIR"/*.sql
  [ -e "$1" ] || fail "No .sql migration files found in $MIGRATION_DIR"

  info "Checking postgres connectivity"
  psql_exec -c "SELECT 1;" >/dev/null || fail "Postgres is not reachable via docker compose service '$POSTGRES_SERVICE'"

  info "Ensuring schema_migrations table"
  psql_exec -c "
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  " >/dev/null
}

apply_migration() {
  file=$1
  filename=$(basename "$file")
  checksum=$(checksum_file "$file")
  filename_sql=$(sql_literal "$filename")
  checksum_sql=$(sql_literal "$checksum")
  existing=$(psql_scalar "SELECT checksum FROM schema_migrations WHERE filename = $filename_sql;")

  if [ -n "$existing" ]; then
    if [ "$existing" != "$checksum" ]; then
      fail "SECURITY WARNING: checksum mismatch for $filename. Historical migration was edited. Expected $existing, found $checksum"
    fi
    warn "Skipping already applied migration: $filename"
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  info "Applying migration: $filename"
  {
    printf 'BEGIN;\n'
    cat "$file"
    printf '\nINSERT INTO schema_migrations (filename, checksum) VALUES (%s, %s);\n' "$filename_sql" "$checksum_sql"
    printf 'COMMIT;\n'
  } | psql_exec >/dev/null
  ok "Applied migration: $filename"
  APPLIED=$((APPLIED + 1))
}

ensure_ready

APPLIED=0
SKIPPED=0

find "$MIGRATION_DIR" -maxdepth 1 -type f -name '*.sql' -print | sort | while IFS= read -r file; do
  apply_migration "$file"
  printf '%s %s\n' "$APPLIED" "$SKIPPED" > /tmp/opencall-migration-counts.$$
done

if [ -f /tmp/opencall-migration-counts.$$ ]; then
  # shell pipelines run in subshells on POSIX sh, so read counters back.
  set -- $(cat /tmp/opencall-migration-counts.$$)
  APPLIED=$1
  SKIPPED=$2
  rm -f /tmp/opencall-migration-counts.$$
fi

ok "Migration run complete. Applied: $APPLIED, skipped: $SKIPPED"
