import { describe, expect, it, vi } from "vitest";
import { OperationsService } from "./operations.service";

const context = {
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleSlug: "manager",
  branchId: "branch-a",
  tenantStatus: "active",
  planSlug: "starter",
  permissions: ["service_orders.manage"],
  userId: "user-a",
};

describe("OperationsService service orders", () => {
  it("rejects references outside the selected branch", async () => {
    const tenantQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "branch-a" }] })
      .mockResolvedValueOnce({ rows: [{ branch_id: "branch-b" }] });
    const service = new OperationsService({ tenantQuery } as never);

    await expect(
      service.createServiceOrder(context, {
        branchId: "branch-a",
        customerId: "customer-a",
        description: "Atendimento",
      }),
    ).rejects.toThrow("Cliente não pertence à filial informada");
    expect(tenantQuery).toHaveBeenCalledTimes(2);
  });
});
