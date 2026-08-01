export const POS_PENDING_SALES_KEY = "orien.pos.pending-sales";

export type PosQueueScope = {
  tenantId: string;
  branchId: string;
  operatorId: string;
  cashRegisterSessionId: string;
};

export type PendingSale = {
  payload: Record<string, unknown>;
  idempotencyKey: string;
  scope: PosQueueScope;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function paymentStatusForMethod(method: string): "pending" | "paid" {
  return method === "store_credit" ? "pending" : "paid";
}

export function readPendingSales(storage: StorageLike): PendingSale[] {
  const raw = storage.getItem(POS_PENDING_SALES_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("invalid queue");
    return parsed.filter(isPendingSale);
  } catch {
    storage.setItem(POS_PENDING_SALES_KEY, "[]");
    return [];
  }
}

export function writePendingSales(storage: StorageLike, sales: PendingSale[]) {
  storage.setItem(POS_PENDING_SALES_KEY, JSON.stringify(sales));
}

export function pendingSalesForScope(sales: PendingSale[], scope: PosQueueScope) {
  return sales.filter(
    (sale) =>
      sale.scope.tenantId === scope.tenantId &&
      sale.scope.branchId === scope.branchId &&
      sale.scope.operatorId === scope.operatorId &&
      sale.scope.cashRegisterSessionId === scope.cashRegisterSessionId,
  );
}

function isPendingSale(value: unknown): value is PendingSale {
  if (!value || typeof value !== "object") return false;
  const sale = value as Partial<PendingSale>;
  const scope = sale.scope;
  return Boolean(
    sale.payload && typeof sale.payload === "object" &&
      typeof sale.idempotencyKey === "string" &&
      scope &&
      typeof scope.tenantId === "string" &&
      typeof scope.branchId === "string" &&
      typeof scope.operatorId === "string" &&
      typeof scope.cashRegisterSessionId === "string",
  );
}
