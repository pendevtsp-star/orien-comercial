import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { permissions } from "@sgc/auth";
import { renderDocumentHtml } from "@sgc/documents";
import type { SaleCancelInput, SaleCreateInput, SalesListQuery } from "@sgc/types";
import type { PoolClient, QueryResult } from "pg";
import {
  ensureBranchAccess,
  ensureFound,
  pagination,
  resolveSort,
} from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { loadTenantBranding } from "../../shared/tenant-branding";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class SalesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(context: TenantContext, query: SalesListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["s.tenant_id = $1", "s.deleted_at IS NULL"];
    const sort = resolveSort(
      query,
      { createdAt: "s.created_at", totalAmount: "s.total_amount", status: "s.status" },
      "createdAt",
    );

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`s.branch_id = $${params.length}`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(
        `(c.name ILIKE $${params.length} OR b.name ILIKE $${params.length} OR COALESCE(s.notes, '') ILIKE $${params.length})`,
      );
    }

    if (query.status) {
      params.push(query.status);
      filters.push(`s.status = $${params.length}`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `
      SELECT count(*)::text AS total
      FROM sales s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE ${filters.join(" AND ")}
      `,
      params,
    );

    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT
        s.id,
        s.status,
        s.total_amount AS "totalAmount",
        s.notes,
        s.cancelled_at AS "cancelledAt",
        s.cancelled_reason AS "cancelledReason",
        s.created_at AS "createdAt",
        b.name AS "branchName",
        c.name AS "customerName",
        COALESCE(items.item_count, 0) AS "itemCount",
        COALESCE(payments.paid_amount, 0)::text AS "paidAmount",
        GREATEST(s.total_amount - COALESCE(payments.paid_amount, 0), 0)::text AS "openAmount"
      FROM sales s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN (
        SELECT sale_id, count(*)::int AS item_count
        FROM sale_items
        WHERE tenant_id = $1
        GROUP BY sale_id
      ) items ON items.sale_id = s.id
      LEFT JOIN (
        SELECT sale_id, sum(amount) FILTER (WHERE status = 'paid') AS paid_amount
        FROM sale_payments
        WHERE tenant_id = $1
        GROUP BY sale_id
      ) payments ON payments.sale_id = s.id
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sort.field} ${sort.direction}, s.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    );

    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async create(context: TenantContext, input: SaleCreateInput, idempotencyKey?: string) {
    ensureBranchAccess(context, input.branchId);

    if (idempotencyKey && !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("Chave de idempotência inválida.");
    }

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      if (idempotencyKey) {
        const key = await client.query<{ response: unknown }>(
          `INSERT INTO idempotency_keys(tenant_id,scope,key) VALUES($1,'sales.create',$2)
           ON CONFLICT(tenant_id,scope,key) DO NOTHING RETURNING response`,
          [context.tenantId, idempotencyKey],
        );
        if (!key.rowCount) {
          const existing = await client.query<{ response: unknown }>(
            "SELECT response FROM idempotency_keys WHERE tenant_id=$1 AND scope='sales.create' AND key=$2 FOR UPDATE",
            [context.tenantId, idempotencyKey],
          );
          if (existing.rows[0]?.response) return existing.rows[0].response as { id: string; totalAmount: number; paidAmount: number; openAmount: number };
          throw new BadRequestException("Venda em processamento. Aguarde alguns segundos e tente novamente.");
        }
      }
      await assertBranch(client, context.tenantId, input.branchId);
      if (input.customerId) await assertCustomer(client, context.tenantId, input.customerId);
      if (input.cashRegisterSessionId) {
        const cashSession = await client.query(
          "SELECT id FROM cash_register_sessions WHERE tenant_id = $1 AND id = $2 AND branch_id = $3 AND status = 'open'",
          [context.tenantId, input.cashRegisterSessionId, input.branchId],
        );
        if (!cashSession.rowCount)
          throw new BadRequestException("Caixa informado nao esta aberto para esta loja.");
      }

      const productIds = input.items.map((item) => item.productId);
      const products = await client.query<{ id: string; name: string; sale_price: string }>(
        `
        SELECT id, name, sale_price
        FROM products
        WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL AND is_active = true
        `,
        [context.tenantId, productIds],
      );

      if (products.rowCount !== productIds.length) {
        throw new BadRequestException("Um ou mais produtos nao existem ou estao inativos.");
      }

      const productById = new Map(products.rows.map((product) => [product.id, product]));
      for (const item of input.items) {
        const product = productById.get(item.productId);
        const unitPrice = item.unitPrice ?? Number(product?.sale_price ?? 0);
        const grossAmount = item.quantity * unitPrice;
        if (item.discountAmount > grossAmount)
          throw new BadRequestException("Desconto nao pode superar o valor do item.");
        if (
          grossAmount > 0 &&
          item.discountAmount / grossAmount > 0.1 &&
          !context.permissions.includes(permissions.sales.cancel)
        ) {
          throw new ForbiddenException(
            "Descontos acima de 10% exigem autorizacao de gerente ou administrador.",
          );
        }
      }
      const totalAmount = input.items.reduce((total, item) => {
        const product = productById.get(item.productId);
        const unitPrice = item.unitPrice ?? Number(product?.sale_price ?? 0);
        return total + item.quantity * unitPrice - item.discountAmount;
      }, 0);

      if (totalAmount < 0) {
        throw new BadRequestException("Total da venda nao pode ser negativo.");
      }

      const plannedPaidAmount = input.payments
        .filter((payment) => payment.status === "paid")
        .reduce((sum, payment) => sum + payment.amount, 0);
      const plannedCreditAmount = Math.max(0, totalAmount - plannedPaidAmount);
      if (input.customerId && plannedCreditAmount > 0) {
        const policy = await client.query<{ credit_limit: string; blocked: boolean }>(
          `SELECT credit_limit::text,blocked FROM customer_credit_accounts WHERE tenant_id=$1 AND customer_id=$2`,
          [context.tenantId, input.customerId],
        );
        const exposure = await client.query<{ total: string }>(
          `SELECT COALESCE(sum(amount),0)::text total FROM accounts_receivable WHERE tenant_id=$1 AND customer_id=$2 AND status IN('open','overdue')`,
          [context.tenantId, input.customerId],
        );
        if (policy.rows[0]?.blocked)
          throw new ForbiddenException("Crediario bloqueado para este cliente.");
        if (
          policy.rows[0] &&
          Number(exposure.rows[0]?.total ?? 0) + plannedCreditAmount >
            Number(policy.rows[0].credit_limit)
        )
          throw new ForbiddenException("Venda excede o limite de crediario do cliente.");
      }

      const sale = await client.query<{ id: string }>(
        `
        INSERT INTO sales (tenant_id, branch_id, customer_id, seller_user_id, cash_register_session_id, status, total_amount, notes)
        VALUES ($1, $2, $3, $4, $5, 'sold', $6, $7)
        RETURNING id
        `,
        [
          context.tenantId,
          input.branchId,
          input.customerId ?? null,
          context.userId ?? null,
          input.cashRegisterSessionId ?? null,
          totalAmount,
          input.notes ?? null,
        ],
      );
      const saleId = sale.rows[0]!.id;

      for (const item of input.items) {
        const product = productById.get(item.productId)!;
        const unitPrice = item.unitPrice ?? Number(product.sale_price);

        await client.query(
          `
          INSERT INTO sale_items (tenant_id, sale_id, product_id, description, quantity, unit_price, discount_amount)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            context.tenantId,
            saleId,
            item.productId,
            product.name,
            item.quantity,
            unitPrice,
            item.discountAmount,
          ],
        );

        await decrementStock(
          client,
          context.tenantId,
          input.branchId,
          item.productId,
          item.quantity,
          saleId,
        );
      }

      const paidAmount = input.payments
        .filter((payment) => payment.status === "paid")
        .reduce((sum, payment) => sum + payment.amount, 0);

      for (const payment of input.payments) {
        await client.query(
          `
          INSERT INTO sale_payments (tenant_id, sale_id, method, amount, status, paid_at)
          VALUES ($1, $2, $3, $4, $5::varchar, CASE WHEN $5::varchar = 'paid' THEN now() ELSE NULL END)
          `,
          [context.tenantId, saleId, payment.method, payment.amount, payment.status],
        );
      }

      const openAmount = totalAmount - paidAmount;
      if (openAmount > 0) {
        await client.query(
          `
          INSERT INTO accounts_receivable (tenant_id, branch_id, customer_id, sale_id, amount, due_date, status, description)
          VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'open', $6)
          `,
          [
            context.tenantId,
            input.branchId,
            input.customerId ?? null,
            saleId,
            openAmount,
            `Saldo da venda ${saleId}`,
          ],
        );
      }

      if (input.customerId && openAmount <= 0) {
        const campaign = await client.query<{ rule: { pointsPerReal?: number } }>(
          `SELECT lr.rule FROM loyalty_campaigns lc JOIN loyalty_rules lr ON lr.campaign_id=lc.id WHERE lc.tenant_id=$1 AND lc.is_active=true ORDER BY lc.created_at DESC LIMIT 1`,
          [context.tenantId],
        );
        const pointsPerReal = Number(campaign.rows[0]?.rule?.pointsPerReal ?? 0);
        const points = Math.floor(totalAmount * pointsPerReal);
        if (points > 0) {
          const wallet = await client.query<{ id: string }>(
            `INSERT INTO loyalty_wallets (tenant_id,customer_id,points_balance) VALUES ($1,$2,0) ON CONFLICT (tenant_id,customer_id) DO UPDATE SET updated_at=now() RETURNING id`,
            [context.tenantId, input.customerId],
          );
          await client.query("UPDATE loyalty_wallets SET points_balance=points_balance+$2,updated_at=now() WHERE id=$1", [wallet.rows[0]!.id, points]);
          await client.query("INSERT INTO loyalty_ledger (tenant_id,wallet_id,movement_type,points,metadata) VALUES ($1,$2,'sale_paid',$3,$4::jsonb)", [context.tenantId, wallet.rows[0]!.id, points, JSON.stringify({ saleId, totalAmount })]);
        }
      }

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "sale.created",
        entityType: "sale",
        entityId: saleId,
        metadata: {
          branchId: input.branchId,
          totalAmount,
          itemCount: input.items.length,
          discountAmount: input.items.reduce((sum, item) => sum + item.discountAmount, 0),
        },
      });

      const response = { id: saleId, totalAmount, paidAmount, openAmount };
      if (idempotencyKey) await client.query("UPDATE idempotency_keys SET response=$3::jsonb,completed_at=now() WHERE tenant_id=$1 AND scope='sales.create' AND key=$2", [context.tenantId, idempotencyKey, JSON.stringify(response)]);
      return response;
    });
  }

  async cancel(context: TenantContext, saleId: string, input: SaleCancelInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const saleResult = await client.query<{
        id: string;
        branch_id: string;
        status: string;
        cancelled_at: Date | null;
      }>(
        `
        SELECT id, branch_id, status, cancelled_at
        FROM sales
        WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
        `,
        [context.tenantId, saleId],
      );
      const sale = ensureFound(saleResult.rows[0], "Venda");
      ensureBranchAccess(context, sale.branch_id);

      if (sale.cancelled_at || sale.status === "cancelled") {
        throw new BadRequestException("Venda ja cancelada.");
      }

      const items = await client.query<{ product_id: string; quantity: string }>(
        "SELECT product_id, quantity::text FROM sale_items WHERE tenant_id = $1 AND sale_id = $2",
        [context.tenantId, saleId],
      );

      for (const item of items.rows) {
        await client.query(
          `
          INSERT INTO stock_balances (tenant_id, branch_id, product_id, quantity)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (tenant_id, branch_id, product_id)
          DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = now()
          `,
          [context.tenantId, sale.branch_id, item.product_id, Number(item.quantity)],
        );

        await client.query(
          `
          INSERT INTO stock_movements (tenant_id, branch_id, product_id, movement_type, quantity, reason, actor_user_id)
          VALUES ($1, $2, $3, 'sale_cancel_in', $4, $5, $6)
          `,
          [
            context.tenantId,
            sale.branch_id,
            item.product_id,
            Number(item.quantity),
            `Cancelamento da venda ${saleId}`,
            context.userId ?? null,
          ],
        );
      }

      await client.query(
        `
        UPDATE sales
        SET status = 'cancelled', cancelled_at = now(), cancelled_reason = $3, updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        `,
        [context.tenantId, saleId, input.reason],
      );

      await client.query(
        "UPDATE accounts_receivable SET status = 'cancelled', updated_at = now() WHERE tenant_id = $1 AND sale_id = $2 AND status <> 'paid'",
        [context.tenantId, saleId],
      );

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "sale.cancelled",
        entityType: "sale",
        entityId: saleId,
        metadata: { reason: input.reason },
      });

      return { ok: true };
    });
  }

  async history(context: TenantContext, saleId: string) {
    const sale = await this.database.tenantQuery<{ branch_id: string }>(
      context.tenantId,
      "SELECT branch_id FROM sales WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [context.tenantId, saleId],
    );
    const saleRow = ensureFound(sale.rows[0], "Venda");
    ensureBranchAccess(context, saleRow.branch_id);

    const [payments, movements, financial, audit] = await Promise.all([
      this.database.tenantQuery<{
        description: string;
        quantity: string;
        unitPrice: string;
        discountAmount: string;
      }>(
        context.tenantId,
        `
        SELECT id, method, amount, status, paid_at AS "paidAt", created_at AS "createdAt"
        FROM sale_payments
        WHERE tenant_id = $1 AND sale_id = $2
        ORDER BY created_at ASC
        `,
        [context.tenantId, saleId],
      ),
      this.database.tenantQuery<{
        method: string;
        amount: string;
        status: string;
      }>(
        context.tenantId,
        `
        SELECT id, movement_type AS "movementType", quantity, reason, created_at AS "createdAt"
        FROM stock_movements
        WHERE tenant_id = $1 AND reason ILIKE $2
        ORDER BY created_at ASC
        `,
        [context.tenantId, `%${saleId}%`],
      ),
      this.database.tenantQuery(
        context.tenantId,
        `
        SELECT id, amount, due_date AS "dueDate", status, paid_at AS "paidAt"
        FROM accounts_receivable
        WHERE tenant_id = $1 AND sale_id = $2
        ORDER BY created_at ASC
        `,
        [context.tenantId, saleId],
      ),
      this.database.tenantQuery(
        context.tenantId,
        `
        SELECT action, metadata, created_at AS "createdAt"
        FROM audit_logs
        WHERE tenant_id = $1 AND entity_type = 'sale' AND entity_id = $2
        ORDER BY created_at ASC
        `,
        [context.tenantId, saleId],
      ),
    ]);

    return {
      payments: payments.rows,
      movements: movements.rows,
      receivables: financial.rows,
      audit: audit.rows,
    };
  }

  async document(context: TenantContext, saleId: string) {
    const branding = await loadTenantBranding(this.database, context.tenantId);
    const saleResult = await this.database.tenantQuery<{
      id: string;
      status: string;
      total_amount: string;
      notes: string | null;
      created_at: Date;
      branch_name: string;
      customer_name: string | null;
    }>(
      context.tenantId,
      `
      SELECT
        s.id,
        s.status,
        s.total_amount::text,
        s.notes,
        s.created_at,
        b.name AS branch_name,
        c.name AS customer_name
      FROM sales s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.tenant_id = $1 AND s.id = $2 AND s.deleted_at IS NULL
      LIMIT 1
      `,
      [context.tenantId, saleId],
    );
    const sale = ensureFound(saleResult.rows[0], "Venda");

    const [items, payments]: [
      QueryResult<SaleDocumentItemRow>,
      QueryResult<SaleDocumentPaymentRow>,
    ] = await Promise.all([
      this.database.tenantQuery<SaleDocumentItemRow>(
        context.tenantId,
        `
        SELECT description, quantity::text AS quantity, unit_price::text AS "unitPrice", discount_amount::text AS "discountAmount"
        FROM sale_items
        WHERE tenant_id = $1 AND sale_id = $2
        ORDER BY description ASC
        `,
        [context.tenantId, saleId],
      ),
      this.database.tenantQuery<SaleDocumentPaymentRow>(
        context.tenantId,
        `
        SELECT method, amount::text AS amount, status
        FROM sale_payments
        WHERE tenant_id = $1 AND sale_id = $2
        ORDER BY created_at ASC
        `,
        [context.tenantId, saleId],
      ),
    ]);

    return renderDocumentHtml({
      title: "Comprovante de venda",
      subtitle: sale.notes ?? "Resumo padronizado da venda para operacao e atendimento.",
      badge: sale.status,
      branding,
      meta: [
        { label: "Venda", value: sale.id.slice(0, 8) },
        { label: "Loja", value: sale.branch_name },
        { label: "Cliente", value: sale.customer_name ?? "Consumidor final" },
        { label: "Emitido em", value: sale.created_at.toLocaleString("pt-BR") },
      ],
      sections: [
        {
          title: "Resumo financeiro",
          metrics: [
            { label: "Total", value: toMoney(sale.total_amount) },
            {
              label: "Pago",
              value: toMoney(
                payments.rows.reduce((sum, payment) => sum + Number(payment.amount), 0),
              ),
            },
            {
              label: "Itens",
              value: String(items.rows.length),
            },
          ],
        },
        {
          title: "Itens vendidos",
          table: {
            columns: [
              { key: "description", label: "Item" },
              { key: "quantity", label: "Qtd" },
              { key: "unitPrice", label: "Preco unit." },
              { key: "discountAmount", label: "Desconto" },
            ],
            rows: items.rows.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: toMoney(item.unitPrice),
              discountAmount: toMoney(item.discountAmount),
            })),
          },
        },
        {
          title: "Pagamentos",
          table: {
            columns: [
              { key: "method", label: "Metodo" },
              { key: "amount", label: "Valor" },
              { key: "status", label: "Status" },
            ],
            rows: payments.rows.map((payment) => ({
              method: payment.method,
              amount: toMoney(payment.amount),
              status: payment.status,
            })),
          },
        },
      ],
    });
  }
}

async function assertBranch(client: PoolClient, tenantId: string, branchId: string) {
  const branch = await client.query(
    "SELECT id FROM branches WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
    [tenantId, branchId],
  );
  ensureFound(branch.rows[0], "Filial");
}

async function assertCustomer(client: PoolClient, tenantId: string, customerId: string) {
  const customer = await client.query(
    "SELECT id FROM customers WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
    [tenantId, customerId],
  );
  ensureFound(customer.rows[0], "Cliente");
}

async function decrementStock(
  client: PoolClient,
  tenantId: string,
  branchId: string,
  productId: string,
  quantity: number,
  saleId: string,
) {
  await client.query(
    `
    INSERT INTO stock_balances (tenant_id, branch_id, product_id, quantity)
    VALUES ($1, $2, $3, 0)
    ON CONFLICT (tenant_id, branch_id, product_id) DO NOTHING
    `,
    [tenantId, branchId, productId],
  );

  const balance = await client.query<{ quantity: string }>(
    `
    UPDATE stock_balances
    SET quantity = quantity - $4, updated_at = now()
    WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3
    RETURNING quantity::text
    `,
    [tenantId, branchId, productId, quantity],
  );

  if (Number(balance.rows[0]?.quantity ?? 0) < 0) {
    throw new BadRequestException("Estoque insuficiente para concluir a venda.");
  }

  await client.query(
    `
    INSERT INTO stock_movements (tenant_id, branch_id, product_id, movement_type, quantity, reason)
    VALUES ($1, $2, $3, 'sale_out', $4, $5)
    `,
    [tenantId, branchId, productId, -quantity, `Venda ${saleId}`],
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
  },
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
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

function toMoney(value: string | number) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface SaleDocumentItemRow {
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
}

interface SaleDocumentPaymentRow {
  method: string;
  amount: string;
  status: string;
}
