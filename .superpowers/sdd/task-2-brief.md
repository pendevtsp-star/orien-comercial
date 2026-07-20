### Task 2: Persistir rascunhos, publicacoes e restauracoes auditaveis

**Files:**
- Create: `packages/db/migrations/0059_platform_landing_publication.sql`
- Modify: `packages/db/src/schema.ts`
- Modify: `apps/api/src/modules/platform/platform.service.ts`
- Modify: `apps/api/src/modules/platform/platform.controller.ts`
- Modify: `apps/api/src/modules/platform/public-marketing.controller.ts`
- Modify: `apps/api/src/modules/platform/platform.service.spec.ts`

**Prerequisite:** Task 1 has introduced `normalizeLandingSettings` and `toPublicLandingSettings` in `apps/api/src/modules/platform/landing-settings.ts`. Import and use them; do not duplicate normalization.

**Interfaces to produce:**
- `GET /platform/landing` returns draft settings.
- `PATCH /platform/landing` saves a normalized draft.
- `POST /platform/landing/publish` creates immutable revision and changes the publicly visible revision atomically.
- `GET /platform/landing/revisions` lists revisions.
- `POST /platform/landing/revisions/:id/restore` republishes an immutable copied revision.
- `GET /public/landing` returns the last published revision only, sanitized by `toPublicLandingSettings`; safe defaults when none is published.

**Global constraints:**
- All protected routes must keep the existing `ok` backoffice guard.
- No commit, push, deploy, reset or cleanup.
- No secrets in migration, audit metadata or public output.
- Preserve the existing testimonials moderation flow.

- [ ] Start by adding a failing test in `platform.service.spec.ts`:

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

- [ ] Run `pnpm --filter @sgc/api test -- platform.service.spec.ts` and observe expected failure.
- [ ] Migration must create `platform_landing_revisions` with `id uuid`, `value jsonb`, nullable `published_by` user reference, `published_at`, nullable `restored_from_id`, plus descending publication index. Do not change or delete `platform_landing_settings`.
- [ ] Implement publication atomically using the database transaction API already used in the project. `restoreLandingRevision` inserts a new revision copied from selected value, sets `restored_from_id`, updates the draft/current value, and appends the existing platform audit log.
- [ ] The public route must never return un-published draft-only copy. If no revision exists it must return sanitized fallback settings.
- [ ] Implement controller DTO shape inline only if existing controller style supports it; avoid broad DTO refactors.
- [ ] Run focused tests, `pnpm --filter @sgc/api typecheck`, and write `.superpowers/sdd/task-2-report.md` with paths/tests/concerns. Return concise status only.
