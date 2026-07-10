import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { renderDocumentHtml } from "@sgc/documents";
import type {
  InventoryCountCreateInput,
  PurchaseEntryCreateInput,
  StockListQuery,
  StockMovementListQuery,
  StockAdjustmentInput,
  StockTransferCreateInput
} from "@sgc/types";
import type { PoolClient } from "pg";
import { ensureBranchAccess, ensureFound, pagination, resolveSort } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { loadTenantBranding } from "../../shared/tenant-branding";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class StockService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(context: TenantContext, query: StockListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["p.tenant_id = $1", "p.deleted_at IS NULL"];
    const sort = resolveSort(
      query,
      {
        productName: "p.name",
        quantity: "COALESCE(sb.quantity, 0)",
        minStock: "p.min_stock",
        branchName: "b.name"
      },
      "productName"
    );

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`(sb.branch_id = $${params.length} OR p.branch_id = $${params.length})`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
    }

    if (query.stockStatus === "critical") {
      filters.push(`COALESCE(sb.quantity, 0) <= p.min_stock`);
    }

    if (query.stockStatus === "healthy") {
      filters.push(`COALESCE(sb.quantity, 0) > p.min_stock`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `
      SELECT count(*)::text AS total
      FROM products p
      LEFT JOIN stock_balances sb ON sb.tenant_id = p.tenant_id AND sb.product_id = p.id
      WHERE ${filters.join(" AND ")}
      `,
      params
    );

    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT
        p.id AS "productId",
        p.name AS "productName",
        p.sku,
        COALESCE(sb.branch_id, p.branch_id) AS "branchId",
        b.name AS "branchName",
        COALESCE(sb.quantity, 0)::text AS quantity,
        p.min_stock AS "minStock"
      FROM products p
      LEFT JOIN stock_balances sb ON sb.tenant_id = p.tenant_id AND sb.product_id = p.id
      LEFT JOIN branches b ON b.id = COALESCE(sb.branch_id, p.branch_id)
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sort.field} ${sort.direction}, p.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async adjust(context: TenantContext, input: StockAdjustmentInput) {
    ensureBranchAccess(context, input.branchId);

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      await assertBranchAndProduct(client, context.tenantId, input.branchId, input.productId);

      const movementType = input.quantityDelta > 0 ? "manual_in" : "manual_out";

      await client.query(
        `
        INSERT INTO stock_balances (tenant_id, branch_id, product_id, quantity)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, branch_id, product_id)
        DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = now()
        `,
        [context.tenantId, input.branchId, input.productId, input.quantityDelta]
      );

      const balance = await client.query<{ quantity: string }>(
        `
        SELECT quantity::text
        FROM stock_balances
        WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3
        `,
        [context.tenantId, input.branchId, input.productId]
      );

      if (Number(balance.rows[0]?.quantity ?? 0) < 0) {
        throw new BadRequestException("Ajuste deixaria o estoque negativo.");
      }

      await insertMovement(client, {
        tenantId: context.tenantId,
        branchId: input.branchId,
        productId: input.productId,
        movementType,
        quantity: input.quantityDelta,
        reason: input.reason,
        actorUserId: context.userId
      });

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "stock.adjusted",
        entityType: "stock_movement",
        metadata: { branchId: input.branchId, productId: input.productId, quantityDelta: input.quantityDelta }
      });

      return { ok: true, quantity: Number(balance.rows[0]?.quantity ?? 0) };
    });
  }

  async movements(context: TenantContext, query: StockMovementListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["sm.tenant_id = $1"];
    const sort = resolveSort(
      query,
      { createdAt: "sm.created_at", movementType: "sm.movement_type", productName: "p.name", branchName: "b.name" },
      "createdAt"
    );

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`sm.branch_id = $${params.length}`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(p.name ILIKE $${params.length} OR sm.reason ILIKE $${params.length})`);
    }

    if (query.movementType) {
      params.push(query.movementType);
      filters.push(`sm.movement_type = $${params.length}`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `
      SELECT count(*)::text AS total
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      WHERE ${filters.join(" AND ")}
      `,
      params
    );

    params.push(page.pageSize, page.offset);
    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT
        sm.id,
        sm.movement_type AS "movementType",
        sm.quantity,
        sm.reason,
        sm.created_at AS "createdAt",
        p.name AS "productName",
        b.name AS "branchName"
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      JOIN branches b ON b.id = sm.branch_id
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sort.field} ${sort.direction}, sm.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    return { data: result.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async transfer(context: TenantContext, input: StockTransferCreateInput) {
    ensureBranchAccess(context, input.sourceBranchId);
    ensureBranchAccess(context, input.targetBranchId);

    if (input.sourceBranchId === input.targetBranchId) {
      throw new BadRequestException("Escolha filiais diferentes para a transferencia.");
    }

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      await assertBranch(client, context.tenantId, input.sourceBranchId);
      await assertBranch(client, context.tenantId, input.targetBranchId);

      const transfer = await client.query<{ id: string }>(
        `
        INSERT INTO stock_transfers (tenant_id, source_branch_id, target_branch_id, status)
        VALUES ($1, $2, $3, 'completed')
        RETURNING id
        `,
        [context.tenantId, input.sourceBranchId, input.targetBranchId]
      );
      const transferId = transfer.rows[0]!.id;

      for (const item of input.items) {
        await assertBranchAndProduct(client, context.tenantId, input.sourceBranchId, item.productId);
        await updateStockBalance(client, context.tenantId, input.sourceBranchId, item.productId, -item.quantity);
        await updateStockBalance(client, context.tenantId, input.targetBranchId, item.productId, item.quantity);

        await client.query(
          `
          INSERT INTO stock_transfer_items (tenant_id, stock_transfer_id, product_id, quantity)
          VALUES ($1, $2, $3, $4)
          `,
          [context.tenantId, transferId, item.productId, item.quantity]
        );

        await insertMovement(client, {
          tenantId: context.tenantId,
          branchId: input.sourceBranchId,
          productId: item.productId,
          movementType: "transfer_out",
          quantity: -item.quantity,
          reason: `Transferencia ${transferId}`,
          actorUserId: context.userId
        });
        await insertMovement(client, {
          tenantId: context.tenantId,
          branchId: input.targetBranchId,
          productId: item.productId,
          movementType: "transfer_in",
          quantity: item.quantity,
          reason: `Transferencia ${transferId}`,
          actorUserId: context.userId
        });
      }

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "stock.transfer.created",
        entityType: "stock_transfer",
        entityId: transferId,
        metadata: {
          sourceBranchId: input.sourceBranchId,
          targetBranchId: input.targetBranchId,
          itemCount: input.items.length
        }
      });

      return { id: transferId, ok: true };
    });
  }

  async inventory(context: TenantContext, input: InventoryCountCreateInput) {
    ensureBranchAccess(context, input.branchId);

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      await assertBranch(client, context.tenantId, input.branchId);
      const inventory = await client.query<{ id: string }>(
        `
        INSERT INTO inventory_counts (tenant_id, branch_id, status)
        VALUES ($1, $2, 'completed')
        RETURNING id
        `,
        [context.tenantId, input.branchId]
      );
      const inventoryId = inventory.rows[0]!.id;

      for (const item of input.items) {
        await assertBranchAndProduct(client, context.tenantId, input.branchId, item.productId);
        const systemBalance = await ensureBalance(client, context.tenantId, input.branchId, item.productId);
        const difference = item.countedQuantity - Number(systemBalance);

        await client.query(
          `
          INSERT INTO inventory_count_items (tenant_id, inventory_count_id, product_id, counted_quantity, system_quantity, difference_quantity)
          VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [context.tenantId, inventoryId, item.productId, item.countedQuantity, Number(systemBalance), difference]
        );

        if (difference !== 0) {
          await updateStockBalance(client, context.tenantId, input.branchId, item.productId, difference, true);
          await insertMovement(client, {
            tenantId: context.tenantId,
            branchId: input.branchId,
            productId: item.productId,
            movementType: "inventory_adjustment",
            quantity: difference,
            reason: `Inventario ${inventoryId}${input.notes ? ` - ${input.notes}` : ""}`,
            actorUserId: context.userId
          });
        }
      }

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "stock.inventory.completed",
        entityType: "inventory_count",
        entityId: inventoryId,
        metadata: { branchId: input.branchId, itemCount: input.items.length, notes: input.notes ?? null }
      });

      return { id: inventoryId, ok: true };
    });
  }

  async purchaseEntry(context: TenantContext, input: PurchaseEntryCreateInput) {
    ensureBranchAccess(context, input.branchId);

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      await assertBranch(client, context.tenantId, input.branchId);
      let supplierName = input.supplierName ?? null;
      if (input.supplierId) {
        const supplier = await client.query<{ name: string }>(
          "SELECT name FROM suppliers WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL AND is_active = true",
          [context.tenantId, input.supplierId]
        );
        supplierName = ensureFound(supplier.rows[0], "Fornecedor").name;
      }
      const totalAmount = input.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
      const purchase = await client.query<{ id: string }>(
        `
        INSERT INTO purchase_entries (tenant_id, branch_id, supplier_id, supplier_name, document_number, total_amount, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        `,
        [context.tenantId, input.branchId, input.supplierId ?? null, supplierName, input.documentNumber ?? null, totalAmount, input.notes ?? null]
      );
      const purchaseId = purchase.rows[0]!.id;

      for (const item of input.items) {
        await assertBranchAndProduct(client, context.tenantId, input.branchId, item.productId);
        await client.query(
          `
          INSERT INTO purchase_entry_items (tenant_id, purchase_entry_id, product_id, quantity, unit_cost)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [context.tenantId, purchaseId, item.productId, item.quantity, item.unitCost]
        );
        await updateStockBalance(client, context.tenantId, input.branchId, item.productId, item.quantity);
        await insertMovement(client, {
          tenantId: context.tenantId,
          branchId: input.branchId,
          productId: item.productId,
          movementType: "purchase_in",
          quantity: item.quantity,
          reason: `Entrada de compra ${purchaseId}`,
          actorUserId: context.userId
        });
      }

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "stock.purchase.created",
        entityType: "purchase_entry",
        entityId: purchaseId,
        metadata: { branchId: input.branchId, supplierId: input.supplierId ?? null, supplierName, documentNumber: input.documentNumber ?? null, totalAmount }
      });

      return { id: purchaseId, totalAmount };
    });
  }

  async reports(context: TenantContext) {
    const params: unknown[] = [context.tenantId];
    const branchFilter = context.branchId ? "AND sb.branch_id = $2" : "";
    if (context.branchId) {
      params.push(context.branchId);
    }

    const [lowStock, slowMoving] = await Promise.all([
      this.database.tenantQuery(
        context.tenantId,
        `
        SELECT
          p.id AS "productId",
          p.name AS "productName",
          b.name AS "branchName",
          sb.quantity,
          p.min_stock AS "minStock"
        FROM stock_balances sb
        JOIN products p ON p.id = sb.product_id
        JOIN branches b ON b.id = sb.branch_id
        WHERE sb.tenant_id = $1
          ${branchFilter}
          AND sb.quantity <= p.min_stock
        ORDER BY sb.quantity ASC, p.name ASC
        `,
        params
      ),
      this.database.tenantQuery(
        context.tenantId,
        `
        SELECT
          p.id AS "productId",
          p.name AS "productName",
          b.name AS "branchName",
          sb.quantity,
          MAX(sm.created_at) AS "lastMovementAt"
        FROM stock_balances sb
        JOIN products p ON p.id = sb.product_id
        JOIN branches b ON b.id = sb.branch_id
        LEFT JOIN stock_movements sm
          ON sm.tenant_id = sb.tenant_id
         AND sm.branch_id = sb.branch_id
         AND sm.product_id = sb.product_id
        WHERE sb.tenant_id = $1
          ${branchFilter}
        GROUP BY p.id, b.id, sb.quantity
        HAVING COALESCE(MAX(sm.created_at), now() - interval '10 years') < now() - interval '30 days'
        ORDER BY "lastMovementAt" ASC NULLS FIRST, p.name ASC
        `,
        params
      )
    ]);

    return {
      lowStock: lowStock.rows,
      slowMoving: slowMoving.rows
    };
  }

  async reportsDocument(context: TenantContext, kind: "low-stock" | "slow-moving") {
    const branding = await loadTenantBranding(this.database, context.tenantId);
    const reports = await this.reports(context);
    const rows = kind === "low-stock" ? reports.lowStock : reports.slowMoving;

    return renderDocumentHtml({
      title: kind === "low-stock" ? "Relatorio de estoque baixo" : "Relatorio de estoque parado",
      subtitle: "Saida padronizada para acompanhamento operacional por loja.",
      badge: "Estoque",
      branding,
      meta: [
        { label: "Tenant", value: branding.companyName },
        { label: "Tipo", value: kind === "low-stock" ? "Reposicao" : "Baixa movimentacao" },
        { label: "Itens", value: String(rows.length) },
        { label: "Emitido em", value: new Date().toLocaleString("pt-BR") }
      ],
      sections: [
        {
          title: "Itens monitorados",
          metrics: [
            { label: "Total de itens", value: String(rows.length) },
            { label: "Escopo", value: context.branchId ? "Filial atual" : "Tenant completo" },
            { label: "Acao recomendada", value: kind === "low-stock" ? "Reposicao" : "Revisao comercial" }
          ],
          table: {
            columns:
              kind === "low-stock"
                ? [
                    { key: "productName", label: "Produto" },
                    { key: "branchName", label: "Loja" },
                    { key: "quantity", label: "Saldo" },
                    { key: "minStock", label: "Minimo" }
                  ]
                : [
                    { key: "productName", label: "Produto" },
                    { key: "branchName", label: "Loja" },
                    { key: "quantity", label: "Saldo" },
                    { key: "lastMovementAt", label: "Ultima movimentacao" }
                  ],
            rows: rows.map((row) => ({
              ...row,
              quantity: Number(row.quantity).toLocaleString("pt-BR"),
              minStock: "minStock" in row ? Number(row.minStock ?? 0).toLocaleString("pt-BR") : undefined,
              lastMovementAt: "lastMovementAt" in row && row.lastMovementAt ? new Date(String(row.lastMovementAt)).toLocaleDateString("pt-BR") : "-"
            }))
          }
        }
      ]
    });
  }
}

async function assertBranchAndProduct(client: PoolClient, tenantId: string, branchId: string, productId: string) {
  const branch = await client.query("SELECT id FROM branches WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL", [
    tenantId,
    branchId
  ]);
  ensureFound(branch.rows[0], "Filial");

  const product = await client.query<{ branch_id: string | null }>(
    "SELECT branch_id FROM products WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
    [tenantId, productId]
  );
  const row = ensureFound(product.rows[0], "Produto");

  if (row.branch_id && row.branch_id !== branchId) {
    throw new ForbiddenException("Produto pertence a outra filial.");
  }
}

async function assertBranch(client: PoolClient, tenantId: string, branchId: string) {
  const branch = await client.query("SELECT id FROM branches WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL", [
    tenantId,
    branchId
  ]);
  ensureFound(branch.rows[0], "Filial");
}

async function ensureBalance(client: PoolClient, tenantId: string, branchId: string, productId: string) {
  await client.query(
    `
    INSERT INTO stock_balances (tenant_id, branch_id, product_id, quantity)
    VALUES ($1, $2, $3, 0)
    ON CONFLICT (tenant_id, branch_id, product_id) DO NOTHING
    `,
    [tenantId, branchId, productId]
  );

  const result = await client.query<{ quantity: string }>(
    "SELECT quantity::text FROM stock_balances WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3",
    [tenantId, branchId, productId]
  );

  return result.rows[0]?.quantity ?? "0";
}

async function updateStockBalance(
  client: PoolClient,
  tenantId: string,
  branchId: string,
  productId: string,
  quantityDelta: number,
  allowNegative = false
) {
  await client.query(
    `
    INSERT INTO stock_balances (tenant_id, branch_id, product_id, quantity)
    VALUES ($1, $2, $3, 0)
    ON CONFLICT (tenant_id, branch_id, product_id) DO NOTHING
    `,
    [tenantId, branchId, productId]
  );

  const result = await client.query<{ quantity: string }>(
    `
    UPDATE stock_balances
    SET quantity = quantity + $4, updated_at = now()
    WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3
    RETURNING quantity::text
    `,
    [tenantId, branchId, productId, quantityDelta]
  );
  const quantity = Number(result.rows[0]?.quantity ?? 0);
  if (!allowNegative && quantity < 0) {
    throw new BadRequestException("Operacao deixaria o estoque negativo.");
  }
  return quantity;
}

async function insertMovement(
  client: PoolClient,
  input: {
    tenantId: string;
    branchId: string;
    productId: string;
    movementType: string;
    quantity: number;
    reason: string;
    actorUserId?: string | null;
  }
) {
  await client.query(
    `
    INSERT INTO stock_movements (tenant_id, branch_id, product_id, movement_type, quantity, reason, actor_user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [input.tenantId, input.branchId, input.productId, input.movementType, input.quantity, input.reason, input.actorUserId ?? null]
  );
}

async function insertAuditLog(
  client: PoolClient,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await client.query(
    `
    INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      input.tenantId,
      input.actorUserId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}
