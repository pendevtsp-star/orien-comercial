# API

Base local: `http://localhost:3334/api/v1`.

## Auth

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `POST /auth/password/forgot`
- `POST /auth/password/reset`
- `POST /auth/invites/accept`

## Usuario e tenant

- `GET /me`
- `GET /tenants/current`
- `GET /tenants/current/branding`
- `PATCH /tenants/current/branding`
- `GET /roles`
- `GET /memberships`
- `PATCH /memberships/:id`
- `GET /invites`
- `POST /invites`
- `GET /audit-logs`

## CRUD inicial

- `GET/POST /branches`
- `GET/PATCH/DELETE /branches/:id`
- `GET/POST /products`
- `GET/PATCH/DELETE /products/:id`
- `GET/POST /customers`
- `GET/PATCH/DELETE /customers/:id`
- `GET /stock`
- `POST /stock/adjustments`
- `GET /stock/movements`
- `POST /stock/transfers`
- `POST /stock/inventory-counts`
- `POST /stock/purchase-entries`
- `GET /stock/reports`
- `GET /stock/reports/document`
- `GET/POST /sales`
- `POST /sales/:id/cancel`
- `GET /sales/:id/history`
- `GET /sales/:id/document`
- `GET/POST /financial/receivables`
- `GET/POST /financial/payables`
- `GET/POST /financial/categories`
- `PATCH /financial/receivables/:id/pay`
- `PATCH /financial/payables/:id/pay`
- `PATCH /financial/receivables/:id/reconcile`
- `PATCH /financial/payables/:id/reconcile`
- `GET /financial/cashflow`
- `GET /financial/cashflow/document`
- `GET /subscriptions/current`
- `POST /subscriptions/checkout`
- `POST /subscriptions/webhooks/asaas`

## Fiscal

- `GET/PUT /fiscal/branches/:branchId/settings`
- `PUT /fiscal/branches/:branchId/credentials`
- `GET /fiscal/branches/:branchId/readiness`
- `POST /fiscal/branches/:branchId/webhook-token`
- `POST /fiscal/branches/:branchId/production/request`
- `POST /fiscal/branches/:branchId/production/approve`
- `POST /fiscal/branches/:branchId/production/revoke`
- `GET/POST /fiscal/documents`
- `GET /fiscal/documents/:id`
- `POST /fiscal/documents/:id/sync`
- `POST /fiscal/documents/:id/retry`
- `POST /fiscal/documents/:id/cancel`
- `GET /fiscal/documents/:id/artifacts/:kind`
- `POST /fiscal/products/:productId/review`
- `POST /fiscal/branches/:branchId/review`
- `GET /fiscal/accounting/overview`
- `GET /fiscal/accounting/export`
- `POST /fiscal/webhooks/focus` (pública, autenticada pelo token dedicado)

## Convencoes de resposta

- Listagens retornam `data` e `pagination` quando paginadas.
- Erros HTTP retornam `statusCode`, `error`, `message`, `requestId` e `timestamp`.
- O cliente pode enviar `x-request-id` para correlacionar chamadas ponta a ponta.
- `GET /dashboard/summary`

Rotas de negocio exigem cookie de sessao e header `x-tenant-id`.
