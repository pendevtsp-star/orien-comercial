# Task 1 Report: Landing settings contract

## Changed paths

- `apps/api/src/modules/platform/landing-settings.ts`
  - Added the Zod-backed landing settings contract.
  - Exports `LandingSettingsSchema`, `PublicLandingSettings`,
    `normalizeLandingSettings(value)`, and `toPublicLandingSettings(value)`.
  - Applies secure defaults, including the seven-day no-card trial copy and the
    existing `/checkout?plan=pro` checkout path.
  - Accepts only internal (`/`) and `https:` URLs, falls back from unsafe CTA
    values, rejects markup in copy, keeps showcase slides to four, strips
    unknown fields, and removes administrative metadata from public output.
  - Normalizes public WhatsApp numbers to digits only.
- `apps/api/src/modules/platform/landing-settings.spec.ts`
  - Added the required unsafe-URL and WhatsApp normalization coverage.
- `.superpowers/sdd/task-1-report.md`
  - Added this report.

`apps/api/src/modules/platform/platform.service.ts` was not changed. It already
has unrelated pending landing-settings work in the dirty tree; the new pure
contract is ready for its later integration without changing publication
endpoints in this task.

## TDD evidence

1. Created `landing-settings.spec.ts` before the implementation.
2. Ran `pnpm --filter @sgc/api test -- landing-settings.spec.ts`.
   - Failed as expected with `Cannot find module './landing-settings'`.
3. Added `landing-settings.ts`.
4. Re-ran `pnpm --filter @sgc/api test -- landing-settings.spec.ts`.
   - Passed: 15 test files and 44 tests.
5. Added a protocol-relative URL regression test (`//unsafe.example`), then
   re-ran `pnpm --filter @sgc/api test -- landing-settings.spec.ts`.
   - Failed as expected because a protocol-relative URL was treated as an
     internal path.
6. Restricted internal URLs to a single leading slash and re-ran the focused
   test.
   - Passed: 15 test files and 45 tests.
7. Ran `pnpm --filter @sgc/api typecheck`.
   - Passed: `tsc -p tsconfig.json --noEmit` completed successfully.
8. Ran `pnpm exec prettier --check apps/api/src/modules/platform/landing-settings.ts apps/api/src/modules/platform/landing-settings.spec.ts .superpowers/sdd/task-1-report.md`.
   - Passed: all three task files match Prettier formatting.

## Concerns

- No endpoints were added or changed, as required. A later task must explicitly
  wire the existing platform service/controller flow to this contract and adapt
  persisted legacy settings where necessary.
- No commit, push, deploy, reset, or clean operation was performed.

## Reviewer fixes

Added these regression tests to `landing-settings.spec.ts`:

- `rejects backslash-bearing pseudo paths` verifies `/\\unsafe.example` falls
  back to `/checkout?plan=pro`.
- `rejects CSS-like copy` verifies `body { display: none; }` falls back to the
  secure default description.
- `uses the checkout fallback for an invalid secondary CTA` verifies an unsafe
  secondary CTA URL falls back to `/checkout?plan=pro`.

TDD command and RED result:

```text
pnpm --filter @sgc/api test -- landing-settings.spec.ts
```

- Failed as expected: 3 failures (`/\\unsafe.example` was accepted, CSS-like
  copy was accepted, and the secondary CTA fell back to `/contato`).

GREEN verification commands and results:

```text
pnpm --filter @sgc/api test -- landing-settings.spec.ts
```

- Passed: 15 test files and 48 tests.

```text
pnpm --filter @sgc/api typecheck
```

- Passed: `tsc -p tsconfig.json --noEmit`.

```text
pnpm exec prettier --check apps/api/src/modules/platform/landing-settings.ts apps/api/src/modules/platform/landing-settings.spec.ts .superpowers/sdd/task-1-report.md
```

- Passed: all task files match Prettier formatting.
