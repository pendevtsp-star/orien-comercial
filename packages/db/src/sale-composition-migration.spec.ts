import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "migrations/0061_sale_composition.sql");

describe("0061 sale composition migration", () => {
  it("persists the immutable cart fingerprint and final item economics", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("composition_fingerprint char(64)");
    expect(migration).toContain("basket_fingerprint char(64)");
    expect(migration).toContain("allocated_adjustment_amount numeric(12,2)");
    expect(migration).toContain("net_amount numeric(12,2)");
    expect(migration).toContain("final_margin_percent numeric(9,4)");
    expect(migration).toContain("prevent_sale_item_pricing_snapshot_update");
  });

  it("stores tenant-scoped adjustments and deterministic allocations", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS sale_adjustments");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS sale_item_adjustments");
    expect(migration).toContain("adjustment_key varchar(120) NOT NULL");
    expect(migration).toContain("'item_discount'");
    expect(migration).toContain("UNIQUE (tenant_id, sale_id, id)");
    expect(migration).toContain("UNIQUE (tenant_id, sale_id, adjustment_key)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, sale_id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, sale_id, sale_item_id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, sale_id, adjustment_id)");
    expect(migration).toContain("ALTER TABLE sale_adjustments ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("CREATE POLICY tenant_isolation ON sale_item_adjustments");
    expect(migration).toContain("request_hash char(64)");
    expect(migration).toContain("prevent_sale_adjustment_update");
  });
});
