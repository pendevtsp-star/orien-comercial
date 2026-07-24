import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "../../shared/request-context";
import { SaleCommissionService } from "./sale-commission.service";

const context: TenantContext = {
  tenantId: "tenant-a",
  branchId: null,
  membershipId: "membership-a",
  roleSlug: "seller",
  permissions: [],
  userId: "user-a",
};

function queryResult<T>(rows: T[]) {
  return Promise.resolve({ rows, rowCount: rows.length });
}

describe("SaleCommissionService", () => {
  it("prioriza a regra da filial e calcula a comissao sem ponto flutuante", async () => {
    const query = vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes("FROM seller_commission_rules")) {
        expect(sql).toContain("tenant_id=$1");
        expect(params).toEqual(["tenant-a", "user-a", "branch-a"]);
        return queryResult([
          {
            id: "rule-branch",
            branch_id: "branch-a",
            rate_percent: "12.34",
          },
        ]);
      }
      if (sql.includes("INSERT INTO seller_commissions")) {
        expect(params).toEqual([
          "tenant-a",
          "sale-a",
          "user-a",
          "2.47",
          "19.99",
        ]);
        return queryResult([{ id: "commission-a" }]);
      }
      if (sql.includes("INSERT INTO audit_logs")) {
        expect(params?.slice(0, 5)).toEqual([
          "tenant-a",
          "user-a",
          "seller_commission.provisioned",
          "commission-a",
          expect.any(String),
        ]);
        const metadata: unknown = JSON.parse(String(params?.[4]));
        expect(metadata).toMatchObject({
          saleId: "sale-a",
          branchId: "branch-a",
          ruleId: "rule-branch",
          before: null,
          after: {
            amount: "2.47",
            baseAmount: "19.99",
            ratePercent: "12.34",
            status: "pending",
          },
        });
        return queryResult([]);
      }
      return Promise.reject(new Error(`Consulta inesperada: ${sql}`));
    });
    const client = { query } as unknown as PoolClient;

    const result = await new SaleCommissionService().provisionInTransaction(
      client,
      context,
      { saleId: "sale-a", branchId: "branch-a", baseAmount: "19.99" },
    );

    expect(result).toEqual({
      status: "created",
      commissionId: "commission-a",
      amountCents: 247,
      baseAmountCents: 1_999,
      ratePercent: "12.34",
      ruleId: "rule-branch",
    });
  });

  it("retorna none quando nao ha usuario ou regra ativa", async () => {
    const queryWithoutUser = vi.fn();
    const clientWithoutUser = { query: queryWithoutUser } as unknown as PoolClient;
    await expect(
      new SaleCommissionService().provisionInTransaction(
        clientWithoutUser,
        { ...context, userId: undefined },
        { saleId: "sale-a", branchId: "branch-a", baseAmount: "10.00" },
      ),
    ).resolves.toEqual({ status: "none", reason: "missing_user" });
    expect(queryWithoutUser).not.toHaveBeenCalled();

    const query = vi.fn((sql: string) => {
      if (sql.includes("FROM seller_commission_rules")) return queryResult([]);
      return Promise.reject(new Error(`Consulta inesperada: ${sql}`));
    });
    await expect(
      new SaleCommissionService().provisionInTransaction(
        { query } as unknown as PoolClient,
        context,
        { saleId: "sale-a", branchId: "branch-a", baseAmount: 10 },
      ),
    ).resolves.toEqual({ status: "none", reason: "rule_not_found" });
  });

  it("e idempotente por tenant, venda e vendedor sem duplicar auditoria", async () => {
    const query = vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes("FROM seller_commission_rules")) {
        return queryResult([
          { id: "rule-global", branch_id: null, rate_percent: "10.00" },
        ]);
      }
      if (sql.includes("INSERT INTO seller_commissions")) {
        expect(sql).toContain("ON CONFLICT(tenant_id,sale_id,user_id) DO NOTHING");
        return queryResult([]);
      }
      if (sql.includes("FROM seller_commissions")) {
        expect(params).toEqual(["tenant-a", "sale-a", "user-a"]);
        return queryResult([
          {
            id: "commission-existing",
            amount: "1.00",
            base_amount: "10.00",
            status: "pending",
          },
        ]);
      }
      return Promise.reject(new Error(`Consulta inesperada: ${sql}`));
    });

    const result = await new SaleCommissionService().provisionInTransaction(
      { query } as unknown as PoolClient,
      context,
      { saleId: "sale-a", branchId: "branch-a", baseAmount: "10.00" },
    );

    expect(result).toMatchObject({
      status: "existing",
      commissionId: "commission-existing",
      amountCents: 100,
      baseAmountCents: 1_000,
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO audit_logs")),
    ).toBe(false);
  });

  it("rejeita filial fora do escopo antes de consultar regras", async () => {
    const query = vi.fn();

    await expect(
      new SaleCommissionService().provisionInTransaction(
        { query } as unknown as PoolClient,
        { ...context, branchId: "branch-authorized" },
        { saleId: "sale-a", branchId: "branch-forbidden", baseAmount: "10.00" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it("cancela apenas comissoes nao pagas e registra antes e depois", async () => {
    const query = vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes("FROM sales")) {
        expect(params).toEqual(["tenant-a", "sale-a"]);
        return queryResult([{ branch_id: "branch-a" }]);
      }
      if (sql.includes("FROM seller_commissions") && sql.includes("FOR UPDATE")) {
        expect(params).toEqual(["tenant-a", "sale-a"]);
        return queryResult([
          {
            id: "commission-pending",
            amount: "5.25",
            base_amount: "105.00",
            status: "pending",
            adjusted_at: null,
            adjustment_reason: null,
          },
          {
            id: "commission-paid",
            amount: "3.00",
            base_amount: "60.00",
            status: "paid",
            adjusted_at: null,
            adjustment_reason: null,
          },
        ]);
      }
      if (sql.includes("UPDATE seller_commissions")) {
        expect(sql).toContain("status<>'paid'");
        expect(params).toEqual([
          "tenant-a",
          "commission-pending",
          "Venda cancelada pelo cliente",
        ]);
        return queryResult([
          {
            id: "commission-pending",
            amount: "0.00",
            base_amount: "105.00",
            status: "cancelled",
            adjusted_at: "2026-07-21T12:00:00.000Z",
            adjustment_reason: "Venda cancelada pelo cliente",
          },
        ]);
      }
      if (sql.includes("INSERT INTO audit_logs")) {
        const metadata: unknown = JSON.parse(String(params?.[4]));
        expect(metadata).toMatchObject({
          before: { amount: "5.25", status: "pending" },
          after: { amount: "0.00", status: "cancelled" },
          reason: "Venda cancelada pelo cliente",
        });
        return queryResult([]);
      }
      return Promise.reject(new Error(`Consulta inesperada: ${sql}`));
    });

    const result = await new SaleCommissionService().cancelInTransaction(
      { query } as unknown as PoolClient,
      context,
      "sale-a",
      " Venda cancelada pelo cliente ",
    );

    expect(result).toEqual({ cancelled: 1, paidPreserved: 1 });
    expect(
      query.mock.calls.filter(([sql]) => String(sql).includes("UPDATE seller_commissions")),
    ).toHaveLength(1);
  });

  it("preserva comissao paga sem atualizacao ou auditoria", async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes("FROM sales")) return queryResult([{ branch_id: "branch-a" }]);
      if (sql.includes("FROM seller_commissions")) {
        return queryResult([
          {
            id: "commission-paid",
            amount: "3.00",
            base_amount: "60.00",
            status: "paid",
            adjusted_at: null,
            adjustment_reason: null,
          },
        ]);
      }
      return Promise.reject(new Error(`Consulta inesperada: ${sql}`));
    });

    await expect(
      new SaleCommissionService().cancelInTransaction(
        { query } as unknown as PoolClient,
        context,
        "sale-a",
        "Venda cancelada",
      ),
    ).resolves.toEqual({ cancelled: 0, paidPreserved: 1 });
    expect(
      query.mock.calls.some(([sql]) =>
        /UPDATE seller_commissions|INSERT INTO audit_logs/.test(String(sql)),
      ),
    ).toBe(false);
  });

  it("valida o escopo da filial da venda no cancelamento", async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes("FROM sales")) return queryResult([{ branch_id: "branch-other" }]);
      return Promise.reject(new Error(`Consulta inesperada: ${sql}`));
    });

    await expect(
      new SaleCommissionService().cancelInTransaction(
        { query } as unknown as PoolClient,
        { ...context, branchId: "branch-authorized" },
        "sale-a",
        "Venda cancelada",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("nao cancela comissao de venda inexistente no tenant", async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes("FROM sales")) return queryResult([]);
      return Promise.reject(new Error(`Consulta inesperada: ${sql}`));
    });

    await expect(
      new SaleCommissionService().cancelInTransaction(
        { query } as unknown as PoolClient,
        context,
        "sale-other-tenant",
        "Venda cancelada",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
