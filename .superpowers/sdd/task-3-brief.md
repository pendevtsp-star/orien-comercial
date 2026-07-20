### Task 3: Construir o editor operacional no backoffice

**Files:**
- Modify: `apps/admin/src/app/landing/page.tsx`
- Modify: `apps/admin/src/app/globals.css`
- Create: `docs/LANDING_CONTENT_OPERATIONS.md` only for the admin manual checklist portion; Task 7 may extend it later.

**Prerequisite:** Task 2 introduces authenticated landing endpoints for draft, publish, revisions and restore. Use the published contract; do not invent endpoints.

**Required behavior:**
- Replace the current small raw form with six tabs: `Geral`, `Produto`, `Planos`, `Prova social`, `Secoes e rodape`, `Historico`.
- General includes eyebrow, title, description, main/secondary CTA labels and allowed hrefs, trial text, support email, WhatsApp number/message.
- Product includes up to four official showcase slides: visible, title, description, image URL and alt text. Do not implement arbitrary file upload in this task.
- Plans includes visibility, plan highlight and CTA labels only; price/limits remain owned by existing plan catalog.
- Social proof links to moderated testimonials and only controls heading/visibility.
- Sections and footer exposes visibility toggles for product, migration, plans, testimonials, segments, security and FAQ plus final CTA/footer links.
- History lists publication revisions and allows restore after `window.confirm`.
- Save draft and publish must remain separate actions. Preview must open the marketing URL in a new tab.
- Forms must have labels, character counters where limits exist, obvious loading/success/error states, and no technical error string when server returns malformed JSON.

**Global constraints:**
- Backoffice controls copy and visibility, not HTML/CSS/scripts.
- No commit/push/deploy/reset/cleanup and do not alter unrelated files.
- Existing testimonials moderation page remains intact.

- [ ] First add a documented manual test checklist in `docs/LANDING_CONTENT_OPERATIONS.md` covering loading, save draft, publish confirmation, preview, invalid URL, history and restore.
- [ ] Replace `any` settings state with a local `LandingSettings` type that mirrors the public/draft API fields. Preserve fetch credentials and safe `response.json().catch(() => ({}))` behavior.
- [ ] Implement tabs and form fields; use generic immutable setter helpers to avoid copy/paste field mutations.
- [ ] Implement `Salvar rascunho` calling `PATCH /platform/landing`, `Publicar alteracoes` calling `POST /platform/landing/publish`, revision list calling `GET /platform/landing/revisions`, and restore calling `POST /platform/landing/revisions/:id/restore` after confirmation.
- [ ] Provide a preview action using `window.open(marketingBaseUrl, "_blank", "noopener,noreferrer")`.
- [ ] Run `pnpm --filter @sgc/admin lint`, `pnpm --filter @sgc/admin typecheck`, `pnpm --filter @sgc/admin build`, and Prettier check for modified files.
- [ ] Write detailed report to `.superpowers/sdd/task-3-report.md` with changed paths, tests and concerns. Return concise status only.
