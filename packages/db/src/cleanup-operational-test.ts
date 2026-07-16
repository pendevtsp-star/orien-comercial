import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
const testEmails = [
  process.env.OPERATIONAL_TEST_SEED_EMAIL ?? "teste.full@useorien.com.br",
  "gerente.centro@teste.orien.local",
  "caixa.centro@teste.orien.local",
  "estoque.atacado@teste.orien.local",
  "financeiro.servicos@teste.orien.local",
];

if (!connectionString) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required.");

async function main() {
  const pool = new Pool({ connectionString, application_name: "orien-operational-test-cleanup" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM tenants WHERE slug='laboratorio-operacional-orien'");
    await client.query("DELETE FROM users WHERE email=ANY($1::text[])", [testEmails]);
    await client.query("COMMIT");
    console.log("Operational test tenant and users removed.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
