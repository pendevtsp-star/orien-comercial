import "dotenv/config";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const migrationsDir = join(__dirname, "..", "migrations");
const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required to run migrations.");
}

async function main() {
  const pool = new Pool({ connectionString, application_name: "sgc-migrator" });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    if (!existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found: ${migrationsDir}`);
    }

    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);

      if (existing.rowCount) {
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), "utf8");
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await pool.query("COMMIT");
        console.log(`Applied migration ${version}`);
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await pool.end();
  }
}

void main();
