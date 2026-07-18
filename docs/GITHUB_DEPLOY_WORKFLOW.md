# Workflow de Deploy pelo GitHub Actions

Este documento e o modelo oficial para publicar a Orien a partir do GitHub.
Ele ainda **nao ativa deploy algum**: serve para revisar os segredos, preparar
o compose de imagens e somente entao criar `.github/workflows/deploy-production.yml`.

## Objetivo

Publicar uma release manual e rastreavel em `/srv/apps/orien_comercial`, sem
copiar segredos para o GitHub, sem expor PostgreSQL/Redis e sem executar testes
contra o banco operacional.

O fluxo proposto e:

1. GitHub valida lint, copy, testes, E2E e build.
2. GitHub gera quatro imagens imutaveis no GHCR: API, painel, landing e
   backoffice.
3. A VPS faz backup do banco antes da migration.
4. A VPS baixa somente as imagens do commit aprovado, aplica migrations e
   recria os servicos da aplicacao.
5. Health checks confirmam API, painel, landing e backoffice.
6. Em falha, os containers voltam para as tags anteriores. Banco nao sofre
   rollback automatico: migration precisa ser sempre aditiva e reversivel por
   decisao operacional.

## Pre-requisitos na VPS

O diretorio produtivo deve continuar neste formato:

```text
/srv/apps/orien_comercial/
  app/        # docker compose, .env e configuracao de release
  data/       # PostgreSQL, Redis e uploads - nunca versionar
  backups/    # dumps antes de releases
  ops/        # Nginx, cron e scripts operacionais
```

Antes de habilitar o workflow, instalar no servidor:

```bash
apt-get update && apt-get install -y curl gzip
docker --version
docker compose version
```

O usuario SSH deve poder executar Docker sem senha. A VPS deve receber as
imagens do GHCR por um `GHCR_READ_TOKEN` de leitura ou por imagens publicas.

## Ajuste obrigatorio do Compose

O `docker-compose.prod.yml` atual usa `build:`. O workflow sincroniza o overlay
versionado `docker-compose.ghcr.yml` para `/srv/apps/orien_comercial/app/` antes
de cada deploy, substituindo cada `build:` por uma imagem imutavel:

```yaml
services:
  migrate:
    image: ${ORIEN_API_IMAGE}
    build: null
  api:
    image: ${ORIEN_API_IMAGE}
    build: null
  web:
    image: ${ORIEN_WEB_IMAGE}
    build: null
  marketing:
    image: ${ORIEN_MARKETING_IMAGE}
    build: null
  admin:
    image: ${ORIEN_ADMIN_IMAGE}
    build: null
```

Confirme localmente na VPS, antes de ativar o Actions:

```bash
cd /srv/apps/orien_comercial/app
docker compose --env-file .env --env-file .release.env \
  -f docker-compose.prod.yml -f docker-compose.ghcr.yml config --quiet
```

O arquivo `.release.env` e mantido pelo deploy e deve ficar fora do Git:

```dotenv
ORIEN_API_IMAGE=ghcr.io/pendevtsp-star/orien-comercial-api:sha-inicial
ORIEN_WEB_IMAGE=ghcr.io/pendevtsp-star/orien-comercial-web:sha-inicial
ORIEN_MARKETING_IMAGE=ghcr.io/pendevtsp-star/orien-comercial-marketing:sha-inicial
ORIEN_ADMIN_IMAGE=ghcr.io/pendevtsp-star/orien-comercial-admin:sha-inicial
PRODUCTION_VERSION=sha-inicial
```

## Segredos no GitHub

Cadastre-os em `Settings > Secrets and variables > Actions`. Nunca use
variaveis do repositorio para segredos.

| Secret | Uso |
| --- | --- |
| `VPS_HOST` | IP ou host da VPS. |
| `VPS_PORT` | Porta SSH, normalmente `22`. |
| `VPS_USER` | Usuario limitado de deploy, por exemplo `orien-deploy`. |
| `VPS_SSH_KEY` | Chave privada exclusiva do deploy, sem passphrase interativa. |
| `GHCR_USERNAME` | Usuario com leitura do pacote GHCR na VPS. |
| `GHCR_READ_TOKEN` | PAT classic com `read:packages`, usado apenas na VPS. |

O workflow usa automaticamente `GITHUB_TOKEN` para publicar as imagens. Em
`Settings > Actions > General`, permita ao workflow `Read and write permissions`.

Tambem crie o Environment `production` no GitHub e exija aprovacao manual de
pelo menos um responsavel. O job de deploy abaixo depende desse Environment.

## Workflow proposto

Quando os pre-requisitos estiverem concluídos, salve este conteudo como
`.github/workflows/deploy-production.yml`.

