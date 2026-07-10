# Security

Baseado em OWASP ASVS, OWASP API Security Top 10, OWASP Top 10, defesa em profundidade e LGPD.

## Controles implementados na fundacao

- Senhas com Argon2id e pepper de servidor.
- Cookies `HttpOnly`, `Secure` em producao e `SameSite=Lax`.
- Refresh token rotativo com hash no banco.
- Rate limit em login, refresh e reset.
- RBAC backend por tenant.
- Escopo por filial.
- Validacao Zod no backend.
- Paginacao obrigatoria nas listas.
- RLS em tabelas sensiveis.
- Erros padronizados sem stack trace ao cliente.

## Checklist de testes por modulo sensivel

- IDOR entre tenants.
- Acesso horizontal entre tenants.
- Acesso a filial sem permissao.
- Escalada vertical de papel.
- Mass assignment.
- SQL injection.
- XSS em campos renderizados.
- CSRF quando aplicavel.
- Reset de senha e token reuse.
- Session fixation.
- Replay de webhooks.
- Campos financeiros manipulados no frontend.
- Alteracao indevida de preco, desconto e forma de pagamento.

## Logs

Nao logar PII sensivel, tokens, payloads integrais de pagamento ou webhooks com dados pessoais desnecessarios.
