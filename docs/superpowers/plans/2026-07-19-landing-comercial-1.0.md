# Landing Comercial 1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma landing comercial configuravel pelo backoffice, com prova visual sanitizada, jornada de trial clara e conversao rastreavel sem publicar nada antes da validacao local.

**Architecture:** `platform_landing_settings.value` permanece como documento JSON versionado, mas passa a ter um contrato explicito, defaults, validacao e revisoes restauraveis. A API expoe uma versao publica sanitizada; admin edita rascunho e publica; marketing renderiza componentes por secoes com fallback seguro. Capturas sanitizadas sao assets locais, otimizados e independentes de dados reais.

**Tech Stack:** Next.js 16, React 19, NestJS, PostgreSQL/Drizzle migrations SQL, Zod, Vitest, Tailwind CSS 4, Lucide.

## Global Constraints

- Manter identidade Orien: azul noite, azul real, ouro, tipografia display somente nos titulos.
- Backoffice controla copy e visibilidade; codigo controla estrutura, acesso, responsividade e acessibilidade.
- Nenhum HTML, CSS arbitrario, script ou URL fora de HTTPS e permitido na configuracao.
- Trial continua com sete dias sem cartao; checkout posterior usa a integracao SaaS existente.
- Capturas usam apenas dados ficticios e sanitizados, sem PII, tokens, documentos ou dados reais de cliente.
- Nenhum commit, push ou deploy faz parte deste plano sem autorizacao posterior do usuario.

---

## File Structure

- `packages/db/migrations/0059_platform_landing_publication.sql`: revisoes publicadas da landing e indice de leitura.
- `packages/db/src/schema.ts`: tabela de revisoes da landing.
- `apps/api/src/modules/platform/landing-settings.ts`: contrato Zod, defaults, sanitizacao e funcoes puras.
- `apps/api/src/modules/platform/landing-settings.spec.ts`: comportamento de defaults, sanitizacao e URL allowlist.
- `apps/api/src/modules/platform/platform.service.ts`: salvar rascunho, preview, publicar e restaurar revisoes.
- `apps/api/src/modules/platform/platform.controller.ts`: rotas autenticadas do admin.
- `apps/api/src/modules/platform/public-marketing.controller.ts`: rota publica somente com configuracao publicada.
- `apps/api/src/modules/platform/platform.service.spec.ts`: persistencia, publicacao e rollback.
- `apps/admin/src/app/landing/page.tsx`: editor por abas, preview e historico de publicacoes.
- `apps/marketing/src/lib/landing-settings.ts`: tipos de consumo publico e dados fallback.
- `apps/marketing/src/components/landing-hero.tsx`: hero e CTAs editaveis.
- `apps/marketing/src/components/landing-product-showcase.tsx`: carrossel de capturas com teclado/toque.
- `apps/marketing/src/components/landing-plan-comparison.tsx`: cards e comparativo de planos.
- `apps/marketing/src/components/landing-section.tsx`: wrapper semantico para secoes configuraveis.
- `apps/marketing/src/components/landing-social-proof.tsx`: migrar para o novo contrato sem alterar moderacao.
- `apps/marketing/src/app/page.tsx`: composicao enxuta da jornada comercial.
- `apps/marketing/src/app/globals.css`: tokens e estilos responsivos, sem substituicao de copy via CSS.
- `apps/marketing/src/components/*.test.tsx`: testes de comportamento acessivel dos componentes.
- `apps/marketing/public/product-showcase/*.webp`: quatro capturas sanitizadas publicaveis.
- `docs/LANDING_CONTENT_OPERATIONS.md`: procedimento de publicacao, rollback e sanitizacao.

## Task 1: Definir o contrato publico e as validacoes de conteudo

**Files:**
- Create: `apps/api/src/modules/platform/landing-settings.ts`
- Create: `apps/api/src/modules/platform/landing-settings.spec.ts`
- Modify: `apps/api/src/modules/platform/platform.service.ts`

**Interfaces:**
- Produces `LandingSettingsSchema`, `PublicLandingSettings`, `normalizeLandingSettings(value)` e `toPublicLandingSettings(value)`.
- Consumed by API autenticada, rota publica, admin e marketing.

- [ ] **Step 1: Escrever os testes que devem falhar**

