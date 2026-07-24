import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = () =>
  readFileSync(resolve(process.cwd(), "migrations/0064_quote_item_timestamps.sql"), "utf8");

describe("0064 quote item timestamps migration", () => {
  it("adds deterministic ordering metadata to commercial document items", () => {
    const migration = sql();

    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()",
    );
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()",
    );
    expect(migration).toContain("quote_items_tenant_quote_created_idx");
    expect(migration).toContain("tenant_id, quote_id, created_at, id");
  });
});
