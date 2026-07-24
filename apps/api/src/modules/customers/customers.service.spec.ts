import { describe, expect, it, vi } from "vitest";
import { CustomersService } from "./customers.service";

describe("CustomersService", () => {
  it("verifies a customer segment in the active tenant before persisting the customer", async () => {
    const tenantQuery = vi.fn((_tenantId: string, query: string, ...values: unknown[]) => {
      void values;
      if (query.includes("FROM customer_segments")) return Promise.resolve({ rows: [{ id: "segment-a" }] });
      return Promise.resolve({ rows: [{ id: "customer-a" }] });
    });
    const service = new CustomersService({ tenantQuery } as never);

    await service.create(
      { tenantId: "tenant-a", userId: "user-a", membershipId: "membership-a", roleSlug: "seller", branchId: null, permissions: [] },
      { name: "Cliente A", customerSegmentId: "segment-a", type: "individual", tags: [], communicationOptIn: false, isActive: true },
    );

    expect(tenantQuery.mock.calls[0]?.[1]).toContain("FROM customer_segments");
    expect(tenantQuery.mock.calls[0]?.[2]).toEqual(["tenant-a", "segment-a"]);
    expect(tenantQuery.mock.calls[1]?.[1]).toContain("customer_segment_id");
  });

  it("clears the customer segment when customerSegmentId is explicitly null", async () => {
    const tenantQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "customer-a", branch_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: "customer-a", customer_segment_id: null }] });
    const service = new CustomersService({ tenantQuery } as never);

    await service.update(
      { tenantId: "tenant-a", userId: "user-a", membershipId: "membership-a", roleSlug: "owner", branchId: null, permissions: [] },
      "customer-a",
      { customerSegmentId: null },
    );

    expect(tenantQuery.mock.calls[1]?.[1]).toContain("CASE WHEN $20::boolean THEN $19::uuid ELSE customer_segment_id END");
    expect(tenantQuery.mock.calls[1]?.[2]).toEqual(expect.arrayContaining([null, true]));
  });
});
