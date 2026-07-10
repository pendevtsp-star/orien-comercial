import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "./request-context";
import { TenantContextGuard } from "./tenant-context.guard";

describe("TenantContextGuard", () => {
  it("requires x-tenant-id for business routes", async () => {
    const guard = new TenantContextGuard({ pool: { query: vi.fn() } } as never);
    const request = { user: { userId: "user-1" }, headers: {} };

    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request })
      } as never)
    ).rejects.toThrow(/x-tenant-id/);
  });

  it("hydrates tenant context when membership exists", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            tenantId: "tenant-1",
            membershipId: "membership-1",
            roleSlug: "owner",
            branchId: null,
            permissions: ["products.read"]
          }
        ]
      })
    };
    const guard = new TenantContextGuard({ pool } as never);
    const request = {
      user: { userId: "user-1" },
      headers: { "x-tenant-id": "tenant-1" }
    } as unknown as AuthenticatedRequest;

    const allowed = await guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request })
    } as never);

    expect(allowed).toBe(true);
    expect(request.tenant).toEqual({
      tenantId: "tenant-1",
      membershipId: "membership-1",
      roleSlug: "owner",
      branchId: null,
      permissions: ["products.read"],
      userId: "user-1"
    });
  });
});
