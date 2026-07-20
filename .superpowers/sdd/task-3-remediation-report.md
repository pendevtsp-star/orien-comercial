# Task 3R - Remediacao da Landing Comercial 1.0

## Arquivos alterados

- `apps/api/src/modules/platform/landing-settings.ts`
- `apps/api/src/modules/platform/landing-settings.spec.ts`
- `apps/admin/src/app/landing/page.tsx`
- `apps/admin/src/app/globals.css`
- `docs/LANDING_CONTENT_OPERATIONS.md`
- `.superpowers/sdd/task-3-remediation-report.md`

Nenhum arquivo fora da lista permitida pelo brief foi alterado por esta remediacao. Alteracoes sujas preexistentes de outros trabalhos foram preservadas.

## Correcao entregue

- O contrato versionado agora normaliza e publica `hero.trialText`, `supportEmail`, alt e visibilidade de cada slide, apresentacao de planos, titulo de prova social, visibilidades independentes, CTA final e links de rodape.
- Rascunhos e revisoes legados recebem defaults seguros. URLs inseguras, protocolo relativo, barras invertidas e valores invalidos sao removidos ou retornam ao fallback seguro durante a normalizacao.
- `PublicLandingSettings` continua removendo `admin` e agora inclui todos os novos controles publicos.
- O backoffice valida integralmente respostas 2xx antes de gravar estado. O carregamento do rascunho e do historico e independente: falha no rascunho bloqueia o editor; falha no historico nao descarta o rascunho.
- O editor tem dirty state, bloqueia publicacao enquanto houver alteracoes locais, mostra erros junto aos campos obrigatorios e usa IDs ASCII estaveis nos tabs e relacionamentos ARIA.
- As seis abas expõem somente controles persistidos no contrato. O checklist operacional foi atualizado para as novas falhas, limites e fluxos.

## TDD

Foram adicionados tres testes puros antes da implementacao para defaults/retrocompatibilidade, URLs e valores inseguros, e persistencia publica dos novos campos. A primeira execucao falhou como esperado porque os campos ainda nao existiam:

```text
Test Files  1 failed | 14 passed (15)
Tests  3 failed | 54 passed (57)
```

Depois da implementacao, os mesmos casos passaram.

## Validacoes executadas

| Comando                                                                                                                                                                                                                                     | Resultado observado                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm --filter @sgc/api test -- landing-settings.spec.ts`                                                                                                                                                                                   | Passou: 15 arquivos, 57 testes.                                                      |
| `pnpm exec tsc --noEmit --project apps/admin/tsconfig.json`                                                                                                                                                                                 | Passou, sem saida de erro.                                                           |
| `pnpm exec eslint apps/admin/src/app/landing/page.tsx`                                                                                                                                                                                      | Passou, sem saida de erro.                                                           |
| `pnpm --filter @sgc/admin build`                                                                                                                                                                                                            | Passou; compilacao, TypeScript e rota estatica `/landing` concluidos.                |
| `pnpm exec prettier --check apps/api/src/modules/platform/landing-settings.ts apps/api/src/modules/platform/landing-settings.spec.ts apps/admin/src/app/landing/page.tsx apps/admin/src/app/globals.css docs/LANDING_CONTENT_OPERATIONS.md` | Passou: todos os arquivos seguem Prettier.                                           |
| `git diff --check -- apps/api/src/modules/platform/landing-settings.ts apps/api/src/modules/platform/landing-settings.spec.ts apps/admin/src/app/landing/page.tsx apps/admin/src/app/globals.css docs/LANDING_CONTENT_OPERATIONS.md`        | Passou; somente avisos informativos de normalizacao LF/CRLF nos dois arquivos admin. |

## Riscos e limites

- Nao foi executado E2E autenticado contra API e banco reais. A checklist manual documenta os cenarios que ainda precisam dessa validacao.
- O build emite aviso preexistente de Next.js sobre multiplos lockfiles e a inferencia de `C:\Users\maxue\package-lock.json` como raiz; o build concluiu normalmente e nenhuma configuracao foi alterada.
- Esta tarefa entrega e persiste o contrato e os controles do backoffice. O consumo visual dos campos novos pela aplicacao de marketing permanece fora do escopo permitido deste brief.
- Nenhum commit, push, deploy, reset ou clean foi executado.
