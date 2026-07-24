import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./loading-state";

describe("LoadingState", () => {
  it("announces loading politely and reserves stable space", () => {
    const markup = renderToStaticMarkup(
      createElement(LoadingState, { label: "Carregando clientes", minHeight: "12rem" }),
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('min-height:12rem');
    expect(markup).toContain("motion-reduce:animate-none");
  });
});
