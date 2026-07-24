import { BadRequestException } from "@nestjs/common";
import type { SaleCreateInput } from "@sgc/types";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "../../shared/request-context";
import type { DatabaseService } from "../database/database.service";
import type { LoyaltyService, SaleBenefits } from "../loyalty/loyalty.service";
import type { PriceResolution, PricingService } from "../pricing/pricing.service";
import { SaleCompositionService } from "./sale-composition.service";

const context: TenantContext = {
  tenantId: "tenant-1",
  branchId: null,
  membershipId: "membership-1",
  roleSlug: "owner",
  permissions: [],
  userId: "user-1",
};

const input: SaleCreateInput = {
  branchId: "branch-1",
  customerId: "customer-1",
  loyaltyPointsToRedeem: 0,
  fiscalRequested: false,
  items: [
    {
      productId: "product-1",
      quantity: 1,
      unitPrice: 10,
      discountAmount: 1,
    },
    {
      productId: "product-2",
      quantity: 2,
      unitPrice: 5,
      discountAmount: 0,
    },
  ],
  payments: [],
};

const products = [
  { id: "product-1", name: "Produto 1", sale_price: "10.00", cost_price: "6.00" },
  { id: "product-2", name: "Produto 2", sale_price: "5.00", cost_price: "2.00" },
];

function resolution(overrides: Partial<PriceResolution> = {}): PriceResolution {
  return {
    productId: "product-1",
    productName: "Produto 1",
    customerSegmentId: null,
    customerSegmentCode: null,
    policyId: "policy-1",
    policyVersion: 3,
    referencePrice: 10,
    minPrice: 8,
    maxPrice: 12,
    costPrice: 6,
    unitPrice: 10,
    projectedMarginPercent: 40,
    marginStatus: "ok",
    minMarginPercent: 20,
    marginMode: "approval_required",
    priority: 1,
    priceWithinLimits: true,
    ...overrides,
  };
}

function emptyBenefits(overrides: Partial<SaleBenefits> = {}): SaleBenefits {
  return {
    customerId: "customer-1",
    walletId: null,
    pointsToRedeem: 0,
    coupon: null,
    reward: null,
    adjustments: [],
    gift: null,
    futureBenefit: null,
    lockedLotIds: [],
    ...overrides,
  };
}

function createHarness(options: {
  benefits?: SaleBenefits;
  resolutions?: Record<string, PriceResolution>;
  productRows?: typeof products;
  customerFound?: boolean;
} = {}) {
  const queryMock = vi.fn((sql: string) => {
    if (sql.includes("FROM branches")) {
      return Promise.resolve({ rows: [{ id: "branch-1" }], rowCount: 1 });
    }
    if (sql.includes("FROM customers")) {
      const rows = options.customerFound === false ? [] : [{ id: "customer-1" }];
      return Promise.resolve({ rows, rowCount: rows.length });
    }
    if (sql.includes("FROM products")) {
      const rows = options.productRows ?? products;
      return Promise.resolve({ rows, rowCount: rows.length });
    }
    return Promise.reject(new Error(`Consulta inesperada: ${sql}`));
  });
  const client = {
    query: queryMock,
  } as unknown as PoolClient;
  const tenantTransaction = vi.fn(
    (_tenantId: string, callback: (tx: PoolClient) => unknown) =>
      Promise.resolve(callback(client)),
  );
  const database = {
    tenantTransaction,
  } as unknown as DatabaseService;
  const resolveForSale = vi.fn((_context, request: { productId: string }) =>
    Promise.resolve(
      options.resolutions?.[request.productId] ??
        resolution({
          productId: request.productId,
          productName: request.productId === "product-2" ? "Produto 2" : "Produto 1",
          referencePrice: request.productId === "product-2" ? 5 : 10,
          minPrice: request.productId === "product-2" ? 4 : 8,
          maxPrice: request.productId === "product-2" ? 6 : 12,
          costPrice: request.productId === "product-2" ? 2 : 6,
          unitPrice: request.productId === "product-2" ? 5 : 10,
        }),
    ),
  );
  const pricing = {
    resolveForSale,
  } as unknown as PricingService;
  const benefits = options.benefits ?? emptyBenefits();
  const inspectSaleBenefits = vi.fn(() => Promise.resolve(benefits));
  const lockSaleBenefits = vi.fn(() => Promise.resolve(benefits));
  const loyalty = {
    inspectSaleBenefits,
    lockSaleBenefits,
  } as unknown as LoyaltyService;
  return {
    service: new SaleCompositionService(database, pricing, loyalty),
    database,
    pricing,
    loyalty,
    client,
    queryMock,
    tenantTransaction,
    resolveForSale,
    inspectSaleBenefits,
    lockSaleBenefits,
  };
}

