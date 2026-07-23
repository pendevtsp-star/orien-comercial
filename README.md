# Orien

Monorepo TypeScript da Orien, uma plataforma multitenant de gestao comercial, estoque, clientes, financeiro e relacionamento.

## Stack

- `apps/api`: NestJS, PostgreSQL, Drizzle, Zod, cookies `HttpOnly`, RBAC e RLS.
- `apps/web`: Next.js 16, painel autenticado, dashboard e CRUDs iniciais.
- `apps/marketing`: Next.js 16, landing comercial separada.
- `packages/db`: schema, migrations e seed.
- `packages/ui`, `packages/auth`, `packages/config`, `packages/types`, `packages/documents`: pacotes compartilhados.

## Funcionalidades Enterprise (v1.23.0)

### Relatórios (13 abas)
- Dashboard Executivo com KPIs
- Resumo Gerencial, Vendas, Financeiro, Estoque
- Análise de Produtos e Clientes (RFM)
- Fluxo de Caixa
- Faturamento (DAVs)
- Comissões por Forma de Pagamento
- Conciliação com Defasagem
- Performance por Vendedor
- Consolidado Mensal

### Filtros Avançados
- Período com 10 atalhos (Hoje, Semana, Mês, etc.)
- Filial, Vendedor, Cliente, Produto
- Situação e Forma de Pagamento

### Automação
- Relatórios agendados (diário/semanal/mensal)
- Alertas automáticos
- Notificações push

### Analytics e IA
- Previsão de vendas (Média Móvel)
- Segmentação de clientes (RFM)
- Detecção de anomalias
- IA Assistente com Knowledge Base

### Segurança
- Auditoria completa
- Gerenciamento de sessões
- Detecção de atividade suspeita

### Mobile
- PWA completo
- Atalhos de instalação
- Funcionamento offline

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

## Configuração da IA (Opcional)

Para usar a IA Assistente com respostas mais inteligentes:

1. Obtenha uma API key em [openrouter.ai](https://openrouter.ai)
2. Adicione ao `.env`:

```bash
OPENROUTER_API_KEY=sua-chave-aqui
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free
```

## Padrao de documentos

Relatorios, comprovantes e e-mails operacionais usam a base compartilhada `@sgc/documents` com branding por tenant salvo em `tenant_settings`, tendo a identidade da Orien como padrao inicial.

## Qualidade

```powershell
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

## Deploy

O deploy é automatizado via GitHub Actions:
1. Push para branch `master`
2. Validação (lint, testes, build)
3. Publicação de imagens Docker no GHCR
4. Deploy na VPS

## Primeiro acesso local

O seed usa `PLATFORM_OWNER_EMAIL` e `PLATFORM_OWNER_PASSWORD` do `.env`.
Nunca use a senha de exemplo em producao.
