#!/bin/sh
set -eu

APP_DIR=${APP_DIR:-/srv/apps/orien_comercial/app}
LOG_DIR=${LOG_DIR:-/srv/apps/orien_comercial/backups}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:3334/health}
LOG_FILE="$LOG_DIR/health-monitor.log"

mkdir -p "$LOG_DIR"
if payload=$(curl --fail --silent --show-error --max-time 12 "$HEALTH_URL"); then
  printf '%s status=ok payload=%s\n' "$(date -u +%FT%TZ)" "$payload" >> "$LOG_FILE"
  exit 0
fi

message="Orien health check failed at $(date -u +%FT%TZ)"
printf '%s status=failed\n' "$message" >> "$LOG_FILE"

if [ -f "$APP_DIR/.env" ]; then
  webhook_url=$(sed -n 's/^HEALTHCHECK_WEBHOOK_URL=//p' "$APP_DIR/.env" | tail -n 1)
  if [ -n "$webhook_url" ]; then
    curl --silent --show-error --max-time 12 --retry 1 \
      -H 'Content-Type: application/json' \
      --data "{\"text\":\"$message\"}" \
      "$webhook_url" >/dev/null || true
  fi
fi

exit 1
