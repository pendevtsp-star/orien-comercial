# Release 1.22.1 - Hardening Operacional

## Entrega

- Suíte E2E agora usa exclusivamente o banco descartável `orien_e2e`, com bloqueio explícito contra conexão ao banco operacional `sgc`.
- Rotina de VPS recria, migra, testa e remove o banco E2E ao final, preservando dados de caixa, financeiro, estoque e operações reais.
- Workflow recorrente usa o mesmo banco isolado do CI.
- Contrato financeiro corrigido para `accounts_receivable`, incluindo origem do documento, índices operacionais e consistência da resposta pública de caixa.
- Consultas críticas passaram a usar contratos tipados; o lint da API termina sem avisos.
- Validações de compra em uma única transação passaram a executar em sequência, eliminando concorrência indevida no mesmo cliente PostgreSQL.

## Evidência de validação

- Typecheck da API concluído.
- Lint da API concluído sem avisos.
- 34 testes unitários aprovados.
- 9 cenários E2E críticos aprovados na VPS com banco `orien_e2e` descartável.

## Segurança de dados

O script `ops/run-e2e-vps.sh` recusa qualquer banco que não siga o padrão `orien_e2e` e encerra conexões antes de descartá-lo. O banco operacional nunca é truncado ou recriado pela suíte.
