import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { TenantsService } from "./tenants.service";

const context = { tenantId: "tenant-a", userId: "actor-a", membershipId: "membership-actor", roleSlug: "owner", branchId: null, permissions: [] };

describe("TenantsService bulk membership status", () => {
  function serviceFor(rows: unknown[]) {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: rows.map((row) => ({ id: (row as { id: string }).id })) })
      .mockResolvedValue({ rows: [] });
    const tenantTransaction = vi.fn((_tenantId: string, run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }));
    return { service: new TenantsService({ tenantTransaction } as never, {} as never), query };
  }

  it("disables regular members and audits each access", async () => {
    const { service, query } = serviceFor([
      { id: "membership-a", user_id: "user-a", branch_id: null, status: "active", role_slug: "seller" },
      { id: "membership-b", user_id: "user-b", branch_id: null, status: "active", role_slug: "manager" },
    ]);

    await expect(service.bulkUpdateMembershipStatus(context, { membershipIds: ["membership-a", "membership-b"], status: "disabled" })).resolves.toMatchObject({ updatedCount: 2, status: "disabled" });
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO audit_logs"))).toHaveLength(2);
  });

  it("never disables the current membership or an owner in a batch", async () => {
    const self = serviceFor([{ id: "membership-actor", user_id: "actor-a", branch_id: null, status: "active", role_slug: "seller" }]);
    await expect(self.service.bulkUpdateMembershipStatus(context, { membershipIds: ["membership-actor"], status: "disabled" })).rejects.toBeInstanceOf(BadRequestException);
    expect(self.query).toHaveBeenCalledTimes(1);

    const owner = serviceFor([{ id: "membership-owner", user_id: "owner-a", branch_id: null, status: "active", role_slug: "owner" }]);
    await expect(owner.service.bulkUpdateMembershipStatus(context, { membershipIds: ["membership-owner"], status: "disabled" })).rejects.toBeInstanceOf(BadRequestException);
    expect(owner.query).toHaveBeenCalledTimes(1);
  });

  it("prevents a branch-scoped actor from changing global access", async () => {
    const global = serviceFor([{ id: "membership-a", user_id: "user-a", branch_id: null, status: "active", role_slug: "seller" }]);

    await expect(
      global.service.bulkUpdateMembershipStatus(
        { ...context, branchId: "branch-a" },
        { membershipIds: ["membership-a"], status: "disabled" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(global.query).toHaveBeenCalledTimes(1);
  });
});
