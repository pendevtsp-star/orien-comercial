import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { LandingCalculator } from "./landing-calculator";

describe("LandingCalculator", () => {
  it("renders accessible inputs and an operational-hours estimate", () => {
    const html = renderToStaticMarkup(createElement(LandingCalculator));

    expect(html).toContain('id="calculator"');
    expect(html).toContain("Pessoas envolvidas");
    expect(html).toContain("Horas recuperadas por mês");
  });
});
