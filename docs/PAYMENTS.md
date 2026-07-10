# Payments

Pagamentos reais do cliente final nao estao ativos nesta fundacao.

## Assinatura SaaS

Provider preferencial: Asaas em sandbox antes de producao.

Status atual da fase 1:

- `GET /subscriptions/current` entrega assinatura, planos e cobrancas locais.
- `POST /subscriptions/checkout` inicia checkout sandbox e salva contexto da assinatura no tenant.
- `POST /subscriptions/webhooks/asaas` registra eventos em `webhook_events` com idempotencia por `provider + event_id`.
- `subscription_invoices` passa a armazenar referencia externa e URL de fatura quando vier do provedor.
- Normalizacao local de status:
  - assinatura: `active`, `pending_activation`, `past_due`, `cancelled`
  - cobranca: `pending`, `paid`, `overdue`, `cancelled`
- A API usa token opcional `asaas-access-token` para endurecer autenticacao do webhook quando configurado.

Requisitos antes de ativar:

- `subscriptions`, `subscription_invoices`, `subscription_payments`.
- Webhooks idempotentes em `webhook_events`.
- Checkout hospedado quando possivel.
- Confirmar assinatura por webhook ou consulta segura ao provedor.
- Nunca armazenar dados de cartao.
- Exigir `ASAAS_WEBHOOK_TOKEN` em ambientes compartilhados.

## Pagamento do consumidor final

Default MVP: registro manual/link externo. Integracao por tenant deve usar credenciais isoladas e criptografadas.
Split/subcontas so apos validacao juridica e operacional.
