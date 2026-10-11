#!/usr/bin/env bash
# Backs up the Rove database to a compressed file and deletes backups older than KEEP_DAYS.
#
#   tools/ops/backup-db.sh                       # development: dumps the docker container "rove-postgres"
#   DATABASE_URL=postgresql://... tools/ops/backup-db.sh   # anywhere else: uses pg_dump from this machine
#
# Settings (environment): BACKUP_DIR (default ./backups), KEEP_DAYS (default 14), DB_CONTAINER (default rove-postgres),
# POSTGRES_USER / POSTGRES_DB (defaults rove / rove, for the container mode).
# Run it from cron or a scheduler (for example every night) and copy BACKUP_DIR somewhere else: a backup on the same
# disk as the database is not a backup. Restore with tools/ops/restore-db.sh, and try a restore regularly.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/rove-$stamp.dump"

if [[ -n "${DATABASE_URL:-}" ]]; then
  # Custom format (-Fc) is compressed and lets pg_restore restore selectively. The URL's ?schema=... is not a libpq option.
  pg_dump -Fc --no-owner --no-privileges "${DATABASE_URL%%\?*}" > "$out.partial"
else
  docker exec "${DB_CONTAINER:-rove-postgres}" pg_dump -Fc --no-owner --no-privileges \
    -U "${POSTGRES_USER:-rove}" "${POSTGRES_DB:-rove}" > "$out.partial"
fi

# Only a complete, readable file gets the final name, so a half-written dump is never mistaken for a backup.
if [[ ! -s "$out.partial" ]]; then
  rm -f "$out.partial"
  echo "Backup failed: the dump is empty" >&2
  exit 1
fi
mv "$out.partial" "$out"
echo "Backup written: $out ($(wc -c < "$out") bytes)"

# Keep the last KEEP_DAYS days (and always the newest file).
find "$BACKUP_DIR" -maxdepth 1 -name 'rove-*.dump' -type f -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/Deleted old backup: /'
