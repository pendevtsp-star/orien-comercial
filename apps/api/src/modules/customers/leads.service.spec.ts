import { describe, expect, it, vi } from "vitest";
import { LeadsService } from "./leads.service";

const seller = {
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleSlug: "seller",
  branchId: "branch-a",
  tenantStatus: "active",
  planSlug: "starter",
  permissions: ["customers.update"],
  userId: "user-a",
};

describe("LeadsService", () => {
  it("does not let a seller update another seller's lead", async () => {
    const tenantQuery = vi.fn().mockResolvedValue({
      rows: [{ id: "lead-a", branch_id: "branch-a", owner_user_id: "user-b" }],
    });
    const service = new LeadsService({ tenantQuery } as never);

    await expect(service.update(seller, "lead-a", { name: "Novo nome" })).rejects.toThrow(
      "Lead fora do escopo do vendedor",
    );
    expect(tenantQuery).toHaveBeenCalledTimes(1);
  });

  it("keeps a seller's own lead within the tenant and branch scope", async () => {
    const tenantQuery = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "lead-a", branch_id: "branch-a", owner_user_id: "user-a" }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "lead-a" }] });
    const service = new LeadsService({ tenantQuery } as never);

    await expect(service.update(seller, "lead-a", { name: "Novo nome" })).resolves.toEqual({
      id: "lead-a",
    });
    expect(tenantQuery.mock.calls[1]?.[2]).toEqual([
      "tenant-a",
      "lead-a",
      null,
      "Novo nome",
      null,
      null,
      null,
      null,
    ]);
  });
});
