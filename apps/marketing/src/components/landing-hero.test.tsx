import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { LandingHero } from "./landing-hero";
import { fallbackLandingSettings } from "../lib/landing-settings";

describe("LandingHero", () => {
  it("renders the required primary CTA and omits an unavailable secondary CTA", () => {
    const withSecondary = renderToStaticMarkup(
      createElement(LandingHero, { hero: fallbackLandingSettings.hero }),
    );
    const withoutSecondary = renderToStaticMarkup(
      createElement(LandingHero, {
        hero: { ...fallbackLandingSettings.hero, secondaryCta: null },
      }),
    );

    expect(withSecondary).toContain(fallbackLandingSettings.hero.primaryCta.label);
    expect(withSecondary).toContain("Conhecer planos");
    expect(withSecondary).not.toContain('href="#produto"');
    expect(withoutSecondary).not.toContain("Conhecer planos");
  });
});
