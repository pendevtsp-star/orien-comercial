import { describe, expect, it } from "vitest";
import { normalizeFocusWebhook } from "./fiscal.service";

describe("webhook fiscal Focus", () => {
  it("normaliza apenas os campos operacionais necessários", () => {
    const event = normalizeFocusWebhook({
      ref: "orien-nfce-sale-1",
      evento: "nfce_autorizada",
      status: "autorizado",
      chave_nfce: "35260712345678000199650010000000011000000010",
      protocolo: "135260000000001",
      caminho_xml: "/arquivos/nota.xml",
      caminho_danfe_nfce: "/arquivos/danfe.pdf",
      cpf_destinatario: "00000000000",
    });
    expect(event.reference).toBe("orien-nfce-sale-1");
    expect(event.result.status).toBe("authorized");
    expect(event.payload).not.toHaveProperty("cpf_destinatario");
  });

  it("aceita o payload sanitizado armazenado para reprocessamento", () => {
    const first = normalizeFocusWebhook({ ref: "orien-nfce-sale-2", status: "rejeitado" });
    const replay = normalizeFocusWebhook(first.payload);
    expect(replay.reference).toBe("orien-nfce-sale-2");
    expect(replay.result.status).toBe("rejected");
  });

  it("aceita eventos encapsulados em data", () => {
    const event = normalizeFocusWebhook({
      data: { ref: "orien-nfce-sale-3", status: "autorizado" },
    });
    expect(event.reference).toBe("orien-nfce-sale-3");
    expect(event.result.status).toBe("authorized");
  });

  it("recusa eventos sem referência", () => {
    expect(() => normalizeFocusWebhook({ status: "autorizado" })).toThrow(
      "não possui uma referência válida",
    );
  });
});
