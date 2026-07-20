import { describe, expect, it } from "vitest";
import { getScopedBranchId, synchronizeTenantScope } from "./api";

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
