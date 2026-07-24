import { createHash } from 'node:crypto';

export type QuantityInput = number | string;

export type SaleAdjustmentType =
  | 'item_discount'
  | 'loyalty_points'
  | 'loyalty_coupon'
  | 'loyalty_reward'
  | 'customer_credit'
  | 'promotion'
  | 'bonus_product';

export type SaleCompositionInput = {
  tenantId: string;
  branchId: string;
  customerId: string | null;
  items: Array<{
    id: string;
    productId: string;
    quantity: QuantityInput;
    unitPriceCents: number;
    unitCostCents: number;
    policy: {
      id: string | null;
      version: number | null;
    };
  }>;
  adjustments: Array<{
    id: string;
    type: SaleAdjustmentType;
    amountCents: number;
    sourceId?: string | null;
    eligibleItemIds?: string[];
  }>;
};

export type AllocationBasis = {
  id: string;
  productId: string;
  amountCents: number;
  order: number;
};

export type SaleComposition = {
  items: Array<{
    id: string;
    productId: string;
    quantityMilliunits: number;
    unitPriceCents: number;
    unitCostCents: number;
    grossCents: number;
    directDiscountCents: number;
    allocatedAdjustmentCents: number;
    totalDiscountCents: number;
    netCents: number;
    costCents: number;
    marginBasisPoints: number | null;
    policy: {
      id: string | null;
      version: number | null;
    };
  }>;
  adjustments: Array<{
    id: string;
    type: SaleAdjustmentType;
    amountCents: number;
    allocations: Array<{
      itemId: string;
      amountCents: number;
    }>;
  }>;
  totals: {
    grossCents: number;
    discountCents: number;
    netCents: number;
    costCents: number;
  };
  fingerprint: string;
};

const QUANTITY_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d{1,3}))?$/;

export function normalizeQuantityToMilliunits(quantity: QuantityInput): number {
  if (
    (typeof quantity !== 'number' && typeof quantity !== 'string') ||
    (typeof quantity === 'number' && !Number.isFinite(quantity))
  ) {
    throw new Error('Quantidade invalida');
  }

  const raw = typeof quantity === 'number' ? quantity.toString() : quantity.trim();
  const match = QUANTITY_PATTERN.exec(raw);
  if (!match) {
    throw new Error('Quantidade invalida');
  }

  const [whole = ''] = raw.split('.');
  const fraction = (match[1] ?? '').padEnd(3, '0');
  const milliunits = BigInt(whole) * 1_000n + BigInt(fraction || '0');
  if (milliunits <= 0n || milliunits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Quantidade invalida');
  }

  return Number(milliunits);
}

export function allocateByLargestRemainder(
  amountCents: number,
  bases: AllocationBasis[],
): Array<{ id: string; amountCents: number }> {
  assertCents(amountCents);
  bases.forEach((basis) => {
    assertIdentifier(basis.id, 'Base de rateio invalida');
    assertIdentifier(basis.productId, 'Base de rateio invalida');
    assertCents(basis.amountCents);
    if (!Number.isSafeInteger(basis.order) || basis.order < 0) {
      throw new Error('Base de rateio invalida');
    }
  });

  if (amountCents === 0) {
    return bases.map((basis) => ({ id: basis.id, amountCents: 0 }));
  }

  const total = bases.reduce((sum, basis) => sum + BigInt(basis.amountCents), 0n);
  if (total === 0n) {
    throw new Error('Ajuste sem base elegivel');
  }
  if (BigInt(amountCents) > total) {
    throw new Error('Ajuste excede o valor elegivel');
  }

  const rows = bases.map((basis, index) => {
    const numerator = BigInt(amountCents) * BigInt(basis.amountCents);
    return {
      basis,
      index,
      floor: numerator / total,
      remainder: numerator % total,
    };
  });
  const allocated = rows.reduce((sum, row) => sum + row.floor, 0n);
  const missing = Number(BigInt(amountCents) - allocated);
  const winners = [...rows].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    if (left.basis.order !== right.basis.order) {
      return left.basis.order - right.basis.order;
    }
    const productComparison = left.basis.productId.localeCompare(right.basis.productId);
    return productComparison || left.index - right.index;
  });
  const winnerIndexes = new Set(winners.slice(0, missing).map((row) => row.index));

  return rows.map((row) => ({
    id: row.basis.id,
    amountCents: Number(row.floor) + (winnerIndexes.has(row.index) ? 1 : 0),
  }));
}

