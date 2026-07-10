# Roadmap

## Fase 0

- Monorepo, Docker, banco, auth, RBAC, multitenancy, layout, docs, CI, seed e auditoria inicial.

## Fase 1

- Tenants, usuarios, lojas, produtos, clientes, estoque basico, vendas basicas, financeiro simples, dashboard, assinatura Asaas sandbox e landing.

Status atual:

- Operacao comercial: venda com multiplos itens, pagamento parcial, cancelamento e historico por venda.
- Estoque: ajustes, transferencias, inventario, entrada por compra, relatorio de estoque baixo e estoque parado.
- Financeiro: baixa manual, parcelamento, categorias, fluxo de caixa e conciliacao inicial por status.
- Usuarios: convites com aceite, membros, perfis, escopo por filial visivel e auditoria.
- Assinatura SaaS: checkout Asaas sandbox, webhooks idempotentes e tela "Minha assinatura".
- Ainda pendente de infraestrutura local nesta maquina: aplicar migrations em Postgres ativo e rerodar smoke tests HTTP com API/web ligadas.

## Fase 2

- PDV, caixa, orcamentos, servicos, fornecedores, compras, transferencias, relatorios, fidelidade, WhatsApp basico e e-mail transacional.

## Fase 3

- Fiscal, pagamento do consumidor final, WhatsApp completo por tenant, e-commerce, maquininhas, BI e automacao.
