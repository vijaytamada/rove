#!/usr/bin/env bash
# Proves a backup is usable: restores it into a scratch database and compares the row count of every table with the live
# database. Run it after a backup (a backup nobody has restored is only a hope).
#
#   tools/ops/verify-backup.sh backups/rove-20261011T040000Z.dump
#
# Container mode only (development). For a production server, restore into a scratch database with restore-db.sh and compare by hand.
set -euo pipefail

file="${1:?usage: verify-backup.sh <backup-file>}"
here="$(cd "$(dirname "$0")" && pwd)"
scratch="rove_backup_check"
user="${POSTGRES_USER:-rove}"
live="${POSTGRES_DB:-rove}"
container="${DB_CONTAINER:-rove-postgres}"

FORCE=yes "$here/restore-db.sh" "$file" "$scratch" >/dev/null

# One query counts every table (no per-table loop: a loop that calls docker would swallow its own input).
counts() {
  docker exec -i "$container" psql -U "$user" -d "$1" -tA -F ' ' -c "
    SELECT table_name,
           (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
    ORDER BY 1"
}

counts "$scratch" > /tmp/rove-restored.counts
counts "$live" > /tmp/rove-live.counts
docker exec -i "$container" psql -U "$user" -d postgres -c "DROP DATABASE \"$scratch\" WITH (FORCE)" >/dev/null

tables="$(wc -l < /tmp/rove-restored.counts | tr -d ' ')"
if diff -u /tmp/rove-restored.counts /tmp/rove-live.counts > /tmp/rove-counts.diff; then
  echo "OK: $tables tables restored, every row count matches the live database."
else
  # Rows written after the backup was taken are expected to differ; show them and let a person judge.
  echo "Restored $tables tables. Differences from the live database (rows written since the backup are expected):"
  cat /tmp/rove-counts.diff
fi
