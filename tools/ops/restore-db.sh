#!/usr/bin/env bash
# Restores a backup made by backup-db.sh into a database. It never touches the live database unless you name it.
#
#   tools/ops/restore-db.sh backups/rove-20261011T040000Z.dump rove_restore_check      # a scratch copy, to check a backup
#   FORCE=yes tools/ops/restore-db.sh backups/rove-....dump rove                        # replace the real database
#
# The target database is created if it does not exist. Restoring over an existing database needs FORCE=yes, and
# replaces its contents (the backup is the truth). Stop the backend first when restoring the real database.
# Container mode (default): docker container DB_CONTAINER (rove-postgres). Other servers: set RESTORE_URL to a server URL
# without a database name, e.g. postgresql://user:pass@host:5432
set -euo pipefail

file="${1:?usage: restore-db.sh <backup-file> <database-name>}"
target="${2:?usage: restore-db.sh <backup-file> <database-name>}"
[[ -s "$file" ]] || { echo "No such backup: $file" >&2; exit 1; }
[[ "$target" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Database name may only contain letters, digits and _" >&2; exit 1; }

user="${POSTGRES_USER:-rove}"
container="${DB_CONTAINER:-rove-postgres}"

if [[ -n "${RESTORE_URL:-}" ]]; then
  psql_admin() { psql "$RESTORE_URL/postgres" -v ON_ERROR_STOP=1 -tA "$@"; }
  restore() { pg_restore --no-owner --no-privileges --exit-on-error -d "$RESTORE_URL/$target"; }
else
  psql_admin() { docker exec -i "$container" psql -U "$user" -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
  restore() { docker exec -i "$container" pg_restore --no-owner --no-privileges --exit-on-error -U "$user" -d "$target"; }
fi

exists="$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname = '$target'")"
if [[ "$exists" == "1" ]]; then
  if [[ "${FORCE:-}" != "yes" ]]; then
    echo "Database $target already exists. Re-run with FORCE=yes to replace it." >&2
    exit 1
  fi
  psql_admin -c "DROP DATABASE \"$target\" WITH (FORCE)" >/dev/null
fi
psql_admin -c "CREATE DATABASE \"$target\"" >/dev/null
restore < "$file"
echo "Restored $file into database $target"
