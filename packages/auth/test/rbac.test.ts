import { describe, expect, it } from "vitest";
import { assertTenantScopedQuery, hasEveryPermission, permissions } from "../src";

describe("RBAC helpers", () => {
  it("requires every declared permission", () => {
    expect(
      hasEveryPermission(
        [permissions.products.read, permissions.products.create],
        [permissions.products.read]
      )
    ).toBe(true);

    expect(
      hasEveryPermission(
        [permissions.products.read],
        [permissions.products.read, permissions.products.create]
      )
    ).toBe(false);
  });

  it("rejects resource access without a tenant scope", () => {
    expect(() => assertTenantScopedQuery({ tenantId: "tenant-1", resourceId: "product-1" })).not.toThrow();
    expect(() => assertTenantScopedQuery({ tenantId: null, resourceId: "product-1" })).toThrow(/tenant/i);
  });
});
