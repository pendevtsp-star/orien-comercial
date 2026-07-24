import { ConflictException } from "@nestjs/common";
import type { PaymentSnapshotResolveInput, SaleCreateInput } from "@sgc/types";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "../../shared/request-context";
import type { LoyaltyService, SaleBenefits } from "../loyalty/loyalty.service";
import type { FinancialSettlementsService } from "../financial/financial-settlements.service";
import type { PricingService } from "../pricing/pricing.service";
import type { SaleCommissionService } from "./sale-commission.service";
import type { SaleCompositionResult, SaleCompositionService } from "./sale-composition.service";
import { createSaleRequestHash } from "./sale-request-hash";
import { SalesService } from "./sales.service";

const context: TenantContext = {
  tenantId: "tenant-a",
  userId: "seller-a",
  membershipId: "membership-a",
  roleSlug: "seller",
  branchId: "branch-a",
  permissions: [],
};

const input: SaleCreateInput = {
  branchId: "branch-a",
  customerId: "customer-a",
  loyaltyPointsToRedeem: 0,
  fiscalRequested: false,
  items: [
    { productId: "product-b", quantity: 1, unitPrice: 5, discountAmount: 0 },
    { productId: "product-a", quantity: 1, unitPrice: 10, discountAmount: 1 },
  ],
  payments: [{ method: "pix", amount: 14, status: "paid", installments: 1 }],
};

const benefits: SaleBenefits = {
  customerId: "customer-a",
  walletId: null,
  pointsToRedeem: 0,
  coupon: null,
  reward: null,
  adjustments: [],
  gift: null,
  futureBenefit: null,
  lockedLotIds: [],
};

const composition: SaleCompositionResult = {
  items: [
    {
      id: "line-0",
      productId: "product-b",
      productName: "Produto B",
      inputItemIndex: 0,
      isGift: false,
      quantityMilliunits: 1_000,
      unitPriceCents: 500,
      unitCostCents: 200,
      grossCents: 500,
      directDiscountCents: 0,
      allocatedAdjustmentCents: 0,
      totalDiscountCents: 0,
      netCents: 500,
      costCents: 200,
      marginBasisPoints: 6_000,
      priceWithinLimits: true,
      marginStatus: "ok",
      policy: { id: "policy-b", version: 1 },
    },
    {
      id: "line-1",
      productId: "product-a",
      productName: "Produto A",
      inputItemIndex: 1,
      isGift: false,
      quantityMilliunits: 1_000,
      unitPriceCents: 1_000,
      unitCostCents: 600,
      grossCents: 1_000,
      directDiscountCents: 100,
      allocatedAdjustmentCents: 0,
      totalDiscountCents: 100,
      netCents: 900,
      costCents: 600,
      marginBasisPoints: 3_333,
      priceWithinLimits: true,
      marginStatus: "warn",
      policy: { id: "policy-a", version: 2 },
    },
  ],
  adjustments: [
    {
      id: "item-discount:line-1",
      type: "item_discount",
      sourceId: null,
      amountCents: 100,
      allocations: [{ itemId: "line-1", amountCents: 100 }],
    },
  ],
  totals: { grossCents: 1_500, discountCents: 100, netCents: 1_400, costCents: 800 },
  fingerprint: "a".repeat(64),
  approvalsRequired: [],
  alerts: [{ itemId: "line-1", productId: "product-a", code: "margin_warning" }],
  loyaltyBenefits: benefits,
};

