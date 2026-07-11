#!/bin/sh
set -eu

APP_DIR=${APP_DIR:-/srv/apps/orien_comercial/app}
BACKUP_DIR=${BACKUP_DIR:-/srv/apps/orien_comercial/backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET="$BACKUP_DIR/orien-$STAMP.dump"

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U sgc_owner -d sgc --format=custom --no-owner --no-acl > "$TARGET"
test -s "$TARGET"
sha256sum "$TARGET" > "$TARGET.sha256"
find "$BACKUP_DIR" -type f \( -name 'orien-*.dump' -o -name 'orien-*.dump.sha256' \) \
  -mtime "+$RETENTION_DAYS" -delete
printf '%s\n' "$TARGET"
