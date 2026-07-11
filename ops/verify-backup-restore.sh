#!/bin/sh
set -eu

APP_DIR=${APP_DIR:-/srv/apps/orien_comercial/app}
BACKUP=${1:?Informe o arquivo .dump a validar}
DB="orien_restore_check_$(date -u +%Y%m%d%H%M%S)"

test -s "$BACKUP"
cd "$APP_DIR"
cleanup() {
  docker compose -f docker-compose.prod.yml exec -T postgres \
    dropdb -U sgc_owner --if-exists "$DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker compose -f docker-compose.prod.yml exec -T postgres createdb -U sgc_owner "$DB"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U sgc_owner -d "$DB" --no-owner --no-acl < "$BACKUP"
COUNT=$(docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U sgc_owner -d "$DB" -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
test "$COUNT" -gt 10
printf 'restore_ok database=%s tables=%s\n' "$DB" "$COUNT"
