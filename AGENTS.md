# AGENTS.md

Regras para Codex e agentes futuros neste repositorio.

## Comandos

- Instalar: `pnpm install`
- Dev completo: `pnpm dev`
- API: `pnpm dev:api`
- Web: `pnpm dev:web`
- Marketing: `pnpm dev:marketing`
- Migrations: `pnpm db:migrate`
- Seed: `pnpm db:seed`
- Lint: `pnpm lint`
- Testes: `pnpm test` e `pnpm test:e2e`
- Build: `pnpm build`

## Branches e commits

- Prefixo padrao: `codex/`.
- Commits pequenos, revisaveis e com mensagem objetiva.
- Nao misturar refactors amplos com feature de produto.

## Seguranca obrigatoria

- Nunca commitar `.env`, tokens, credenciais, dumps ou dados reais.
- Nunca logar senha, token, CPF/CNPJ completo, telefone, e-mail de cliente em massa ou payload sensivel.
- Toda validacao critica deve existir no backend.
- Nunca confiar em validacao, permissao ou preco enviado apenas pelo frontend.
- Nunca consultar ou alterar dados de negocio sem `tenant_id`.
- Nunca buscar registro apenas por `id`; use `tenant_id + id` e valide permissao.
- Em rotas por filial, validar `branch_id` contra o membership.
- Pagamentos, webhooks, WhatsApp e fiscal exigem idempotencia, auditoria e sandbox antes de producao.

## Multitenancy

- Tabelas de negocio devem ter `tenant_id`.
- Tabelas por unidade devem ter `branch_id`.
- Queries de negocio devem usar `DatabaseService.tenantQuery` para ativar RLS no mesmo contexto transacional.
- Testes de isolamento entre tenants sao obrigatorios para modulos sensiveis.

## Criterios antes de PR

- `pnpm lint`, `pnpm test`, `pnpm build` passando.
- Migrations revisadas.
- `.env.example` atualizado sem secrets.
- Docs atualizadas quando houver novo modulo, endpoint ou decisao arquitetural.
- Codex Security scan para alteracoes em auth, RBAC, multitenancy, pagamentos, upload, webhooks ou integracoes.
