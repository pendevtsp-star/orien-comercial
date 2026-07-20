import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { LandingSocialProof } from "./landing-social-proof";
import { fallbackLandingSettings } from "../lib/landing-settings";

describe("LandingSocialProof", () => {
  it("omits the social proof section when there are no authorized testimonials", () => {
    const html = renderToStaticMarkup(
      createElement(LandingSocialProof, { settings: fallbackLandingSettings }),
    );

    expect(html).not.toContain(fallbackLandingSettings.socialProof.title);
    expect(html).not.toContain("backoffice");
    expect(html).not.toContain("autorização de cada empresa");
    expect(html).not.toContain("DEPOIMENTOS DE CLIENTES");
    expect(html).not.toContain("Relatos compartilhados por clientes da Orien.");
  });

  it("renders social proof and WhatsApp only from valid public settings", () => {
    const html = renderToStaticMarkup(
      createElement(LandingSocialProof, {
        settings: {
          ...fallbackLandingSettings,
          whatsappNumber: "55 (11) 99999-9999",
          testimonials: [
            {
              name: "Bruno Silva",
              company: "Comercial Silva",
              role: "Diretor",
              quote: "A equipe ganhou visibilidade e ritmo nas vendas.",
              imageUrl: "",
            },
          ],
        },
      }),
    );

    expect(html).toContain("Bruno Silva");
    expect(html).toContain("https://wa.me/5511999999999");
    expect(html).toContain("DEPOIMENTOS DE CLIENTES");
    expect(html).toContain("Relatos compartilhados por clientes da Orien.");
    expect(html).not.toContain("Relatos de empresas que ganharam clareza na rotina comercial.");
    expect(html).not.toContain("Avaliações de clientes");
    expect(html).not.toContain("★★★★★");
    expect(html).not.toContain("5/5");
    expect(html).not.toContain("Nota 5");
    expect(html).not.toMatch(/aria-label="[^"]*(avaliacao|rating|estrelas)/i);
    expect(html).not.toContain("lucide-star");
    expect(html).not.toContain("autorização de cada empresa");
  });
});