```yaml
name: Deploy de producao

on:
  workflow_dispatch:
    inputs:
      confirmar_producao:
        description: Digite PUBLICAR para confirmar a release
        required: true
        type: string
      versao:
        description: Versao semantica opcional, por exemplo v1.23.0
        required: false
        type: string

concurrency:
  group: orien-production
  cancel-in-progress: false

permissions:
  contents: read
  packages: write

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ghcr.io/${{ github.repository_owner }}/orien-comercial

jobs:
  validate:
    name: Validar release
    runs-on: ubuntu-latest
    if: github.event.inputs.confirmar_producao == 'PUBLICAR'
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_DB: orien_e2e
          POSTGRES_USER: sgc_owner
          POSTGRES_PASSWORD: sgc_owner_password
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U sgc_owner -d orien_e2e"
          --health-interval 10s --health-timeout 5s --health-retries 10
      redis:
        image: redis:8-alpine
        ports: ['6379:6379']
    env:
      NODE_ENV: test
      APP_ENV: e2e
      DATABASE_URL: postgresql://sgc_owner:sgc_owner_password@localhost:5432/orien_e2e
      DATABASE_MIGRATION_URL: postgresql://sgc_owner:sgc_owner_password@localhost:5432/orien_e2e
      REDIS_URL: redis://localhost:6379
      COOKIE_SECURE: 'false'
      JWT_ACCESS_SECRET: e2e-access-secret-at-least-thirty-two-chars
      JWT_REFRESH_SECRET: e2e-refresh-secret-at-least-thirty-two-chars
      COOKIE_SECRET: e2e-cookie-secret-at-least-thirty-two-chars
      PASSWORD_PEPPER: e2e-password-pepper
      INTEGRATIONS_ENCRYPTION_KEY: e2e-integrations-key-at-least-thirty-two
      PLATFORM_OWNER_EMAIL: e2e@orien.test
      PLATFORM_OWNER_PASSWORD: E2eOwner123!
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with:
          version: 11.7.0
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm lint:copy
      - run: pnpm test
      - run: pnpm db:migrate
      - run: pnpm test:e2e
      - run: pnpm build

  publish-images:
    name: Publicar imagens imutaveis
    needs: validate
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.value }}
    steps:
      - uses: actions/checkout@v5
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: version
        run: echo "value=${GITHUB_SHA}" >> "$GITHUB_OUTPUT"
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/api/Dockerfile
          push: true
          tags: ${{ env.IMAGE_PREFIX }}-api:${{ github.sha }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/web/Dockerfile
          push: true
          build-args: NEXT_PUBLIC_API_URL=https://api.useorien.com.br/api/v1
          tags: ${{ env.IMAGE_PREFIX }}-web:${{ github.sha }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/marketing/Dockerfile
          push: true
          tags: ${{ env.IMAGE_PREFIX }}-marketing:${{ github.sha }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/admin/Dockerfile
          push: true
          build-args: NEXT_PUBLIC_API_URL=https://api.useorien.com.br/api/v1
          tags: ${{ env.IMAGE_PREFIX }}-admin:${{ github.sha }}

  deploy:
    name: Publicar na VPS
    needs: publish-images
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: appleboy/ssh-action@v1.2.1
        env:
          VERSION: ${{ needs.publish-images.outputs.version }}
          GHCR_USERNAME: ${{ secrets.GHCR_USERNAME }}
          GHCR_READ_TOKEN: ${{ secrets.GHCR_READ_TOKEN }}
        with:
          host: ${{ secrets.VPS_HOST }}
          port: ${{ secrets.VPS_PORT }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          envs: VERSION,GHCR_USERNAME,GHCR_READ_TOKEN
          script: |
            set -euo pipefail
            ROOT=/srv/apps/orien_comercial
            APP=$ROOT/app
            cd "$APP"

            test -f .env
            test -f docker-compose.ghcr.yml
            mkdir -p "$ROOT/backups"

            timestamp=$(date -u +%Y%m%dT%H%M%SZ)
            docker compose --env-file .env -f docker-compose.prod.yml \
              exec -T postgres pg_dump -U sgc_owner sgc | gzip > "$ROOT/backups/predeploy-${timestamp}-${VERSION}.sql.gz"
            test -s "$ROOT/backups/predeploy-${timestamp}-${VERSION}.sql.gz"

            if [ -f .release.env ]; then cp .release.env .release.env.previous; fi
            cat > .release.env <<EOF
            ORIEN_API_IMAGE=ghcr.io/pendevtsp-star/orien-comercial-api:${VERSION}
            ORIEN_WEB_IMAGE=ghcr.io/pendevtsp-star/orien-comercial-web:${VERSION}
            ORIEN_MARKETING_IMAGE=ghcr.io/pendevtsp-star/orien-comercial-marketing:${VERSION}
            ORIEN_ADMIN_IMAGE=ghcr.io/pendevtsp-star/orien-comercial-admin:${VERSION}
            PRODUCTION_VERSION=${VERSION}
            EOF

            echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
            compose="docker compose --env-file .env --env-file .release.env -f docker-compose.prod.yml -f docker-compose.ghcr.yml"
            $compose pull api web marketing admin migrate
            $compose run --rm migrate
            $compose up -d --remove-orphans api web marketing admin

            for attempt in $(seq 1 24); do
              curl -fsS http://127.0.0.1:3334/health && break
              sleep 5
              [ "$attempt" -eq 24 ] && exit 1
            done
            curl -fsS http://127.0.0.1:3100 >/dev/null
            curl -fsS http://127.0.0.1:3101 >/dev/null
            curl -fsS http://127.0.0.1:3102 >/dev/null
            $compose ps
```

## Como fazer rollback

O rollback da aplicacao usa as imagens anteriores, sem tocar em volumes,
uploads, PostgreSQL ou Redis:

```bash
cd /srv/apps/orien_comercial/app
cp .release.env.previous .release.env
docker compose --env-file .env --env-file .release.env \
  -f docker-compose.prod.yml -f docker-compose.ghcr.yml up -d api web marketing admin
```

Nao reverta banco automaticamente. Se uma migration causar incidente, primeiro
suspenda o fluxo afetado, preserve logs e backup, e execute uma migration de
correcao aprovada.

## Checklist para ativacao

- [ ] Criar o Environment `production` com aprovacao obrigatoria.
- [ ] Criar os seis GitHub Secrets listados acima.
- [ ] Criar e validar `docker-compose.ghcr.yml` na VPS.
- [ ] Fazer um deploy manual de homologacao com imagens GHCR.
- [ ] Confirmar backup criado, `docker compose ps` saudavel e os quatro health checks.
- [ ] Somente entao salvar o YAML em `.github/workflows/deploy-production.yml` e fazer o primeiro despacho manual.
