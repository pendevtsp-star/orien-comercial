import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>["db"];

export function createDb(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    application_name: "sgc-api"
  });

  return {
    pool,
    db: drizzle(pool, { schema })
  };
}

export async function closeDb(pool: Pool): Promise<void> {
  await pool.end();
}
