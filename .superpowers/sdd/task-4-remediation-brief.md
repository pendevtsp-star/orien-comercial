# Tarefa 4R - Conversao, resiliencia e qualidade publica

## Objetivo

Corrigir integralmente os dez achados da revisao da Task 4 antes de continuar para capturas. A landing deve continuar comercial, rapida, segura e configuravel sem expor bastidores.

## Escopo permitido

- `apps/marketing/src/lib/landing-settings.ts`
- `apps/marketing/src/components/landing-hero.tsx`
- `apps/marketing/src/components/landing-product-showcase.tsx`
- `apps/marketing/src/components/landing-plan-comparison.tsx`
- `apps/marketing/src/components/landing-social-proof.tsx`
- Criar `apps/marketing/src/components/landing-calculator.tsx`
- `apps/marketing/src/components/landing-section.tsx` somente se preciso
- `apps/marketing/src/app/page.tsx`
- `apps/marketing/src/app/globals.css`
- testes de marketing afetados
- `apps/api/src/modules/platform/landing-settings.ts`
- `apps/api/src/modules/platform/landing-settings.spec.ts`
- `apps/admin/src/app/landing/page.tsx` somente para permitir ocultar CTA secundaria de modo real
- `.superpowers/sdd/task-4-remediation-report.md`

Nao tocar em migrations, services/controllers, deploy, assets de captura, nem arquivos de outros trabalhos. Sem commit/push/deploy/reset/clean.

## Requisitos de correcao

1. Reintroduzir calculadora interativa de ganho operacional como Client Component acessivel. Deve permitir informar pessoas e minutos economizados por dia, calcular horas/mes e texto de valor gerencial sem promessas financeiras inventadas. `showCalculator` deve controlar a secao.
2. `getLandingSettings` deve usar cache/revalidacao de Next (maximo 5 minutos; preferencia 60 segundos) e timeout curto. Remover `cache: no-store`. Fallback so quando nao houver configuracao disponivel; nao expor erro tecnico.
3. Com colecao vazia, nao renderizar uma secao com copy interna. Showcase sem slides deve ocultar a vitrine; prova social sem depoimentos deve ocultar o bloco, inclusive titulo/estrelas. Nada de `backoffice`, `proxima etapa`, `experiencias reais` ou estrelas sem depoimentos na pagina publica.
4. WhatsApp: normalizar apenas removendo formatacao, sem truncar. Renderizar apenas se numero original normalizado tiver 10 a 15 digitos; qualquer tamanho fora disso deve ocultar o CTA.
5. Tornar CTA secundaria efetivamente opcional de ponta a ponta: contrato API aceita `null` para secundaria e normalizacao preserva `null`; admin oferece controle claro `Exibir CTA secundaria`; marketing apenas renderiza quando existe. CTA primaria continua obrigatoria com fallback seguro. Adicione testes API para retrocompatibilidade e null.
6. Navegacao do header deve seguir os toggles, incluindo Produto. Nenhum link para ancora ausente.
7. Marketing deve aceitar imagens de showcase publicas seguras como caminho interno (`/product-showcase/...`) ou HTTPS. Mantem rejeicao de protocolo relativo, barras invertidas, esquemas e URLs inseguras. Nao descartar silenciosamente asset local valido.
8. Corrigir toda copy nova para portugues BR com acentuacao profissional. Nao usar ASCII so porque o codigo costuma ser ASCII; textos de interface podem e devem ter UTF-8 correto.
9. Substituir testes de objetos por verificacao real de componentes: use `react-dom/server` ou harness existente para renderizar Hero, Calculadora, Showcase, Planos e SocialProof, verificando CTAs, toggles e ausencia de copy tecnica. Nao adicionar dependencia pesada se nao for necessaria.
10. O carousel deve expor `role="region"` e `aria-roledescription="carrossel"`, com label compreensivel; a navegacao completa de setas/toque continua na Task 5.

## Validacao obrigatoria

```powershell
pnpm --filter @sgc/api test -- landing-settings.spec.ts
pnpm --filter @sgc/marketing test
pnpm --filter @sgc/marketing lint
pnpm --filter @sgc/marketing typecheck
pnpm --filter @sgc/marketing build
pnpm --filter @sgc/admin build
pnpm exec prettier --check apps/marketing/src apps/api/src/modules/platform/landing-settings.ts apps/api/src/modules/platform/landing-settings.spec.ts apps/admin/src/app/landing/page.tsx
git diff --check -- apps/marketing apps/api/src/modules/platform/landing-settings.ts apps/api/src/modules/platform/landing-settings.spec.ts apps/admin/src/app/landing/page.tsx
```

O relatorio deve mapear cada um dos dez achados para a correcao correspondente.
