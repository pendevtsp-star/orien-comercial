import { describe, expect, it } from "vitest";
import { ensureBranchAccess, pagination, resolveSort } from "./resource-access";

describe("resource access helpers", () => {
  it("blocks branch-scoped access to another branch", () => {
    expect(() =>
      ensureBranchAccess(
        {
          tenantId: "tenant-1",
          membershipId: "membership-1",
          roleSlug: "manager",
          permissions: [],
          branchId: "branch-a"
        },
        "branch-b"
      )
    ).toThrow(/filial/);
  });

  it("normalizes pagination bounds", () => {
    expect(pagination({ page: 0, pageSize: 999 })).toEqual({ page: 1, pageSize: 100, offset: 0 });
    expect(pagination({ page: 3, pageSize: 10 })).toEqual({ page: 3, pageSize: 10, offset: 20 });
  });

  it("falls back to safe sorting when sortBy is not allowed", () => {
    expect(
      resolveSort(
        { sortBy: "unsafe", sortDirection: "desc" } as never,
        { createdAt: "created_at", name: "name" },
        "createdAt"
      )
    ).toEqual({ field: "created_at", direction: "DESC" });
  });
});
