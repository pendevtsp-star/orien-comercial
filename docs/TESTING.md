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

## VPS: banco isolado e descartavel

Na VPS, execute somente o script abaixo a partir do checkout publicado:

```bash
chmod +x ops/run-e2e-vps.sh
./ops/run-e2e-vps.sh
```

Ele cria `orien_e2e`, aplica todas as migrations, executa a suite critica e remove o banco ao final, inclusive em caso de falha. O runner possui uma trava no codigo: qualquer URL cujo banco nao comece com `orien_e2e` e recusada antes de truncar tabelas.

Nunca aponte `DATABASE_URL` ou `DATABASE_MIGRATION_URL` dos testes para `sgc`, para um banco de staging compartilhado ou para qualquer base com dados de clientes.

## Gates recorrentes

- Pull requests que alteram API, banco ou pacotes executam `.github/workflows/e2e.yml`.
- A verificacao agendada `.github/workflows/e2e-recurring.yml` roda diariamente os fluxos de PDV, caixa, NF-e, permissoes e documentos.
- Antes de uma release, rode a suite VPS isolada e arquive o resultado junto do checklist de liberacao.

## Sem Docker

Enquanto Docker/PostgreSQL nao estiverem disponiveis, avancar com:

- unit tests de guards, auth e services puros;
- testes de helpers de branch scope, paginacao e ordenacao;
- testes unitarios de webhook/idempotencia e normalizacao de status;
- validacao com `pnpm --filter @sgc/api test`, `pnpm --filter @sgc/api typecheck`, `pnpm --filter @sgc/web lint`.
