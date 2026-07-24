import { describe, expect, it } from 'vitest';

import {
  allocateByLargestRemainder,
  composeSale,
  createSaleCompositionFingerprint,
  normalizeQuantityToMilliunits,
  type SaleCompositionInput,
} from './sale-composition';

const baseComposition = (): SaleCompositionInput => ({
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  customerId: 'customer-1',
  items: [
    {
      id: 'item-a',
      productId: 'product-a',
      quantity: '1.000',
      unitPriceCents: 1_000,
      unitCostCents: 600,
      policy: { id: 'policy-a', version: 3 },
    },
    {
      id: 'item-b',
      productId: 'product-b',
      quantity: '1.000',
      unitPriceCents: 1_000,
      unitCostCents: 500,
      policy: { id: 'policy-b', version: 7 },
    },
  ],
  adjustments: [],
});

describe('normalizeQuantityToMilliunits', () => {
  it.each([
    [1, 1_000],
    [1.25, 1_250],
    ['0.001', 1],
    ['12.340', 12_340],
  ])('normaliza %s sem usar ponto flutuante na composicao', (quantity, expected) => {
    expect(normalizeQuantityToMilliunits(quantity)).toBe(expected);
  });

  it.each(['0', 0, '-1', '1.0001', 'abc', Number.NaN])(
    'rejeita quantidade invalida %s',
    (quantity) => {
      expect(() => normalizeQuantityToMilliunits(quantity)).toThrow('Quantidade invalida');
    },
  );
});

describe('allocateByLargestRemainder', () => {
  it('preserva cada centavo e entrega o resto ao maior residuo fracionario', () => {
    const allocations = allocateByLargestRemainder(5, [
      { id: 'a', productId: 'product-a', amountCents: 100, order: 0 },
      { id: 'b', productId: 'product-b', amountCents: 200, order: 1 },
    ]);

    expect(allocations).toEqual([
      { id: 'a', amountCents: 2 },
      { id: 'b', amountCents: 3 },
    ]);
    expect(allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0)).toBe(5);
  });

  it('usa ordem original e depois productId como desempate deterministico', () => {
    expect(
      allocateByLargestRemainder(1, [
        { id: 'z', productId: 'product-z', amountCents: 100, order: 0 },
        { id: 'a', productId: 'product-a', amountCents: 100, order: 0 },
        { id: 'm', productId: 'product-m', amountCents: 100, order: 1 },
      ]),
    ).toEqual([
      { id: 'z', amountCents: 0 },
      { id: 'a', amountCents: 1 },
      { id: 'm', amountCents: 0 },
    ]);
  });

  it('retorna rateios zerados para ajuste de valor zero', () => {
    expect(
      allocateByLargestRemainder(0, [
        { id: 'a', productId: 'product-a', amountCents: 0, order: 0 },
        { id: 'b', productId: 'product-b', amountCents: 100, order: 1 },
      ]),
    ).toEqual([
      { id: 'a', amountCents: 0 },
      { id: 'b', amountCents: 0 },
    ]);
  });

  it('rejeita ajuste acima do limite elegivel ou sem base positiva', () => {
    expect(() =>
      allocateByLargestRemainder(101, [
        { id: 'a', productId: 'product-a', amountCents: 100, order: 0 },
      ]),
    ).toThrow('Ajuste excede o valor elegivel');

    expect(() =>
      allocateByLargestRemainder(1, [
        { id: 'a', productId: 'product-a', amountCents: 0, order: 0 },
      ]),
    ).toThrow('Ajuste sem base elegivel');
  });
});

