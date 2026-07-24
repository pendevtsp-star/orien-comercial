import { describe, expect, it } from "vitest";
import { createSaleRequestHash } from "./sale-request-hash";

type SaleHashFixture = {
  branchId: string;
  fiscalRequested: boolean;
  notes: string;
  payments: Array<{ method: string; amount: number }>;
  items: Array<{ productId: string; quantity: number }>;
};

type HashVariation = [
  field: string,
  change: (value: SaleHashFixture) => SaleHashFixture,
];

describe("createSaleRequestHash", () => {
  it("is stable for object key order while preserving item and payment order", () => {
    const a = { branchId: "branch-a", notes: "Venda", payments: [{ method: "pix", amount: 10 }], items: [{ productId: "p1", quantity: 1 }] };
    const b = { items: [{ quantity: 1, productId: "p1" }], payments: [{ amount: 10, method: "pix" }], notes: "Venda", branchId: "branch-a" };

    expect(createSaleRequestHash(a)).toBe(createSaleRequestHash(b));
    expect(createSaleRequestHash(a)).toMatch(/^[a-f0-9]{64}$/);
  });

  const variations: HashVariation[] = [
    ["payment", (value) => ({
      ...value,
      payments: value.payments.map((payment, index) =>
        index === 0 ? { ...payment, amount: 9 } : payment,
      ),
    })],
    ["notes", (value) => ({ ...value, notes: "Outra" })],
    ["fiscal", (value) => ({ ...value, fiscalRequested: true })],
    ["order", (value) => ({ ...value, items: [...value.items].reverse() })],
  ];

  it.each(variations)("changes when %s changes", (_field, change) => {
    const original: SaleHashFixture = {
      branchId: "branch-a",
      fiscalRequested: false,
      notes: "Venda",
      payments: [{ method: "pix", amount: 10 }],
      items: [
        { productId: "p1", quantity: 1 },
        { productId: "p2", quantity: 1 },
      ],
    };
    const changed = change(original);

    expect(createSaleRequestHash(changed)).not.toBe(createSaleRequestHash(original));
  });
});
