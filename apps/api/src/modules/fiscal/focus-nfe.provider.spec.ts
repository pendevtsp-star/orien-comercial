import { describe, expect, it } from "vitest";
import { FocusNfeProvider, normalizeFocusResponse } from "./focus-nfe.provider";

describe("FocusNfeProvider", () => {
  it("normaliza uma NFC-e autorizada", () => {
    expect(
      normalizeFocusResponse({
        status: "autorizado",
        chave_nfce: "35260712345678000199650010000000011000000010",
        protocolo: "135260000000001",
      }),
    ).toMatchObject({ status: "authorized", protocol: "135260000000001" });
  });

  it("usa Basic Auth com senha vazia e ambiente de homologação", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetcher: typeof fetch = (input, init) => {
      requestedUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requestedInit = init;
      return Promise.resolve(
        new Response(JSON.stringify({ status: "autorizado", ref: "sale-1" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );
    };
    const provider = new FocusNfeProvider("token-teste", "homologation", fetcher);
    await provider.issue({ reference: "sale-1", documentType: "nfce", payload: {} });
    expect(requestedUrl).toContain("https://homologacao.focusnfe.com.br/v2/nfce?");
    expect(new Headers(requestedInit?.headers).get("Authorization")).toBe(
      `Basic ${Buffer.from("token-teste:").toString("base64")}`,
    );
  });

  it("baixa artefatos apenas do domínio oficial com autenticação", async () => {
    let authorization = "";
    const provider = new FocusNfeProvider("token-teste", "homologation", (_input, init) => {
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return Promise.resolve(
        new Response("<nfeProc />", { status: 200, headers: { "Content-Type": "application/xml" } }),
      );
    });
    const artifact = await provider.downloadArtifact("/arquivos/nota.xml");
    expect(artifact.content.toString()).toBe("<nfeProc />");
    expect(authorization).toBe(`Basic ${Buffer.from("token-teste:").toString("base64")}`);
    await expect(provider.downloadArtifact("https://example.com/nota.xml")).rejects.toThrow(
      "endereço de artefato inválido",
    );
  });
});
