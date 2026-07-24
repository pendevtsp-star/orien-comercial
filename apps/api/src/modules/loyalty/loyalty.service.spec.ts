import { BadRequestException } from "@nestjs/common";
import type { PoolClient, QueryResult } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "../../shared/request-context";
import { LoyaltyService, type SaleBenefits } from "./loyalty.service";

const tenant: TenantContext = {
  userId: "10000000-0000-4000-8000-000000000001",
  tenantId: "20000000-0000-4000-8000-000000000002",
  membershipId: "30000000-0000-4000-8000-000000000003",
  roleSlug: "owner",
  permissions: ["sales.cancel"],
  branchId: null,
};

const ids = {
  branch: "40000000-0000-4000-8000-000000000004",
  customer: "50000000-0000-4000-8000-000000000005",
  wallet: "60000000-0000-4000-8000-000000000006",
  reward: "70000000-0000-4000-8000-000000000007",
  coupon: "80000000-0000-4000-8000-000000000008",
  product: "90000000-0000-4000-8000-000000000009",
  sale: "a0000000-0000-4000-8000-00000000000a",
  campaign: "b0000000-0000-4000-8000-00000000000b",
  ledger: "c0000000-0000-4000-8000-00000000000c",
};

type QueryHandler = (sql: string, values?: unknown[]) => Record<string, unknown>[];

function clientWith(handler: QueryHandler) {
  const query = vi.fn((sql: string, values?: unknown[]) => {
    const rows = handler(sql, values);
    return Promise.resolve({ rows, rowCount: rows.length } as unknown as QueryResult);
  });
  return { client: { query } as unknown as PoolClient, query };
}

function service() {
  return new LoyaltyService({} as never);
}

function rewardRow(
  rewardType: "discount" | "coupon" | "cashback" | "bonus_product",
  overrides: Record<string, unknown> = {},
) {
  return {
    id: ids.reward,
    name: `Recompensa ${rewardType}`,
    reward_type: rewardType,
    points_required: 500,
    value_amount: "12.50",
    product_id: rewardType === "bonus_product" ? ids.product : null,
    coupon_code: rewardType === "coupon" ? "VOLTE" : null,
    ...overrides,
  };
}

function lockedBenefitHandler(rewardType: "discount" | "coupon" | "cashback" | "bonus_product") {
  return (sql: string) => {
    if (sql.includes("FROM loyalty_rewards")) return [rewardRow(rewardType)];
    if (sql.includes("FROM loyalty_campaigns"))
      return [{ max_redemption_points: 2_000, approval_threshold_points: null }];
    if (sql.includes("FROM loyalty_wallets"))
      return [{ id: ids.wallet, points_balance: 2_000 }];
    if (sql.includes("FROM loyalty_point_lots"))
      return [{ id: "d0000000-0000-4000-8000-00000000000d", remaining_points: 2_000 }];
    return [];
  };
}

