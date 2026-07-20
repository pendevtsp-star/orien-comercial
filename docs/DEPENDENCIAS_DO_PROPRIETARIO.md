# Dependências do Proprietário do Ambiente

Este documento lista somente ações externas ao repositório. Não registre chaves, senhas ou tokens neste arquivo.

## 1. Observabilidade

### Sentry

1. Crie um projeto Sentry separado para `api`, `web`, `marketing` e `admin`.
2. Gere os DSNs de cada projeto e armazene-os apenas nos secrets do ambiente de produção.
3. Defina alertas para erro novo, taxa de erro, falha de checkout, webhook falho e indisponibilidade da API.
4. Convide somente operadores internos autorizados e ative MFA na conta Sentry.

Variáveis esperadas quando a integração for ativada:

```env
SENTRY_DSN_API=
SENTRY_DSN_WEB=
SENTRY_DSN_MARKETING=
SENTRY_DSN_ADMIN=
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

## 2. Backups fora da VPS

O backup local atual reduz risco operacional, mas não protege contra perda total da VPS. Configure um bucket privado no Cloudflare R2, S3, Backblaze B2 ou equivalente.

1. Crie bucket privado, com retenção de pelo menos 30 dias.
2. Crie uma credencial com permissão exclusiva de gravação/leitura daquele bucket.
3. Habilite versionamento ou retenção imutável, se o provedor oferecer.
4. Guarde as credenciais somente em `/srv/apps/orien_comercial/app/.env` e nos secrets de produção.
5. Programe envio diário criptografado e uma restauração automatizada mensal em banco descartável.

Variáveis sugeridas:

```env
BACKUP_STORAGE_PROVIDER=s3
BACKUP_BUCKET=
BACKUP_REGION=
BACKUP_ENDPOINT=
BACKUP_ACCESS_KEY_ID=
BACKUP_SECRET_ACCESS_KEY=
BACKUP_ENCRYPTION_KEY=
BACKUP_RETENTION_DAYS=30
```

Não reutilize chaves da aplicação, do banco ou do GitHub para o bucket.

## 3. Alertas de Operação

1. Defina o canal que receberá alerta de indisponibilidade: e-mail, Slack, Teams ou webhook próprio.
2. Configure contatos responsáveis por: aplicação, banco, cobrança, fiscal e suporte.
3. Teste o alerta com uma manutenção programada, nunca desligando PostgreSQL em horário comercial.

```env
HEALTHCHECK_WEBHOOK_URL=
ALERT_EMAIL_TO=
```

## 4. GitHub Actions e Runner na VPS

1. Mantenha o runner dedicado com label `production-deploy` e grupo restrito ao repositório Orien.
2. No GitHub, crie o Environment `production`, exija aprovação manual e limite secrets a ele.
3. Proteja `master`: pull request, checks obrigatórios, bloqueio de force push e revisão para mudanças de infraestrutura.
4. Não execute o runner como `root`; mantenha o usuário `github-deploy` com acesso apenas aos diretórios necessários em `/srv/apps/orien_comercial`.
5. Revise mensalmente o status com `systemctl status actions.runner.*` e atualize o runner.

## 5. E-mail da Plataforma

O Resend é responsável somente por e-mails da Orien: convite, reset, trial, cobrança e suporte.

1. Confirme SPF e DKIM de `useorien.com.br` no Resend.
2. Use remetentes como `no-reply@useorien.com.br` e `suporte@useorien.com.br`.
3. Defina uma caixa real ou encaminhamento para `suporte@useorien.com.br`.
4. Mantenha a chave `RESEND_API_KEY` apenas no `.env` de produção.

## 6. Fiscal, pagamentos e WhatsApp

Essas integrações só devem sair de homologação após contrato, credenciais e validação operacional.

- Fiscal: certificado, CSC, credenciais do provedor e homologação por UF.
- Asaas: chave de produção, webhook autenticado e validação de evento idempotente.
- WhatsApp: número oficial, conta Meta Business aprovada e templates aceitos.

Ative cada integração primeiro para um tenant controlado, usando feature flag por tenant.

## 7. Rotina de validação

Semanalmente:

1. Confirme `/health` e painel de saúde da plataforma.
2. Confirme o backup mais recente e o checksum.
3. Revise jobs mortos, webhooks falhos e erros recentes.
4. Verifique uso de disco, memória e containers.

Mensalmente:

1. Execute restauração em banco descartável e registre duração/resultado.
2. Revise acessos de operadores, secrets e MFA.
3. Atualize imagens base e runner em janela controlada.

## Critério para produção

Não habilite novos tenants pagantes enquanto ao menos uma destas condições for verdadeira:

- backup externo não configurado;
- restauração não testada;
- alertas sem destinatário responsável;
- runner sem grupo/label dedicado;
- Sentry sem DSN ou sem alertas;
- fiscal ou cobrança em produção sem validação de ponta a ponta.
