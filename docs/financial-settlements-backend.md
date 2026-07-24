# Taxas, recebíveis líquidos e conciliação

## Escopo

O módulo financeiro distingue valor bruto, taxas, valor líquido, previsão e liquidação sem
alterar o campo legado `amount`. A migration `0063_financial_settlements.sql` é aditiva e
preserva os registros anteriores como snapshots sem taxa.

## Modelo

- `payment_acquirers`: adquirentes do tenant, opcionais por filial;
- `payment_fee_rules`: versões imutáveis por meio, bandeira, faixa de parcelas e vigência;
- `sale_payments`: snapshot de regra, bruto, taxas, líquido e previsão;
- `accounts_receivable`: snapshot líquido relacionado ao pagamento, quando aplicável;
- `payment_settlements`: liquidações e reversões idempotentes por referência externa;
- `reconciliation_batches` e `reconciliation_items`: comparação de esperado e realizado.

O pagamento mantém estados independentes: `settlement_status` representa a liquidação e
`reconciliation_status` representa a conferência do extrato. Conciliar não transforma nem
apaga o histórico de liquidações.

Todas as tabelas novas usam `tenant_id`, FKs compostas, índices de filial e RLS. Alterações de
configuração, liquidação, reversão e conciliação produzem registros em `audit_logs`.

## Contrato para vendas

`FinancialSettlementsService` é exportado por `FinancialModule`. O caso de uso de venda deve
chamar `resolvePaymentSnapshotsInTransaction(client, tenant, payments)` dentro da mesma
transação que cria a venda. Cada pagamento é resolvido independentemente.

Quando não há adquirente/regra selecionada, o snapshot é seguro e explícito:

- bruto igual ao líquido;
- taxas iguais a zero;
- previsão na data da operação;
- regra e adquirente nulos.

O adaptador da venda deverá persistir o snapshot recebido no `sale_payment` e, quando houver
recebível futuro, criar `accounts_receivable` com os mesmos bruto, taxa, líquido e data. Não é
permitido recalcular uma venda histórica depois que a regra mudar.

Dinheiro e Pix imediato continuam pertencendo ao caixa operacional. O snapshot financeiro
explica a operação, mas não cria uma segunda entrada de caixa. Cartão registra a venda no caixa
e a liquidação futura neste módulo.

## API

Leitura exige `financial.read`; configuração, liquidação, reversão e conciliação exigem
`financial.reconcile`.

| Método | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/api/v1/financial/acquirers` | Listar adquirentes no escopo autorizado |
| `POST` | `/api/v1/financial/acquirers` | Criar adquirente |
| `PATCH` | `/api/v1/financial/acquirers/:id` | Atualizar metadados/estado |
| `POST` | `/api/v1/financial/acquirers/:id/deactivate` | Desativar adquirente |
| `GET` | `/api/v1/financial/fee-rules` | Listar versões de regras |
| `POST` | `/api/v1/financial/fee-rules` | Criar nova versão imutável |
| `POST` | `/api/v1/financial/fee-rules/:id/deactivate` | Desativar uma versão com motivo |
| `POST` | `/api/v1/financial/payment-snapshots/resolve` | Simular snapshots autoritativos |
| `GET` | `/api/v1/financial/settlement-forecasts` | Listar recebimentos previstos e realizados |
| `POST` | `/api/v1/financial/settlements` | Registrar liquidação idempotente |
| `POST` | `/api/v1/financial/settlements/batch` | Liquidar lote em uma transação |
| `POST` | `/api/v1/financial/settlements/:id/reverse` | Reverter liquidação com motivo |
| `POST` | `/api/v1/financial/reconciliation-batches` | Processar extrato/lote e divergências |

## Idempotência e precisão

- valores de entrada e cálculos internos usam centavos inteiros;
- percentuais usam pontos-base (`100 = 1%`);
- arredondamento monetário é half-up;
- uma referência de liquidação só pode repetir o mesmo pagamento, valor, data e estado;
- lote de conciliação usa SHA-256 do conteúdo canônico, portanto a mesma referência com outro
  conteúdo retorna conflito;
- a conciliação compara o extrato com o líquido ainda pendente, descontando liquidações e
  reversões já registradas;
- lote de baixas usa uma única transação; qualquer falha reverte todos os itens.

## Operação e reversão

A migration não remove colunas antigas e não exige reprocessamento comercial. O rollback
operacional recomendado é desativar as rotas novas e manter as tabelas/snapshots para auditoria;
não se deve apagar liquidações ou regras históricas. Reversões são lançamentos compensatórios.
