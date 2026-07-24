import { describe, expect, it } from "vitest";
import { assertAuthoritativeFallbackPrice, calculateSaleItemPricing, evaluateMargin, resolvePricePolicy, type PricePolicyCandidate } from "./pricing-policy";

const now = new Date("2026-07-21T12:00:00.000Z");

const basePolicy: PricePolicyCandidate = {
  id: "global",
  tenantId: "tenant-a",
  productId: "product-a",
  branchId: null,
  customerSegmentId: null,
  startsAt: null,
  endsAt: null,
  minQuantity: 1,
  referencePrice: 100,
  minPrice: 90,
  maxPrice: 110,
  minMarginPercent: 10,
  marginMode: "warn",
  priority: 0,
  version: 1,
};

describe("price policy resolution", () => {
  it("rejects a client unit price that differs from the authoritative fallback", () => {
    expect(() => assertAuthoritativeFallbackPrice(79.9, 80)).toThrow(/preço resolvido/i);
    expect(assertAuthoritativeFallbackPrice(undefined, 80)).toBe(80);
    expect(assertAuthoritativeFallbackPrice(80, 80)).toBe(80);
  });

  it("selects the most specific current policy inside the tenant", () => {
    const result = resolvePricePolicy(
      [
        basePolicy,
        { ...basePolicy, id: "branch", branchId: "branch-a", version: 2 },
        {
          ...basePolicy,
          id: "branch-and-segment",
          branchId: "branch-a",
          customerSegmentId: "segment-a",
          minQuantity: 3,
          version: 1,
        },
        { ...basePolicy, id: "future", startsAt: new Date("2026-08-01T00:00:00.000Z") },
        { ...basePolicy, id: "other-tenant", tenantId: "tenant-b", version: 99 },
      ],
      {
        tenantId: "tenant-a",
        productId: "product-a",
        branchId: "branch-a",
        customerSegmentId: "segment-a",
        quantity: 3,
        now,
      },
    );

    expect(result?.id).toBe("branch-and-segment");
  });

  it("uses quantity and version only after matching policy scope", () => {
    const result = resolvePricePolicy(
      [
        basePolicy,
        { ...basePolicy, id: "quantity-2", minQuantity: 2, version: 1 },
        { ...basePolicy, id: "quantity-2-new", minQuantity: 2, version: 2 },
        { ...basePolicy, id: "quantity-5", minQuantity: 5, version: 1 },
      ],
      {
        tenantId: "tenant-a",
        productId: "product-a",
        branchId: "branch-a",
        customerSegmentId: null,
        quantity: 3,
        now,
      },
    );

    expect(result?.id).toBe("quantity-2-new");
  });

  it("uses configured priority before specificity", () => {
    const result = resolvePricePolicy(
      [
        { ...basePolicy, id: "segment", customerSegmentId: "segment-a", priority: 5 },
        { ...basePolicy, id: "branch", branchId: "branch-a", priority: 10 },
      ],
      { tenantId: "tenant-a", productId: "product-a", branchId: "branch-a", customerSegmentId: "segment-a", quantity: 1, now },
    );

    expect(result?.id).toBe("branch");
  });

  it("rejects ambiguous top policies with different scopes", () => {
    expect(() => resolvePricePolicy(
      [
        { ...basePolicy, id: "branch", branchId: "branch-a" },
        { ...basePolicy, id: "segment", customerSegmentId: "segment-a" },
      ],
      { tenantId: "tenant-a", productId: "product-a", branchId: "branch-a", customerSegmentId: "segment-a", quantity: 1, now },
    )).toThrow(/configuração de preço/i);
  });

  it("evaluates margin behavior without trusting a client supplied limit", () => {
    expect(evaluateMargin({ minMarginPercent: 20, marginMode: "warn" }, 10)).toEqual({ status: "warn" });
    expect(evaluateMargin({ minMarginPercent: 20, marginMode: "block" }, 10)).toEqual({ status: "block" });
    expect(evaluateMargin({ minMarginPercent: 20, marginMode: "approval_required" }, 10)).toEqual({
      status: "approval_required",
    });
    expect(evaluateMargin({ minMarginPercent: 20, marginMode: "block" }, 20)).toEqual({ status: "ok" });
  });

  it("compares policy bounds and margin from the same rounded net total", () => {
    expect(calculateSaleItemPricing({
      unitPrice: 100,
      costPrice: 60,
      minPrice: 90,
      maxPrice: 110,
      quantity: 3,
      discountAmount: 30.01,
    })).toMatchObject({
      grossTotal: 300,
      netTotal: 269.99,
      effectiveUnitPrice: 89.99666666666667,
      projectedMarginPercent: 33.33,
      priceWithinLimits: false,
    });
  });
});
