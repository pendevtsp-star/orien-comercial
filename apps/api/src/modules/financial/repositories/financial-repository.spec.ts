import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "../../../shared/request-context";
import { RepositoryScopeError } from "../../domain/repository-scope";
import { PgFinancialRepository } from "./financial-repository";

const context: TenantContext = {
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleSlug: "financial",
  permissions: [],
  branchId: "branch-a",
};

function clientWith(query: ReturnType<typeof vi.fn>) {
  return { query } as unknown as PoolClient;
}

describe("PgFinancialRepository", () => {
  it("bloqueia pagamento pelo tenant, filial e id e retorna apenas o snapshot financeiro", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{
      id: "payment-a",
      branch_id: "branch-a",
      sale_id: "sale-a",
      status: "paid",
      settlement_status: "pending",
      gross_amount: "100.00",
      total_fee_amount: "3.50",
      net_amount: "96.50",
      metadata: { access_token: "segredo" },
    }] });
    const repository = new PgFinancialRepository();

    const result = await repository.findPaymentForUpdate(clientWith(query), {
      context,
      tenantId: "tenant-a",
      branchId: "branch-a",
      paymentId: "payment-a",
    });

    expect(query.mock.calls[0]?.[0]).toContain("tenant_id = $1");
    expect(query.mock.calls[0]?.[0]).toContain("branch_id = $2");
    expect(query.mock.calls[0]?.[0]).toContain("id = $3");
    expect(query.mock.calls[0]?.[1]).toEqual(["tenant-a", "branch-a", "payment-a"]);
    expect(result).toEqual({
      id: "payment-a",
      branchId: "branch-a",
      saleId: "sale-a",
      status: "paid",
      settlementStatus: "pending",
      grossAmount: "100.00",
      totalFeeAmount: "3.50",
      netAmount: "96.50",
    });
    expect(result).not.toHaveProperty("metadata");
  });

  it("encontra liquidacao pela referencia externa dentro do mesmo tenant e filial", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{
      id: "settlement-a",
      branch_id: "branch-a",
      payment_id: "payment-a",
      external_reference: "bank-123",
      settled_amount: "96.50",
      status: "posted",
    }] });
    const repository = new PgFinancialRepository();

    await expect(repository.findSettlementByExternalReferenceForUpdate(clientWith(query), {
      context,
      tenantId: "tenant-a",
      branchId: "branch-a",
      externalReference: "bank-123",
    })).resolves.toMatchObject({ id: "settlement-a", externalReference: "bank-123" });
    expect(query.mock.calls[0]?.[1]).toEqual(["tenant-a", "branch-a", "bank-123"]);
  });

  it("rejeita escopos cruzados sem executar SQL", async () => {
    const query = vi.fn();
    const repository = new PgFinancialRepository();

    await expect(repository.findPaymentForUpdate(clientWith(query), {
      context,
      tenantId: "tenant-b",
      branchId: "branch-a",
      paymentId: "payment-a",
    })).rejects.toMatchObject({ code: "TENANT_SCOPE_MISMATCH" } satisfies Partial<RepositoryScopeError>);
    await expect(repository.findPaymentForUpdate(clientWith(query), {
      context,
      tenantId: "tenant-a",
      branchId: "branch-b",
      paymentId: "payment-a",
    })).rejects.toMatchObject({ code: "BRANCH_SCOPE_MISMATCH" } satisfies Partial<RepositoryScopeError>);
    expect(query).not.toHaveBeenCalled();
  });

  it("deixa rollback sob responsabilidade da transacao chamadora", async () => {
    const failure = new Error("serialization failure");
    const query = vi.fn().mockRejectedValue(failure);
    const repository = new PgFinancialRepository();

    await expect(repository.findReceivableForUpdate(clientWith(query), {
      context,
      tenantId: "tenant-a",
      branchId: "branch-a",
      receivableId: "receivable-a",
    })).rejects.toBe(failure);
    expect(query.mock.calls.flat().join(" ")).not.toMatch(/\b(BEGIN|COMMIT|ROLLBACK)\b/i);
  });
});
