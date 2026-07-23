import { describe, expect, it } from "vitest";
import * as types from "./index";

const policyInput = {
  productId: "11111111-1111-4111-8111-111111111111",
  branchId: "22222222-2222-4222-8222-222222222222",
  customerSegmentId: "33333333-3333-4333-8333-333333333333",
  startsAt: "2026-07-21T10:00:00.000Z",
  endsAt: "2026-08-21T10:00:00.000Z",
  minQuantity: 2,
  referencePrice: 120,
  minPrice: 100,
  maxPrice: 140,
  minMarginPercent: 15,
  marginMode: "approval_required",
};

describe("pricing contracts", () => {
  it("validates a versioned policy and rejects inconsistent limits", () => {
    const schema = Reflect.get(types, "pricePolicyCreateSchema") as {
      safeParse(input: unknown): { success: boolean };
    };

    expect(schema.safeParse(policyInput).success).toBe(true);
    expect(schema.safeParse({ ...policyInput, minPrice: 141 }).success).toBe(false);
    expect(schema.safeParse({ ...policyInput, startsAt: "2026-09-01T00:00:00.000Z" }).success).toBe(false);
  });

  it("accepts a sale approval reference but never a client supplied segment or exception reason", () => {
    const schema = Reflect.get(types, "saleCreateSchema") as {
      safeParse(input: unknown): { success: boolean };
      parse(input: unknown): { items: Array<Record<string, unknown>> };
    };
    const sale = {
      branchId: "22222222-2222-4222-8222-222222222222",
      compositionFingerprint: "a".repeat(64),
      items: [
        {
          productId: "11111111-1111-4111-8111-111111111111",
          quantity: 1,
          unitPrice: 90,
          pricingApprovalId: "44444444-4444-4444-8444-444444444444",
          exceptionReason: "Campanha comercial autorizada para este pedido.",
        },
      ],
    };

    expect(schema.safeParse(sale).success).toBe(true);
    expect(schema.parse(sale).items[0]).not.toHaveProperty("exceptionReason");
    expect(schema.safeParse({ ...sale, customerSegmentId: policyInput.customerSegmentId }).success).toBe(false);
  });

  it("keeps the official customer segment identifier on customer writes", () => {
    const schema = Reflect.get(types, "customerCreateSchema") as {
      parse(input: unknown): Record<string, unknown>;
    };

    expect(
      schema.parse({
        name: "Cliente Segmentado",
        customerSegmentId: policyInput.customerSegmentId,
      }).customerSegmentId,
    ).toBe(policyInput.customerSegmentId);
  });

  it("rejects money and quantities with more precision than their database columns", () => {
    const saleSchema = Reflect.get(types, "saleCreateSchema") as { safeParse(input: unknown): { success: boolean } };
    const policySchema = Reflect.get(types, "pricePolicyCreateSchema") as { safeParse(input: unknown): { success: boolean } };
    const approvalSchema = Reflect.get(types, "pricingApprovalRequestSchema") as { safeParse(input: unknown): { success: boolean } };

    expect(saleSchema.safeParse({
      branchId: policyInput.branchId,
      items: [{ productId: policyInput.productId, quantity: 3, unitPrice: 100, discountAmount: 30.005 }],
    }).success).toBe(false);
    expect(policySchema.safeParse({ ...policyInput, minQuantity: 1.0004 }).success).toBe(false);
    expect(approvalSchema.safeParse({
      productId: policyInput.productId,
      branchId: policyInput.branchId,
      quantity: 3,
      unitPrice: 100,
      discountAmount: 30.005,
      allocatedAdjustmentAmount: 0,
      basketFingerprint: "a".repeat(64),
      reason: "Condição comercial aprovada para o total líquido.",
    }).success).toBe(false);
    expect(saleSchema.safeParse({
      branchId: policyInput.branchId,
      items: [{ productId: policyInput.productId, quantity: 1, unitPrice: 10_000_000_000, discountAmount: 0 }],
    }).success).toBe(false);
    expect(policySchema.safeParse({ ...policyInput, minQuantity: 1_000_000_000 }).success).toBe(false);
  });

  it("binds globally adjusted approvals and sale creation to a SHA-256 basket fingerprint", () => {
    const saleSchema = Reflect.get(types, "saleCreateSchema") as { safeParse(input: unknown): { success: boolean } };
    const approvalSchema = Reflect.get(types, "pricingApprovalRequestSchema") as { safeParse(input: unknown): { success: boolean } };
    const fingerprint = "a".repeat(64);

    expect(saleSchema.safeParse({
      branchId: policyInput.branchId,
      compositionFingerprint: fingerprint,
      items: [{ productId: policyInput.productId, quantity: 1, unitPrice: 100 }],
    }).success).toBe(true);
    expect(saleSchema.safeParse({
      branchId: policyInput.branchId,
      compositionFingerprint: "not-a-hash",
      items: [{ productId: policyInput.productId, quantity: 1, unitPrice: 100 }],
    }).success).toBe(false);
    expect(approvalSchema.safeParse({
      productId: policyInput.productId,
      branchId: policyInput.branchId,
      quantity: 1,
      unitPrice: 100,
      discountAmount: 0,
      allocatedAdjustmentAmount: 20,
      basketFingerprint: fingerprint,
      reason: "Benefício global aprovado para esta cesta exata.",
    }).success).toBe(true);
    expect(approvalSchema.safeParse({
      productId: policyInput.productId,
      branchId: policyInput.branchId,
      quantity: 1,
      unitPrice: 100,
      discountAmount: 0,
      allocatedAdjustmentAmount: 20,
      reason: "Benefício sem fingerprint não pode ser aprovado.",
    }).success).toBe(false);
  });
});
