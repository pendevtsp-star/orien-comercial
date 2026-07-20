# Tarefa 3R3 - Paridade exata de e-mail

## Escopo unico

Corrija apenas `apps/admin/src/app/landing/page.tsx` para eliminar a divergencia entre `isValidEmail` local e o schema `z.string().email().max(254)` do backend.

O caso `a..b@example.com` precisa ser rejeitado no cliente e na validacao de payload 2xx. Nao implemente uma regex caseira excessivamente permissiva. Use uma dependencia ja presente no admin ou um predicado conservador que tambem rejeite, no minimo: ponto duplicado na parte local ou dominio, ponto inicial/final na parte local, dominio sem ponto, espacos e tamanho acima de 254. O email vazio segue permitido onde o contrato permite opcionalidade.

Nao altere outros arquivos. Nao commit/push/deploy/reset/clean.

## Validacao

Execute:

```powershell
pnpm exec tsc --noEmit --project apps/admin/tsconfig.json
pnpm exec eslint apps/admin/src/app/landing/page.tsx
pnpm --filter @sgc/admin build
pnpm exec prettier --check apps/admin/src/app/landing/page.tsx
git diff --check -- apps/admin/src/app/landing/page.tsx
```

Crie `.superpowers/sdd/task-3-remediation-3-report.md` com a mudanca e resultados.
