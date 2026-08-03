import { describe, expect, it, vi } from "vitest";
import { financialEntryCreateSchema } from "@sgc/types";
import { FinancialService } from "./financial.service";

const context = {
  tenantId: "tenant-a",
  userId: "user-a",
  membershipId: "membership-a",
  roleSlug: "manager",
  permissions: ["financial.receive"],
  branchId: "branch-a",
};

describe("FinancialService", () => {
  it("splits a total amount across installments without losing cents", async () => {
    const inserts: unknown[][] = [];
    const query = vi.fn((sql: string, values?: unknown[]) => {
      if (sql.includes("INSERT INTO accounts_receivable")) {
        inserts.push(values ?? []);
        return Promise.resolve({
          rows: [
            {
              id: `receivable-${inserts.length}`,
              amount: values?.[3],
              dueDate: values?.[4],
              status: values?.[5],
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const database = {
      tenantTransaction: vi.fn(
        (_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) =>
          callback({ query }),
      ),
    };
    const service = new FinancialService(database as never);

    await service.create(context, "receivables", {
      branchId: "branch-a",
      amount: 100,
      amountMode: "total",
      dueDate: "2026-07-21",
      status: "open",
      installmentCount: 3,
    });

    expect(inserts.map((values) => values[3])).toEqual(["33.34", "33.33", "33.33"]);
    expect(inserts.map((values) => values[8])).toEqual([1, 2, 3]);
    expect(inserts.map((values) => values[9])).toEqual([3, 3, 3]);
  });

  it("keeps the entered amount on every installment when explicitly requested", async () => {
    const inserts: unknown[][] = [];
    const query = vi.fn((sql: string, values?: unknown[]) => {
      if (sql.includes("INSERT INTO accounts_payable")) {
        inserts.push(values ?? []);
        return Promise.resolve({
          rows: [
            {
              id: `payable-${inserts.length}`,
              amount: values?.[3],
              dueDate: values?.[4],
              status: values?.[5],
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const database = {
      tenantTransaction: vi.fn(
        (_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) =>
          callback({ query }),
      ),
    };
    const service = new FinancialService(database as never);

    await service.create(context, "payables", {
      branchId: "branch-a",
      amount: 12.5,
      amountMode: "installment",
      dueDate: "2026-07-21",
      status: "open",
      installmentCount: 2,
    });

    expect(inserts.map((values) => values[3])).toEqual(["12.50", "12.50"]);
  });

  it("preserves the legacy installment interpretation when amount mode is omitted", async () => {
    const inserts: unknown[][] = [];
    const query = vi.fn((sql: string, values?: unknown[]) => {
      if (sql.includes("INSERT INTO accounts_receivable")) {
        inserts.push(values ?? []);
        return Promise.resolve({
          rows: [
            {
              id: `receivable-${inserts.length}`,
              amount: values?.[3],
              dueDate: values?.[4],
              status: values?.[5],
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const database = {
      tenantTransaction: vi.fn(
        (_tenantId: string, callback: (client: { query: typeof query }) => Promise<unknown>) =>
          callback({ query }),
      ),
    };
    const service = new FinancialService(database as never);

    const input = financialEntryCreateSchema.parse({
      amount: 12.5,
      dueDate: "2026-07-21",
      status: "open",
      installmentCount: 2,
    });

    await service.create(context, "receivables", input);

    expect(inserts.map((values) => values[3])).toEqual(["12.50", "12.50"]);
  });
});