function createHarness(
  options: {
    prepared?: SaleCompositionResult;
    existingIdempotency?: { request_hash: string; response: unknown };
    approval?: { approvalId: string; approvedByUserId: string; approvedReason: string } | null;
    financialSnapshots?: Array<{
      branchId: string;
      acquirerId: string | null;
      feeRuleId: string | null;
      feeRuleVersion: number | null;
      paymentMethod: string;
      brand: string | null;
      installments: number;
      grossAmountCents: number;
      processingFeeCents: number;
      anticipationFeeCents: number;
      totalFeeCents: number;
      netAmountCents: number;
      expectedSettlementDate: string;
    }>;
  } = {},
) {
  let saleItemSequence = 0;
  let salePaymentSequence = 0;
  let adjustmentSequence = 0;
  const query = vi.fn((sql: string, values?: unknown[]) => {
    if (sql.includes("INSERT INTO idempotency_keys")) {
      if (options.existingIdempotency) return Promise.resolve({ rows: [], rowCount: 0 });
      return Promise.resolve({ rows: [{ response: null }], rowCount: 1 });
    }
    if (sql.includes("SELECT request_hash,response FROM idempotency_keys")) {
      return Promise.resolve({ rows: [options.existingIdempotency], rowCount: 1 });
    }
    if (sql.includes("FROM cash_register_sessions")) {
      return Promise.resolve({ rows: [{ id: "cash-a" }], rowCount: 1 });
    }
    if (sql.includes("FROM customer_credit_accounts")) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (sql.includes("FROM accounts_receivable")) {
      return Promise.resolve({ rows: [{ total: "0" }], rowCount: 1 });
    }
    if (sql.includes("FROM quotes")) {
      return Promise.resolve({ rows: [{ id: "quote-a" }], rowCount: 1 });
    }
    if (sql.includes("INSERT INTO sales")) {
      return Promise.resolve({ rows: [{ id: "sale-a" }], rowCount: 1 });
    }
    if (sql.includes("INSERT INTO sale_items")) {
      saleItemSequence += 1;
      return Promise.resolve({ rows: [{ id: `sale-item-${saleItemSequence}` }], rowCount: 1 });
    }
    if (sql.includes("INSERT INTO sale_payments")) {
      salePaymentSequence += 1;
      return Promise.resolve({ rows: [{ id: `sale-payment-${salePaymentSequence}` }], rowCount: 1 });
    }
    if (sql.includes("INSERT INTO sale_adjustments")) {
      adjustmentSequence += 1;
      return Promise.resolve({ rows: [{ id: `adjustment-${adjustmentSequence}` }], rowCount: 1 });
    }
    if (sql.includes("UPDATE stock_balances")) {
      return Promise.resolve({ rows: [{ quantity: "9" }], rowCount: 1 });
    }
    if (sql.includes("FROM products") && sql.includes("category_id")) {
      return Promise.resolve({
        rows: [
          { id: "product-a", category_id: "category-a" },
          { id: "product-b", category_id: null },
        ],
        rowCount: 2,
      });
    }
    if (sql.includes("FROM seller_commission_rules")) {
      return Promise.resolve({ rows: [{ rate_percent: "2" }], rowCount: 1 });
    }
    void values;
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  const client = { query } as unknown as PoolClient;
  const tenantTransaction = vi.fn(
    (_tenantId: string, callback: (transaction: PoolClient) => Promise<unknown>) =>
      callback(client),
  );
  const database = { tenantTransaction };
  const prepareForCommit = vi.fn(() => Promise.resolve(options.prepared ?? composition));
  const preview = vi.fn(() => Promise.resolve(options.prepared ?? composition));
  const composer = { prepareForCommit, preview } as unknown as SaleCompositionService;
  const resolveForSale = vi.fn((_context, request: { productId: string }) =>
    Promise.resolve({
      productId: request.productId,
      productName: request.productId === "product-a" ? "Produto A" : "Produto B",
      customerSegmentId: null,
      customerSegmentCode: null,
      policyId: request.productId === "product-a" ? "policy-a" : "policy-b",
      policyVersion: request.productId === "product-a" ? 2 : 1,
      referencePrice: request.productId === "product-a" ? 10 : 5,
      minPrice: request.productId === "product-a" ? 8 : 4,
      maxPrice: request.productId === "product-a" ? 12 : 6,
      costPrice: request.productId === "product-a" ? 6 : 2,
      unitPrice: request.productId === "product-a" ? 10 : 5,
      projectedMarginPercent: 40,
      marginStatus: "ok" as const,
      minMarginPercent: 20,
      marginMode: "warn" as const,
      priority: 1,
      priceWithinLimits: true,
    }),
  );
  const validateApproval = vi.fn(() => Promise.resolve(options.approval ?? null));
  const consumeApproval = vi.fn(() => Promise.resolve({ id: "approval-a", approvedReason: "OK" }));
  const pricing = {
    resolveForSale,
    validateApproval,
    consumeApproval,
  } as unknown as PricingService;
  const applySaleBenefits = vi.fn(() =>
    Promise.resolve({
      immediateDiscountCents: composition.adjustments
        .filter((adjustment) => adjustment.type !== "item_discount")
        .reduce((sum, adjustment) => sum + adjustment.amountCents, 0),
      futureCreditAmountCents: 0,
      issuedCouponCode: null,
      gift: null,
    }),
  );
  const awardSalePoints = vi.fn(() =>
    Promise.resolve({ pointsAwarded: 14, automationPointsAwarded: 0, walletId: "wallet-a" }),
  );
  const loyalty = { applySaleBenefits, awardSalePoints } as unknown as LoyaltyService;
  let snapshotIndex = 0;
  const resolvePaymentSnapshotInTransaction = vi.fn(
    (_client: PoolClient, _context: TenantContext, payment: PaymentSnapshotResolveInput) => {
      const configured = options.financialSnapshots?.[snapshotIndex++];
      return Promise.resolve(configured ?? {
        branchId: payment.branchId,
        acquirerId: payment.acquirerId ?? null,
        feeRuleId: null,
        feeRuleVersion: null,
        paymentMethod: payment.paymentMethod,
        brand: payment.brand ?? null,
        installments: payment.installments,
        grossAmountCents: payment.grossAmountCents,
        processingFeeCents: 0,
        anticipationFeeCents: 0,
        totalFeeCents: 0,
        netAmountCents: payment.grossAmountCents,
        expectedSettlementDate: payment.occurredAt.slice(0, 10),
      });
    },
  );
  const financial = { resolvePaymentSnapshotInTransaction } as unknown as FinancialSettlementsService;
  const provisionInTransaction = vi.fn(() => Promise.resolve({ status: "none", reason: "rule_not_found" }));
  const cancelInTransaction = vi.fn(() => Promise.resolve({ cancelled: 0, paidPreserved: 0 }));
  const commissions = { provisionInTransaction, cancelInTransaction } as unknown as SaleCommissionService;
  const service = new SalesService(database as never, {} as never, pricing, composer, loyalty, financial, commissions);
  return {
    service,
    client,
    query,
    tenantTransaction,
    prepareForCommit,
    preview,
    resolveForSale,
    validateApproval,
    consumeApproval,
    applySaleBenefits,
    awardSalePoints,
    resolvePaymentSnapshotInTransaction,
    provisionInTransaction,
    cancelInTransaction,
  };
}

describe("SalesService canonical sale flow", () => {
  it("delegates preview to the canonical composition service", async () => {
    const harness = createHarness();

    await expect(harness.service.preview(context, input)).resolves.toEqual(composition);
    expect(harness.preview).toHaveBeenCalledWith(context, input);
    expect(harness.tenantTransaction).not.toHaveBeenCalled();
  });

  it("opens one tenant transaction and delegates create to createInTransaction", async () => {
    const harness = createHarness();
    const spy = vi.spyOn(harness.service, "createInTransaction");

    await harness.service.create(context, input, "idempotency-key-123");

    expect(harness.tenantTransaction).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(
      harness.client,
      context,
      input,
      "idempotency-key-123",
      undefined,
    );
  });

  it("returns 409 SALE_COMPOSITION_CHANGED before persisting when the preview is stale", async () => {
    const harness = createHarness();

    await expect(
      harness.service.createInTransaction(harness.client, context, {
        ...input,
        compositionFingerprint: "b".repeat(64),
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "SALE_COMPOSITION_CHANGED" },
    });
    expect(harness.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO sales"))).toBe(false);
  });

  it("rejects paid amounts above the canonical sale total", async () => {
    const harness = createHarness();

    await expect(
      harness.service.createInTransaction(harness.client, context, {
        ...input,
        payments: [{ method: "pix", amount: 15, status: "paid", installments: 1 }],
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "SALE_PAYMENT_EXCEEDS_TOTAL" },
    });
    expect(harness.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO sales"))).toBe(false);
  });

  it("rejects reuse of an idempotency key with a different canonical payload", async () => {
    const existingHash = createSaleRequestHash({
      input: { ...input, notes: "Original" },
      commercialOrigin: null,
    });
    const harness = createHarness({
      existingIdempotency: { request_hash: existingHash, response: { id: "sale-old" } },
    });

    await expect(
      harness.service.createInTransaction(
        harness.client,
        context,
        { ...input, notes: "Alterada" },
        "idempotency-key-123",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.prepareForCommit).not.toHaveBeenCalled();
  });

  it("returns the cached response for the same idempotency key and canonical payload", async () => {
    const requestHash = createSaleRequestHash({ input, commercialOrigin: null });
    const cached = { id: "sale-old", totalAmount: 14, paidAmount: 14, openAmount: 0 };
    const harness = createHarness({
      existingIdempotency: { request_hash: requestHash, response: cached },
    });

    await expect(
      harness.service.createInTransaction(harness.client, context, input, "idempotency-key-123"),
    ).resolves.toEqual(cached);
    expect(harness.prepareForCommit).not.toHaveBeenCalled();
  });

  it("persists final snapshots, adjustments and allocations and decrements stock deterministically", async () => {
    const harness = createHarness();

    const response = await harness.service.createInTransaction(harness.client, context, input);

    expect(response).toMatchObject({
      id: "sale-a",
      totalAmount: 14,
      paidAmount: 14,
      openAmount: 0,
      compositionFingerprint: composition.fingerprint,
    });
    const saleInsert = harness.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO sales"));
    expect(saleInsert?.[1]).toEqual(expect.arrayContaining([composition.fingerprint]));
    const itemInserts = harness.query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO sale_items"),
    );
    expect(itemInserts).toHaveLength(2);
    expect(itemInserts[1]?.[1]).toEqual(expect.arrayContaining([1, 0, 9, 33.33]));
    expect(
      harness.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO sale_adjustments")),
    ).toBe(true);
    expect(
      harness.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO sale_item_adjustments")),
    ).toBe(true);
    const stockProductIds = harness.query.mock.calls
      .filter(([sql]) => sql.includes("UPDATE stock_balances"))
      .map(([, values]) => (values as unknown[])[2]);
    expect(stockProductIds).toEqual(["product-a", "product-b"]);
    expect(harness.applySaleBenefits).toHaveBeenCalledOnce();
    expect(harness.awardSalePoints).toHaveBeenCalledOnce();
    expect(harness.provisionInTransaction).toHaveBeenCalledWith(harness.client, context, {
      saleId: "sale-a",
      branchId: "branch-a",
      baseAmount: 14,
    });
  });

  it("resolves mixed payments in the sale transaction and persists each historical fee snapshot", async () => {
    const harness = createHarness({
      financialSnapshots: [
        {
          branchId: "branch-a", acquirerId: null, feeRuleId: null, feeRuleVersion: null,
          paymentMethod: "pix", brand: null, installments: 1, grossAmountCents: 500,
          processingFeeCents: 0, anticipationFeeCents: 0, totalFeeCents: 0,
          netAmountCents: 500, expectedSettlementDate: "2026-07-21",
        },
        {
          branchId: "branch-a", acquirerId: "22222222-2222-4222-8222-222222222222",
          feeRuleId: "33333333-3333-4333-8333-333333333333", feeRuleVersion: 4,
          paymentMethod: "credit_card", brand: "visa", installments: 3, grossAmountCents: 900,
          processingFeeCents: 30, anticipationFeeCents: 0, totalFeeCents: 30,
          netAmountCents: 870, expectedSettlementDate: "2026-08-20",
        },
      ],
    });
    const mixedInput: SaleCreateInput = {
      ...input,
      payments: [
        { method: "pix", amount: 5, status: "paid", installments: 1 },
        {
          method: "credit_card", amount: 9, status: "paid", installments: 3, brand: "visa",
          acquirerId: "22222222-2222-4222-8222-222222222222",
        },
      ],
    };

    await harness.service.createInTransaction(harness.client, context, mixedInput);

    expect(harness.resolvePaymentSnapshotInTransaction).toHaveBeenCalledTimes(2);
    const snapshotRequests = harness.resolvePaymentSnapshotInTransaction.mock.calls;
    expect(snapshotRequests[0]?.[0]).toBe(harness.client);
    expect(snapshotRequests[0]?.[1]).toBe(context);
    expect(snapshotRequests[0]?.[2]).toMatchObject({ branchId: "branch-a", paymentMethod: "pix", grossAmountCents: 500 });
    expect(snapshotRequests[1]?.[2]).toMatchObject({
      acquirerId: "22222222-2222-4222-8222-222222222222", brand: "visa", installments: 3,
      grossAmountCents: 900,
    });
    expect(snapshotRequests[0]?.[2].occurredAt).toBe(snapshotRequests[1]?.[2].occurredAt);

    const paymentInserts = harness.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO sale_payments"));
    expect(paymentInserts).toHaveLength(2);
    expect(paymentInserts[0]?.[0]).toContain("snapshot_locked_at");
    expect(paymentInserts[1]?.[1]).toEqual(expect.arrayContaining([
      "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333",
      4, "visa", 3, 9, 0.3, 8.7, "2026-08-20",
    ]));
  });

  it("links pending payments to one receivable and leaves only the uncovered balance residual", async () => {
    const harness = createHarness();
    const partialInput: SaleCreateInput = {
      ...input,
      payments: [
        { method: "pix", amount: 5, status: "paid", installments: 1 },
        { method: "store_credit", amount: 4, status: "pending", installments: 1 },
      ],
    };

    await harness.service.createInTransaction(harness.client, context, partialInput);

    const receivableInserts = harness.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO accounts_receivable"));
    expect(receivableInserts).toHaveLength(2);
    expect(receivableInserts[0]?.[0]).toContain("sale_payment_id");
    expect(receivableInserts[0]?.[1]).toEqual(expect.arrayContaining([4]));
    expect(receivableInserts[1]?.[1]).toEqual(expect.arrayContaining([5]));
    expect(receivableInserts[1]?.[1]).not.toContain(9);
  });

  it("validates and consumes an approval against final allocated values and fingerprint", async () => {
    const approvedComposition: SaleCompositionResult = {
      ...composition,
      items: composition.items.map((item) =>
        item.id === "line-1"
          ? {
              ...item,
              pricingApprovalId: "approval-a",
              allocatedAdjustmentCents: 50,
              netCents: 850,
              marginBasisPoints: 2_941,
            }
          : item,
      ),
      totals: { ...composition.totals, discountCents: 150, netCents: 1_350 },
    };
    const approval = {
      approvalId: "approval-a",
      approvedByUserId: "manager-a",
      approvedReason: "Exceção aprovada",
    };
    const harness = createHarness({ prepared: approvedComposition, approval });
    const approvedInput = {
      ...input,
      compositionFingerprint: approvedComposition.fingerprint,
      items: input.items.map((item) =>
        item.productId === "product-a" ? { ...item, pricingApprovalId: "approval-a" } : item,
      ),
      payments: [{ method: "pix", amount: 13.5, status: "paid" as const, installments: 1 }],
    };

    await harness.service.createInTransaction(harness.client, context, approvedInput);

    expect(harness.validateApproval).toHaveBeenCalledWith(
      harness.client,
      context,
      expect.objectContaining({
        approvalId: "approval-a",
        allocatedAdjustmentAmount: 0.5,
        basketFingerprint: approvedComposition.fingerprint,
        netTotal: 8.5,
        costTotal: 6,
      }),
      expect.objectContaining({
        policyId: "policy-a",
        policyVersion: 2,
        projectedMarginPercent: 29.41,
      }),
    );
    expect(harness.consumeApproval).toHaveBeenCalledWith(
      harness.client,
      context,
      "approval-a",
      "sale-a",
      expect.any(String),
      expect.objectContaining({
        allocatedAdjustmentAmount: 0.5,
        basketFingerprint: approvedComposition.fingerprint,
        netTotal: 8.5,
      }),
    );
  });

  it("persists an audited commercial origin without opening another transaction", async () => {
    const harness = createHarness();

    await harness.service.createInTransaction(harness.client, context, input, undefined, {
      id: "quote-a",
      type: "quote",
    });

    const originQuery = harness.query.mock.calls.find(([sql]) => sql.includes("FROM quotes"));
    expect(originQuery?.[1]).toEqual(["tenant-a", "quote-a", "branch-a", "quote"]);
    const saleInsert = harness.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO sales"));
    expect(saleInsert?.[1]).toEqual(expect.arrayContaining(["quote-a", "quote"]));
    expect(harness.tenantTransaction).not.toHaveBeenCalled();
  });
});
