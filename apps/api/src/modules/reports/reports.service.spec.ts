import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "../../shared/request-context";
import { ReportsService } from "./reports.service";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const branchId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherBranchId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const sellerId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const customerId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const restrictedContext: TenantContext = {
  tenantId,
  branchId,
  userId: sellerId,
  membershipId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  roleSlug: "manager",
  permissions: ["sales.read", "financial.read"],
};

function createDatabase() {
  return {
    tenantQuery: vi.fn((_tenantId: string, sql: string, params: unknown[]) => {
      if (sql.includes("key = 'regional'")) return { rows: [{ timezone: "America/Sao_Paulo" }] };
      if (sql.includes("seller_goals sg")) {
        return {
          rows: [
            {
              sellerName: "Ana Vendas",
              branchName: "Loja Centro",
              totalSales: "5000.00",
              salesCount: 25,
              itemsCount: 150,
              averageTicket: "200.00",
              salesTarget: "6000.00",
              targetPercentage: "83.3%",
              targetDifference: "-1000.00",
              customersCount: 20,
              newCustomersCount: 5,
              dailyPlan: "200.00",
            },
          ],
          params,
        };
      }
      if (sql.includes("reconciliation_status") && sql.includes("defasagemDays")) {
        return {
          rows: [
            {
              paymentId: "20000000-0000-4000-8000-000000000001",
              branchName: "Loja Centro",
              sellerName: "Ana Vendas",
              customerName: "José da Silva",
              paymentMethod: "credit_card",
              paymentAmount: "100.00",
              paymentDate: "2026-07-15T15:00:00.000Z",
              settlementDate: "2026-08-10T10:00:00.000Z",
              reconciliationDate: "2026-08-12T14:00:00.000Z",
              defasagemDays: 28,
              reconciliationStatus: "reconciled",
              settlementStatus: "settled",
            },
            {
              paymentId: "20000000-0000-4000-8000-000000000002",
              branchName: "Loja Centro",
              sellerName: "Ana Vendas",
              customerName: "Cliente sem taxa",
              paymentMethod: "pix",
              paymentAmount: "50.00",
              paymentDate: "2026-07-16T15:00:00.000Z",
              settlementDate: null,
              reconciliationDate: null,
              defasagemDays: 0,
              reconciliationStatus: "pending",
              settlementStatus: "pending",
            },
          ],
          params,
        };
      }
      if (sql.includes("seller_commissions sc")) {
        return {
          rows: [
            {
              sellerName: "Ana Vendas",
              branchName: "Loja Centro",
              paymentMethod: "credit_card",
              installments: "3x",
              salesCount: 5,
              totalSalesAmount: "1250.00",
              totalCommissionAmount: "62.50",
              averageCommissionRate: "5.00%",
            },
            {
              sellerName: "Ana Vendas",
              branchName: "Loja Centro",
              paymentMethod: "pix",
              installments: "1x",
              salesCount: 8,
              totalSalesAmount: "800.00",
              totalCommissionAmount: "40.00",
              averageCommissionRate: "5.00%",
            },
          ],
          params,
        };
      }
      if (sql.includes("commercial_document_type = 'dav'") && sql.includes("billingStatus")) {
        return {
          rows: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              documentNumber: "42",
              documentType: "dav",
              status: "approved",
              branchName: "Loja Centro",
              customerName: "José da Silva",
              sellerName: "Ana Vendas",
              totalAmount: "250.50",
              validUntil: "2026-07-31",
              convertedSaleId: null,
              convertedAt: null,
              createdAt: "2026-07-15T14:00:00.000Z",
              saleAmount: null,
              saleDate: null,
              billingStatus: "Pendente",
            },
          ],
          params,
        };
      }
      if (sql.includes("FROM quotes q")) {
        return {
          rows: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              documentNumber: "42",
              documentType: "dav",
              status: "approved",
              branchName: "Loja Centro",
              customerName: "José da Silva",
              sellerName: "Ana Vendas",
              totalAmount: "250.50",
              validUntil: "2026-07-31",
              convertedSaleId: null,
              createdAt: "2026-07-15T14:00:00.000Z",
            },
          ],
          params,
        };
      }
      if (sql.includes("FROM sale_payments sp")) {
        return {
          rows: [
            {
              paymentId: "20000000-0000-4000-8000-000000000001",
              saleId: "30000000-0000-4000-8000-000000000001",
              branchName: "Loja Centro",
              sellerName: "Ana Vendas",
              customerName: "José da Silva",
              method: "credit_card",
              status: "paid",
              grossAmount: "100.00",
              feeAmount: "3.50",
              netAmount: "96.50",
              acquirerName: "Adquirente Teste",
              cardBrand: "visa",
              expectedSettlementAt: "2026-08-15",
              createdAt: "2026-07-15T15:00:00.000Z",
            },
            {
              paymentId: "20000000-0000-4000-8000-000000000002",
              saleId: "30000000-0000-4000-8000-000000000002",
              branchName: "Loja Centro",
              sellerName: "Ana Vendas",
              customerName: "Cliente sem taxa",
              method: "pix",
              status: "paid",
              grossAmount: "50.00",
              feeAmount: null,
              netAmount: null,
              acquirerName: null,
              cardBrand: null,
              expectedSettlementAt: null,
              createdAt: "2026-07-16T15:00:00.000Z",
            },
          ],
          params,
        };
      }
      throw new Error(`Query inesperada: ${sql}`);
    }),
  };
}

