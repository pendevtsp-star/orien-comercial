import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import type { AuthenticatedRequest } from "./request-context";
import { JwtAuthGuard } from "./auth.guard";

describe("JwtAuthGuard", () => {
  const guard = new JwtAuthGuard({
    JWT_ACCESS_SECRET: "test-access-secret"
  } as never);

  it("accepts a valid access token from cookies", () => {
    const token = jwt.sign({ sub: "user-1", sid: "session-1" }, "test-access-secret");
    const request = { cookies: { access_token: token }, headers: {} } as unknown as AuthenticatedRequest;

    const result = guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request })
    } as never);

    expect(result).toBe(true);
    expect(request.user).toEqual({ userId: "user-1", sessionId: "session-1" });
  });

  it("accepts a valid access token from authorization header", () => {
    const token = jwt.sign({ sub: "user-2", sid: "session-2" }, "test-access-secret");
    const request = { cookies: {}, headers: { authorization: `Bearer ${token}` } } as unknown as AuthenticatedRequest;

    const result = guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request })
    } as never);

    expect(result).toBe(true);
    expect(request.user).toEqual({ userId: "user-2", sessionId: "session-2" });
  });

  it("rejects missing tokens", () => {
    const request = { cookies: {}, headers: {} } as unknown as AuthenticatedRequest;

    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request })
      } as never)
    ).toThrow(/Sessao ausente/);
  });
});
