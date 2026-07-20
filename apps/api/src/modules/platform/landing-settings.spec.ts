import { describe, expect, it } from "vitest";
import { normalizeLandingSettings, toPublicLandingSettings } from "./landing-settings";

describe("toPublicLandingSettings", () => {
  it("removes unsafe URLs and keeps public settings within copy limits", () => {
    const result = toPublicLandingSettings({
      hero: {
        title: "Gestao clara",
        primaryCta: { label: "Testar", href: "javascript:alert(1)" },
      },
      whatsappNumber: "+55 (11) 99999-9999",
    });

    expect(result.hero.primaryCta.href).toBe("/checkout?plan=pro");
    expect(result.whatsappNumber).toBe("5511999999999");
  });

  it("does not treat protocol-relative URLs as internal paths", () => {
    const result = toPublicLandingSettings({
      hero: { primaryCta: { label: "Testar", href: "//unsafe.example" } },
    });

    expect(result.hero.primaryCta.href).toBe("/checkout?plan=pro");
  });

  it("rejects backslash-bearing pseudo paths", () => {
    const result = toPublicLandingSettings({
      hero: { primaryCta: { label: "Testar", href: "/\\unsafe.example" } },
    });

    expect(result.hero.primaryCta.href).toBe("/checkout?plan=pro");
  });

  it("rejects CSS-like copy", () => {
    const result = toPublicLandingSettings({
      hero: { description: "body { display: none; }" },
    });

    expect(result.hero.description).toBe(
      "Teste por 7 dias sem cartão e mantenha o seu comercial sob controle.",
    );
  });

  it("uses the checkout fallback for an invalid secondary CTA", () => {
    const result = toPublicLandingSettings({
      hero: { secondaryCta: { label: "Testar", href: "javascript:alert(1)" } },
    });

    expect(result.hero.secondaryCta).not.toBeNull();
    expect(result.hero.secondaryCta).toMatchObject({ href: "/checkout?plan=pro" });
  });

  it("preserves a deliberately hidden secondary CTA while legacy drafts keep their default", () => {
    expect(toPublicLandingSettings({ hero: { secondaryCta: null } }).hero.secondaryCta).toBeNull();
    expect(toPublicLandingSettings({}).hero.secondaryCta).toEqual({
      label: "Falar com especialista",
      href: "/contato",
    });
  });

  it("allows public internal showcase assets and rejects unsafe image paths", () => {
    const result = toPublicLandingSettings({
      showcaseSlides: [
        {
          title: "Painel de vendas",
          description: "Acompanhe a operação em tempo real.",
          imageUrl: "/product-showcase/painel-vendas.png",
        },
        {
          title: "Origem insegura",
          description: "Não deve preservar o caminho.",
          imageUrl: "//unsafe.example/image.png",
        },
      ],
    });

    expect(result.showcaseSlides).toEqual([
      expect.objectContaining({ imageUrl: "/product-showcase/painel-vendas.png" }),
      expect.objectContaining({ imageUrl: "" }),
    ]);
  });

  it("rejects normalized and encoded traversal paths while keeping local showcase assets", () => {
    const result = toPublicLandingSettings({
      hero: { primaryCta: { label: "Testar", href: "/checkout/%2e%2e/admin" } },
      finalCta: { label: "Falar com vendas", href: "/planos//pro" },
      footerLinks: [{ label: "Termos", href: "/contato/../admin" }],
      showcaseSlides: [
        {
          title: "Arquivo local",
          description: "Um caminho local publicado pela vitrine.",
          imageUrl: "/product-showcase/foo.webp",
          href: "/product-showcase/%2fprivado",
        },
        {
          title: "Arquivo inseguro",
          description: "Não deve conservar caminho normalizado.",
          imageUrl: "/product-showcase/%2e%2e/admin.webp",
        },
      ],
    });

    expect(result.hero.primaryCta.href).toBe("/checkout?plan=pro");
    expect(result.finalCta.href).toBe("/checkout?plan=pro");
    expect(result.footerLinks).toEqual([]);
    expect(result.showcaseSlides).toEqual([
      expect.objectContaining({ imageUrl: "/product-showcase/foo.webp", href: "" }),
      expect.objectContaining({ imageUrl: "" }),
    ]);
  });

  it("keeps approved testimonials while sanitizing their public image URLs", () => {
    const result = toPublicLandingSettings({
      testimonials: [
        {
          testimonialRequestId: "request-1",
          name: "Bruno",
          quote: "A equipe ganhou visibilidade e ritmo nas vendas.",
          imageUrl: "javascript:alert(1)",
        },
      ],
    });

    expect(result.testimonials).toEqual([
      expect.objectContaining({
        testimonialRequestId: "request-1",
        imageUrl: "",
      }),
    ]);
  });

  it("adds safe defaults for the versioned landing controls without changing legacy drafts", () => {
    const result = toPublicLandingSettings({
      showcaseSlides: [
        {
          title: "Painel de vendas",
          description: "Acompanhe a operação em tempo real.",
        },
      ],
    });

    expect(result).toMatchObject({
      hero: { trialText: "Teste por 7 dias sem cartão." },
      supportEmail: "",
      planPresentation: {
        highlightedPlan: "pro",
        ctaLabels: {
          starter: "Começar agora",
          pro: "Começar agora",
          enterprise: "Falar com especialista",
        },
      },
      socialProof: { title: "Histórias de quem organiza melhor a operação" },
      visibility: {
        showProduct: true,
        showMigration: true,
        showSecurity: true,
      },
      finalCta: { label: "Começar teste gratuito", href: "/checkout?plan=pro" },
      footerLinks: [],
      showcaseSlides: [
        {
          alt: "Painel de vendas",
          isVisible: true,
        },
      ],
    });
    expect(result).not.toHaveProperty("admin");
  });

  it("uses a neutral social proof title by default", () => {
    expect(toPublicLandingSettings({}).socialProof.title).toBe(
      "Histórias de quem organiza melhor a operação",
    );
  });

  it.each([
    "/checkout/%2e%2e/admin",
    "/checkout/%252e%252e/admin",
    "/produto/%2fprivado",
    "/produto/%252fprivado",
    "/produto/%5cprivado",
    "/produto/%255cprivado",
  ])("rejects percent-encoded internal path: %s", (href) => {
    const result = toPublicLandingSettings({ finalCta: { label: "Falar com vendas", href } });

    expect(result.finalCta.href).toBe("/checkout?plan=pro");
  });

  it("keeps a valid local path and HTTPS URL", () => {
    const local = toPublicLandingSettings({
      finalCta: { label: "Falar com vendas", href: "/contato" },
    });
    const external = toPublicLandingSettings({
      finalCta: { label: "Falar com vendas", href: "https://example.com/demo%20seguro" },
    });

    expect(local.finalCta.href).toBe("/contato");
    expect(external.finalCta.href).toBe("https://example.com/demo%20seguro");
  });

  it("normalizes unsafe URLs and invalid optional values in new public controls", () => {
    const result = normalizeLandingSettings({
      hero: { trialText: "<script>alert(1)</script>" },
      supportEmail: "not-an-email",
      showcaseSlides: [
        {
          title: "Painel de vendas",
          description: "Acompanhe a operação em tempo real.",
          alt: "<img src=x>",
          imageUrl: "javascript:alert(1)",
          href: "//unsafe.example",
          isVisible: "yes",
        },
      ],
      finalCta: { label: "Começar", href: "javascript:alert(1)" },
      footerLinks: [{ label: "Termos", href: "/\\unsafe.example" }],
    });

    expect(result.hero.trialText).toBe("Teste por 7 dias sem cartão.");
    expect(result.supportEmail).toBe("");
    expect(result.showcaseSlides).toEqual([
      expect.objectContaining({
        alt: "Painel de vendas",
        imageUrl: "",
        href: "",
        isVisible: true,
      }),
    ]);
    expect(result.finalCta.href).toBe("/checkout?plan=pro");
    expect(result.footerLinks).toEqual([]);
  });

  it("keeps valid public plan, footer, CTA and support controls", () => {
    const result = toPublicLandingSettings({
      hero: { trialText: "Teste a Orien por 7 dias." },
      supportEmail: "suporte@useorien.com.br",
      planPresentation: {
        highlightedPlan: "enterprise",
        ctaLabels: {
          starter: "Testar Starter",
          pro: "Testar Pro",
          enterprise: "Falar com vendas",
        },
      },
      socialProof: { title: "Histórias de clientes" },
      visibility: { showProduct: false, showMigration: false, showSecurity: false },
      finalCta: { label: "Fale com vendas", href: "https://example.com/demo" },
      footerLinks: [{ label: "Privacidade", href: "/privacidade" }],
    });

    expect(result).toMatchObject({
      hero: { trialText: "Teste a Orien por 7 dias." },
      supportEmail: "suporte@useorien.com.br",
      planPresentation: { highlightedPlan: "enterprise" },
      socialProof: { title: "Histórias de clientes" },
      visibility: { showProduct: false, showMigration: false, showSecurity: false },
      finalCta: { label: "Fale com vendas", href: "https://example.com/demo" },
      footerLinks: [{ label: "Privacidade", href: "/privacidade" }],
    });
  });
});
