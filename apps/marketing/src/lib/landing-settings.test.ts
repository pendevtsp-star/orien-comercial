import { describe, expect, it } from "vitest";
import {
  hasVisibleShowcaseSlides,
  isValidWhatsappNumber,
  normalizePublicLandingSettings,
} from "./landing-settings";

describe("landing settings", () => {
  it("uses a safe fallback CTA and detects whether the showcase has visible slides", () => {
    const settings = normalizePublicLandingSettings({
      hero: { secondaryCta: { label: "Ver produto", href: "#produto" } },
      showcaseSlides: [
        {
          title: "Slide oculto",
          description: "Não deve tornar a vitrine disponível.",
          isVisible: false,
        },
      ],
    });

    expect(settings.hero.secondaryCta?.href).toBe("/checkout?plan=pro");
    expect(hasVisibleShowcaseSlides(settings.showcaseSlides)).toBe(false);
    expect(
      hasVisibleShowcaseSlides([
        {
          eyebrow: "PDV",
          title: "Venda rápida",
          description: "Fluxo disponível para a equipe.",
          alt: "Painel de vendas",
          imageUrl: "/product-showcase/foo.webp",
          href: "",
          isVisible: true,
        },
      ]),
    ).toBe(true);
  });

  it.each([
    "/checkout/%2e%2e/admin",
    "/checkout/%252e%252e/admin",
    "/produto/%2fprivado",
    "/produto/%252fprivado",
    "/produto/%5cprivado",
    "/produto/%255cprivado",
  ])("rejects every percent-encoded internal path: %s", (href) => {
    const settings = normalizePublicLandingSettings({
      finalCta: { label: "Testar", href },
      showcaseSlides: [
        {
          title: "Painel de vendas",
          description: "Acompanhe a operação em tempo real.",
          imageUrl: "/product-showcase/foo.webp",
          href,
        },
        {
          title: "Painel inseguro",
          description: "Não deve manter o caminho inseguro.",
          imageUrl: "/product-showcase/../privado.webp",
        },
      ],
    });

    expect(settings.finalCta.href).toBe("/checkout?plan=pro");
    expect(settings.showcaseSlides).toEqual([
      expect.objectContaining({ imageUrl: "/product-showcase/foo.webp", href: "" }),
      expect.objectContaining({ imageUrl: "" }),
    ]);
  });

  it("keeps a valid local path and HTTPS URL", () => {
    const settings = normalizePublicLandingSettings({
      finalCta: { label: "Testar", href: "/checkout?plan=pro" },
      showcaseSlides: [
        {
          title: "Painel de vendas",
          description: "Acompanhe a operação em tempo real.",
          imageUrl: "https://cdn.example.com/painel%20vendas.webp",
          href: "https://example.com/demo%20seguro",
        },
      ],
    });

    expect(settings.finalCta.href).toBe("/checkout?plan=pro");
    expect(settings.showcaseSlides).toEqual([
      expect.objectContaining({
        imageUrl: "https://cdn.example.com/painel%20vendas.webp",
        href: "https://example.com/demo%20seguro",
      }),
    ]);
  });

  it("accepts only WhatsApp numbers between ten and fifteen digits", () => {
    expect(isValidWhatsappNumber("123456789")).toBe(false);
    expect(isValidWhatsappNumber("5511999999999")).toBe(true);
    expect(isValidWhatsappNumber("1234567890123456")).toBe(false);
  });
});
