# Tarefa 4 - Landing publica configuravel

## Objetivo

Substituir a landing monolitica por componentes configuraveis, responsivos e acessiveis, usando apenas configuracao publica normalizada ou fallback tipado. Esta tarefa nao cria capturas reais; o carrossel recebera o refinamento visual e os assets na Tarefa 5.

## Escopo de escrita

- Criar `apps/marketing/src/lib/landing-settings.ts`
- Criar `apps/marketing/src/components/landing-hero.tsx`
- Criar `apps/marketing/src/components/landing-product-showcase.tsx`
- Criar `apps/marketing/src/components/landing-plan-comparison.tsx`
- Criar `apps/marketing/src/components/landing-section.tsx`
- Modificar `apps/marketing/src/app/page.tsx`
- Modificar `apps/marketing/src/components/landing-social-proof.tsx`
- Modificar `apps/marketing/src/app/globals.css`
- Criar testes de componente em `apps/marketing/src/components/*.test.tsx` conforme o harness existente.

Nao alterar API, admin, banco, assets de captura nem configuracoes de deploy.

## Requisitos

1. Consumir `GET /public/landing` no servidor com fallback deterministico quando API estiver indisponivel. Nunca expor detalhes tecnicos ao visitante.
2. `fallbackLandingSettings` deve ser tipado e conter a mensagem clara de `Teste gratuito de 7 dias, sem cartao` e CTA `/checkout?plan=pro`.
3. A hero deve exibir eyebrow, titulo, descricao, dois CTAs opcionais e textos de trial da configuracao. Sem copy injetada por CSS.
4. Preservar a jornada comercial ja existente: produto, migracao, planos, depoimentos moderados, segmentos, seguranca, FAQ e CTA final, sempre condicionada aos toggles publicos.
5. Planos: desktop com comparativo de recursos/limites/suporte e CTA por plano; mobile deve priorizar cards legiveis e CTAs contextuais. Precos, limites e nomes canonicos continuam controlados pelo codigo/catalogo, nao pelo CMS.
6. `LandingSocialProof` deve receber configuracao publica normalizada; WhatsApp so aparece com numero valido; moderacao continua pela API ja existente.
7. Carrossel inicial deve ser uma estrutura acessivel preparada para slides configuraveis, sem inventar screenshot e sem dados reais. A Tarefa 5 adicionara imagens locais e navegacao completa.
8. Remover qualquer hack CSS que substitua texto da hero por pseudo-elemento (`::after`).
9. Sem `any`, sem HTML/CSS arbitrario vindo de configuracao, sem URL insegura.
10. Preservar identidade Orien e comportamento responsivo; nao trocar o design do app autenticado.

## Validacao

Execute, conforme scripts realmente existentes:

```powershell
pnpm --filter @sgc/marketing test
pnpm --filter @sgc/marketing lint
pnpm --filter @sgc/marketing typecheck
pnpm --filter @sgc/marketing build
git diff --check -- apps/marketing
```

Nao faca commit, push, deploy, reset ou clean. Nao reverta mudancas sujas de terceiros.

## Relatorio

Criar `.superpowers/sdd/task-4-report.md` com: arquivos alterados, decisoes, comandos/resultados e riscos pendentes.
