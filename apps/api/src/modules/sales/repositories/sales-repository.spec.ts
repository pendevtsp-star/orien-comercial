import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "../../../shared/request-context";
import { RepositoryScopeError } from "../../domain/repository-scope";
import { PgSalesRepository } from "./sales-repository";

const context: TenantContext = {
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleSlug: "owner",
  permissions: [],
  branchId: "branch-a",
};

function clientWith(query: ReturnType<typeof vi.fn>) {
  return { query } as unknown as PoolClient;
}

describe("PgSalesRepository", () => {
  it("busca uma venda por tenant, filial e id sem devolver colunas sensiveis", async () => {
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{
        id: "sale-a",
        branch_id: "branch-a",
        customer_id: "customer-a",
        status: "sold",
        total_amount: "120.50",
        composition_fingerprint: "a".repeat(64),
        metadata: { token: "nao-deve-sair" },
      }],
    });
    const repository = new PgSalesRepository();

    const result = await repository.findForUpdate(clientWith(query), {
      context,
      tenantId: "tenant-a",
      branchId: "branch-a",
      saleId: "sale-a",
    });

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("s.tenant_id = $1");
    expect(query.mock.calls[0]?.[0]).toContain("s.branch_id = $2");
    expect(query.mock.calls[0]?.[0]).toContain("s.id = $3");
    expect(query.mock.calls[0]?.[1]).toEqual(["tenant-a", "branch-a", "sale-a"]);
    expect(result).toEqual({
      id: "sale-a",
      branchId: "branch-a",
      customerId: "customer-a",
      status: "sold",
      totalAmount: "120.50",
      compositionFingerprint: "a".repeat(64),
    });
    expect(result).not.toHaveProperty("metadata");
  });

  it("rejeita tenant e filial cruzados antes de consultar o banco", async () => {
    const query = vi.fn();
    const repository = new PgSalesRepository();

    await expect(repository.findForUpdate(clientWith(query), {
      context,
      tenantId: "tenant-b",
      branchId: "branch-a",
      saleId: "sale-a",
    })).rejects.toMatchObject({ code: "TENANT_SCOPE_MISMATCH" } satisfies Partial<RepositoryScopeError>);

    await expect(repository.findForUpdate(clientWith(query), {
      context,
      tenantId: "tenant-a",
      branchId: "branch-b",
      saleId: "sale-a",
    })).rejects.toMatchObject({ code: "BRANCH_SCOPE_MISMATCH" } satisfies Partial<RepositoryScopeError>);
    expect(query).not.toHaveBeenCalled();
  });

  it("distingue aquisicao, replay, processamento e conflito de idempotencia", async () => {
    const requestHash = "b".repeat(64);
    const acquiredQuery = vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ request_hash: requestHash, response: null }] });
    const repository = new PgSalesRepository();
    const scope = { context, tenantId: "tenant-a", operation: "sales.create", key: "request-key-0001", requestHash };

    await expect(repository.claimIdempotency(clientWith(acquiredQuery), scope)).resolves.toEqual({ status: "acquired" });

    const replayQuery = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ request_hash: requestHash, response: { id: "sale-a" } }] });
    await expect(repository.claimIdempotency(clientWith(replayQuery), scope)).resolves.toEqual({ status: "replay", response: { id: "sale-a" } });

    const processingQuery = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ request_hash: requestHash, response: null }] });
    await expect(repository.claimIdempotency(clientWith(processingQuery), scope)).resolves.toEqual({ status: "in_progress" });

    const conflictQuery = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ request_hash: "c".repeat(64), response: null }] });
    await expect(repository.claimIdempotency(clientWith(conflictQuery), scope)).resolves.toEqual({ status: "conflict" });
  });

  it("conclui somente a chave idempotente do tenant e hash correspondentes", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const repository = new PgSalesRepository();

    await expect(repository.completeIdempotency(clientWith(query), {
      context,
      tenantId: "tenant-a",
      operation: "sales.create",
      key: "request-key-0001",
      requestHash: "d".repeat(64),
    }, { id: "sale-a" })).resolves.toBe(true);

    expect(query.mock.calls[0]?.[0]).toContain("tenant_id = $1");
    expect(query.mock.calls[0]?.[0]).toContain("request_hash = $4");
    expect(query.mock.calls[0]?.[1]).toEqual([
      "tenant-a",
      "sales.create",
      "request-key-0001",
      "d".repeat(64),
      JSON.stringify({ id: "sale-a" }),
    ]);
  });

  it("nao controla a transacao e propaga falhas do PoolClient", async () => {
    const failure = new Error("transaction aborted");
    const query = vi.fn().mockRejectedValue(failure);
    const repository = new PgSalesRepository();

    await expect(repository.findForUpdate(clientWith(query), {
      context,
      tenantId: "tenant-a",
      branchId: "branch-a",
      saleId: "sale-a",
    })).rejects.toBe(failure);

    const sql = query.mock.calls.map(([statement]) => String(statement)).join(" ");
    expect(sql).not.toMatch(/\b(BEGIN|COMMIT|ROLLBACK)\b/i);
  });
});