describe("ReportsService commercial datasets", () => {
  it("rejects a branch outside the authenticated membership before querying data", async () => {
    const database = createDatabase();
    const service = new ReportsService(database as never);

    await expect(
      service.dataset(restrictedContext, "commercial-documents", {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        branchId: otherBranchId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.tenantQuery).not.toHaveBeenCalled();
  });

  it("rejects an unbounded period even when the end date is omitted", async () => {
    const database = createDatabase();
    const service = new ReportsService(database as never);

    await expect(
      service.dataset(restrictedContext, "commercial-documents", { startDate: "2020-01-01" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.tenantQuery).not.toHaveBeenCalled();
  });

  it("applies tenant, branch, period, seller, customer, type and status to commercial documents", async () => {
    const database = createDatabase();
    const service = new ReportsService(database as never);
    const dataset = await service.dataset(restrictedContext, "commercial-documents", {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      sellerId,
      customerId,
      documentType: "dav",
      status: "approved",
    });

    const queryCall = database.tenantQuery.mock.calls.find((call) => String(call[1]).includes("FROM quotes q"));
    expect(queryCall?.[0]).toBe(tenantId);
    expect(queryCall?.[2]).toEqual(expect.arrayContaining([tenantId, branchId, sellerId, customerId, "dav", "approved"]));
    expect(dataset.rows).toHaveLength(1);
    expect(dataset.rows[0]).not.toHaveProperty("fiscalStatus");
    expect(dataset.summary).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Documentos", value: 1 })]));
  });

  it("reports gross amounts and keeps missing fee snapshots explicit instead of inventing fiscal or financial data", async () => {
    const database = createDatabase();
    const service = new ReportsService(database as never);
    const dataset = await service.dataset(restrictedContext, "financial-net", {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      sellerId,
      customerId,
      status: "paid",
      cardBrand: "VISA",
    });

    const queryCall = database.tenantQuery.mock.calls.find((call) => String(call[1]).includes("FROM sale_payments sp"));
    const sql = String(queryCall?.[1]);
    expect(sql).toContain("sp.gross_amount");
    expect(sql).toContain("sp.total_fee_amount");
    expect(sql).toContain("sp.net_amount");
    expect(sql).toContain("LEFT JOIN payment_acquirers pa");
    expect(sql).not.toContain("sp.metadata");

    expect(dataset.rows[1]).toMatchObject({ grossAmount: "50.00", feeAmount: null, netAmount: null });
    expect(dataset.summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Bruto", value: "150.00" }),
        expect.objectContaining({ label: "Taxas registradas", value: "3.50" }),
        expect.objectContaining({ label: "Líquido conhecido", value: "96.50" }),
      ]),
    );
    expect(dataset.warnings.join(" ")).toContain("1 pagamento(s) sem snapshot");
  });

  it("rejects a status that does not belong to the requested report", async () => {
    const database = createDatabase();
    const service = new ReportsService(database as never);

    await expect(
      service.dataset(restrictedContext, "financial-net", {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        status: "approved",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("uses the same dataset for JSON, CSV and PDF without another business query", async () => {
    const database = createDatabase();
    const service = new ReportsService(database as never);
    const dataset = await service.dataset(restrictedContext, "commercial-documents", {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
    const callsAfterDataset = database.tenantQuery.mock.calls.length;

    const csv = service.csv(dataset);
    const pdf = service.pdf(dataset, {
      companyName: "Comércio São José",
      primaryColor: "#0B1D3D",
      accentColor: "#F5C34A",
    });

    expect(csv).toContain("José da Silva");
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
    expect(database.tenantQuery).toHaveBeenCalledTimes(callsAfterDataset);
  });

  it("returns billing dataset with DAVs and calculates billing status correctly", async () => {
    const database = createDatabase();
    const service = new ReportsService(database as never);
    const dataset = await service.dataset(restrictedContext, "billing", {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    const queryCall = database.tenantQuery.mock.calls.find((call) => String(call[1]).includes("commercial_document_type = 'dav'"));
    expect(queryCall).toBeDefined();
    expect(queryCall?.[0]).toBe(tenantId);

    const sql = String(queryCall?.[1]);
    expect(sql).toContain("q.commercial_document_type = 'dav'");
    expect(sql).toContain("billingStatus");
    expect(sql).toContain("converted_sale_id");

    expect(dataset.kind).toBe("billing");
    expect(dataset.title).toBe("Faturamento de DAVs");
    expect(dataset.rows).toHaveLength(1);
    expect(dataset.summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Total DAVs", value: 1 }),
        expect.objectContaining({ label: "Pendentes", value: 1 }),
      ]),
    );
  });

  it("returns commission-by-payment dataset with payment method breakdown", async () => {
    const database = createDatabase();
    const service = new ReportsService(database as never);
    const dataset = await service.dataset(restrictedContext, "commission-by-payment", {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    const queryCall = database.tenantQuery.mock.calls.find((call) => String(call[1]).includes("seller_commissions sc"));
    expect(queryCall).toBeDefined();
    expect(queryCall?.[0]).toBe(tenantId);

    const sql = String(queryCall?.[1]);
    expect(sql).toContain("sp.method");
    expect(sql).toContain("sp.installments");
    expect(sql).toContain("GROUP BY");

    expect(dataset.kind).toBe("commission-by-payment");
    expect(dataset.title).toBe("Comissões por Forma de Pagamento");
    expect(dataset.summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Total comissões" }),
      ]),
    );
  });

  it("returns reconciliation-defasaged dataset with defasagem analysis", async () => {
    const database = createDatabase();
    const service = new ReportsService(database as never);
    const dataset = await service.dataset(restrictedContext, "reconciliation-defasaged", {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    const queryCall = database.tenantQuery.mock.calls.find((call) => String(call[1]).includes("reconciliation_status"));
    expect(queryCall).toBeDefined();
    expect(queryCall?.[0]).toBe(tenantId);

    const sql = String(queryCall?.[1]);
    expect(sql).toContain("defasagemDays");
    expect(sql).toContain("reconciliation_status");
    expect(sql).toContain("settlement_status");

    expect(dataset.kind).toBe("reconciliation-defasaged");
    expect(dataset.title).toBe("Conciliação e Defasagem");
    expect(dataset.summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Total pagamentos" }),
        expect.objectContaining({ label: "Pendentes conciliação" }),
      ]),
    );
  });

  it("returns seller-performance dataset with sales metrics and targets", async () => {
    const database = createDatabase();
    const service = new ReportsService(database as never);
    const dataset = await service.dataset(restrictedContext, "seller-performance", {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    const queryCall = database.tenantQuery.mock.calls.find((call) => String(call[1]).includes("seller_goals sg"));
    expect(queryCall).toBeDefined();
    expect(queryCall?.[0]).toBe(tenantId);

    const sql = String(queryCall?.[1]);
    expect(sql).toContain("totalSales");
    expect(sql).toContain("salesCount");
    expect(sql).toContain("averageTicket");
    expect(sql).toContain("salesTarget");
    expect(sql).toContain("targetPercentage");

    expect(dataset.kind).toBe("seller-performance");
    expect(dataset.title).toBe("Performance por Vendedor");
    expect(dataset.summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Total vendedores" }),
        expect.objectContaining({ label: "Total vendas" }),
      ]),
    );
  });
});
