# Tarefa 4R2 - Fechamento de contrato e qualidade comercial

## Escopo permitido

- `apps/api/src/modules/platform/landing-settings.ts`
- `apps/api/src/modules/platform/landing-settings.spec.ts`
- `apps/marketing/src/lib/landing-settings.ts`
- `apps/marketing/src/app/page.tsx`
- `apps/marketing/src/components/landing-hero.tsx`
- `apps/marketing/src/components/landing-product-showcase.tsx`
- `apps/marketing/src/components/landing-social-proof.tsx`
- `apps/marketing/src/components/landing-plan-comparison.tsx`
- testes marketing afetados
- `apps/admin/src/app/landing/page.tsx`
- `.superpowers/sdd/task-4-remediation-2-report.md`

Sem outros arquivos, sem commit/push/deploy/reset/clean.

## Correcao completa

1. Corrigir API typecheck/build: assinatura e chamada de `mergeSecondaryCta` devem estar coerentes; teste nao pode acessar nullable sem narrowing. Rode `pnpm --filter @sgc/api typecheck` e `build`.
2. Header so renderiza Produto se houver ao menos um slide visivel alem de `showProduct`; criar predicado compartilhado para nao divergir do componente. Fallback com zero slides nao deve ter `#produto` em CTA nem nav. Use fallback CTA interna segura, por exemplo `/checkout?plan=pro`, se nao houver vitrine.
3. Reativar CTA secundaria no admin com href valido e seguro (`/contato`), nao uma ancora. Teste/garanta que toggle ligar -> salvar sem edicao extra.
4. Remover toda copy interna/proibida da landing publica. Prova social sem depoimentos continua oculta; com depoimentos use titulo comercial sem afirmar experiencia real sem base. Corrigir toda copy nova para PT-BR acentuado profissional em todos os arquivos do escopo.
5. Reforcar validação de caminhos internos nas duas camadas: rejeitar `%2e`, `%2f`, `%5c`, `..`, barras invertidas, `//`, schemas e qualquer URL cujo pathname normalizado nao seja o mesmo do valor recebido. Caminhos locais `/product-showcase/foo.webp` continuam aceitos.
6. Expandir testes para: nav/CTA sem slides, mostrar/ocultar CTA secundaria, titulo social com/sem testimoniais, Whatsapp 9 e 16 digitos, traversal codificado e caminhos locais validos. Testes devem renderizar ou cobrir o comportamento real correspondente.

## Validacao obrigatoria

```powershell
pnpm --filter @sgc/api test -- landing-settings.spec.ts
pnpm --filter @sgc/api typecheck
pnpm --filter @sgc/api build
pnpm --filter @sgc/marketing test
pnpm --filter @sgc/marketing lint
pnpm --filter @sgc/marketing typecheck
pnpm --filter @sgc/marketing build
pnpm --filter @sgc/admin build
git diff --check -- apps/api/src/modules/platform/landing-settings.ts apps/api/src/modules/platform/landing-settings.spec.ts apps/marketing apps/admin/src/app/landing/page.tsx
```

No relatorio mapear todos os itens e dizer resultados reais.
