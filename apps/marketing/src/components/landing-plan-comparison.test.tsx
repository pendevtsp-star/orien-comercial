import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { LandingPlanComparison } from "./landing-plan-comparison";
import { fallbackLandingSettings } from "../lib/landing-settings";

describe("LandingPlanComparison", () => {
  it("renders configured labels for catalog checkout CTAs", () => {
    const html = renderToStaticMarkup(
      createElement(LandingPlanComparison, {
        presentation: {
          ...fallbackLandingSettings.planPresentation,
          ctaLabels: {
            ...fallbackLandingSettings.planPresentation.ctaLabels,
            pro: "Iniciar teste Pro",
          },
        },
      }),
    );

    expect(html).toContain("Iniciar teste Pro");
    expect(html).toContain('href="/checkout?plan=pro"');
  });
});