```ts
it("removes unsafe URLs and keeps public settings within copy limits", () => {
  const result = toPublicLandingSettings({
    hero: { title: "Gestao clara", primaryCta: { label: "Testar", href: "javascript:alert(1)" } },
    whatsappNumber: "+55 (11) 99999-9999",
  });
  expect(result.hero.primaryCta.href).toBe("/checkout?plan=pro");
  expect(result.whatsappNumber).toBe("5511999999999");
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha**

Run: `pnpm --filter @sgc/api test -- landing-settings.spec.ts`

Expected: FAIL because `landing-settings.ts` does not exist.

- [ ] **Step 3: Implementar contrato minimo com Zod e defaults**

```ts
export const LandingSettingsSchema = z.object({
  hero: z.object({ eyebrow: z.string().max(90), title: z.string().max(150), description: z.string().max(320), primaryCta: ctaSchema, secondaryCta: ctaSchema.optional() }),
  sections: z.object({ product: z.boolean(), migration: z.boolean(), plans: z.boolean(), testimonials: z.boolean(), segments: z.boolean(), security: z.boolean(), faq: z.boolean() }),
  whatsappNumber: z.string().max(32),
  whatsappMessage: z.string().max(400),
  showcase: z.array(showcaseSchema).max(4),
}).strict();
```

`ctaSchema` aceita somente caminhos internos iniciados em `/` e URLs `https:` previamente definidas; `toPublicLandingSettings` normaliza, remove campos administrativos e garante fallback seguro.

- [ ] **Step 4: Rodar testes focados**

Run: `pnpm --filter @sgc/api test -- landing-settings.spec.ts`

Expected: PASS.

- [ ] **Step 5: Revisar diff**

Run: `git diff --check -- apps/api/src/modules/platform/landing-settings.ts apps/api/src/modules/platform/landing-settings.spec.ts`

Expected: no output.

## Task 2: Persistir rascunhos, publicacoes e restauracoes auditaveis

**Files:**
- Create: `packages/db/migrations/0059_platform_landing_publication.sql`
- Modify: `packages/db/src/schema.ts`
- Modify: `apps/api/src/modules/platform/platform.service.ts`
- Modify: `apps/api/src/modules/platform/platform.controller.ts`
- Modify: `apps/api/src/modules/platform/public-marketing.controller.ts`
- Modify: `apps/api/src/modules/platform/platform.service.spec.ts`

**Interfaces:**
- Produces `GET /platform/landing`, `PATCH /platform/landing`, `POST /platform/landing/publish`, `GET /platform/landing/revisions`, `POST /platform/landing/revisions/:id/restore`.
- Produces `GET /public/landing` from the last published revision, never an unvalidated draft.

- [ ] **Step 1: Escrever teste de publicacao e rollback**

```ts
it("returns only the latest published landing and restores a prior revision", async () => {
  await service.updateLandingSettings("operator-1", draftA);
  const first = await service.publishLandingSettings("operator-1");
  await service.updateLandingSettings("operator-1", draftB);
  await service.publishLandingSettings("operator-1");
  await service.restoreLandingRevision("operator-1", first.id);
  expect((await service.publicLandingSettings()).hero.title).toBe(draftA.hero.title);
});
```

- [ ] **Step 2: Rodar teste e confirmar falha**

Run: `pnpm --filter @sgc/api test -- platform.service.spec.ts`

Expected: FAIL because publication methods do not exist.

- [ ] **Step 3: Criar migration segura**

```sql
CREATE TABLE platform_landing_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value jsonb NOT NULL,
  published_by uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  restored_from_id uuid REFERENCES platform_landing_revisions(id) ON DELETE SET NULL
);
CREATE INDEX platform_landing_revisions_published_at_idx ON platform_landing_revisions (published_at DESC);
```

- [ ] **Step 4: Implementar publicacao atomica**

`publishLandingSettings` deve chamar `normalizeLandingSettings`, inserir a revisao e atualizar `platform_landing_settings.value` na mesma transacao. `restoreLandingRevision` republica uma copia da revisao escolhida e grava auditoria com `restoredFromId`.

- [ ] **Step 5: Expor rotas protegidas e rota publica**

Todas as rotas `/platform/landing/*` chamam o guard `ok`; a rota publica chama apenas `publicLandingSettings`.

- [ ] **Step 6: Rodar teste focado e typecheck**

Run: `pnpm --filter @sgc/api test -- platform.service.spec.ts; pnpm typecheck`

Expected: PASS.

## Task 3: Construir o editor operacional no backoffice

**Files:**
- Modify: `apps/admin/src/app/landing/page.tsx`
- Modify: `apps/admin/src/app/globals.css`
- Test: `apps/admin/src/app/landing/page.test.tsx` if admin test harness exists; otherwise manual QA checklist in `docs/LANDING_CONTENT_OPERATIONS.md`.

**Interfaces:**
- Consumes authenticated endpoints defined in Task 2.
- Produces validated draft, explicit publication, preview link and revision restore request.

- [ ] **Step 1: Definir teste ou checklist de estados**

Validar: loading, save draft, publish confirmation, preview opens a new tab, restore requires confirmation, invalid URL receives visible error.

- [ ] **Step 2: Criar abas de configuracao**

```tsx
const tabs = ["Geral", "Produto", "Planos", "Prova social", "Secoes e rodape", "Historico"] as const;
```

Cada aba edita apenas campos do contrato. Usar campos rotulados, contador de caracteres, toggles de visibilidade e preview lateral sem iframe remoto.

- [ ] **Step 3: Separar salvar de publicar**

`Salvar rascunho` chama `PATCH /platform/landing`; `Publicar alteracoes` chama `POST /platform/landing/publish` apenas apos dialog de confirmacao.

- [ ] **Step 4: Adicionar historico e rollback**

Listar data, operador, titulo da hero e acao `Restaurar esta versao`. Nao apagar revisoes.

- [ ] **Step 5: Validar o admin**

Run: `pnpm --filter @sgc/admin lint; pnpm --filter @sgc/admin typecheck; pnpm --filter @sgc/admin build`

Expected: PASS.

## Task 4: Substituir a landing monolitica por componentes configuraveis

**Files:**
- Create: `apps/marketing/src/lib/landing-settings.ts`
- Create: `apps/marketing/src/components/landing-hero.tsx`
- Create: `apps/marketing/src/components/landing-product-showcase.tsx`
- Create: `apps/marketing/src/components/landing-plan-comparison.tsx`
- Create: `apps/marketing/src/components/landing-section.tsx`
- Modify: `apps/marketing/src/app/page.tsx`
- Modify: `apps/marketing/src/components/landing-social-proof.tsx`
- Modify: `apps/marketing/src/app/globals.css`

**Interfaces:**
- Consumes `GET /public/landing` as `PublicLandingSettings`.
- Produces semantic sections and deterministic fallback data if API is unavailable.

- [ ] **Step 1: Escrever teste do hero com fallback**

```tsx
it("uses a safe default CTA when public landing data is unavailable", async () => {
  render(<LandingHero settings={fallbackLandingSettings} />);
  expect(screen.getByRole("link", { name: /teste gratuito/i })).toHaveAttribute("href", "/checkout?plan=pro");
});
```

- [ ] **Step 2: Confirmar falha**

Run: `pnpm --filter @sgc/marketing test -- landing-hero.test.tsx`

Expected: FAIL because component is absent.

- [ ] **Step 3: Implementar componentes sem copy hard-coded no CSS**

Remover a regra que troca o texto do beneficio da hero via `::after`. Todo texto exibido vem de `PublicLandingSettings` ou de `fallbackLandingSettings` tipado.

- [ ] **Step 4: Transformar planos em comparativo responsivo**

No desktop, renderizar matriz com recursos e CTA por plano. Em mobile, preservar cards com link `href={`/checkout?plan=${slug}`}` e resumo de limites.

- [ ] **Step 5: Migrar prova social**

`LandingSocialProof` recebe configuracao publica ja normalizada; mantem depoimentos moderados e oculta o botao WhatsApp quando numero vazio.

- [ ] **Step 6: Rodar testes de marketing**

Run: `pnpm --filter @sgc/marketing test; pnpm --filter @sgc/marketing lint; pnpm --filter @sgc/marketing typecheck`

Expected: PASS.

## Task 5: Adicionar carrossel de telas reais sanitizadas e acessiveis

**Files:**
- Create: `apps/marketing/public/product-showcase/pdv.webp`
- Create: `apps/marketing/public/product-showcase/stock.webp`
- Create: `apps/marketing/public/product-showcase/financial.webp`
- Create: `apps/marketing/public/product-showcase/store-central.webp`
- Modify: `apps/marketing/src/components/landing-product-showcase.tsx`
- Create: `apps/marketing/src/components/landing-product-showcase.test.tsx`

**Interfaces:**
- Consumes `showcase` configuration with `{ id, title, description, imageUrl, alt, isVisible }`.
- Produces keyboard navigation with `ArrowLeft`, `ArrowRight`, `Home` and `End`.

- [ ] **Step 1: Preparar tenant demonstracao local**

Subir apenas os servicos necessarios depois de definir `SGC_APP_PASSWORD` e `POSTGRES_OWNER_PASSWORD` no `.env` local. Usar seed com dados ficticios e nunca copiar dados da VPS.

- [ ] **Step 2: Registrar teste de navegacao**

```tsx
it("moves between product slides with keyboard navigation", async () => {
  render(<LandingProductShowcase items={items} />);
  await userEvent.keyboard("{ArrowRight}");
  expect(screen.getByRole("heading", { name: /estoque/i })).toBeVisible();
});
```

- [ ] **Step 3: Capturar e sanitizar telas**

Capturar PDV, estoque, financeiro e Central da Loja em viewport desktop; remover identificadores e valores reais; exportar WebP em largura maxima de 1600px.

- [ ] **Step 4: Implementar carrossel**

Usar imagens locais, `loading="lazy"` fora do slide ativo, botao anterior/proximo, indicadores rotulados e pausa de animacao em `prefers-reduced-motion`.

- [ ] **Step 5: Verificar tamanho e acessibilidade**

Run: `pnpm --filter @sgc/marketing test -- landing-product-showcase.test.tsx`

Expected: PASS.

## Task 6: Rastrear o funil comercial sem coletar dados pessoais

**Files:**
- Modify: `apps/marketing/src/app/page.tsx`
- Modify: `apps/marketing/src/app/checkout/page.tsx`
- Modify: `apps/api/src/modules/platform/platform.service.ts` only if existing analytics endpoint needs a new event allowlist.
- Test: existing analytics tests or new focused specs in the owning package.

**Interfaces:**
- Produces events `landing_view`, `landing_cta_clicked`, `plan_selected`, `checkout_started`, `trial_started`.
- Events never contain name, email, CPF/CNPJ, token, IP completo or payment data.

- [ ] **Step 1: Escrever teste de payload permitido**

```ts
it("does not send personal fields in marketing events", () => {
  expect(buildLandingEvent("plan_selected", { plan: "pro", email: "blocked@example.com" })).toEqual({ event: "plan_selected", metadata: { plan: "pro" } });
});
```

- [ ] **Step 2: Confirmar falha e implementar allowlist**

Permitir somente `plan`, `section`, `cta` e `slideId`; descartar quaisquer outras chaves.

- [ ] **Step 3: Rodar teste**

Run: command of the package owning the analytics helper.

Expected: PASS.

## Task 7: Documentar operacao e executar verificacao local completa

**Files:**
- Create: `docs/LANDING_CONTENT_OPERATIONS.md`
- Modify: `docs/DEPENDENCIAS_DO_PROPRIETARIO.md` only if a new owner action is introduced.

**Interfaces:**
- Documents draft, preview, publish, restore, image sanitization and release checklist.

- [ ] **Step 1: Documentar rotina de publicacao**

Incluir checklist: revisar copy, verificar links, preview desktop/mobile, confirmar autorizacao de depoimento, publicar, registrar versao e testar CTA/checkout.

- [ ] **Step 2: Rodar verificacoes de qualidade**

Run:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Expected: all commands pass.

- [ ] **Step 3: Subir ambiente local e validar visualmente**

Run Docker Compose com `.env` local completo, aplicar migrations e seed demonstracao. Validar landing em 1440px, 768px e 390px; testar hero, carrossel, planos, FAQ, CTA, checkout e configuracao publicada pelo admin.

- [ ] **Step 4: Registrar resultado sem publicar**

Atualizar a resposta final com comandos aprovados, testes bloqueados por ambiente se houver, e lista precisa de arquivos alterados. Nao executar `git commit`, `git push` ou deploy.

## Self-review

- Cobertura: hero, prova visual, planos, migracao, segmentos, seguranca, FAQ, prova social, CTA, backoffice, preview, publicacao, rollback, rastreamento e QA possuem tarefas dedicadas.
- Sem placeholders: cada tarefa define arquivos, interfaces, teste e comando esperado.
- Consistencia: API entrega `PublicLandingSettings`; admin altera rascunho e publica revisoes; marketing consome somente a configuracao publicada.
