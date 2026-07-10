# Testing

## Comandos

```powershell
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
```

## Prioridades

- RBAC.
- Tenant context.
- Auth e rotacao de refresh token.
- CRUDs com isolamento por tenant.
- Restricao por filial.
- Ajuste de estoque e venda com baixa atomica.
- Geracao de contas a receber a partir de venda parcialmente paga.
- Mass assignment.
- Webhooks e pagamentos quando forem ativados.

Testes e2e reais devem rodar contra PostgreSQL/Redis em Docker.

## Sem Docker

Enquanto Docker/PostgreSQL nao estiverem disponiveis, avancar com:

- unit tests de guards, auth e services puros;
- testes de helpers de branch scope, paginacao e ordenacao;
- testes unitarios de webhook/idempotencia e normalizacao de status;
- validacao com `pnpm --filter @sgc/api test`, `pnpm --filter @sgc/api typecheck`, `pnpm --filter @sgc/web lint`.
