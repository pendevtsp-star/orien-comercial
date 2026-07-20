# Relatorio - Tarefa 4R5

## Escopo entregue

- `apps/api/src/modules/platform/landing-settings.ts`
- `apps/api/src/modules/platform/landing-settings.spec.ts`
- `apps/marketing/src/lib/landing-settings.ts`
- `apps/marketing/src/lib/landing-settings.test.ts`
- `apps/admin/src/app/landing/page.tsx`
- `apps/marketing/src/components/landing-social-proof.test.tsx`
- `.superpowers/sdd/task-4-remediation-5-report.md`

Os tres validadores agora rejeitam qualquer caractere `%` em paths internos de
CTA e assets. URLs HTTPS continuam permitidas, inclusive quando usam
percent-encoding valido.

## Cobertura adicionada

- Paths internos rejeitados: `%2e`, `%252e`, `%2f`, `%252f`, `%5c` e `%255c`.
- Path local valido preservado: `/checkout?plan=pro`.
- URL HTTPS valida preservada: `https://example.com/demo%20seguro`.
- A prova social agora garante ausencia de estrelas, `5/5`, `Nota 5`,
  `aria-label` de avaliacao/rating/estrelas e icone `star`, sem acoplar o teste
  a uma copy historica especifica.

## Validacoes executadas

- `pnpm --filter @sgc/api test -- landing-settings.spec.ts` - passou: 15 arquivos, 68 testes.
- `pnpm --filter @sgc/api typecheck` - passou.
- `pnpm --filter @sgc/api build` - passou.
- `pnpm --filter @sgc/marketing test` - passou: 7 arquivos, 18 testes.
- `pnpm --filter @sgc/marketing lint` - passou.
- `pnpm --filter @sgc/marketing typecheck` - passou.
- `pnpm --filter @sgc/marketing build` - passou.
- `pnpm --filter @sgc/admin build` - passou.
- `git diff --check` - passou sem erros de whitespace.
- `pnpm exec prettier --check ...` nos sete arquivos da tarefa - apontou apenas
  `apps/admin/src/app/landing/page.tsx`, ja fora do estilo Prettier antes desta
  alteracao pontual; nao foi aplicado formatador para preservar o trabalho
  preexistente no arquivo.

## Observacao

O build do admin repetiu o aviso preexistente do Next.js sobre inferir a raiz
do workspace a partir de `C:\Users\maxue\package-lock.json`. Nenhuma
configuracao, lockfile ou arquivo fora do escopo desta tarefa foi alterado.
