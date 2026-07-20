# Sistema Operacional de Produção

## Objetivo

O Orien trata operações críticas como fluxos recuperáveis: eventos são persistidos, tarefas são executadas de forma idempotente e falhas ficam visíveis para ação humana.

## Componentes

| Componente | Responsabilidade | Regra de segurança |
| --- | --- | --- |
| API | solicitações síncronas e gravação transacional | request ID, RLS e erros sem PII sensível |
| Outbox de eventos | registrar fatos de domínio | chave idempotente por agregado/evento |
| Fila durável | executar trabalho posterior | reserva atômica, backoff e fila morta |
| Worker | consumir tarefas internas | sem porta HTTP e sem duplicar processamento |
| Feature flags | liberar por tenant/plano | padrão seguro, override auditável |
| Configurações versionadas | rastrear mudanças de operação | ator, escopo, antes/depois resumido |
| Saúde da plataforma | detectar degradação | banco, Redis, filas, integrações, webhooks e erros |
| Backup | recuperar dados | cópia externa, checksum e restore descartável |

## Ciclo de uma tarefa

1. A API grava a alteração de domínio e um evento na mesma transação.
2. A tarefa derivada é criada com uma chave de deduplicação.
3. O worker reserva uma única tarefa pendente usando `FOR UPDATE SKIP LOCKED`.
4. Em sucesso, a tarefa fica `succeeded`; em falha, recebe novo horário com backoff.
5. Depois do limite de tentativas, fica `dead` e aparece no painel interno para reprocessamento consciente.

## Reprocessamento

Reprocessar só após investigar causa, validar credenciais e confirmar que a ação é idempotente. Nunca use reprocessamento em massa como resposta para indisponibilidade de provedor.

## Feature flags

- Flags de plataforma ficam desabilitadas por padrão, salvo decisão explícita.
- Overrides de tenant são permitidos apenas a operadores internos autorizados.
- Uma flag deve ter finalidade, dono, data de revisão e plano de remoção.
- Use rollout progressivo: equipe interna, tenant piloto, pequeno grupo, disponibilidade geral.

## Configurações

Mudanças em integrações, impressão, fiscal, regras comerciais e preferências relevantes devem gerar versão. A versão não guarda segredo: registra somente metadados permitidos, ator, escopo e referência da alteração.

## Resposta a incidentes

1. Identifique `requestId`, tenant, rota e horário.
2. Preserve logs e backup; não destrua dados ou volumes.
3. Isole somente a funcionalidade afetada por flag quando possível.
4. Registre decisão, impacto e correção.
5. Após estabilizar, crie teste de regressão e nota de versão.

## Critérios de saúde

- API, PostgreSQL e Redis respondem saudáveis.
- Nenhuma tarefa morta crítica sem responsável.
- Backup diário concluído e restore mensal verificado.
- Webhooks com falha possuem causa e plano de reprocessamento.
- Integrações em produção têm teste de conexão e último erro visíveis.

## Limites atuais

A execução de backup externo, os DSNs do Sentry e os provedores fiscal/WhatsApp dependem de credenciais e contratos externos. O código prepara o ponto de integração, mas a ativação requer os passos em `docs/DEPENDENCIAS_DO_PROPRIETARIO.md`.
