#!/usr/bin/env bash
set -euo pipefail

# Executa a suite critica em um banco descartavel, no mesmo Docker host da VPS.
# Nunca use DATABASE_URL de producao neste script.

ROOT_DIR="${ORIEN_ROOT_DIR:-/srv/apps/orien_comercial/app}"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
ENV_FILE="${ROOT_DIR}/.env"
E2E_DATABASE="${ORIEN_E2E_DATABASE:-orien_e2e}"

if [[ ! "${E2E_DATABASE}" =~ ^orien_e2e(_[a-z0-9_]+)?$ ]]; then
  echo "Banco E2E invalido: ${E2E_DATABASE}. Use orien_e2e ou um sufixo seguro." >&2
  exit 64
fi

cd "${ROOT_DIR}"
source "${ENV_FILE}"

: "${POSTGRES_OWNER_PASSWORD:?POSTGRES_OWNER_PASSWORD ausente no .env}"

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

e2e_url="postgresql://sgc_owner:${POSTGRES_OWNER_PASSWORD}@postgres:5432/${E2E_DATABASE}"

cleanup() {
  compose exec -T postgres psql -U sgc_owner -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${E2E_DATABASE}' AND pid <> pg_backend_pid();" >/dev/null
  compose exec -T postgres psql -U sgc_owner -d postgres -c "DROP DATABASE IF EXISTS ${E2E_DATABASE};" >/dev/null
}

trap cleanup EXIT

cleanup
compose exec -T postgres psql -U sgc_owner -d postgres -c "CREATE DATABASE ${E2E_DATABASE} OWNER sgc_owner;" >/dev/null

common_env=(
  -e "NODE_ENV=test"
  -e "APP_ENV=e2e"
  -e "DATABASE_URL=${e2e_url}"
  -e "DATABASE_MIGRATION_URL=${e2e_url}"
  -e "REDIS_URL=redis://redis:6379"
  -e "COOKIE_SECURE=false"
  -e "JWT_ACCESS_SECRET=e2e-access-secret-at-least-thirty-two-chars"
  -e "JWT_REFRESH_SECRET=e2e-refresh-secret-at-least-thirty-two-chars"
  -e "COOKIE_SECRET=e2e-cookie-secret-at-least-thirty-two-chars"
  -e "PASSWORD_PEPPER=e2e-password-pepper"
  -e "INTEGRATIONS_ENCRYPTION_KEY=e2e-integrations-key-at-least-thirty-two"
  -e "PLATFORM_OWNER_EMAIL=e2e-owner@orien.test"
  -e "PLATFORM_OWNER_PASSWORD=E2eOwner123!"
)

compose build migrate api >/dev/null
compose run --rm "${common_env[@]}" migrate pnpm db:migrate
compose run --rm --no-deps "${common_env[@]}" api pnpm test:e2e

echo "Suite E2E aprovada no banco descartavel ${E2E_DATABASE}."
