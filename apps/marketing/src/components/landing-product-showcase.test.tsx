import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { LandingProductShowcase } from "./landing-product-showcase";

describe("LandingProductShowcase", () => {
  it("omits the showcase when no visible slides are configured", () => {
    expect(renderToStaticMarkup(createElement(LandingProductShowcase, { slides: [] }))).toBe("");
  });

  it("renders configured slides in an accessible carousel region", () => {
    const html = renderToStaticMarkup(
      createElement(LandingProductShowcase, {
        slides: [
          {
            eyebrow: "PDV",
            title: "Venda sem filas",
            description: "Fluxos comerciais organizados.",
            alt: "Painel do PDV",
            imageUrl: "/product-showcase/pdv.png",
            href: "/checkout?plan=pro",
            isVisible: true,
          },
        ],
      }),
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-roledescription="carrossel"');
    expect(html).toContain("Venda sem filas");
    expect(html).toContain("Conheça os recursos para vender, controlar e acompanhar sua operação.");
    expect(html).not.toContain("números decorativos");
  });
});
