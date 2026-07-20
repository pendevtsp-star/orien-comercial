import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarketingPage from "./page";

describe("MarketingPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("omits product navigation and product anchors when there are no visible slides", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ visibility: { showProduct: true }, showcaseSlides: [] }),
      }),
    );

    const html = renderToStaticMarkup(await MarketingPage());

    expect(html).not.toContain('href="#produto"');
    expect(html).not.toContain('id="produto"');
    expect(html).toContain('href="/checkout?plan=pro"');
  });

  it("renders product navigation only when the showcase has a visible slide", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          visibility: { showProduct: true },
          showcaseSlides: [
            {
              title: "Painel de vendas",
              description: "Acompanhe a operação em tempo real.",
              imageUrl: "/product-showcase/foo.webp",
              isVisible: true,
            },
          ],
        }),
      }),
    );

    const html = renderToStaticMarkup(await MarketingPage());

    expect(html).toContain('href="#produto"');
    expect(html).toContain('id="produto"');
  });
});
