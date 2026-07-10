# Orien

Monorepo TypeScript da Orien, uma plataforma multitenant de gestao comercial, estoque, clientes, financeiro e relacionamento.

## Stack

- `apps/api`: NestJS, PostgreSQL, Drizzle, Zod, cookies `HttpOnly`, RBAC e RLS.
- `apps/web`: Next.js 16, painel autenticado, dashboard e CRUDs iniciais.
- `apps/marketing`: Next.js 16, landing comercial separada.
- `packages/db`: schema, migrations e seed.
- `packages/ui`, `packages/auth`, `packages/config`, `packages/types`, `packages/documents`: pacotes compartilhados.

## Rodar localmente

1. Copie `.env.example` para `.env` e troque todos os secrets.
2. Suba banco e Redis:

```powershell
docker compose up -d postgres redis
```

3. Instale dependencias:

```powershell
corepack enable
pnpm install
```

4. Rode migrations e seed:

```powershell
pnpm db:migrate
pnpm db:seed
```

5. Inicie a stack:

```powershell
pnpm dev
```

Painel: `http://localhost:3000`
Landing: `http://localhost:3001`
API: `http://localhost:3334/api/v1`
Swagger local: `http://localhost:3334/api/docs`

## Padrao de documentos

Relatorios, comprovantes e e-mails operacionais usam a base compartilhada `@sgc/documents` com branding por tenant salvo em `tenant_settings`, tendo a identidade da Orien como padrao inicial.

## Qualidade

```powershell
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

## Primeiro acesso local

O seed usa `PLATFORM_OWNER_EMAIL` e `PLATFORM_OWNER_PASSWORD` do `.env`.
Nunca use a senha de exemplo em producao.
