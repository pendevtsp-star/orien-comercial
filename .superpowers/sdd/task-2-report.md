# Task 2 Report - Orien Landing Comercial 1.0

## Implemented

- Added `packages/db/migrations/0059_platform_landing_publication.sql`, creating
  `platform_landing_revisions` with immutable JSONB snapshots, nullable publisher and
  restore references, publication timestamp, and a descending publication index.
- Added the matching `platformLandingRevisions` Drizzle schema declaration in
  `packages/db/src/schema.ts`.
- Updated `apps/api/src/modules/platform/platform.service.ts` to import and use the
  Task 1 `normalizeLandingSettings` and `toPublicLandingSettings` contract.
  - Draft reads and writes are normalized.
  - Publishing locks the draft, inserts a revision, and writes the platform audit log
    inside one transaction.
  - Restore locks the source revision, creates a copied revision with
    `restored_from_id`, updates the draft, and writes the audit log in the same
    transaction.
  - Public settings select only the latest published revision and fall back through
    `toPublicLandingSettings` when no revision exists; unpublished drafts are never
    returned publicly.
  - The existing testimonial moderation data is preserved internally while the
    protected landing response remains normalized to the Task 1 contract.
- Added guarded backoffice endpoints in
  `apps/api/src/modules/platform/platform.controller.ts`:
  - `POST /platform/landing/publish`
  - `GET /platform/landing/revisions`
  - `POST /platform/landing/revisions/:id/restore`
- `apps/api/src/modules/platform/public-marketing.controller.ts` already delegated
  `GET /public/landing` to `publicLandingSettings`; no unrelated controller rewrite
  was needed.

## TDD Evidence

- Added the required publish/restore lifecycle test in
  `apps/api/src/modules/platform/platform.service.spec.ts` and observed the expected
  red failure: `publishLandingSettings is not a function`.
- Added a regression test for testimonial moderation. It initially failed because
  normalized reads removed the legacy moderated testimonials before an approval was
  persisted; the implementation now keeps that internal list intact.

## Verification

- `pnpm --filter @sgc/api test -- platform.service.spec.ts` passed: 15 files, 50 tests.
- `pnpm --filter @sgc/api typecheck` passed.
- `pnpm --filter @sgc/db typecheck` passed.
- `git diff --check` passed for the tracked Task 2 source files.

## Concerns / Boundaries

- No migration was applied and no PostgreSQL-backed HTTP/E2E run was performed in
  this task; the migration and transactional SQL were validated statically and by
  focused service tests only.
- No commit, push, deploy, reset, or cleanup was performed. Pre-existing dirty files
  outside the Task 2 scope were left unchanged.

## Review Remediation Evidence

- Extended `apps/api/src/modules/platform/landing-settings.ts` so normalized drafts,
  immutable revisions, and `GET /public/landing` carry approved testimonials. Public
  testimonial text is bounded and markup-free; image URLs are retained only when they
  are valid HTTPS URLs. `admin` remains omitted by `toPublicLandingSettings`.
- Strengthened the lifecycle coverage in
  `apps/api/src/modules/platform/platform.service.spec.ts` to prove that draft B is
  not public before its publication, the approved testimonial from A survives both
  publish and restore, the public response strips admin metadata and normalizes the
  WhatsApp number, and restore acquires the singleton settings lock before reading the
  source revision and inserting its copied revision.
- The red run before the contract fix failed with the expected missing public field:
  `expected undefined to deeply equal [ ObjectContaining{...} ]` for
  `publicBeforeSecondPublish.testimonials` and `toPublicLandingSettings(...).testimonials`.
- Restore now locks `platform_landing_settings` with `SELECT ... FOR UPDATE` before
  reading the source revision. The source revision is immutable, so it is read without
  taking a competing revision-row lock after the singleton lock is held.
- `restored_from_id` now uses `ON DELETE RESTRICT`, matching the repository's existing
  immutable-reference convention, and the Drizzle `publishedAt` default is explicitly
  `clock_timestamp()` to match the migration.

### Exact Verification Output

```text
$ pnpm --filter @sgc/api test -- platform.service.spec.ts landing-settings.spec.ts
Test Files  15 passed (15)
Tests  51 passed (51)

$ pnpm --filter @sgc/api typecheck
$ tsc -p tsconfig.json --noEmit

$ pnpm --filter @sgc/db typecheck
$ tsc -p tsconfig.json --noEmit
```

## Re-Review Public/Draft Isolation Evidence

- `decideTestimonial` now reads the latest published revision after acquiring the
  singleton settings lock. Its new public revision mutates only that revision's
  testimonial list; it never uses the draft as the public-revision source.
- The draft update is separate and changes only `testimonials` on the locked raw draft
  value, preserving unrelated unpublished draft fields. The focused A/B test starts
  from public hero title `Public A` and draft hero title `Draft B`; approval and later
  revocation change public testimonials while both public reads remain `Public A` and
  the draft remains `Draft B`.
- Restore now uses SQL-side copying:
  `INSERT INTO platform_landing_revisions (...) SELECT value,$2,id ...`, followed by
  an SQL-side settings update selecting the same source JSONB. No JavaScript
  stringify/normalization step is involved in the immutable restore copy.
- The lifecycle fixture asserts the singleton lock precedes the restore insert and
  that the insert contains `SELECT value,$2,id`.

### Public/Draft Isolation Verification Output

```text
$ pnpm --filter @sgc/api test -- platform.service.spec.ts landing-settings.spec.ts
Test Files  15 passed (15)
Tests  54 passed (54)

$ pnpm --filter @sgc/api typecheck
$ tsc -p tsconfig.json --noEmit

$ pnpm --filter @sgc/db typecheck
$ tsc -p tsconfig.json --noEmit
```

## Re-Review Transaction Evidence

- `decideTestimonial` now acquires the singleton landing-settings lock and performs
  testimonial status mutation, immutable revision insertion, draft update, and the
  existing audit action through one transaction client. Approval, rejection, and
  revocation each create a new published revision; public output therefore changes as
  soon as the transaction commits.
- The focused transaction test starts from an already-published landing, approves a
  testimonial, verifies it appears in public output, then revokes it and verifies it
  disappears. It uses distinct pool and transaction-client spies and asserts that the
  testimonial update, revision insert, draft update, and audit insert never use the
  pool connection.
- The audit-failure case throws `audit failure`, executes `ROLLBACK`, keeps the
  committed draft without testimonials, and retains exactly one committed revision.
- Restore now serializes the selected `value` directly into the restored immutable
  revision and current settings row. The restore regression test includes an unknown
  historical field and verifies it survives byte-for-byte JSON-equivalent copying;
  public reads remain the only normalization boundary for that stored revision.

### Re-Review Verification Output

```text
$ pnpm --filter @sgc/api test -- platform.service.spec.ts landing-settings.spec.ts
Test Files  15 passed (15)
Tests  54 passed (54)

$ pnpm --filter @sgc/api typecheck
$ tsc -p tsconfig.json --noEmit

$ pnpm --filter @sgc/db typecheck
$ tsc -p tsconfig.json --noEmit
```
