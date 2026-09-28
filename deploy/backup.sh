#!/usr/bin/env bash
# Nightly KOVA database backup on the VM. Installed at ~/kova-deploy/bin/backup.sh and run by cron.
#
#   0 3 * * *  ~/kova-deploy/bin/backup.sh >> ~/kova-deploy/backups/backup.log 2>&1
#
# Writes a pg_dump custom-format file, checks it can be listed by pg_restore, keeps the newest 14.
# Restore (into a stopped or fresh database):
#   sudo docker exec -i kova-postgres-1 pg_restore -U kova -d kova --clean --if-exists < FILE
set -euo pipefail

DIR="${KOVA_BACKUP_DIR:-$HOME/kova-deploy/backups}"
KEEP="${KOVA_BACKUP_KEEP:-14}"
CONTAINER="${KOVA_POSTGRES_CONTAINER:-kova-postgres-1}"
umask 077
mkdir -p "$DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$DIR/kova-$stamp.dump"
tmp="$file.partial"

sudo -n docker exec "$CONTAINER" pg_dump -U kova -d kova --format=custom --no-owner > "$tmp"
# A dump that pg_restore can't read is not a backup.
sudo -n docker exec -i "$CONTAINER" pg_restore --list < "$tmp" > /dev/null
mv "$tmp" "$file"
echo "$(date -u +%FT%TZ) ok $file $(stat -c %s "$file") bytes"

ls -1t "$DIR"/kova-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm -f --
