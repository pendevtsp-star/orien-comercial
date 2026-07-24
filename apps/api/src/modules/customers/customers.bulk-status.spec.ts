import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CustomersService } from "./customers.service";

const context = { tenantId: "tenant-a", userId: "user-a", membershipId: "membership-a", roleSlug: "owner", branchId: null, permissions: [] };

describe("CustomersService bulk status", () => {
  it("updates and audits customers atomically", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "customer-a", branch_id: null, is_active: false }] })
      .mockResolvedValueOnce({ rows: [{ id: "customer-a" }] })
      .mockResolvedValueOnce({ rows: [] });
    const tenantTransaction = vi.fn((_tenantId: string, run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }));
    const service = new CustomersService({ tenantTransaction } as never);

    await expect(service.bulkUpdateStatus(context, { ids: ["customer-a"], isActive: true })).resolves.toMatchObject({ updatedCount: 1, isActive: true });
    expect(query.mock.calls[0]?.[0]).toContain("FOR UPDATE");
    expect(query.mock.calls[2]?.[0]).toContain("INSERT INTO audit_logs");
  });

  it("rolls back logically when any requested customer is outside the scope", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const tenantTransaction = vi.fn((_tenantId: string, run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }));
    const service = new CustomersService({ tenantTransaction } as never);

    await expect(service.bulkUpdateStatus(context, { ids: ["missing"], isActive: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects customers assigned to another branch", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: "customer-a", branch_id: "branch-b", is_active: true }] });
    const tenantTransaction = vi.fn((_tenantId: string, run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }));
    const service = new CustomersService({ tenantTransaction } as never);

    await expect(service.bulkUpdateStatus({ ...context, branchId: "branch-a" }, { ids: ["customer-a"], isActive: false })).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