export function composeSale(input: SaleCompositionInput): SaleComposition {
  assertCompositionIdentity(input);
  if (input.items.length === 0) {
    throw new Error('Venda sem itens');
  }

  const itemIds = new Set<string>();
  const items = input.items.map((item, order) => {
    assertIdentifier(item.id, 'Item invalido');
    assertIdentifier(item.productId, 'Item invalido');
    if (itemIds.has(item.id)) {
      throw new Error('Item duplicado');
    }
    itemIds.add(item.id);
    assertCents(item.unitPriceCents);
    assertCents(item.unitCostCents);
    assertPolicy(item.policy);

    const quantityMilliunits = normalizeQuantityToMilliunits(item.quantity);
    const grossCents = multiplyCentsByQuantity(item.unitPriceCents, quantityMilliunits);
    const costCents = multiplyCentsByQuantity(item.unitCostCents, quantityMilliunits);
    return {
      ...item,
      order,
      quantityMilliunits,
      grossCents,
      costCents,
      directDiscountCents: 0,
      allocatedAdjustmentCents: 0,
      netCents: grossCents,
    };
  });

  const adjustmentIds = new Set<string>();
  let globalAdjustmentStarted = false;
  const adjustments = input.adjustments.map((adjustment) => {
    assertIdentifier(adjustment.id, 'Ajuste invalido');
    if (adjustmentIds.has(adjustment.id)) {
      throw new Error('Ajuste duplicado');
    }
    adjustmentIds.add(adjustment.id);
    assertCents(adjustment.amountCents);

    const eligibleIds = adjustment.eligibleItemIds ?? items.map((item) => item.id);
    if (new Set(eligibleIds).size !== eligibleIds.length) {
      throw new Error('Item elegivel duplicado');
    }
    if (adjustment.type === 'item_discount' && eligibleIds.length !== 1) {
      throw new Error('Desconto de item exige um unico item elegivel');
    }
    if (adjustment.type === 'item_discount' && globalAdjustmentStarted) {
      throw new Error('Descontos de item devem preceder ajustes globais');
    }
    if (adjustment.type !== 'item_discount') globalAdjustmentStarted = true;

    const eligibleSet = new Set(eligibleIds);
    for (const eligibleId of eligibleSet) {
      if (!itemIds.has(eligibleId)) {
        throw new Error('Item elegivel inexistente');
      }
    }

    const allocations = allocateByLargestRemainder(
      adjustment.amountCents,
      items
        .filter((item) => eligibleSet.has(item.id))
        .map((item) => ({
          id: item.id,
          productId: item.productId,
          amountCents: item.netCents,
          order: item.order,
        })),
    ).filter((allocation) => allocation.amountCents > 0);

    for (const allocation of allocations) {
      const item = items.find((candidate) => candidate.id === allocation.id);
      if (!item) {
        throw new Error('Item elegivel inexistente');
      }
      item.netCents -= allocation.amountCents;
      if (adjustment.type === 'item_discount') {
        item.directDiscountCents += allocation.amountCents;
      } else {
        item.allocatedAdjustmentCents += allocation.amountCents;
      }
    }

    return {
      id: adjustment.id,
      type: adjustment.type,
      amountCents: adjustment.amountCents,
      sourceId: adjustment.sourceId ?? null,
      allocations: allocations.map((allocation) => ({
        itemId: allocation.id,
        amountCents: allocation.amountCents,
      })),
    };
  });

  const composedItems = items.map((item) => ({
    id: item.id,
    productId: item.productId,
    quantityMilliunits: item.quantityMilliunits,
    unitPriceCents: item.unitPriceCents,
    unitCostCents: item.unitCostCents,
    grossCents: item.grossCents,
    directDiscountCents: item.directDiscountCents,
    allocatedAdjustmentCents: item.allocatedAdjustmentCents,
    totalDiscountCents: item.directDiscountCents + item.allocatedAdjustmentCents,
    netCents: item.netCents,
    costCents: item.costCents,
    marginBasisPoints:
      item.netCents === 0
        ? item.costCents > 0 ? -10_000 : 0
        : Math.trunc(((item.netCents - item.costCents) * 10_000) / item.netCents),
    policy: item.policy,
  }));

  return {
    items: composedItems,
    adjustments,
    totals: {
      grossCents: sumCents(composedItems.map((item) => item.grossCents)),
      discountCents: sumCents(composedItems.map((item) => item.totalDiscountCents)),
      netCents: sumCents(composedItems.map((item) => item.netCents)),
      costCents: sumCents(composedItems.map((item) => item.costCents)),
    },
    fingerprint: createSaleCompositionFingerprint(input),
  };
}

export function createSaleCompositionFingerprint(input: SaleCompositionInput): string {
  assertCompositionIdentity(input);
  const payload = {
    tenantId: input.tenantId,
    branchId: input.branchId,
    customerId: input.customerId,
    items: input.items.map((item) => {
      assertIdentifier(item.id, 'Item invalido');
      assertIdentifier(item.productId, 'Item invalido');
      assertCents(item.unitPriceCents);
      assertCents(item.unitCostCents);
      assertPolicy(item.policy);
      return {
        id: item.id,
        productId: item.productId,
        quantityMilliunits: normalizeQuantityToMilliunits(item.quantity),
        unitPriceCents: item.unitPriceCents,
        unitCostCents: item.unitCostCents,
        policy: {
          id: item.policy.id,
          version: item.policy.version,
        },
      };
    }),
    adjustments: input.adjustments.map((adjustment) => {
      assertIdentifier(adjustment.id, 'Ajuste invalido');
      assertCents(adjustment.amountCents);
      return {
        id: adjustment.id,
        type: adjustment.type,
        amountCents: adjustment.amountCents,
        sourceId: adjustment.sourceId ?? null,
        eligibleItemIds: adjustment.eligibleItemIds ?? null,
      };
    }),
  };

  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function multiplyCentsByQuantity(unitCents: number, quantityMilliunits: number): number {
  const numerator = BigInt(unitCents) * BigInt(quantityMilliunits);
  const rounded = (numerator + 500n) / 1_000n;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Valor monetario invalido');
  }
  return Number(rounded);
}

function sumCents(values: number[]): number {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Valor monetario invalido');
  }
  return Number(total);
}

function assertCompositionIdentity(input: SaleCompositionInput): void {
  assertIdentifier(input.tenantId, 'Tenant invalido');
  assertIdentifier(input.branchId, 'Filial invalida');
  if (input.customerId !== null) {
    assertIdentifier(input.customerId, 'Cliente invalido');
  }
}

function assertPolicy(policy: { id: string | null; version: number | null }): void {
  if (policy.id === null && policy.version === null) return;
  if (policy.id === null || policy.version === null) {
    throw new Error('Politica invalida');
  }
  assertIdentifier(policy.id, 'Politica invalida');
  if (!Number.isSafeInteger(policy.version) || policy.version < 1) {
    throw new Error('Politica invalida');
  }
}

function assertIdentifier(value: string, message: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
}

function assertCents(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Valor monetario invalido');
  }
}
