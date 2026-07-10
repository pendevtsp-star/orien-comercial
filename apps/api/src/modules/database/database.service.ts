import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { createDb } from "@sgc/db";
import type { AppConfig } from "@sgc/config";
import type { Pool, PoolClient } from "pg";
import type { QueryResult, QueryResultRow } from "pg";
import { APP_CONFIG } from "../config/config.module";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly connection: ReturnType<typeof createDb>;

  readonly db: ReturnType<typeof createDb>["db"];
  readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.connection = createDb(this.config.DATABASE_URL);
    this.db = this.connection.db;
    this.pool = this.connection.pool;
  }

  async onModuleDestroy() {
    await this.connection.pool.end();
  }

  async tenantQuery<T extends QueryResultRow = QueryResultRow>(
    tenantId: string,
    query: string,
    values: unknown[] = []
  ): Promise<QueryResult<T>> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const result = await client.query<T>(query, values);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async tenantTransaction<T>(
    tenantId: string,
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