describe("SaleCompositionService", () => {
  it("creates a side-effect-free preview with deterministic item adjustments", async () => {
    const harness = createHarness();

    const result = await harness.service.preview(context, input);

    expect(result.totals).toEqual({
      grossCents: 2_000,
      discountCents: 100,
      netCents: 1_900,
      costCents: 1_000,
    });
    expect(result.items.map((item) => item.id)).toEqual(["line-0", "line-1"]);
    expect(result.adjustments).toMatchObject([
      {
        id: "item-discount:line-0",
        type: "item_discount",
        amountCents: 100,
        allocations: [{ itemId: "line-0", amountCents: 100 }],
      },
    ]);
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(harness.inspectSaleBenefits).toHaveBeenCalledOnce();
    expect(harness.lockSaleBenefits).not.toHaveBeenCalled();
    expect(harness.tenantTransaction).toHaveBeenCalledWith(
      context.tenantId,
      expect.any(Function),
    );
  });

  it("uses locks for commit preparation while sharing the same composition core", async () => {
    const benefits = emptyBenefits({
      walletId: "wallet-1",
      pointsToRedeem: 200,
      adjustments: [
        {
          id: "loyalty-points",
          type: "loyalty_points",
          sourceId: "wallet-1",
          amountCents: 200,
        },
      ],
    });
    const harness = createHarness({ benefits });

    const preview = await harness.service.preview(context, input);
    const prepared = await harness.service.prepareForCommit(harness.client, context, input);

    expect(prepared.fingerprint).toBe(preview.fingerprint);
    expect(prepared.totals).toEqual(preview.totals);
    expect(prepared.loyaltyBenefits.lockedLotIds).toEqual([]);
    expect(harness.inspectSaleBenefits).toHaveBeenCalledOnce();
    expect(harness.lockSaleBenefits).toHaveBeenCalledOnce();
  });

  it("requires approval when an allocated coupon takes an item below its minimum", async () => {
    const harness = createHarness({
      benefits: emptyBenefits({
        coupon: { id: "coupon-1", code: "MENOS5", valueAmountCents: 500 },
        adjustments: [
          {
            id: "loyalty-coupon:coupon-1",
            type: "loyalty_coupon",
            sourceId: "coupon-1",
            amountCents: 500,
          },
        ],
      }),
    });

    const result = await harness.service.preview(context, input);

    const required = result.approvalsRequired.find((approval) => approval.itemId === "line-0");
    expect(required).toMatchObject({
      itemId: "line-0",
      productId: "product-1",
      basketFingerprint: result.fingerprint,
    });
    expect(required?.reasons).toContain("price_below_minimum");
    expect(result.items[0]).toMatchObject({
      netCents: 663,
      allocatedAdjustmentCents: 237,
      priceWithinLimits: false,
    });
  });

  it.each(["cashback", "coupon"] as const)(
    "does not reduce the current sale for a future %s benefit",
    async (futureType) => {
      const harness = createHarness({
        benefits: emptyBenefits({
          reward: {
            id: "reward-1",
            name: "Benefício futuro",
            rewardType: futureType,
            pointsRequired: 100,
            valueAmountCents: 500,
            productId: null,
            couponCode: futureType === "coupon" ? "VOLTE" : null,
          },
          pointsToRedeem: 100,
          futureBenefit: {
            type: futureType,
            amountCents: 500,
            couponPrefix: futureType === "coupon" ? "VOLTE" : null,
          },
        }),
      });

      const result = await harness.service.preview(context, input);

      expect(result.totals.netCents).toBe(1_900);
      expect(result.adjustments).toHaveLength(1);
      expect(result.adjustments[0]?.type).toBe("item_discount");
    },
  );

  it("models a configured gift as an explicit fully allocated bonus adjustment", async () => {
    const giftProduct = {
      id: "gift-1",
      name: "Brinde",
      sale_price: "3.00",
      cost_price: "1.00",
    };
    const harness = createHarness({
      productRows: [...products, giftProduct],
      resolutions: {
        "gift-1": resolution({
          productId: "gift-1",
          productName: "Brinde",
          referencePrice: 3,
          minPrice: 0,
          maxPrice: 3,
          costPrice: 1,
          unitPrice: 3,
        }),
      },
      benefits: emptyBenefits({
        pointsToRedeem: 50,
        reward: {
          id: "reward-gift",
          name: "Brinde",
          rewardType: "bonus_product",
          pointsRequired: 50,
          valueAmountCents: 0,
          productId: "gift-1",
          couponCode: null,
        },
        gift: { productId: "gift-1", rewardId: "reward-gift", name: "Brinde" },
      }),
    });

    const result = await harness.service.preview(context, input);

    expect(result.items.at(-1)).toMatchObject({
      id: "gift:reward-gift",
      productId: "gift-1",
      grossCents: 300,
      netCents: 0,
    });
    expect(result.adjustments.at(-1)).toMatchObject({
      id: "bonus-product:reward-gift",
      type: "bonus_product",
      amountCents: 300,
      sourceId: "reward-gift",
      allocations: [{ itemId: "gift:reward-gift", amountCents: 300 }],
    });
  });

  it("scopes branch, customer and products by tenant and branch", async () => {
    const harness = createHarness();

    await harness.service.preview(context, input);

    const calls = harness.queryMock.mock.calls;
    expect(calls).toEqual(
      expect.arrayContaining([
        [expect.stringContaining("FROM branches"), ["tenant-1", "branch-1"]],
        [expect.stringContaining("FROM customers"), ["tenant-1", "customer-1", "branch-1"]],
        [expect.stringContaining("FROM products"), ["tenant-1", ["product-1", "product-2"], "branch-1"]],
      ]),
    );
  });

  it("rejects a customer outside the tenant or selected branch", async () => {
    const harness = createHarness({ customerFound: false });

    await expect(harness.service.preview(context, input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(harness.resolveForSale).not.toHaveBeenCalled();
  });
});
