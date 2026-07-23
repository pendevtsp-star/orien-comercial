import { describe, expect, it } from "vitest";
import {
  paymentAcquirerCreateSchema,
  paymentFeeRuleCreateSchema,
  paymentSettlementCreateSchema,
  reconciliationBatchCreateSchema,
  financialForecastListQuerySchema,
  salePaymentSchema,
} from "./index";

const branchId = "11111111-1111-4111-8111-111111111111";
const acquirerId = "22222222-2222-4222-8222-222222222222";
const paymentId = "33333333-3333-4333-8333-333333333333";

describe("financial settlement contracts", () => {
  it("normalizes an acquirer code and accepts an optional branch scope", () => {
    expect(paymentAcquirerCreateSchema.parse({ name: " Rede ", code: " rede ", branchId })).toEqual({
      name: "Rede",
      code: "REDE",
      branchId,
      isActive: true,
    });
  });

  it("requires monetary fee inputs in integer cents and bounded basis points", () => {
    expect(paymentFeeRuleCreateSchema.parse({
      acquirerId,
      paymentMethod: "credit_card",
      brand: "visa",
      installmentFrom: 1,
      installmentTo: 6,
      percentageBasisPoints: 249,
      fixedFeeCents: 35,
      anticipationBasisPoints: 100,
      settlementDays: 30,
      validFrom: "2026-07-21T00:00:00.000Z",
    })).toMatchObject({ percentageBasisPoints: 249, fixedFeeCents: 35, anticipationBasisPoints: 100 });

    expect(() => paymentFeeRuleCreateSchema.parse({
      acquirerId,
      paymentMethod: "credit_card",
      installmentFrom: 1,
      installmentTo: 1,
      percentageBasisPoints: 10_001,
      fixedFeeCents: 0,
      anticipationBasisPoints: 0,
      settlementDays: 0,
      validFrom: "2026-07-21T00:00:00.000Z",
    })).toThrow();
  });

  it("requires a stable external reference for idempotent settlements", () => {
    expect(paymentSettlementCreateSchema.parse({
      paymentId,
      settledAmountCents: 5_000,
      effectiveAt: "2026-07-21T12:00:00.000Z",
      externalReference: "bank-file-42:item-9",
    })).toMatchObject({ status: "posted", settledAmountCents: 5_000 });
  });

  it("accepts optional acquiring metadata and defaults a sale payment to one installment", () => {
    expect(salePaymentSchema.parse({
      method: "credit_card",
      amount: 100,
      status: "paid",
      acquirerId,
      brand: " Visa ",
    })).toEqual({
      method: "credit_card",
      amount: 100,
      status: "paid",
      acquirerId,
      brand: "visa",
      installments: 1,
    });
  });

  it("validates reconciliation batches and branch-scoped forecast filters", () => {
    expect(reconciliationBatchCreateSchema.parse({
      branchId,
      acquirerId,
      externalReference: "statement-2026-07-21",
      items: [{ paymentId, actualAmountCents: 9_650, externalReference: "statement-line-1" }],
    }).items).toHaveLength(1);
    expect(financialForecastListQuerySchema.parse({ branchId, page: "2", pageSize: "25" })).toMatchObject({
      branchId,
      page: 2,
      pageSize: 25,
    });
  });

  it("rejects duplicate payments and external references inside a reconciliation batch", () => {
    const base = {
      branchId,
      acquirerId,
      externalReference: "statement-duplicate",
    };
    const duplicatePayment = reconciliationBatchCreateSchema.safeParse({
      ...base,
      items: [
        { paymentId, actualAmountCents: 5_000, externalReference: "line-1" },
        { paymentId, actualAmountCents: 5_000, externalReference: "line-2" },
      ],
    });
    const duplicateReference = reconciliationBatchCreateSchema.safeParse({
      ...base,
      items: [
        { paymentId, actualAmountCents: 5_000, externalReference: "line-1" },
        { paymentId: "44444444-4444-4444-8444-444444444444", actualAmountCents: 5_000, externalReference: "line-1" },
      ],
    });

    expect(duplicatePayment.success).toBe(false);
    expect(duplicatePayment.error?.issues[0]?.message).toBe("Um pagamento não pode aparecer mais de uma vez no lote.");
    expect(duplicateReference.success).toBe(false);
    expect(duplicateReference.error?.issues[0]?.message).toBe("A referência de um item não pode se repetir no lote.");
  });
});
