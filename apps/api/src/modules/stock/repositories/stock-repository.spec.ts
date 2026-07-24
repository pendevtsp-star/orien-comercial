import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "../../../shared/request-context";
import { RepositoryScopeError } from "../../domain/repository-scope";
import { InsufficientStockError, PgStockRepository } from "./stock-repository";

const context: TenantContext = {
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleSlug: "stock",
  permissions: [],
  branchId: "branch-a",
};

function clientWith(query: ReturnType<typeof vi.fn>) {
  return { query } as unknown as PoolClient;
}

describe("PgStockRepository", () => {
  it("bloqueia saldo por tenant, filial e produto", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ quantity: "12.500" }] });
    const repository = new PgStockRepository();

    await expect(repository.findBalanceForUpdate(clientWith(query), {
      context,
      tenantId: "tenant-a",
      branchId: "branch-a",
      productId: "product-a",
    })).resolves.toEqual({ quantity: "12.500" });
    expect(query.mock.calls[0]?.[0]).toContain("tenant_id = $1");
    expect(query.mock.calls[0]?.[0]).toContain("branch_id = $2");
    expect(query.mock.calls[0]?.[0]).toContain("product_id = $3");
    expect(query.mock.calls[0]?.[1]).toEqual(["tenant-a", "branch-a", "product-a"]);
  });

  it("aplica delta no saldo bloqueado e impede estoque negativo", async () => {
    const repository = new PgStockRepository();
    const successQuery = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ quantity: "5.000" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ quantity: "3.000" }] });

    await expect(repository.changeBalance(clientWith(successQuery), {
      context,
      tenantId: "tenant-a",
      branchId: "branch-a",
      productId: "product-a",
      quantityDelta: "-2.000",
    })).resolves.toEqual({ quantity: "3.000" });

    const insufficientQuery = vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ quantity: "1.000" }] });
    await expect(repository.changeBalance(clientWith(insufficientQuery), {
      context,
      tenantId: "tenant-a",
      branchId: "branch-a",
      productId: "product-a",
      quantityDelta: "-2.000",
    })).rejects.toBeInstanceOf(InsufficientStockError);
    expect(insufficientQuery).toHaveBeenCalledOnce();
  });

  it("rejeita tenant e filial cruzados antes de bloquear saldo", async () => {
    const query = vi.fn();
    const repository = new PgStockRepository();

    await expect(repository.findBalanceForUpdate(clientWith(query), {
      context,
      tenantId: "tenant-b",
      branchId: "branch-a",
      productId: "product-a",
    })).rejects.toMatchObject({ code: "TENANT_SCOPE_MISMATCH" } satisfies Partial<RepositoryScopeError>);
    await expect(repository.findBalanceForUpdate(clientWith(query), {
      context,
      tenantId: "tenant-a",
      branchId: "branch-b",
      productId: "product-a",
    })).rejects.toMatchObject({ code: "BRANCH_SCOPE_MISMATCH" } satisfies Partial<RepositoryScopeError>);
    expect(query).not.toHaveBeenCalled();
  });

  it("registra movimento no cliente ativo e propaga falha para rollback", async () => {
    const failure = new Error("movement insert failed");
    const query = vi.fn().mockRejectedValue(failure);
    const repository = new PgStockRepository();

    await expect(repository.recordMovement(clientWith(query), {
      context,
      tenantId: "tenant-a",
      branchId: "branch-a",
      productId: "product-a",
      movementType: "sale_out",
      quantity: "-1.000",
      reason: "Venda sale-a",
    })).rejects.toBe(failure);
    expect(query.mock.calls.flat().join(" ")).not.toMatch(/\b(BEGIN|COMMIT|ROLLBACK)\b/i);
  });
});