describe('composeSale', () => {
  it('combina desconto direto e beneficio global sobre o saldo restante', () => {
    const input = baseComposition();
    input.adjustments = [
      {
        id: 'direct-a',
        type: 'item_discount',
        amountCents: 100,
        eligibleItemIds: ['item-a'],
      },
      {
        id: 'points',
        type: 'loyalty_points',
        amountCents: 301,
      },
    ];

    const result = composeSale(input);

    expect(result.adjustments).toEqual([
      {
        id: 'direct-a',
        type: 'item_discount',
        amountCents: 100,
        sourceId: null,
        allocations: [{ itemId: 'item-a', amountCents: 100 }],
      },
      {
        id: 'points',
        type: 'loyalty_points',
        amountCents: 301,
        sourceId: null,
        allocations: [
          { itemId: 'item-a', amountCents: 143 },
          { itemId: 'item-b', amountCents: 158 },
        ],
      },
    ]);
    expect(result.items).toMatchObject([
      {
        id: 'item-a',
        quantityMilliunits: 1_000,
        grossCents: 1_000,
        directDiscountCents: 100,
        allocatedAdjustmentCents: 143,
        totalDiscountCents: 243,
        netCents: 757,
        costCents: 600,
      },
      {
        id: 'item-b',
        quantityMilliunits: 1_000,
        grossCents: 1_000,
        directDiscountCents: 0,
        allocatedAdjustmentCents: 158,
        totalDiscountCents: 158,
        netCents: 842,
        costCents: 500,
      },
    ]);
    expect(result.totals).toEqual({
      grossCents: 2_000,
      discountCents: 401,
      netCents: 1_599,
      costCents: 1_100,
    });
  });

  it('arredonda totais fracionarios para o centavo mais proximo', () => {
    const input = baseComposition();
    input.items = [
      {
        id: 'weighted',
        productId: 'weighted-product',
        quantity: '0.333',
        unitPriceCents: 101,
        unitCostCents: 50,
        policy: { id: 'weighted-policy', version: 1 },
      },
    ];

    expect(composeSale(input).items[0]).toMatchObject({
      quantityMilliunits: 333,
      grossCents: 34,
      costCents: 17,
      netCents: 34,
    });
  });

  it('compoe produtos sem politica ativa mantendo o fallback autoritativo', () => {
    const input = baseComposition();
    input.items[0] = { ...input.items[0]!, policy: { id: null, version: null } };

    expect(composeSale(input).items[0]?.policy).toEqual({ id: null, version: null });
    expect(createSaleCompositionFingerprint(input)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejeita ids duplicados, centavos invalidos e desconto combinado excessivo', () => {
    const duplicated = baseComposition();
    duplicated.items[1] = { ...duplicated.items[1]!, id: 'item-a' };
    expect(() => composeSale(duplicated)).toThrow('Item duplicado');

    const invalidMoney = baseComposition();
    invalidMoney.items[0] = { ...invalidMoney.items[0]!, unitPriceCents: 1.5 };
    expect(() => composeSale(invalidMoney)).toThrow('Valor monetario invalido');

    const excessive = baseComposition();
    excessive.adjustments = [
      {
        id: 'all',
        type: 'loyalty_coupon',
        amountCents: 2_001,
      },
    ];
    expect(() => composeSale(excessive)).toThrow('Ajuste excede o valor elegivel');
  });

  it('exige descontos diretos antes dos ajustes globais e sinaliza margem negativa com total zero', () => {
    const outOfOrder = baseComposition();
    outOfOrder.adjustments = [
      { id: 'points', type: 'loyalty_points', amountCents: 100 },
      { id: 'direct-a', type: 'item_discount', amountCents: 100, eligibleItemIds: ['item-a'] },
    ];
    expect(() => composeSale(outOfOrder)).toThrow('Descontos de item devem preceder ajustes globais');

    const zeroed = baseComposition();
    zeroed.items = [zeroed.items[0]!];
    zeroed.adjustments = [{ id: 'full', type: 'loyalty_reward', amountCents: 1_000 }];
    expect(composeSale(zeroed).items[0]?.marginBasisPoints).toBe(-10_000);
  });
});

describe('createSaleCompositionFingerprint', () => {
  it('e deterministico para o mesmo conteudo independentemente da ordem das chaves', () => {
    const input = baseComposition();
    input.adjustments = [
      { id: 'coupon', type: 'loyalty_coupon', amountCents: 10, sourceId: 'reward-1' },
    ];
    const reordered = JSON.parse(JSON.stringify(input)) as SaleCompositionInput;
    reordered.items[0] = {
      policy: { version: 3, id: 'policy-a' },
      unitCostCents: 600,
      unitPriceCents: 1_000,
      quantity: '1.000',
      productId: 'product-a',
      id: 'item-a',
    };

    expect(createSaleCompositionFingerprint(input)).toBe(
      createSaleCompositionFingerprint(reordered),
    );
    expect(createSaleCompositionFingerprint(input)).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ['quantidade', (input: SaleCompositionInput) => (input.items[0]!.quantity = '1.001')],
    ['preco', (input: SaleCompositionInput) => (input.items[0]!.unitPriceCents += 1)],
    ['ajuste', (input: SaleCompositionInput) => (input.adjustments[0]!.amountCents += 1)],
    ['politica', (input: SaleCompositionInput) => {
      const policy = input.items[0]!.policy;
      if (policy.version === null) throw new Error('Politica esperada no teste');
      policy.version += 1;
    }],
    ['ordem', (input: SaleCompositionInput) => input.items.reverse()],
  ])('muda quando muda %s da composicao', (_field, mutate) => {
    const original = baseComposition();
    original.adjustments = [
      { id: 'coupon', type: 'loyalty_coupon', amountCents: 10, sourceId: 'reward-1' },
    ];
    const changed = JSON.parse(JSON.stringify(original)) as SaleCompositionInput;
    mutate(changed);

    expect(createSaleCompositionFingerprint(changed)).not.toBe(
      createSaleCompositionFingerprint(original),
    );
  });
});
