import { describe, expect, it, vi } from "vitest";
import { SalesService } from "./sales.service";

const context = {
  tenantId: "tenant-a",
  userId: "manager-a",
  membershipId: "membership-a",
  roleSlug: "manager",
  branchId: "branch-a",
  permissions: [],
};

describe("SalesService cancel", () => {
  it("locks the sale before restoring stock and conditionally marks it cancelled", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "sale-a", branch_id: "branch-a", status: "sold", cancelled_at: null }] })
      .mockResolvedValueOnce({ rows: [{ product_id: "product-a", quantity: "2" }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });
    const tenantTransaction = vi.fn((_tenantId: string, run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }));
    const commissions = { cancelInTransaction: vi.fn().mockResolvedValue({ cancelled: 1, paidPreserved: 0 }) };
    const service = new SalesService(
      { tenantTransaction } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      commissions as never,
    );

    await service.cancel(context, "sale-a", { reason: "Solicitação do cliente" });

    expect(query.mock.calls[0]?.[0]).toContain("FOR UPDATE");
    const update = query.mock.calls.find(([sql]) => String(sql).includes("UPDATE sales"));
    expect(update?.[0]).toContain("cancelled_at IS NULL");
    expect(update?.[0]).toContain("status <> 'cancelled'");
  });
});
