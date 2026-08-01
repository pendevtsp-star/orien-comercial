import { describe, expect, it } from "vitest";
import { countAdvancedFilters, financialStatusLabel } from "./page-model";

describe("countAdvancedFilters", () => {
  it("counts only advanced financial filters that affect the result", () => {
    expect(
      countAdvancedFilters({
        search: "cliente",
        branchId: "branch-1",
        paymentMethod: "pix",
        dueDateFrom: "2026-07-01",
        dueDateTo: "",
      }),
    ).toBe(3);
  });

  it("returns zero when only the visible search is filled", () => {
    expect(
      countAdvancedFilters({
        search: "cliente",
        branchId: "",
        paymentMethod: "",
        dueDateFrom: "",
        dueDateTo: "",
      }),
    ).toBe(0);
  });
});

describe("financialStatusLabel", () => {
  it("translates operational status values", () => {
    expect(financialStatusLabel("open")).toBe("Em aberto");
    expect(financialStatusLabel("paid")).toBe("Pago");
    expect(financialStatusLabel("reconciled")).toBe("Conciliado");
    expect(financialStatusLabel("diverged")).toBe("Com divergência");
  });
});
