#!/bin/sh
set -eu

APP_DIR=${APP_DIR:-/srv/apps/orien_comercial/app}
CREDENTIALS_FILE=${CREDENTIALS_FILE:-/srv/apps/orien_comercial/ops/homologation-credentials.txt}

umask 077
password=$(openssl rand -base64 24 | tr -d '\n')
cd "$APP_DIR"
HOMOLOGATION_SEED_PASSWORD="$password" docker compose -f docker-compose.prod.yml run --rm --no-deps api \
  pnpm --filter @sgc/db seed:homologation

{
  printf 'Homologacao Orien - gerado em %s UTC\n\n' "$(date -u +%FT%TZ)"
  printf 'Senha temporaria comum: %s\n' "$password"
  printf 'Todos os acessos exigem troca de senha no primeiro login.\n\n'
  for tenant in homolog-horizonte homolog-aurora; do
    printf '%s\n' "$tenant"
    for role in owner admin manager seller cashier stock finance; do
      printf '%s.%s@orien.test\n' "$role" "$tenant"
    done
    printf '\n'
  done
} > "$CREDENTIALS_FILE"
chmod 600 "$CREDENTIALS_FILE"
printf '%s\n' "$CREDENTIALS_FILE"
