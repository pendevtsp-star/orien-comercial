import { describe, expect, it } from "vitest";
import { fiscalReadiness } from "./product-fiscal-readiness";

const completeProfile = {
  ncm: "22021000",
  taxOrigin: "0",
  cfopDomestic: "5102",
  cfopInterstate: "6102",
  icmsTaxCode: "102",
  pisTaxCode: "49",
  cofinsTaxCode: "49",
};

describe("fiscalReadiness", () => {
  it("mantém um cadastro não iniciado como pendente", () => {
    expect(fiscalReadiness(null)).toMatchObject({ status: "pending", reviewedByAccountant: false });
  });

  it("bloqueia um cadastro parcialmente preenchido", () => {
    const result = fiscalReadiness({ ncm: "22021000" });
    expect(result.status).toBe("blocked");
    expect(result.missing).toContain("CFOP interno");
  });

  it("exige CEST quando o produto está sujeito a ICMS-ST", () => {
    const result = fiscalReadiness({ ...completeProfile, subjectToIcmsSt: true });
    expect(result.status).toBe("blocked");
    expect(result.missing).toContain("CEST");
  });

  it("libera o produto quando os campos críticos estão completos", () => {
    expect(fiscalReadiness(completeProfile)).toMatchObject({ status: "ready", missing: [] });
  });
});
