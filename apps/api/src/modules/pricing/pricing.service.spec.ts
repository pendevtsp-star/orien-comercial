import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PricingService } from "./pricing.service";

const context = {
  tenantId: "tenant-a",
  userId: "seller-a",
  membershipId: "membership-a",
  roleSlug: "seller",
  branchId: "branch-a",
  permissions: [],
};

describe("PricingService", () => {
  it("lists only valid pending approvals in the authorized branch", async () => {
    const tenantQuery = vi.fn().mockResolvedValue({ rows: [{ id: "approval-a" }] });
    const service = new PricingService({ tenantQuery } as never);

    await expect(service.listPendingApprovals(context)).resolves.toEqual({
      data: [{ id: "approval-a" }],
    });

    expect(tenantQuery).toHaveBeenCalledWith(
      "tenant-a",
      expect.stringContaining("pa.expires_at > now()"),
      ["tenant-a", "branch-a"],
    );
    expect(tenantQuery.mock.calls[0]?.[1]).toContain("pa.branch_id=$2");
  });

  it("automatically scopes policy lists to the membership branch", async () => {
    const tenantQuery = vi.fn((_tenantId: string, _query: string, _values: unknown[]) => {
      void _tenantId;
      void _query;
      void _values;
      return Promise.resolve({ rows: [] });
    });
    const service = new PricingService({ tenantQuery } as never);

    await service.listPolicies({ ...context, branchId: "branch-a" }, { page: 1, pageSize: 20 });

    expect(tenantQuery.mock.calls[0]?.[1]).toContain("pp.branch_id=$2");
    expect(tenantQuery.mock.calls[0]?.[2]).toEqual(expect.arrayContaining(["tenant-a", "branch-a"]));
  });

  it("locks the policy scope before calculating its next version", async () => {
    const query = vi.fn((sql: string, _values?: unknown[]) => {
      void _values;
      if (sql.includes("FROM products")) return { rows: [{ id: "product-a" }] };
      if (sql.includes("FROM branches")) return { rows: [{ id: "branch-a" }] };
      if (sql.includes("MAX(version)")) return { rows: [{ version: 2 }] };
      if (sql.includes("INSERT INTO price_policies")) return { rows: [{ id: "policy-a" }] };
      return { rows: [] };
    });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new PricingService({ tenantTransaction } as never);

    await service.createPolicy(context, {
      productId: "product-a", minQuantity: 1, referencePrice: 100, minPrice: 90, maxPrice: 110, marginMode: "warn", priority: 0,
    });

    const lockIndex = query.mock.calls.findIndex(([sql]) => sql.includes("pg_advisory_xact_lock"));
    const versionIndex = query.mock.calls.findIndex(([sql]) => sql.includes("MAX(version)"));
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(versionIndex);
  });

  it("resolves an official customer segment inside the tenant instead of accepting a client group", async () => {
    const tenantQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          productId: "product-a",
          productName: "Produto A",
          productBranchId: null,
          salePrice: "120",
          costPrice: "60",
          customerSegmentId: "segment-a",
          customerSegmentCode: "VIP",
          policyId: "policy-a",
          policyVersion: 3,
          referencePrice: "100",
          minPrice: "90",
          maxPrice: "110",
          minMarginPercent: "15",
          marginMode: "block",
        },
      ],
    });
    const service = new PricingService({ tenantQuery } as never);

    const resolved = await service.resolve(context, {
      productId: "product-a",
      branchId: "branch-a",
      quantity: 2,
      customerId: "customer-a",
      unitPrice: 95,
    });

    expect(resolved).toMatchObject({
      policyId: "policy-a",
      customerSegmentId: "segment-a",
      unitPrice: 95,
      priceWithinLimits: true,
      projectedMarginPercent: 36.84,
    });
    expect(tenantQuery.mock.calls[0]?.[1]).toContain("customer_segment_id");
    expect(tenantQuery.mock.calls[0]?.[2]).toEqual([
      "tenant-a",
      "product-a",
      "branch-a",
      "customer-a",
      2,
    ]);
  });

  it("uses the server fallback price when no policy is active", async () => {
    const tenantQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          productId: "product-a",
          productName: "Produto A",
          productBranchId: null,
          salePrice: "120",
          costPrice: "60",
          customerSegmentId: null,
          customerSegmentCode: null,
          legacyFixedPrice: null,
          legacyDiscountPercent: null,
          policyId: null,
          policyVersion: null,
          referencePrice: null,
          minPrice: null,
          maxPrice: null,
          minMarginPercent: null,
          marginMode: null,
        },
      ],
    });
    const service = new PricingService({ tenantQuery } as never);

    const resolved = await service.resolve(context, {
      productId: "product-a",
      branchId: "branch-a",
      quantity: 1,
      unitPrice: 1,
    });

    expect(resolved).toMatchObject({ policyId: null, referencePrice: 120, unitPrice: 120 });
  });

  it("rounds a legacy percentage discount to the monetary cent", async () => {
    const tenantQuery = vi.fn().mockResolvedValue({
      rows: [{
        productId: "product-a", productName: "Produto A", productBranchId: null, salePrice: "19.99", costPrice: "10",
        customerSegmentId: null, customerSegmentCode: null, legacyFixedPrice: null, legacyDiscountPercent: "10",
        policyId: null, policyVersion: null, referencePrice: null, minPrice: null, maxPrice: null,
        minMarginPercent: null, marginMode: null,
      }],
    });
    const service = new PricingService({ tenantQuery } as never);

    const resolved = await service.resolve(context, { productId: "product-a", branchId: "branch-a", quantity: 1 });

    expect(resolved).toMatchObject({ referencePrice: 17.99, unitPrice: 17.99 });
  });

  it("flags prices below and above the server policy limits", async () => {
    const tenantQuery = vi.fn().mockResolvedValue({
      rows: [{
        productId: "product-a", productName: "Produto A", productBranchId: null, salePrice: "120", costPrice: "60",
        customerSegmentId: null, customerSegmentCode: null, legacyFixedPrice: null, legacyDiscountPercent: null,
        policyId: "policy-a", policyVersion: 1, referencePrice: "100", minPrice: "90", maxPrice: "110",
        minMarginPercent: null, marginMode: "warn",
      }],
    });
    const service = new PricingService({ tenantQuery } as never);

    const below = await service.resolve(context, { productId: "product-a", branchId: "branch-a", quantity: 1, unitPrice: 89 });
    const above = await service.resolve(context, { productId: "product-a", branchId: "branch-a", quantity: 1, unitPrice: 111 });

    expect(below.priceWithinLimits).toBe(false);
    expect(above.priceWithinLimits).toBe(false);
  });

  it("rejects self-approval before changing an approval request", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ requested_by_user_id: "seller-a", status: "pending", expires_at: new Date("2026-07-21T12:10:00Z") }],
    });
    const tenantTransaction = vi.fn(async (_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) =>
      callback({ query }),
    );
    const service = new PricingService({ tenantTransaction } as never);

    await expect(
      service.decideApproval(
        { ...context, userId: "seller-a", permissions: ["pricing.exceptions.authorize"] },
        "approval-a",
        { approved: true },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects an approval decision outside the approver branch", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          requested_by_user_id: "seller-b",
          branch_id: "branch-b",
          status: "pending",
          expires_at: new Date(Date.now() + 60_000),
        },
      ],
    });
    const tenantTransaction = vi.fn(async (_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) =>
      callback({ query }),
    );
    const service = new PricingService({ tenantTransaction } as never);

    await expect(
      service.decideApproval(
        { ...context, permissions: ["pricing.exceptions.authorize"], branchId: "branch-a" },
        "approval-b",
        { approved: true },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("persists an expired approval before reporting the expiration", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          requested_by_user_id: "seller-b",
          branch_id: "branch-a",
          status: "pending",
          expires_at: new Date(Date.now() - 60_000),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const tenantTransaction = vi.fn(async (_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) =>
      callback({ query }),
    );
    const service = new PricingService({ tenantTransaction } as never);

    await expect(
      service.decideApproval(
        { ...context, permissions: ["pricing.exceptions.authorize"] },
        "approval-expired",
        { approved: true },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(query.mock.calls[1]?.[0]).toContain("status='expired'");
    await expect(tenantTransaction.mock.results[0]?.value).resolves.toEqual({ kind: "expired" });
  });

  it("locks an approved exception while validating it for a sale", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ approved_by_user_id: "manager-a", approvedReason: "Motivo aprovado A" }] });
    const service = new PricingService({} as never);
    const resolution = {
      productId: "product-a",
      policyId: "policy-a",
      policyVersion: 1,
      priceWithinLimits: false,
      marginStatus: "ok",
    } as never;

    const approval = await service.validateApproval(
      { query } as never,
      context,
      { approvalId: "approval-a", quantity: 2, unitPrice: 90, discountAmount: 0, netTotal: 180, costTotal: 120, projectedMarginPercent: 33.33, branchId: "branch-a" },
      resolution,
    );

    expect(query.mock.calls[0]?.[0]).toContain("FOR UPDATE");
    expect(approval).toMatchObject({ approvedReason: "Motivo aprovado A" });
  });

  it("persists an approval request by its normalized net total", async () => {
    const query = vi.fn((sql: string, _values?: unknown[]) => {
      void _values;
      if (sql.includes("INSERT INTO pricing_approvals")) {
        return { rows: [{ id: "approval-a", expires_at: new Date("2026-07-21T12:10:00Z") }] };
      }
      if (sql.includes("FROM products p")) {
        return { rows: [{
          productId: "product-a", productName: "Produto A", productBranchId: null, salePrice: "100", costPrice: "80",
          customerSegmentId: null, customerSegmentCode: null, legacyFixedPrice: null, legacyDiscountPercent: null,
          policyId: "policy-a", policyVersion: 2, referencePrice: "100", minPrice: "90", maxPrice: "110",
          minMarginPercent: null, marginMode: "warn",
        }] };
      }
      return { rows: [] };
    });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new PricingService({ tenantTransaction } as never);

    await service.createApproval(context, {
      productId: "product-a",
      branchId: "branch-a",
      quantity: 3,
      unitPrice: 100,
      discountAmount: 30.01,
      allocatedAdjustmentAmount: 0,
      basketFingerprint: "a".repeat(64),
      reason: "Condição comercial aprovada para o total líquido.",
    });

    const insert = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO pricing_approvals"));
    expect(insert?.[0]).toContain("requested_total_amount");
    expect(insert?.[0]).toContain("requested_cost_amount");
    expect(insert?.[1]).toEqual(expect.arrayContaining([100, 30.01, 269.99, 240, 11.11, 3]));
  });

  it("matches an approval by net total instead of a derived unit price", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ approved_by_user_id: "manager-a" }] });
    const service = new PricingService({} as never);
    const resolution = { productId: "product-a", policyId: "policy-a", policyVersion: 2, customerSegmentId: null, priceWithinLimits: false, marginStatus: "ok" } as never;

    await service.validateApproval(
      { query } as never,
      context,
      { approvalId: "approval-a", quantity: 3, unitPrice: 100, discountAmount: 30.01, netTotal: 269.99, costTotal: 240, projectedMarginPercent: 11.11, branchId: "branch-a" },
      resolution,
    );

    expect(query.mock.calls[0]?.[0]).toContain("requested_total_amount=$10");
    expect(query.mock.calls[0]?.[0]).toContain("requested_cost_amount=$12");
    expect(query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([269.99, 240, 11.11, 3]));
  });

  it("binds an approval with a global allocation to the exact basket fingerprint", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ approved_by_user_id: "manager-a", approvedReason: "Aprovado" }] });
    const service = new PricingService({} as never);
    const resolution = { productId: "product-a", policyId: "policy-a", policyVersion: 2, customerSegmentId: null, priceWithinLimits: false, marginStatus: "ok" } as never;
    const basketFingerprint = "a".repeat(64);

    await service.validateApproval(
      { query } as never,
      context,
      {
        approvalId: "approval-a", quantity: 1, unitPrice: 100, discountAmount: 0,
        allocatedAdjustmentAmount: 20, basketFingerprint, netTotal: 80, costTotal: 60,
        projectedMarginPercent: 25, branchId: "branch-a",
      },
      resolution,
    );

    expect(query.mock.calls[0]?.[0]).toContain("requested_allocated_adjustment_amount");
    expect(query.mock.calls[0]?.[0]).toContain("basket_fingerprint");
    expect(query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([20, basketFingerprint]));
  });

  it("rejects an approval when the current cost or margin differs from the approved snapshot", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = new PricingService({} as never);
    const resolution = { productId: "product-a", policyId: "policy-a", policyVersion: 2, customerSegmentId: null, priceWithinLimits: false, marginStatus: "ok" } as never;

    await expect(service.validateApproval(
      { query } as never,
      context,
      { approvalId: "approval-a", quantity: 3, unitPrice: 100, discountAmount: 30.01, netTotal: 269.99, costTotal: 285, projectedMarginPercent: -5.56, branchId: "branch-a" },
      resolution,
    )).rejects.toThrow(/Aprovação de preço válida/i);
    expect(query.mock.calls[0]?.[0]).toContain("requested_cost_amount");
  });

  it("consumes an approval only once and binds it to the sale item", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "approval-a", approvedReason: "Motivo aprovado A" }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new PricingService({} as never);

    const consumed = await service.consumeApproval({ query } as never, context, "approval-a", "sale-a", "sale-item-a", {
      unitPrice: 100, discountAmount: 30.01, netTotal: 269.99, quantity: 3, costTotal: 240,
      projectedMarginPercent: 11.11, policyId: "policy-a", policyVersion: 2,
    });

    expect(query.mock.calls[0]?.[0]).toContain("status='consumed'");
    expect(query.mock.calls[0]?.[0]).toContain("consumed_sale_id");
    expect(query.mock.calls[0]?.[0]).toContain("requested_cost_amount=$9");
    expect(query.mock.calls[0]?.[0]).toContain("requested_margin_percent=$10");
    expect(query.mock.calls[0]?.[1]).toEqual(["tenant-a", "approval-a", "sale-a", "sale-item-a", 269.99, 3, 100, 30.01, 240, 11.11, "policy-a", 2, 0, null]);
    expect(consumed).toMatchObject({ approvedReason: "Motivo aprovado A" });
    await expect(service.consumeApproval({ query } as never, context, "approval-a", "sale-b", "sale-item-b", {
      unitPrice: 100, discountAmount: 30.01, netTotal: 269.99, quantity: 3, costTotal: 240,
      projectedMarginPercent: 11.11, policyId: "policy-a", policyVersion: 2,
    })).rejects.toThrow();
  });
});
