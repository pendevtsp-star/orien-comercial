import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = () => readFileSync(resolve(process.cwd(), "migrations/0062_commercial_documents.sql"), "utf8");

describe("0062 commercial documents migration", () => {
  it("evolves quotes into typed, numbered commercial documents", () => {
    const migration = sql();
    expect(migration).toContain("commercial_document_type");
    expect(migration).toContain("CHECK (commercial_document_type IN ('quote','order','dav'))");
    expect(migration).toContain("document_number bigint");
    expect(migration).toContain("commercial_document_counters");
    expect(migration).toContain("UNIQUE (tenant_id, branch_id, commercial_document_type, document_number)");
    expect(migration).toContain("status IN ('draft','sent','approved','reserved','converted','expired','cancelled')");
    expect(migration).toContain("converted_sale_id");
  });

  it("creates tenant and branch scoped reservations without reducing stock", () => {
    const migration = sql();
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS stock_reservations");
    expect(migration).toContain("status IN ('active','released','consumed','expired')");
    expect(migration).toContain("FOREIGN KEY (tenant_id, branch_id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, quote_id, quote_item_id)");
    expect(migration).toContain("ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("CREATE POLICY tenant_isolation ON stock_reservations");
    expect(migration).not.toMatch(/UPDATE stock_balances SET quantity/);
  });
});
