export type MarginMode = "warn" | "block" | "approval_required";

export type PricePolicyCandidate = {
  id: string;
  tenantId: string;
  productId: string;
  branchId: string | null;
  customerSegmentId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  minQuantity: number;
  referencePrice: number;
  minPrice: number;
  maxPrice: number;
  minMarginPercent: number | null;
  marginMode: MarginMode;
  priority: number;
  version: number;
};

type PolicyResolutionInput = {
  tenantId: string;
  productId: string;
  branchId: string;
  customerSegmentId: string | null;
  quantity: number;
  now: Date;
};

export function resolvePricePolicy(
  policies: readonly PricePolicyCandidate[],
  input: PolicyResolutionInput,
): PricePolicyCandidate | undefined {
  const candidates = policies
    .filter(
      (policy) =>
        policy.tenantId === input.tenantId &&
        policy.productId === input.productId &&
        policy.minQuantity <= input.quantity &&
        (policy.branchId === null || policy.branchId === input.branchId) &&
        (policy.customerSegmentId === null || policy.customerSegmentId === input.customerSegmentId) &&
        (policy.startsAt === null || policy.startsAt <= input.now) &&
        (policy.endsAt === null || policy.endsAt >= input.now),
    );
  const sorted = candidates
    .slice()
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      const scope = specificity(right) - specificity(left);
      if (scope !== 0) return scope;
      if (right.minQuantity !== left.minQuantity) return right.minQuantity - left.minQuantity;
      return right.version - left.version;
    });
  const selected = sorted[0];
  if (!selected) return undefined;

  const tiedScopes = new Set(
    candidates
      .filter((policy) =>
        policy.priority === selected.priority &&
        specificity(policy) === specificity(selected) &&
        policy.minQuantity === selected.minQuantity &&
        policy.version === selected.version,
      )
      .map((policy) => `${policy.branchId ?? "global"}:${policy.customerSegmentId ?? "all"}`),
  );
  if (tiedScopes.size > 1) {
    throw new Error("Configuração de preço ambígua. Contate um administrador.");
  }
  return selected;
}

export function evaluateMargin(
  policy: Pick<PricePolicyCandidate, "minMarginPercent" | "marginMode">,
  marginPercent: number,
): { status: "ok" | "warn" | "block" | "approval_required" } {
  if (policy.minMarginPercent === null || marginPercent >= policy.minMarginPercent) {
    return { status: "ok" };
  }
  return { status: policy.marginMode };
}

export function assertAuthoritativeFallbackPrice(
  requestedUnitPrice: number | undefined,
  resolvedUnitPrice: number,
) {
  if (requestedUnitPrice !== undefined && requestedUnitPrice !== resolvedUnitPrice) {
    throw new Error("O preço enviado diverge do preço resolvido pelo servidor.");
  }
  return resolvedUnitPrice;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateSaleItemPricing(input: {
  unitPrice: number;
  costPrice: number;
  minPrice: number | null;
  maxPrice: number | null;
  quantity: number;
  discountAmount: number;
}) {
  const grossTotal = roundMoney(input.unitPrice * input.quantity);
  const netTotal = roundMoney(grossTotal - input.discountAmount);
  const costTotal = roundMoney(input.costPrice * input.quantity);
  const minTotal = input.minPrice === null ? null : roundMoney(input.minPrice * input.quantity);
  const maxTotal = input.maxPrice === null ? null : roundMoney(input.maxPrice * input.quantity);
  const projectedMarginPercent = netTotal <= 0
    ? 0
    : Number((((netTotal - costTotal) / netTotal) * 100).toFixed(2));

  return {
    grossTotal,
    netTotal,
    costTotal,
    effectiveUnitPrice: netTotal / input.quantity,
    projectedMarginPercent,
    priceWithinLimits: minTotal === null || (netTotal >= minTotal && netTotal <= maxTotal!),
  };
}

function specificity(policy: PricePolicyCandidate) {
  return Number(policy.branchId !== null) + Number(policy.customerSegmentId !== null);
}
