import { describe, expect, it, vi } from "vitest";
import { CashRegistersService } from "./cash-registers.service";

const context = {
  tenantId: "tenant-a",
  userId: "operator-a",
  membershipId: "membership-a",
  roleSlug: "manager",
  branchId: "branch-a",
  permissions: [],
};

describe("CashRegistersService close", () => {
  it("calculates physical cash without counting Pix or card payments", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ branch_id: "branch-a", opening_amount: "20", opened_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [{ total: "90" }] })
      .mockResolvedValueOnce({ rows: [{ supply: "10", withdrawal: "5" }] })
      .mockResolvedValueOnce({ rows: [{ id: "cash-a", expectedAmount: "115", closingAmount: "115", differenceAmount: "0", approvalStatus: "not_required", closedAt: new Date() }] })
      .mockResolvedValue({ rows: [] });
    const tenantTransaction = vi.fn((_tenantId: string, run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }));
    const service = new CashRegistersService({ tenantTransaction } as never);

    await service.close(context, "cash-a", { closingAmount: 115 });

    const paymentQuery = query.mock.calls[1]?.[0] as string;
    expect(paymentQuery).toContain("sp.method IN ('cash', 'dinheiro')");
    expect(query.mock.calls[3]?.[1]).toEqual(expect.arrayContaining([115, 115, 0]));
  });
});
