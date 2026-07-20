### Task 1: Definir o contrato publico e as validacoes de conteudo

**Files:**
- Create: `apps/api/src/modules/platform/landing-settings.ts`
- Create: `apps/api/src/modules/platform/landing-settings.spec.ts`
- Modify: `apps/api/src/modules/platform/platform.service.ts` only where necessary to consume the new contract later; do not implement publication endpoints in this task.

**Interfaces:**
- Produce `LandingSettingsSchema`, `PublicLandingSettings`, `normalizeLandingSettings(value)` and `toPublicLandingSettings(value)`.
- API, admin and marketing will consume the same public contract later.

**Global constraints:**
- Keep Orien brand irrelevant to API copy but preserve trial of 7 days without card and existing checkout flow.
- Backoffice controls content and visibility; code controls security and accessibility.
- Reject HTML, CSS, arbitrary scripts and unsafe URLs.
- URLs may only be internal paths beginning with `/` or `https:` URLs.
- Do not commit, push or deploy. Work only in your assigned workspace.

- [ ] Write a failing Vitest spec for URL sanitization and normalized public settings:

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

- [ ] Run `pnpm --filter @sgc/api test -- landing-settings.spec.ts` and verify it fails because the module is missing.
- [ ] Implement the smallest Zod based contract. The schema must include hero copy, primary/secondary CTAs, section visibility flags, WhatsApp, and up to four showcase slides. Copy limits: eyebrow 90, title 150, description 320, WhatsApp message 400.
- [ ] `normalizeLandingSettings` must merge secure defaults and validate unknown input. `toPublicLandingSettings` must normalize a number to digits only, strip administrative-only fields and use `/checkout?plan=pro` as safe CTA fallback.
- [ ] Re-run the focused test and typecheck. Report exact commands and results.
- [ ] Write a detailed report to `.superpowers/sdd/task-1-report.md`: paths changed, tests run, concerns. Return only status and a one-line summary to the controller.
