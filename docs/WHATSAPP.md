# WhatsApp

A primeira implementação experimental usa Baileys `6.7.23` para conectar um
número secundário por QR Code. Ela é opt-in por tenant, não oficial e não é
fornecida, homologada ou suportada pela Meta.

Não há promessa de SLA, compatibilidade permanente ou suporte a bloqueios da
Meta. O uso em produção exige validação operacional, sandbox e aprovação
explícita do tenant.

## Niveis planejados

- WhatsApp da plataforma SaaS para comunicacao com tenants.
- WhatsApp do tenant para comunicacao com clientes finais.

## Requisitos

- Credenciais por tenant.
- Sessão isolada por tenant e filial, com estado persistido cifrado usando
  `INTEGRATIONS_ENCRYPTION_KEY`.
- QR Code mantido somente em memória e nunca persistido.
- Templates aprovados.
- Opt-in/opt-out.
- Limites por plano.
- Fila e retentativas.
- Webhooks validados.
- Logs sem dados sensiveis em excesso.

## Escopo experimental atual

- Conexão, reconexão, desconexão e remoção da sessão pela tela de Integrações.
- Recebimento e envio somente de mensagens de texto.
- Mensagens de números desconhecidos criam ou atualizam leads; não criam
  clientes automaticamente.
- Imagens, PDFs e áudios não são baixados nem armazenados.
- Cada mensagem recebida usa idempotência, opt-in, janela de horário, limite
  de taxa e auditoria.
- Não há campanhas, listas, segmentação ou disparos em massa.

## Rotas internas

- `GET /api/v1/integrations/whatsapp`
- `POST /api/v1/integrations/whatsapp/connect`
- `POST /api/v1/integrations/whatsapp/reconnect`
- `POST /api/v1/integrations/whatsapp/disconnect`
- `DELETE /api/v1/integrations/whatsapp/session`

Todas as rotas exigem tenant, filial autorizada quando aplicável e as
permissões de Integrações correspondentes. A autorização de plano continua
sendo aplicada pelo backend.

O e-mail `pendevtsp@gmail.com` pode orientar a documentacao operacional da Meta Developer, mas nao deve ser hardcoded em codigo.
