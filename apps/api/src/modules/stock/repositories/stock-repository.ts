import type { PoolClient } from "pg";
import { assertBranchRepositoryScope, type BranchRepositoryScope } from "../../domain/repository-scope";

export class InsufficientStockError extends Error {
  constructor() {
    super("A movimentacao deixaria o estoque negativo.");
    this.name = "InsufficientStockError";
  }
}

export interface StockBalanceSnapshot {
  quantity: string;
}

export interface StockBalanceScope extends BranchRepositoryScope {
  productId: string;
}

export interface StockBalanceChange extends StockBalanceScope {
  quantityDelta: string;
}

export interface StockMovementInput extends StockBalanceScope {
  movementType: string;
  quantity: string;
  reason: string;
}

export interface StockRepository {
  findBalanceForUpdate(client: PoolClient, scope: StockBalanceScope): Promise<StockBalanceSnapshot | null>;
  changeBalance(client: PoolClient, input: StockBalanceChange): Promise<StockBalanceSnapshot>;
  recordMovement(client: PoolClient, input: StockMovementInput): Promise<{ id: string }>;
}

interface BalanceRow {
  quantity: string;
}

export class PgStockRepository implements StockRepository {
  async findBalanceForUpdate(client: PoolClient, scope: StockBalanceScope): Promise<StockBalanceSnapshot | null> {
    assertStockScope(scope);
    const result = await client.query<BalanceRow>(
      `SELECT quantity::text AS quantity
       FROM stock_balances
       WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3
       FOR UPDATE`,
      [scope.tenantId, scope.branchId, scope.productId],
    );
    const row = result.rows[0];
    return row ? { quantity: row.quantity } : null;
  }

  async changeBalance(client: PoolClient, input: StockBalanceChange): Promise<StockBalanceSnapshot> {
    assertStockScope(input);
    const delta = parseQuantity(input.quantityDelta);
    if (delta === 0n) throw new TypeError("A variacao de estoque nao pode ser zero.");

    const current = await this.findBalanceForUpdate(client, input);
    const currentQuantity = parseQuantity(current?.quantity ?? "0");
    if (currentQuantity + delta < 0n) throw new InsufficientStockError();

    const result = await client.query<BalanceRow>(
      `INSERT INTO stock_balances(tenant_id,branch_id,product_id,quantity)
       VALUES($1,$2,$3,$4::numeric)
       ON CONFLICT(tenant_id,branch_id,product_id)
       DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity,updated_at = now()
       RETURNING quantity::text AS quantity`,
      [input.tenantId, input.branchId, input.productId, input.quantityDelta],
    );
    const row = result.rows[0];
    if (!row) throw new Error("O banco nao retornou o saldo atualizado.");
    return { quantity: row.quantity };
  }

  async recordMovement(client: PoolClient, input: StockMovementInput): Promise<{ id: string }> {
    assertStockScope(input);
    if (!input.movementType || !input.reason.trim()) throw new TypeError("Tipo e motivo da movimentacao sao obrigatorios.");
    parseQuantity(input.quantity);
    const result = await client.query<{ id: string }>(
      `INSERT INTO stock_movements(tenant_id,branch_id,product_id,movement_type,quantity,reason,actor_user_id)
       VALUES($1,$2,$3,$4,$5::numeric,$6,$7)
       RETURNING id`,
      [
        input.tenantId,
        input.branchId,
        input.productId,
        input.movementType,
        input.quantity,
        input.reason.trim(),
        input.context.userId ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("O banco nao retornou a movimentacao criada.");
    return { id: row.id };
  }
}

function assertStockScope(scope: StockBalanceScope): void {
  assertBranchRepositoryScope(scope);
  if (!scope.productId) throw new TypeError("Produto obrigatorio no escopo de estoque.");
}

function parseQuantity(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) throw new TypeError("Quantidade invalida; use no maximo tres casas decimais.");
  const sign = match[1] === "-" ? -1n : 1n;
  return sign * (BigInt(match[2] ?? "0") * 1000n + BigInt((match[3] ?? "").padEnd(3, "0")));
}
