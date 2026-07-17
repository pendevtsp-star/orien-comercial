import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { createFiscalProvider } from "./fiscal-provider-registry";

describe("createFiscalProvider", () => {
  it("instancia o adaptador homologado", () => {
    expect(createFiscalProvider("focus_nfe", "token-de-teste", "homologation").name).toBe("focus_nfe");
  });

  it("impede ativar provedor ainda sem homologação", () => {
    expect(() => createFiscalProvider("spedy", "token-de-teste", "homologation")).toThrow(
      BadRequestException,
    );
  });
});
