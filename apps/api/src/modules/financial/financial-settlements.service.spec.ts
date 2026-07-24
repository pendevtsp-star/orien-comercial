import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { FinancialSettlementsService } from "./financial-settlements.service";

const context = {
  tenantId: "tenant-a",
  userId: "user-a",
  membershipId: "membership-a",
  roleSlug: "manager",
  permissions: ["financial.reconcile"],
  branchId: "branch-a",
};

describe("FinancialSettlementsService", () => {
  it("returns a zero-fee immutable snapshot when no acquirer rule is selected", async () => {
    const service = new FinancialSettlementsService({} as never);

    const snapshot = await service.resolvePaymentSnapshotInTransaction({ query: vi.fn() } as never, context, {
      branchId: "branch-a",
      paymentMethod: "pix",
      installments: 1,
      grossAmountCents: 12_345,
      occurredAt: "2026-07-21T12:00:00.000Z",
    });

    expect(snapshot).toMatchObject({
      acquirerId: null,
      feeRuleId: null,
      feeRuleVersion: null,
      grossAmountCents: 12_345,
      totalFeeCents: 0,
      netAmountCents: 12_345,
      expectedSettlementDate: "2026-07-21",
    });
  });

  it("rejects an explicit acquirer that is unavailable in the tenant and branch scope", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = new FinancialSettlementsService({} as never);

    await expect(service.resolvePaymentSnapshotInTransaction({ query } as never, context, {
      branchId: "branch-a",
      acquirerId: "acquirer-outside-scope",
      paymentMethod: "credit_card",
      installments: 1,
      grossAmountCents: 10_000,
      occurredAt: "2026-07-21T12:00:00.000Z",
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("resolves each mixed payment independently against the tenant and branch rule", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        acquirer_id: "acquirer-a", branch_id: "branch-a", rule_id: "rule-a", version: 3,
        percentage_basis_points: 250, fixed_fee: "0.30", anticipation_basis_points: 0, settlement_days: 30,
      }] })
      .mockResolvedValueOnce({ rows: [{
        acquirer_id: "acquirer-a", branch_id: "branch-a", rule_id: "rule-b", version: 4,
        percentage_basis_points: 150, fixed_fee: "0.00", anticipation_basis_points: 0, settlement_days: 2,
      }] });
    const service = new FinancialSettlementsService({} as never);

    const snapshots = await service.resolvePaymentSnapshotsInTransaction({ query } as never, context, [
      { branchId: "branch-a", acquirerId: "acquirer-a", paymentMethod: "credit_card", brand: "visa", installments: 3, grossAmountCents: 10_000, occurredAt: "2026-07-21T12:00:00.000Z" },
      { branchId: "branch-a", acquirerId: "acquirer-a", paymentMethod: "debit_card", installments: 1, grossAmountCents: 5_000, occurredAt: "2026-07-21T12:00:00.000Z" },
    ]);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ feeRuleId: "rule-a", feeRuleVersion: 3, totalFeeCents: 280, netAmountCents: 9_720 });
    expect(snapshots[1]).toMatchObject({ feeRuleId: "rule-b", feeRuleVersion: 4, totalFeeCents: 75, netAmountCents: 4_925 });
    expect(query.mock.calls[0]?.[0]).toContain("pa.tenant_id=$1");
    expect(query.mock.calls[0]?.[0]).toContain("pa.branch_id=$3");
  });

  it("serializes fee rule versions before creating a new immutable version", async () => {
    const query = vi.fn((sql: string, values?: unknown[]) => {
      void values;
      if (sql.includes("FROM payment_acquirers")) return { rows: [{ id: "acquirer-a", branch_id: "branch-a" }] };
      if (sql.includes("ORDER BY version DESC")) return { rows: [{ version: 2, supersedes_rule_id: "rule-v2" }] };
      if (sql.includes("INSERT INTO payment_fee_rules")) return { rows: [{ id: "rule-v3", version: 3 }] };
      return { rows: [] };
    });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new FinancialSettlementsService({ tenantTransaction } as never);

    const created = await service.createFeeRule(context, {
      acquirerId: "acquirer-a",
      paymentMethod: "credit_card",
      brand: "visa",
      installmentFrom: 1,
      installmentTo: 6,
      percentageBasisPoints: 250,
      fixedFeeCents: 30,
      anticipationBasisPoints: 0,
      settlementDays: 30,
      validFrom: "2026-07-21T00:00:00.000Z",
    });

    const lockIndex = query.mock.calls.findIndex(([sql]) => sql.includes("pg_advisory_xact_lock"));
    const versionIndex = query.mock.calls.findIndex(([sql]) => sql.includes("ORDER BY version DESC"));
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(versionIndex);
    expect(created).toEqual({ id: "rule-v3", version: 3 });
    const insert = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO payment_fee_rules"));
    expect(insert?.[0]).toContain("supersedes_rule_id");
    expect(insert?.[1]).toContain("rule-v2");
  });

  it("returns the original settlement for an identical external reference", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{
      id: "settlement-a", payment_id: "33333333-3333-4333-8333-333333333333",
      settled_amount: "50.00", effective_at: new Date("2026-07-21T12:00:00.000Z"), status: "posted",
    }] });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new FinancialSettlementsService({ tenantTransaction } as never);

    const result = await service.createSettlement(context, {
      paymentId: "33333333-3333-4333-8333-333333333333",
      settledAmountCents: 5_000,
      effectiveAt: "2026-07-21T12:00:00.000Z",
      externalReference: "bank-file:item-1",
      status: "posted",
    });

    expect(result).toMatchObject({ id: "settlement-a", idempotentReplay: true });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse of an external reference with a different payload", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{
      id: "settlement-a", payment_id: "other-payment", settled_amount: "50.00",
      effective_at: new Date("2026-07-21T12:00:00.000Z"), status: "posted",
    }] });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new FinancialSettlementsService({ tenantTransaction } as never);

    await expect(service.createSettlement(context, {
      paymentId: "33333333-3333-4333-8333-333333333333",
      settledAmountCents: 5_000,
      effectiveAt: "2026-07-21T12:00:00.000Z",
      externalReference: "bank-file:item-1",
      status: "posted",
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects settlement amounts above the outstanding net amount", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "payment-a", branch_id: "branch-a", net_amount: "100.00", amount: "100.00", settlement_status: "pending" }] })
      .mockResolvedValueOnce({ rows: [{ settled_total: "90.00" }] });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new FinancialSettlementsService({ tenantTransaction } as never);

    await expect(service.createSettlement(context, {
      paymentId: "33333333-3333-4333-8333-333333333333",
      settledAmountCents: 1_001,
      effectiveAt: "2026-07-21T12:00:00.000Z",
      externalReference: "bank-file:item-2",
      status: "posted",
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(query.mock.calls[1]?.[0]).toContain("FOR UPDATE");
  });

  it.each([
    ["25.00", 2_500, "partially_settled"],
    ["50.00", 5_000, "settled"],
  ])("updates a payment from an existing %s settlement to %s cents as %s", async (alreadySettled, amountCents, expectedStatus) => {
    const query = vi.fn((sql: string, values?: unknown[]) => {
      void values;
      if (sql.includes("INSERT INTO payment_settlements")) return { rows: [{ id: "settlement-a", status: "posted" }] };
      if (sql.includes("external_reference")) return { rows: [] };
      if (sql.includes("FROM sale_payments") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "payment-a", branch_id: "branch-a", net_amount: "100.00", amount: "100.00", settlement_status: "pending" }] };
      }
      if (sql.includes("settled_total")) return { rows: [{ settled_total: alreadySettled }] };
      return { rows: [] };
    });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new FinancialSettlementsService({ tenantTransaction } as never);

    const result = await service.createSettlement(context, {
      paymentId: "33333333-3333-4333-8333-333333333333",
      settledAmountCents: amountCents,
      effectiveAt: "2026-07-21T12:00:00.000Z",
      externalReference: `status:${expectedStatus}`,
      status: "posted",
    });

    expect(result).toMatchObject({ settlementStatus: expectedStatus });
    const statusUpdate = query.mock.calls.find(([sql]) => sql.includes("UPDATE sale_payments SET settlement_status"));
    expect(statusUpdate?.[1]).toEqual(["tenant-a", "33333333-3333-4333-8333-333333333333", expectedStatus]);
  });

  it("rolls a batch back through the single tenant transaction when one item fails", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "payment-a", branch_id: "branch-a", net_amount: "50.00", amount: "50.00", settlement_status: "pending" }] })
      .mockResolvedValueOnce({ rows: [{ settled_total: "0" }] })
      .mockResolvedValueOnce({ rows: [{ id: "settlement-a", status: "posted" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "payment-b", branch_id: "branch-b", net_amount: "50.00", amount: "50.00", settlement_status: "pending" }] });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new FinancialSettlementsService({ tenantTransaction } as never);

    await expect(service.createSettlementBatch(context, { settlements: [
      { paymentId: "33333333-3333-4333-8333-333333333333", settledAmountCents: 5_000, effectiveAt: "2026-07-21T12:00:00.000Z", externalReference: "batch:1", status: "posted" },
      { paymentId: "44444444-4444-4444-8444-444444444444", settledAmountCents: 5_000, effectiveAt: "2026-07-21T12:00:00.000Z", externalReference: "batch:2", status: "posted" },
    ] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tenantTransaction).toHaveBeenCalledTimes(1);
  });

  it("rejects a reversal idempotency key reused for another settlement", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        id: "settlement-a", branch_id: "branch-a", payment_id: "33333333-3333-4333-8333-333333333333",
        receivable_id: null, settled_amount: "50.00",
      }] })
      .mockResolvedValueOnce({ rows: [{ id: "reversal-existing", reversed_settlement_id: "other-settlement" }] });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new FinancialSettlementsService({ tenantTransaction } as never);

    await expect(service.reverseSettlement(context, "settlement-a", {
      reason: "Correção operacional",
      externalReference: "reversal:reused",
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects a second reversal of the same posted settlement with another external reference", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        id: "settlement-a", branch_id: "branch-a", payment_id: "33333333-3333-4333-8333-333333333333",
        receivable_id: null, settled_amount: "50.00",
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "reversal-existing", external_reference: "reversal:first" }] });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new FinancialSettlementsService({ tenantTransaction } as never);

    await expect(service.reverseSettlement(context, "settlement-a", {
      reason: "Nova tentativa indevida",
      externalReference: "reversal:second",
    })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects duplicate payment ids and item references before opening a reconciliation transaction", async () => {
    const tenantTransaction = vi.fn();
    const service = new FinancialSettlementsService({ tenantTransaction } as never);
    const duplicatePayment = {
      branchId: "branch-a",
      acquirerId: "22222222-2222-4222-8222-222222222222",
      externalReference: "statement-duplicate-payment",
      items: [
        { paymentId: "33333333-3333-4333-8333-333333333333", actualAmountCents: 5_000, externalReference: "line-1" },
        { paymentId: "33333333-3333-4333-8333-333333333333", actualAmountCents: 5_000, externalReference: "line-2" },
      ],
    };

    await expect(service.createReconciliationBatch(context, duplicatePayment)).rejects.toMatchObject({ status: 400 });
    expect(tenantTransaction).not.toHaveBeenCalled();
  });

  it("records and explains reconciliation divergence by payment", async () => {
    const query = vi.fn((sql: string, values?: unknown[]) => {
      void values;
      if (sql.includes("FROM payment_acquirers")) return { rows: [{ id: "22222222-2222-4222-8222-222222222222", branch_id: "branch-a" }] };
      if (sql.includes("INSERT INTO reconciliation_batches")) return { rows: [{ id: "batch-a" }] };
      if (sql.includes("FROM sale_payments") && sql.includes("FOR UPDATE")) return { rows: [{ id: "33333333-3333-4333-8333-333333333333", branch_id: "branch-a", net_amount: "100.00", amount: "100.00" }] };
      if (sql.includes("INSERT INTO reconciliation_items")) return { rows: [{ id: "item-a", status: "diverged", difference_amount: "-3.50" }] };
      if (sql.includes("UPDATE reconciliation_batches")) return { rows: [{ id: "batch-a", status: "diverged", expectedAmount: "100.00", actualAmount: "96.50", differenceAmount: "-3.50" }] };
      return { rows: [] };
    });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new FinancialSettlementsService({ tenantTransaction } as never);

    const result = await service.createReconciliationBatch(context, {
      branchId: "branch-a",
      acquirerId: "22222222-2222-4222-8222-222222222222",
      externalReference: "statement-1",
      items: [{ paymentId: "33333333-3333-4333-8333-333333333333", actualAmountCents: 9_650, externalReference: "line-1" }],
    });

    expect(result).toMatchObject({ status: "diverged", differenceAmount: "-3.50" });
    const itemInsert = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO reconciliation_items"));
    expect(itemInsert?.[1]).toEqual(expect.arrayContaining(["100.00", "96.50", "-3.50", "diverged"]));
  });

  it("reconciles only the outstanding net amount without changing settlement status", async () => {
    const query = vi.fn((sql: string, values?: unknown[]) => {
      void values;
      if (sql.includes("FROM payment_acquirers")) return { rows: [{ id: "22222222-2222-4222-8222-222222222222", branch_id: "branch-a" }] };
      if (sql.includes("INSERT INTO reconciliation_batches")) return { rows: [{ id: "batch-a" }] };
      if (sql.includes("FROM sale_payments") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "33333333-3333-4333-8333-333333333333", branch_id: "branch-a", net_amount: "100.00", amount: "100.00", settlement_status: "partially_settled" }] };
      }
      if (sql.includes("settled_total")) return { rows: [{ settled_total: "20.00" }] };
      if (sql.includes("INSERT INTO reconciliation_items")) return { rows: [{ id: "item-a", status: "reconciled", difference_amount: "0.00" }] };
      if (sql.includes("UPDATE reconciliation_batches")) return { rows: [{ id: "batch-a", status: "reconciled", expectedAmount: "80.00", actualAmount: "80.00", differenceAmount: "0.00" }] };
      return { rows: [] };
    });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new FinancialSettlementsService({ tenantTransaction } as never);

    const result = await service.createReconciliationBatch(context, {
      branchId: "branch-a",
      acquirerId: "22222222-2222-4222-8222-222222222222",
      externalReference: "statement-outstanding",
      items: [{ paymentId: "33333333-3333-4333-8333-333333333333", actualAmountCents: 8_000, externalReference: "line-1" }],
    });

    expect(result).toMatchObject({ status: "reconciled", expectedAmount: "80.00", differenceAmount: "0.00" });
    const itemInsert = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO reconciliation_items"));
    expect(itemInsert?.[1]).toEqual(expect.arrayContaining(["80.00", "80.00", "0.00", "reconciled"]));
    expect(query.mock.calls.some(([sql]) => sql.includes("SET reconciliation_status=$3"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes("SET settlement_status=$3"))).toBe(false);
  });

  it("rejects an idempotency key reused by a different reconciliation payload", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: "batch-a", request_hash: "0".repeat(64) }] });
    const tenantTransaction = vi.fn((_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }));
    const service = new FinancialSettlementsService({ tenantTransaction } as never);

    await expect(service.createReconciliationBatch(context, {
      branchId: "branch-a",
      acquirerId: "22222222-2222-4222-8222-222222222222",
      externalReference: "statement-reused",
      items: [{ paymentId: "33333333-3333-4333-8333-333333333333", actualAmountCents: 9_650, externalReference: "line-1" }],
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