describe("LoyaltyService sale benefits", () => {
  it("inspects simple points as an immediate sale adjustment without locking or mutating", async () => {
    const { client, query } = clientWith((sql) => {
      if (sql.includes("FROM loyalty_campaigns"))
        return [{ max_redemption_points: 2_000, approval_threshold_points: null }];
      if (sql.includes("FROM loyalty_wallets"))
        return [{ id: ids.wallet, points_balance: 2_000 }];
      return [];
    });

    const result = await service().inspectSaleBenefits(client, tenant, {
      branchId: ids.branch,
      customerId: ids.customer,
      grossAmountCents: 10_000,
      loyaltyPointsToRedeem: 500,
    });

    expect(result.adjustments).toEqual([
      {
        id: "loyalty-points",
        type: "loyalty_points",
        sourceId: ids.wallet,
        amountCents: 500,
      },
    ]);
    expect(result.pointsToRedeem).toBe(500);
    expect(query.mock.calls.every(([sql]) => !String(sql).includes("FOR UPDATE"))).toBe(true);
    expect(query.mock.calls.every(([sql]) => /^SELECT/i.test(String(sql).trim()))).toBe(true);
  });

  it.each(["cashback", "coupon", "bonus_product"] as const)(
    "does not turn %s rewards into an immediate discount",
    async (rewardType) => {
      const { client, query } = clientWith(lockedBenefitHandler(rewardType));

      const result = await service().lockSaleBenefits(client, tenant, {
        branchId: ids.branch,
        customerId: ids.customer,
        grossAmountCents: 10_000,
        loyaltyRewardId: ids.reward,
      });

      expect(result.adjustments).toEqual([]);
      expect(result.pointsToRedeem).toBe(500);
      expect(result.futureBenefit?.type ?? null).toBe(
        rewardType === "bonus_product" ? null : rewardType,
      );
      expect(result.gift?.productId ?? null).toBe(
        rewardType === "bonus_product" ? ids.product : null,
      );
      expect(query.mock.calls.some(([sql]) => String(sql).includes("FOR UPDATE"))).toBe(true);
      expect(query.mock.calls.every(([sql]) => !/^(INSERT|UPDATE|DELETE)/i.test(String(sql).trim()))).toBe(
        true,
      );
    },
  );

  it("turns only a discount reward into an immediate reward adjustment", async () => {
    const { client } = clientWith(lockedBenefitHandler("discount"));

    const result = await service().lockSaleBenefits(client, tenant, {
      branchId: ids.branch,
      customerId: ids.customer,
      grossAmountCents: 10_000,
      loyaltyRewardId: ids.reward,
    });

    expect(result.adjustments).toEqual([
      {
        id: `loyalty-reward:${ids.reward}`,
        type: "loyalty_reward",
        sourceId: ids.reward,
        amountCents: 1_250,
      },
    ]);
    expect(result.futureBenefit).toBeNull();
    expect(result.gift).toBeNull();
  });

  it("uses an available customer coupon as an immediate adjustment", async () => {
    const { client } = clientWith((sql) => {
      if (sql.includes("FROM loyalty_customer_coupons"))
        return [{ id: ids.coupon, code: "CLIENTE10", value_amount: "10.00" }];
      return [];
    });

    const result = await service().inspectSaleBenefits(client, tenant, {
      branchId: ids.branch,
      customerId: ids.customer,
      grossAmountCents: 800,
      loyaltyCouponCode: " cliente10 ",
    });

    expect(result.adjustments[0]).toEqual({
      id: `loyalty-coupon:${ids.coupon}`,
      type: "loyalty_coupon",
      sourceId: ids.coupon,
      amountCents: 800,
    });
    expect(result.coupon?.code).toBe("CLIENTE10");
  });

  it("applies cashback atomically as future credit while consuming points", async () => {
    const benefits: SaleBenefits = {
      customerId: ids.customer,
      walletId: ids.wallet,
      pointsToRedeem: 500,
      coupon: null,
      reward: {
        id: ids.reward,
        name: "Crédito futuro",
        rewardType: "cashback",
        pointsRequired: 500,
        valueAmountCents: 1_250,
        productId: null,
        couponCode: null,
      },
      adjustments: [],
      gift: null,
      futureBenefit: { type: "cashback", amountCents: 1_250, couponPrefix: null },
      lockedLotIds: ["d0000000-0000-4000-8000-00000000000d"],
    };
    const { client, query } = clientWith((sql) => {
      if (sql.includes("FROM loyalty_point_lots"))
        return [{ id: "d0000000-0000-4000-8000-00000000000d", remaining_points: 500 }];
      if (sql.includes("UPDATE loyalty_wallets")) return [{}];
      return [];
    });

    const result = await service().applySaleBenefits(client, tenant, {
      saleId: ids.sale,
      branchId: ids.branch,
      benefits,
    });

    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("INSERT INTO customer_credits"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO loyalty_redemptions"))).toBe(true);
    expect(statements.some((sql) => sql.includes("UPDATE loyalty_wallets"))).toBe(true);
    expect(result.futureCreditAmountCents).toBe(1_250);
    expect(result.immediateDiscountCents).toBe(0);
  });

  it("issues a future coupon and never reports it as an immediate discount", async () => {
    const benefits: SaleBenefits = {
      customerId: ids.customer,
      walletId: ids.wallet,
      pointsToRedeem: 500,
      coupon: null,
      reward: {
        id: ids.reward,
        name: "Cupom futuro",
        rewardType: "coupon",
        pointsRequired: 500,
        valueAmountCents: 1_250,
        productId: null,
        couponCode: "VOLTE",
      },
      adjustments: [],
      gift: null,
      futureBenefit: { type: "coupon", amountCents: 1_250, couponPrefix: "VOLTE" },
      lockedLotIds: [],
    };
    const { client, query } = clientWith((sql) => {
      if (sql.includes("FROM loyalty_point_lots"))
        return [{ id: "d0000000-0000-4000-8000-00000000000d", remaining_points: 500 }];
      if (sql.includes("UPDATE loyalty_wallets")) return [{}];
      return [];
    });

    const result = await service().applySaleBenefits(client, tenant, {
      saleId: ids.sale,
      branchId: ids.branch,
      benefits,
    });

    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO loyalty_customer_coupons"))).toBe(
      true,
    );
    expect(result.issuedCouponCode).toMatch(/^VOLTE-/);
    expect(result.immediateDiscountCents).toBe(0);
  });

  it("rejects applying points when the locked wallet identity is absent", async () => {
    const { client } = clientWith(() => []);
    const benefits = {
      customerId: ids.customer,
      walletId: null,
      pointsToRedeem: 10,
      coupon: null,
      reward: null,
      adjustments: [],
      gift: null,
      futureBenefit: null,
      lockedLotIds: [],
    } satisfies SaleBenefits;

    await expect(
      service().applySaleBenefits(client, tenant, {
        saleId: ids.sale,
        branchId: ids.branch,
        benefits,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("awards campaign points and first-purchase automation using the existing client", async () => {
    const { client, query } = clientWith((sql) => {
      if (sql.includes("JOIN loyalty_rules"))
        return [
          {
            id: ids.campaign,
            rule: { pointsPerReal: 2 },
            expires_in_days: 90,
            minimum_sale_amount: "20.00",
          },
        ];
      if (sql.includes("automation_type='first_purchase'"))
        return [{ id: "e0000000-0000-4000-8000-00000000000e", automation_points: 30 }];
      if (sql.includes("count(*)::text FROM sales")) return [{ count: "1" }];
      if (sql.includes("INSERT INTO loyalty_automation_runs"))
        return [{ id: "f0000000-0000-4000-8000-00000000000f" }];
      if (sql.includes("INSERT INTO loyalty_wallets")) return [{ id: ids.wallet }];
      if (sql.includes("INSERT INTO loyalty_ledger") && sql.includes("RETURNING id"))
        return [{ id: ids.ledger }];
      return [];
    });

    const result = await service().awardSalePoints(client, tenant, {
      saleId: ids.sale,
      branchId: ids.branch,
      customerId: ids.customer,
      paidTotalCents: 5_000,
      productIds: [ids.product],
      categoryIds: [],
    });

    expect(result).toEqual({ pointsAwarded: 100, automationPointsAwarded: 30 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("loyalty_point_lots"))).toBe(true);
    expect(query.mock.calls.every(([, values]) => !values || values.includes(tenant.tenantId))).toBe(
      true,
    );
  });
});
