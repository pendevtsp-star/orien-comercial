import { describe, expect, it } from "vitest";
import { permissionsForTenant } from "./current-permissions";

describe("permissionsForTenant", () => {
  it("returns only permissions from the active tenant membership", () => {
    expect(permissionsForTenant({
      memberships: [
        { tenantId: "tenant-a", permissions: ["sales.read"] },
        { tenantId: "tenant-b", permissions: ["financial.read"] },
      ],
    }, "tenant-b")).toEqual(["financial.read"]);
  });

  it("does not leak permissions when the tenant is not selected", () => {
    expect(permissionsForTenant({ memberships: [{ tenantId: "tenant-a", permissions: ["sales.read"] }] })).toEqual([]);
  });
});
