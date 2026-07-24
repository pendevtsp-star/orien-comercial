import type { PoolClient } from "pg";
import {
  assertBranchRepositoryScope,
  assertTenantRepositoryScope,
  type BranchRepositoryScope,
  type TenantRepositoryScope,
} from "../../domain/repository-scope";

export interface SaleSnapshot {
  id: string;
  branchId: string;
  customerId: string | null;
  status: string;
  totalAmount: string;
  compositionFingerprint: string | null;
}

export interface SaleLookupScope extends BranchRepositoryScope {
  saleId: string;
}

export interface IdempotencyScope extends TenantRepositoryScope {
  operation: string;
  key: string;
  requestHash: string;
}

export type IdempotencyClaim =
  | { status: "acquired" }
  | { status: "in_progress" }
  | { status: "conflict" }
  | { status: "replay"; response: Readonly<Record<string, unknown>> };

export interface SalesRepository {
  findForUpdate(client: PoolClient, scope: SaleLookupScope): Promise<SaleSnapshot | null>;
  claimIdempotency(client: PoolClient, scope: IdempotencyScope): Promise<IdempotencyClaim>;
  completeIdempotency(
    client: PoolClient,
    scope: IdempotencyScope,
    response: Readonly<Record<string, unknown>>,
  ): Promise<boolean>;
}

interface SaleRow {
  id: string;
  branch_id: string;
  customer_id: string | null;
  status: string;
  total_amount: string;
  composition_fingerprint: string | null;
}

interface IdempotencyRow {
  request_hash: string | null;
  response: Record<string, unknown> | null;
}

export class PgSalesRepository implements SalesRepository {
  async findForUpdate(client: PoolClient, scope: SaleLookupScope): Promise<SaleSnapshot | null> {
    assertBranchRepositoryScope(scope);
    const result = await client.query<SaleRow>(
      `SELECT s.id,s.branch_id,s.customer_id,s.status,s.total_amount,s.composition_fingerprint
       FROM sales s
       WHERE s.tenant_id = $1 AND s.branch_id = $2 AND s.id = $3 AND s.deleted_at IS NULL
       FOR UPDATE`,
      [scope.tenantId, scope.branchId, scope.saleId],
    );
    const row = result.rows[0];
    return row ? mapSale(row) : null;
  }

  async claimIdempotency(client: PoolClient, scope: IdempotencyScope): Promise<IdempotencyClaim> {
    assertTenantRepositoryScope(scope);
    assertIdempotencyScope(scope);
    const inserted = await client.query<IdempotencyRow>(
      `INSERT INTO idempotency_keys(tenant_id,scope,key,request_hash)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(tenant_id,scope,key) DO NOTHING
       RETURNING request_hash,response`,
      [scope.tenantId, scope.operation, scope.key, scope.requestHash],
    );
    if (inserted.rowCount) return { status: "acquired" };

    const existing = await client.query<IdempotencyRow>(
      `SELECT request_hash,response
       FROM idempotency_keys
       WHERE tenant_id = $1 AND scope = $2 AND key = $3
       FOR UPDATE`,
      [scope.tenantId, scope.operation, scope.key],
    );
    const row = existing.rows[0];
    if (!row || row.request_hash !== scope.requestHash) return { status: "conflict" };
    if (row.response) return { status: "replay", response: row.response };
    return { status: "in_progress" };
  }

  async completeIdempotency(
    client: PoolClient,
    scope: IdempotencyScope,
    response: Readonly<Record<string, unknown>>,
  ): Promise<boolean> {
    assertTenantRepositoryScope(scope);
    assertIdempotencyScope(scope);
    const result = await client.query(
      `UPDATE idempotency_keys
       SET response = $5::jsonb,completed_at = now()
       WHERE tenant_id = $1 AND scope = $2 AND key = $3 AND request_hash = $4`,
      [scope.tenantId, scope.operation, scope.key, scope.requestHash, JSON.stringify(response)],
    );
    return result.rowCount === 1;
  }
}

function mapSale(row: SaleRow): SaleSnapshot {
  return {
    id: row.id,
    branchId: row.branch_id,
    customerId: row.customer_id,
    status: row.status,
    totalAmount: row.total_amount,
    compositionFingerprint: row.composition_fingerprint,
  };
}

function assertIdempotencyScope(scope: IdempotencyScope): void {
  if (!scope.operation || !/^[A-Za-z0-9._:-]{1,80}$/.test(scope.operation)) {
    throw new TypeError("Escopo de idempotencia invalido.");
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(scope.key)) {
    throw new TypeError("Chave de idempotencia invalida.");
  }
  if (!/^[0-9a-f]{64}$/.test(scope.requestHash)) {
    throw new TypeError("Hash da requisicao invalido.");
  }
}
