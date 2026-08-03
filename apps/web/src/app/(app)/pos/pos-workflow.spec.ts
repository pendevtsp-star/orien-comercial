import { describe, expect, it } from "vitest";
import {
  POS_PENDING_SALES_KEY,
  paymentStatusForMethod,
  pendingSalesForScope,
  readPendingSales,
  writePendingSales,
  type PendingSale,
} from "./pos-workflow";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const sale = (branchId: string): PendingSale => ({
  payload: { branchId },
  idempotencyKey: "pos_1234567890123456",
  scope: {
    tenantId: "tenant-a",
    branchId,
    operatorId: "operator-a",
    cashRegisterSessionId: "cash-a",
  },
});

describe("POS workflow", () => {
  it("marks store credit as pending and other methods as paid", () => {
    expect(paymentStatusForMethod("store_credit")).toBe("pending");
    expect(paymentStatusForMethod("pix")).toBe("paid");
  });

  it("does not throw when the local queue contains invalid JSON", () => {
    const storage = new MemoryStorage();
    storage.setItem(POS_PENDING_SALES_KEY, "not-json");

    expect(readPendingSales(storage)).toEqual([]);
    expect(storage.getItem(POS_PENDING_SALES_KEY)).toBe("[]");
  });

  it("returns only pending sales for the active tenant, branch, operator and cash session", () => {
    const storage = new MemoryStorage();
    writePendingSales(storage, [sale("branch-a"), sale("branch-b")]);

    expect(
      pendingSalesForScope(readPendingSales(storage), {
        tenantId: "tenant-a",
        branchId: "branch-a",
        operatorId: "operator-a",
        cashRegisterSessionId: "cash-a",
      }),
    ).toHaveLength(1);
  });
});
