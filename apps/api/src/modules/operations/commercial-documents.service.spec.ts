import { BadRequestException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service";
import {
  CommercialDocumentsService,
  deriveCommercialSaleIdempotencyKey,
} from "./commercial-documents.service";

const context = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  roleSlug: "owner",
  branchId: null,
  permissions: [],
};
const branchId = "44444444-4444-4444-8444-444444444444";
const productId = "55555555-5555-4555-8555-555555555555";
type SaleCreator = ConstructorParameters<typeof CommercialDocumentsService>[1];
type MockQueryResult = { rows: unknown[]; rowCount: number };

function harness(responses: MockQueryResult[]) {
  const query = vi.fn((sql: string, params?: unknown[]) => {
    void sql;
    void params;
    return Promise.resolve(responses.shift() ?? { rows: [], rowCount: 0 });
  });
  const client = { query } as unknown as PoolClient;
  const tenantQuery = vi.fn((tenantId: string, sql: string, params?: unknown[]): Promise<MockQueryResult> => {
    void tenantId;
    void sql;
    void params;
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  const tenantTransaction = vi.fn(
    (_tenantId: string, callback: (transaction: PoolClient) => Promise<unknown>) =>
      callback(client),
  );
  const database = {
    tenantTransaction,
    tenantQuery,
  } as unknown as DatabaseService;
  const createInTransaction = vi.fn<SaleCreator["createInTransaction"]>();
  const sales: SaleCreator = { createInTransaction };
  return {
    service: new CommercialDocumentsService(database, sales),
    query,
    sales,
    createInTransaction,
    tenantQuery,
  };
}

describe("CommercialDocumentsService", () => {
  it("derives collision-resistant sale keys from the complete caller key", () => {
    const commonPrefix = "x".repeat(120);
    const first = deriveCommercialSaleIdempotencyKey("doc-a", `${commonPrefix}-first`);
    const second = deriveCommercialSaleIdempotencyKey("doc-a", `${commonPrefix}-second`);

    expect(first).toMatch(/^commercial-[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
    expect(first).toBe(deriveCommercialSaleIdempotencyKey("doc-a", `${commonPrefix}-first`));
  });

  it("keeps list filters inside the caller branch scope", async () => {
    const { service, tenantQuery } = harness([]);
    tenantQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "doc-a" }], rowCount: 1 });

    const scoped = { ...context, branchId };
    const result = await service.list(scoped, { page: 1, pageSize: 20, sortDirection: "desc" });

    expect(result.pagination.total).toBe(1);
    expect(tenantQuery.mock.calls[0]?.[2]).toContain(branchId);
  });

  it("creates a numbered reserved document without decrementing stock", async () => {
    const { service, query } = harness([
      { rows: [{ id: branchId }], rowCount: 1 },
      { rows: [{ id: productId, name: "Produto", sale_price: "10" }], rowCount: 1 },
      { rows: [{ product_id: productId, available: "5" }], rowCount: 1 },
      { rows: [{ document_number: "1" }], rowCount: 1 },
      { rows: [{ id: "66666666-6666-4666-8666-666666666666" }], rowCount: 1 },
      { rows: [{ id: "77777777-7777-4777-8777-777777777777" }], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);

    const result = await service.create(context, {
      type: "order",
      branchId,
      validUntil: "2026-08-01",
      reserveStock: true,
      items: [{ productId, quantity: 2, unitPrice: 10, discountAmount: 0 }],
    });

    expect(result).toMatchObject({ number: 1, status: "reserved", type: "order" });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO stock_reservations"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE stock_balances"))).toBe(false);
  });

  it("rejects a reservation above tenant and branch availability", async () => {
    const { service } = harness([
      { rows: [{ id: branchId }], rowCount: 1 },
      { rows: [{ id: productId, name: "Produto", sale_price: "10" }], rowCount: 1 },
      { rows: [{ product_id: productId, available: "1" }], rowCount: 1 },
    ]);
    await expect(
      service.create(context, {
        type: "quote",
        branchId,
        validUntil: "2026-08-01",
        reserveStock: true,
        items: [{ productId, quantity: 2, unitPrice: 10, discountAmount: 0 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("cancels a document and releases its active reservations atomically", async () => {
    const { service, query } = harness([
      {
        rows: [{ id: "doc-a", branch_id: branchId, commercial_document_type: "order", status: "reserved" }],
        rowCount: 1,
      },
      { rows: [{ id: "reservation-a" }], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);

    await service.transition(context, "doc-a", { action: "cancel", reason: "Cliente desistiu" });

    const release = query.mock.calls.find(([sql]) => String(sql).includes("UPDATE stock_reservations"));
    expect(release?.[1]).toEqual(expect.arrayContaining([context.tenantId, "doc-a", context.userId]));
  });

  it("returns the existing sale when conversion is retried", async () => {
    const { service, createInTransaction } = harness([
      {
        rows: [{
          id: "doc-a",
          branch_id: branchId,
          customer_id: null,
          commercial_document_type: "dav",
          status: "converted",
          converted_sale_id: "sale-a",
        }],
        rowCount: 1,
      },
    ]);

    await expect(service.convert(context, "doc-a", "1234567890abcdef")).resolves.toEqual({
      id: "sale-a",
      reused: true,
    });
    expect(createInTransaction).not.toHaveBeenCalled();
  });

  it("renders the tenant branded commercial document from the same snapshots", async () => {
    const { service, tenantQuery } = harness([]);
    tenantQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "doc-a",
          branchId,
          type: "order",
          number: "12",
          status: "approved",
          totalAmount: "20",
          validUntil: "2026-08-01",
          notes: "Entrega combinada",
          branchName: "Matriz",
          customerName: "Cliente",
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ description: "Produto", quantity: "2", unitPrice: "10", discountAmount: "0" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ value: null, tenant_name: "Empresa Teste" }],
        rowCount: 1,
      });

    const html = await service.document(context, "doc-a");
    expect(html).toContain("Pedido #12");
    expect(html).toContain("Empresa Teste");
    expect(html).toContain("Produto");
  });
});
