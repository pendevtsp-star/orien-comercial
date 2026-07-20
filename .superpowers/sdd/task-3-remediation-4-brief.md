# Tarefa 3R4 - Fonte unica de validacao de e-mail

## Mudanca de estrategia

Tres iteracoes de regex manual ainda deixaram divergencia com `z.string().email().max(254)`. Pare de ajustar regex. O admin deve usar Zod como dependencia direta e validar e-mail com exatamente `z.string().email().max(254)` para payloads e formulario. Isso substitui o predicado local artesanal.

## Escopo permitido

- `apps/admin/package.json`
- `pnpm-lock.yaml` apenas via `pnpm --filter @sgc/admin add zod@4.4.3` ou versao exatamente igual a usada pela API/lock atual
- `apps/admin/src/app/landing/page.tsx`
- `.superpowers/sdd/task-3-remediation-4-report.md`

Nao altere quaisquer outros arquivos, nem commit/push/deploy/reset/clean.

## Requisitos

1. Instalar `zod` como dependencia direta do admin, com versao alinhada ao monorepo.
2. Remover a regex/predicado manual para e-mail e usar o mesmo schema Zod (vazio permitido apenas como opcionalidade explicitamente composta: `value === "" || emailSchema.safeParse(value).success`).
3. O guard 2xx e a validacao de formulario devem chamar a mesma funcao/schema, sem duplicacao.
4. Adicionar uma pequena matriz de testes comportamentais sem criar novo harness: no minimo um helper de desenvolvimento/teste ou uma verificacao no relatorio demonstrando que `a..b@example.com` e `a'@example.com` sao rejeitados, e um e-mail valido e vazio opcional tem o comportamento esperado. Se houver maneira limpa de teste unitario no admin, use-a.
5. Rode validacoes:
```powershell
pnpm --filter @sgc/admin exec node -e "const { z } = require('zod'); const s=z.string().email().max(254); for(const value of ['a..b@example.com', \"a'@example.com\", 'valid@example.com']) console.log(value, s.safeParse(value).success)"
pnpm exec tsc --noEmit --project apps/admin/tsconfig.json
pnpm exec eslint apps/admin/src/app/landing/page.tsx
pnpm --filter @sgc/admin build
pnpm exec prettier --check apps/admin/package.json apps/admin/src/app/landing/page.tsx
git diff --check -- apps/admin/package.json pnpm-lock.yaml apps/admin/src/app/landing/page.tsx
```

Registre resultados no relatorio.
