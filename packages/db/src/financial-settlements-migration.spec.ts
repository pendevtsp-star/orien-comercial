import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "migrations/0063_financial_settlements.sql");

describe("0063 financial settlements migration", () => {
  it("creates tenant-scoped acquirers, versioned fee rules, settlements and reconciliation batches", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS payment_acquirers");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS payment_fee_rules");
    expect(migration).toContain("version integer NOT NULL");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS payment_settlements");
    expect(migration).toContain("payment_settlements_tenant_reversal_key");
    expect(migration).toContain("WHERE reversed_settlement_id IS NOT NULL");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS reconciliation_batches");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS reconciliation_items");
    expect(migration).toContain("UNIQUE (tenant_id, external_reference)");
    expect(migration).toContain("request_hash char(64) NOT NULL");
  });

  it("adds immutable payment and receivable snapshots without replacing legacy amount", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(/ALTER TABLE sale_payments[\s\S]*gross_amount/);
    expect(migration).toContain("fee_rule_version integer");
    expect(migration).toContain("expected_settlement_date date");
    expect(migration).toMatch(/ALTER TABLE accounts_receivable[\s\S]*gross_amount/);
    expect(migration).not.toMatch(/DROP COLUMN\s+amount/i);
    expect(migration).toContain("prevent_financial_snapshot_update");
    expect(migration).toContain("prevent_payment_fee_rule_mutation");
    expect(migration).toContain("sale_payments_snapshot_amounts_check");
    expect(migration).toContain("accounts_receivable_snapshot_amounts_check");
    expect(migration).toContain("accounts_receivable_tenant_sale_payment_key");
    expect(migration).toContain("settlement_status IN ('pending', 'partially_settled', 'settled', 'diverged', 'cancelled')");
    expect(migration).toContain("reconciliation_status varchar(24) NOT NULL DEFAULT 'pending'");
    expect(migration).toContain("reconciliation_status IN ('pending', 'reconciled', 'diverged')");
  });

  it("uses composite tenant foreign keys, branch indexes and RLS on every new business table", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("REFERENCES branches (tenant_id, id)");
    expect(migration).toContain("REFERENCES payment_acquirers (tenant_id, id)");
    expect(migration).toContain("REFERENCES sale_payments (tenant_id, id)");
    expect(migration).toContain("payment_settlements_tenant_branch_idx");
    for (const table of ["payment_acquirers", "payment_fee_rules", "payment_settlements", "reconciliation_batches", "reconciliation_items"]) {
      expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`CREATE POLICY tenant_isolation ON ${table}`);
    }
  });
});
