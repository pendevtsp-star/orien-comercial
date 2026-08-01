import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, getScopedBranchId, synchronizeTenantScope } from "./api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("tenant and branch scope", () => {
  it("ignores a legacy branch scope persisted outside the current session", () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    local.setItem("sgc.currentBranchScopeId", "branch-from-previous-user");

    expect(getScopedBranchId(local, session)).toBeUndefined();
    expect(local.getItem("sgc.currentBranchScopeId")).toBeNull();
  });

  it("clears the branch selection when the active tenant changes", () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    local.setItem("sgc.currentTenantId", "tenant-a");
    session.setItem("sgc.currentBranchScopeId", "branch-a");

    synchronizeTenantScope(local, session, "tenant-b");

    expect(local.getItem("sgc.currentTenantId")).toBe("tenant-b");
    expect(session.getItem("sgc.currentBranchScopeId")).toBeNull();
  });
});

describe("apiFetch deadline", () => {
  it("ends a request that never resolves with a deterministic timeout error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
      ),
    );

    const request = apiFetch("/slow");
    const assertion = expect(request).rejects.toMatchObject({
      statusCode: 408,
      message: "A requisição demorou demais. Tente novamente.",
    });

    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it("preserves an abort explicitly requested by the caller", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn((_: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("caller aborted")), { once: true });
        }),
      ),
    );

    const request = apiFetch("/cancelled", { signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toThrow("caller aborted");
  });
});
