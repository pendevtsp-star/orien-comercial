import { describe, expect, it } from "vitest";
import {
  commercialDocumentCreateSchema,
  commercialDocumentListQuerySchema,
  commercialDocumentTransitionSchema,
} from "./index";

const branchId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";

describe("commercial document contracts", () => {
  it("keeps the existing quote payload compatible", () => {
    expect(
      commercialDocumentCreateSchema.parse({
        branchId,
        validUntil: "2026-08-01",
        reserveStock: false,
        items: [{ productId, quantity: 1, unitPrice: 12.5, discountAmount: 0 }],
      }),
    ).toMatchObject({ type: "quote", reserveStock: false });
  });

  it("accepts DAV and order documents with bounded validity", () => {
    expect(
      commercialDocumentCreateSchema.parse({
        type: "dav",
        branchId,
        validUntil: "2026-08-01",
        reserveStock: true,
        items: [{ productId, quantity: 2.5, unitPrice: 10, discountAmount: 1 }],
      }).type,
    ).toBe("dav");
  });

  it("requires a cancellation reason", () => {
    expect(() =>
      commercialDocumentTransitionSchema.parse({ action: "cancel", reason: "  " }),
    ).toThrow();
  });

  it("validates list filters and date order", () => {
    expect(() =>
      commercialDocumentListQuerySchema.parse({ startDate: "2026-08-02", endDate: "2026-08-01" }),
    ).toThrow();
    expect(
      commercialDocumentListQuerySchema.parse({ type: "order", status: "reserved", page: 2 }),
    ).toMatchObject({ type: "order", status: "reserved", page: 2 });
  });
});
