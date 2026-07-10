# Observability

## Correlation

- Toda requisicao HTTP recebe `x-request-id`.
- Se o cliente enviar `x-request-id`, a API preserva o valor.
- Erros JSON retornam `requestId` no payload para facilitar rastreio entre frontend e backend.

## Formato basico de erro

```json
{
  "statusCode": 403,
  "error": "ForbiddenException",
  "message": "Permissao insuficiente.",
  "requestId": "req-or-uuid",
  "timestamp": "2026-07-09T00:00:00.000Z"
}
```

## Regras

- Nao logar senha, refresh token, payload integral de webhook ou PII desnecessaria.
- Logs inesperados devem incluir metodo, rota e `requestId`.
- O frontend deve propagar `x-request-id` para requests da API.
