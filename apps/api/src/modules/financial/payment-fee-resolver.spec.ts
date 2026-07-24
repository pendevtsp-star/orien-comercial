import { describe, expect, it } from "vitest";
import { resolvePaymentFee } from "./payment-fee-resolver";

describe("resolvePaymentFee", () => {
  it("calculates percentage, fixed and anticipation fees with integer cents", () => {
    expect(resolvePaymentFee({
      grossAmountCents: 10_000,
      percentageBasisPoints: 250,
      fixedFeeCents: 30,
      anticipationBasisPoints: 100,
      settlementDays: 30,
      occurredAt: new Date("2026-07-21T12:00:00.000Z"),
    })).toEqual({
      grossAmountCents: 10_000,
      processingFeeCents: 280,
      anticipationFeeCents: 97,
      totalFeeCents: 377,
      netAmountCents: 9_623,
      expectedSettlementDate: "2026-08-20",
    });
  });

  it("uses half-up rounding at monetary boundaries", () => {
    expect(resolvePaymentFee({
      grossAmountCents: 101,
      percentageBasisPoints: 50,
      fixedFeeCents: 0,
      anticipationBasisPoints: 0,
      settlementDays: 0,
      occurredAt: new Date("2026-07-21T23:59:59.000Z"),
    }).processingFeeCents).toBe(1);
  });

  it("keeps gross equal to net when no rule applies", () => {
    expect(resolvePaymentFee({
      grossAmountCents: 4_321,
      percentageBasisPoints: 0,
      fixedFeeCents: 0,
      anticipationBasisPoints: 0,
      settlementDays: 0,
      occurredAt: new Date("2026-07-21T12:00:00.000Z"),
    })).toMatchObject({ totalFeeCents: 0, netAmountCents: 4_321, expectedSettlementDate: "2026-07-21" });
  });

  it("rejects configurations whose fees exceed the gross amount", () => {
    expect(() => resolvePaymentFee({
      grossAmountCents: 100,
      percentageBasisPoints: 0,
      fixedFeeCents: 101,
      anticipationBasisPoints: 0,
      settlementDays: 0,
      occurredAt: new Date("2026-07-21T12:00:00.000Z"),
    })).toThrow(/taxas/i);
  });
});
