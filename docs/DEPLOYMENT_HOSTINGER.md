# Deployment Hostinger

Deploy de producao exige aprovacao explicita.

## MVP em VPS

- Docker Compose.
- Reverse proxy com Caddy, Nginx ou Traefik.
- Cloudflare DNS/proxy/SSL/WAF.
- PostgreSQL com volume persistente ou banco gerenciado.
- Redis.
- Healthchecks.
- Firewall e usuario Linux sem root para aplicacao.
- Backups automaticos e restore testado.

## Observacao critica

VPS unica e aceitavel apenas para MVP controlado. Clientes pagantes exigem backup robusto, monitoramento e plano de migracao para banco gerenciado.
