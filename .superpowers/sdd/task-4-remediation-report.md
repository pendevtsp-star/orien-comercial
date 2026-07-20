# Task 4R - Relatório de remediação

## Escopo executado

Foram alterados somente os contratos de configuração da landing, os componentes e a página de marketing, o controle necessário do admin, os testes de marketing/API e a configuração local do Vitest para permitir a renderização SSR dos componentes.

## Achados corrigidos

1. **Calculadora operacional**: criado `LandingCalculator` como Client Component acessível, com entradas para pessoas e minutos diários, cálculo de horas mensais com base em 22 dias úteis e texto de planejamento operacional sem promessa financeira. A renderização é controlada por `visibility.showCalculator`.
2. **Cache e resiliência pública**: `getLandingSettings` usa `cache: "force-cache"`, revalidação de 60 segundos e timeout de 3 segundos. O fallback continua silencioso e só é usado quando a configuração não está disponível.
3. **Coleções vazias**: a vitrine não renderiza sem slides visíveis; a prova social não renderiza sem depoimentos autorizados. Foram removidos os placeholders e a copy interna pública.
4. **WhatsApp**: a normalização remove apenas formatação, sem truncar. Os CTAs somente são renderizados para números normalizados entre 10 e 15 dígitos.
5. **CTA secundária opcional**: o contrato API aceita e preserva `null`; rascunhos legados sem o campo mantêm a CTA padrão. O admin oferece `Exibir CTA secundária`, e o marketing só renderiza a ação quando ela existe. A CTA primária segue obrigatória.
6. **Navegação condicional**: o link `Produto` do cabeçalho agora depende de `showProduct`, mantendo a navegação sem âncoras ausentes.
7. **Imagens de showcase seguras**: a API e o marketing aceitam HTTPS e caminhos internos sob `/product-showcase/`; continuam recusados URLs relativas a protocolo, barras invertidas, esquemas e caminhos codificados inseguros.
8. **Português BR**: a copy adicionada ou revisada foi corrigida para acentuação profissional em componentes, fallback e página pública.
9. **Testes de componentes**: os testes de marketing passaram a usar `react-dom/server` e renderizam Hero, Calculadora, Showcase, Planos e Prova Social, verificando CTAs, toggles e a ausência da copy técnica. A configuração local do Vitest habilita a transformação JSX automática.
10. **Acessibilidade do carrossel**: a vitrine usa `role="region"`, `aria-roledescription="carrossel"` e um rótulo compreensível. Controles de setas e toque permanecem para a Task 5.

## Validações

Concluídas com sucesso:

- `pnpm --filter @sgc/api test -- landing-settings.spec.ts` - 15 arquivos e 59 testes aprovados.
- `pnpm --filter @sgc/marketing test` - 5 arquivos e 7 testes aprovados.
- `pnpm --filter @sgc/marketing lint`.
- `pnpm --filter @sgc/marketing typecheck`.
- `pnpm --filter @sgc/marketing build`.
- `pnpm --filter @sgc/admin build`.
- `git diff --check -- apps/marketing apps/api/src/modules/platform/landing-settings.ts apps/api/src/modules/platform/landing-settings.spec.ts apps/admin/src/app/landing/page.tsx`.

Pendente fora do escopo desta Task:

- `pnpm exec prettier --check apps/marketing/src apps/api/src/modules/platform/landing-settings.ts apps/api/src/modules/platform/landing-settings.spec.ts apps/admin/src/app/landing/page.tsx` continua falhando somente por sete páginas de marketing não tocadas: `cancelamento/page.tsx`, `checkout/page.tsx`, `checkout/status/page.tsx`, `layout.tsx`, `legal-page.tsx`, `privacidade/page.tsx` e `termos/page.tsx`. Os arquivos alterados nesta Task foram formatados; não foram reformatados arquivos alheios ao escopo.
