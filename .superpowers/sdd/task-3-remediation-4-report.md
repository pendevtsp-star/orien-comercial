# Tarefa 3R4 - Report

## Mudanca aplicada

- Adicionada a dependencia direta `zod@4.4.3` ao pacote `@sgc/admin`.
- Removido o predicado manual de e-mail de `apps/admin/src/app/landing/page.tsx`.
- O schema compartilhado e `z.string().email().max(254)`.
- A opcionalidade esta composta em uma unica funcao: `value === "" || supportEmailSchema.safeParse(value).success`.
- A validacao de payload 2xx e a validacao do formulario chamam `isOptionalSupportEmail`.

## Matriz comportamental

| Valor | Schema Zod | Campo opcional |
| --- | --- | --- |
| `a..b@example.com` | rejeitado | rejeitado |
| `a'@example.com` | rejeitado | rejeitado |
| `valid@example.com` | aceito | aceito |
| `""` | nao aplicavel ao schema de e-mail | aceito pela opcionalidade explicita |

## Validacoes

Executadas em 2026-07-19 no worktree canonico.

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @sgc/admin exec node -e "... z.string().email().max(254) ..."` | passou: `a..b@example.com false`, `a'@example.com false`, `valid@example.com true` |
| Matriz da opcionalidade composta | passou: os dois invalidos retornaram `false`, `valid@example.com` retornou `true` e `""` retornou `true` |
| `pnpm exec tsc --noEmit --project apps/admin/tsconfig.json` | passou |
| `pnpm exec eslint apps/admin/src/app/landing/page.tsx` | passou |
| `pnpm --filter @sgc/admin build` | passou; aviso preexistente sobre o lockfile externo `C:\\Users\\maxue\\package-lock.json` |
| `pnpm exec prettier --check apps/admin/package.json apps/admin/src/app/landing/page.tsx` | passou |
| `git diff --check -- apps/admin/package.json pnpm-lock.yaml apps/admin/src/app/landing/page.tsx` | passou; apenas avisos Git de conversao LF para CRLF |
