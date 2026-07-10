import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { PermissionsGuard } from "./permissions.guard";

describe("PermissionsGuard", () => {
  it("allows requests when every permission is granted", () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(["products.read", "products.create"])
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const request = {
      tenant: { permissions: ["products.read", "products.create", "products.update"] }
    };

    const allowed = guard.canActivate({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request })
    } as never);

    expect(allowed).toBe(true);
  });

  it("rejects requests with missing permissions", () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(["financial.read", "financial.pay"])
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const request = {
      tenant: { permissions: ["financial.read"] }
    };

    expect(() =>
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => undefined,
        switchToHttp: () => ({ getRequest: () => request })
      } as never)
    ).toThrow(/Permissao insuficiente/);
  });
});
