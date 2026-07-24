import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "migrations/0060_price_policy_margin.sql");

describe("0060 price policy migration", () => {
  it("persists tenant-scoped segments, policies, approvals, and immutable sale snapshots", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS customer_segments");
    expect(migration).toContain("ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_segment_id");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS price_policies");
    expect(migration).toContain("margin_mode varchar(24) NOT NULL DEFAULT 'warn'");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS pricing_approvals");
    expect(migration).toContain("CHECK (requested_by_user_id <> approved_by_user_id)");
    expect(migration).toMatch(/ALTER TABLE sale_items\s+ADD COLUMN IF NOT EXISTS price_policy_id/);
    expect(migration).toContain("ALTER TABLE price_policies ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("CREATE POLICY tenant_isolation ON price_policies");
    expect(migration).toContain("'pricing.policies.manage'");
    expect(migration).toContain("'pricing.exceptions.authorize'");
    expect(migration).toMatch(/\('owner', 'pricing\.policies\.manage'\)/);
    expect(migration).toMatch(/\('admin', 'pricing\.exceptions\.authorize'\)/);
    expect(migration).toMatch(/\('manager', 'pricing\.exceptions\.authorize'\)/);
    expect(migration).toContain("JOIN roles r ON r.slug = g.role_slug AND r.deleted_at IS NULL");
  });

  it("uses composite tenant foreign keys and makes approvals single-use", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("REFERENCES products (tenant_id, id)");
    expect(migration).toContain("REFERENCES branches (tenant_id, id)");
    expect(migration).toContain("REFERENCES customer_segments (tenant_id, id)");
    expect(migration).toContain("REFERENCES price_policies (tenant_id, id)");
    expect(migration).toContain("ON DELETE SET NULL (customer_segment_id)");
    expect(migration).toContain("ON DELETE SET NULL (branch_id)");
    expect(migration).toContain("status IN ('pending', 'approved', 'rejected', 'expired', 'consumed')");
    expect(migration).toContain("consumed_at timestamptz");
    expect(migration).toContain("consumed_sale_id uuid");
    expect(migration).toContain("consumed_sale_item_id uuid");
    expect(migration).toContain("price_policies_tenant_id_key");
    expect(migration).toContain("pricing_approvals_tenant_id_key");
    expect(migration).toContain("UNIQUE (tenant_id, sale_id, id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, consumed_sale_id, consumed_sale_item_id)");
    expect(migration).toContain("REFERENCES sale_items (tenant_id, sale_id, id)");
    expect(migration).toContain("pricing_approvals_tenant_consumed_sale_item_fk");
    expect(migration).toContain("requested_total_amount numeric(12,2) NOT NULL");
    expect(migration).toContain("requested_cost_amount numeric(12,2) NOT NULL");
    expect(migration).toContain("priority integer NOT NULL DEFAULT 0");
    expect(migration).toContain("CHECK (priority BETWEEN 0 AND 1000)");
  });
});
