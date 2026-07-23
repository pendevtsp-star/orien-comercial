import { describe, expect, it } from "vitest";
import { reportFiltersSchema } from "./index";

const branchId = "11111111-1111-4111-8111-111111111111";
const sellerId = "22222222-2222-4222-8222-222222222222";
const customerId = "33333333-3333-4333-8333-333333333333";

describe("report filters", () => {
  it("accepts authorized commercial and financial dimensions", () => {
    const parsed = reportFiltersSchema.parse({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      branchId,
      sellerId,
      customerId,
      documentType: "dav",
      status: "approved",
      acquirerId: "44444444-4444-4444-8444-444444444444",
      cardBrand: "visa",
    });

    expect(parsed).toMatchObject({ branchId, sellerId, customerId, documentType: "dav" });
  });

  it("rejects an inverted period", () => {
    expect(
      reportFiltersSchema.safeParse({ startDate: "2026-08-01", endDate: "2026-07-31" }).success,
    ).toBe(false);
  });

  it("rejects invalid UUIDs and unknown document dimensions", () => {
    expect(reportFiltersSchema.safeParse({ branchId: "matriz" }).success).toBe(false);
    expect(reportFiltersSchema.safeParse({ documentType: "invoice" }).success).toBe(false);
    expect(reportFiltersSchema.safeParse({ status: "archived" }).success).toBe(false);
  });

  it("limits the period to avoid unbounded operational exports", () => {
    expect(
      reportFiltersSchema.safeParse({ startDate: "2024-01-01", endDate: "2026-07-31" }).success,
    ).toBe(false);
  });
});
