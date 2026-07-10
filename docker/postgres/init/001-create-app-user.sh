#!/bin/sh
set -eu

: "${SGC_APP_PASSWORD:?SGC_APP_PASSWORD is required}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --set app_password="$SGC_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE sgc_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sgc_app')
\gexec
SQL
