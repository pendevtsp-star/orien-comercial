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

## Health check e alerta

- `GET /health` verifica API, PostgreSQL e Redis. Retorna `200` apenas quando as tres camadas estao saudaveis; caso contrario retorna `503` com estado `degraded`.
- `ops/monitor-health.sh` executa essa verificacao localmente a cada cinco minutos via `/etc/cron.d/orien-monitor`.
- Defina `HEALTHCHECK_WEBHOOK_URL` no `.env` de producao para receber uma notificacao JSON quando a verificacao falhar. O URL nao deve ser versionado.
- Acompanhe `backups/health-monitor.log`, logs Docker e espaco em disco durante o beta.

## Evolução operacional

- A fundação de operações persiste eventos, jobs e tentativas no PostgreSQL. O worker reserva tarefas com trava transacional para evitar duplicidade entre réplicas.
- O painel interno deve acompanhar jobs pendentes, tarefas na fila morta, integracoes desabilitadas, webhooks pendentes, backup recente e erros nas últimas 24 horas.
- Sentry e traces distribuídos são integrações externas. Consulte `docs/DEPENDENCIAS_DO_PROPRIETARIO.md` antes de ativá-los em produção.
