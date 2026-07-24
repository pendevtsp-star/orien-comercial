import { describe, expect, it } from "vitest";
import {
  basisPointsToPercent,
  buildReportQuery,
  centsToMoney,
  commercialDocumentActions,
  commercialDocumentStatusLabel,
  commercialDocumentTypeLabel,
  moneyToCents,
  settlementStatusLabel,
} from "./operational-workflows";

describe("commercial document workflow", () => {
  it("keeps labels and actions in Portuguese for each operational state", () => {
    expect(commercialDocumentTypeLabel("dav")).toBe("Documento auxiliar de venda");
    expect(commercialDocumentStatusLabel("reserved")).toBe("Reservado");
    expect(commercialDocumentActions("quote", "draft")).toEqual(["send", "cancel"]);
    expect(commercialDocumentActions("order", "approved")).toEqual(["reserve", "convert", "cancel"]);
    expect(commercialDocumentActions("dav", "converted")).toEqual([]);
  });
});

describe("financial presentation", () => {
  it("converts money and fee percentages without floating point drift", () => {
    expect(moneyToCents("1234,56")).toBe(123456);
    expect(centsToMoney(123456)).toBe("1234.56");
    expect(basisPointsToPercent(349)).toBe("3,49%");
  });

  it("translates settlement status", () => {
    expect(settlementStatusLabel("partially_settled")).toBe("Liquidado parcialmente");
    expect(settlementStatusLabel("diverged")).toBe("Com divergência");
  });
});

describe("report filters", () => {
  it("uses the same non-empty filters for JSON, CSV and PDF", () => {
    expect(buildReportQuery({
      startDate: "2026-07-01",
      endDate: "2026-07-21",
      branchId: "branch-a",
      status: "",
      documentType: "order",
    })).toBe("?startDate=2026-07-01&endDate=2026-07-21&branchId=branch-a&documentType=order");
  });
});
