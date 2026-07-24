import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ProductsService } from "./products.service";

const context = { tenantId: "tenant-a", userId: "user-a", membershipId: "membership-a", roleSlug: "owner", branchId: null, permissions: [] };

describe("ProductsService bulk status", () => {
  it("updates and audits the complete batch in one tenant transaction", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "product-a", branch_id: null, is_active: true }, { id: "product-b", branch_id: null, is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: "product-a" }, { id: "product-b" }] })
      .mockResolvedValue({ rows: [] });
    const tenantTransaction = vi.fn((_tenantId: string, run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }));
    const service = new ProductsService({ tenantTransaction } as never, {} as never);

    await expect(service.bulkUpdateStatus(context, { ids: ["product-a", "product-b"], isActive: false, reason: "Inventário" })).resolves.toMatchObject({ updatedCount: 2, isActive: false });
    expect(tenantTransaction).toHaveBeenCalledWith("tenant-a", expect.any(Function));
    expect(query.mock.calls[0]?.[0]).toContain("FOR UPDATE");
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO audit_logs"))).toHaveLength(2);
  });

  it("rejects an incomplete selection before any update", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: "product-a", branch_id: null, is_active: true }] });
    const tenantTransaction = vi.fn((_tenantId: string, run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }));
    const service = new ProductsService({ tenantTransaction } as never, {} as never);

    await expect(service.bulkUpdateStatus(context, { ids: ["product-a", "missing"], isActive: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects products from another branch before updating", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: "product-a", branch_id: "branch-b", is_active: true }] });
    const tenantTransaction = vi.fn((_tenantId: string, run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }));
    const service = new ProductsService({ tenantTransaction } as never, {} as never);

    await expect(service.bulkUpdateStatus({ ...context, branchId: "branch-a" }, { ids: ["product-a"], isActive: false })).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
