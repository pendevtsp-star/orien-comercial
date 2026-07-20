# Tarefa 4R5 - Rejeicao total de percent-encoding em paths internos

## Escopo

- `apps/api/src/modules/platform/landing-settings.ts`
- `apps/api/src/modules/platform/landing-settings.spec.ts`
- `apps/marketing/src/lib/landing-settings.ts`
- testes marketing afetados
- `apps/admin/src/app/landing/page.tsx`
- `apps/marketing/src/components/landing-social-proof.test.tsx`
- `.superpowers/sdd/task-4-remediation-5-report.md`

Sem outros arquivos e sem commit/push/deploy/reset/clean.

## Requisitos

1. Para URL interna usada por CTA ou asset, rejeitar qualquer `%`, alem das protecoes existentes. Essa e uma politica deliberadamente conservadora: landing nao precisa de URL percent-encoded. Aplicar de forma identica em API, marketing e admin.
2. Adicionar matriz de casos com `%2e`, `%252e`, `%2f`, `%252f`, `%5c`, `%255c`, path valido local e HTTPS valido.
3. Fortalecer teste social para garantir ausencia de representacoes de rating: `★★★★★`, `5/5`, `Nota 5`, `aria-label` contendo avaliacao/rating/estrelas e icone star, sem exigir uma copy antiga especifica.
4. Rodar API tests/typecheck/build, marketing tests/lint/typecheck/build, admin build e diff check.
