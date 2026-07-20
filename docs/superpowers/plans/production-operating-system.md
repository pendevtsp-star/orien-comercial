# Production Operating System

**Objetivo:** tornar a base operacional do Orien resiliente, auditavel e pronta para evoluir sem depender de processos manuais fragilizados.

## Restrições

- Nenhum dado de tenant pode atravessar fronteiras de tenant ou filial.
- Operações assíncronas devem ser idempotentes, registradas e recuperáveis.
- Sem commit, push ou deploy nesta rodada.
- O TestSprite não está disponível nesta sessão; usar Vitest, E2E existente e build/lint como fallback registrado.
- Toda alteração nova deve ter teste que falha antes da implementação.

## Desenho

1. Criar uma migration única, reversível por adição, para:
   - `platform_feature_flags` e `tenant_feature_flag_overrides`;
   - `configuration_versions`, com escopo de tenant/filial e ator;
   - `operational_events`, como outbox com chave idempotente;
   - `operational_jobs`, como fila persistente com tentativas, agendamento, trava e fila morta;
   - `backup_runs`, para evidência de backup e restauração.
2. Criar `OperationsFoundationModule` no backend com endpoints de plataforma protegidos para listar/alterar flags, registrar versões de configuração, enfileirar e observar jobs e consolidar saúde operacional.
3. Criar worker isolado no mesmo artefato da API, usando `FOR UPDATE SKIP LOCKED`, backoff exponencial e promoção para `dead` após limite. O worker processará inicialmente tarefas internas seguras de expiração de notas de versão e verificações de backup registradas. A execução de backup fora da VPS permanece controlada pelo runbook.
4. Acrescentar o serviço `worker` ao Compose de produção com recursos limitados; ele não expõe porta e usa a mesma imagem da API.
5. Fazer a página de saúde da plataforma usar métricas reais: API/Redis/Postgres, jobs pendentes/falhos, backups recentes, integrações desabilitadas, webhooks pendentes e erros recentes.
6. Documentar operação, retenção, restore, Sentry/OTel, S3/R2, alertas, feature flags e responsabilidades do proprietário do ambiente.

## Tarefas

### Tarefa 1 — Fundação de dados e worker

Arquivos principais: `packages/db/migrations/0058_production_operating_system.sql`, `packages/db/src/schema.ts`, `apps/api/src/modules/operations-foundation/**`, `apps/api/src/worker.ts`, `apps/api/src/modules/app.module.ts`, `apps/api/package.json`, `docker-compose.prod.yml`.

Critérios:
- Migration pode ser aplicada repetidamente em banco novo.
- Todas as tabelas de tenant têm RLS com `app_tenant_id()` e índices de acesso.
- A reserva de jobs é atômica e impede processamento duplicado.
- Jobs falhos recebem próximo agendamento; ao exceder tentativas chegam a `dead`.
- Flags resolvem padrão da plataforma e override do tenant, sem vazar override de outro tenant.
- Worker encerra com segurança e não expõe HTTP.

### Tarefa 2 — Testes da fundação

Arquivos principais: `apps/api/src/modules/operations-foundation/**/*.spec.ts`, com E2E apenas se o harness atual permitir banco local isolado.

Critérios:
- Cobrir flags, versionamento, reserva idempotente e transição para fila morta.
- O teste deve começar vermelho, depois verde.
- Rodar testes focados, `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`.

### Tarefa 3 — Operação e dependências externas

Arquivos principais: `docs/PRODUCTION_OPERATING_SYSTEM.md`, `docs/DEPENDENCIAS_DO_PROPRIETARIO.md`, `docs/OBSERVABILITY.md`, `docs/BACKUP_AND_RESTORE.md`.

Critérios:
- Separar claramente o que é entregue em código e o que depende do proprietário: Sentry, bucket externo, chave de criptografia, alertas, domínio/SMTP e permissões do runner.
- Incluir comandos seguros de validação e restauração em banco descartável.
- Não incluir secrets em documentação.

## Estratégia de validação

1. O implementador cria testes vermelhos para a fundação.
2. O agente de testes executa testes focados e a suíte do workspace.
3. A cada falha, o implementador recebe o erro exato e corrige. Limite: cinco ciclos por assinatura de falha.
4. Após cinco falhas idênticas, interromper correção e propor mudança de estratégia antes de prosseguir.
5. Ao final, revisar diff, migrations e documentação; só então retornar `OK para commit` ao usuário.
