# Architecture

O projeto e um monorepo TypeScript com aplicacoes separadas para API, painel autenticado e landing comercial.

## Componentes

- `apps/api`: backend NestJS versionado em `/api/v1`.
- `apps/web`: painel SaaS usado por tenants.
- `apps/marketing`: site comercial do SaaS, sem depender do painel.
- `packages/db`: schema, migrations, seed e cliente Drizzle/PostgreSQL.
- `packages/auth`: permissoes, papeis e helpers RBAC.
- `packages/types`: contratos Zod compartilhados.
- `packages/ui`: componentes React reutilizaveis.
- `packages/config`: validacao de ambiente.

## Padroes

- Backend e fonte da verdade para validacao, permissoes e calculos criticos.
- API usa cookies `HttpOnly` e refresh token rotativo.
- Dados de negocio sao sempre escopados por tenant.
- PostgreSQL RLS atua como defesa adicional para tabelas sensiveis.
