#!/usr/bin/env sh
set -eu

for file in /opencall-migrations/*.sql; do
  echo "Applying migration: ${file}"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$file"
done

for file in /opencall-seeds/*.sql; do
  echo "Applying seed: ${file}"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$file"
done
