import { Inject, Injectable } from "@nestjs/common";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class DashboardService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async summary(context: TenantContext) {
    const branchFilter = context.branchId ? "AND (branch_id = $2 OR branch_id IS NULL)" : "";
    const branchParams = context.branchId ? [context.tenantId, context.branchId] : [context.tenantId];

    const [branches, products, customers, lowStock, receivable, payable, salesToday, salesMonth, averageTicket] =
      await Promise.all([
        this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT count(*)::text AS total FROM branches WHERE tenant_id = $1 AND deleted_at IS NULL ${
          context.branchId ? "AND id = $2" : ""
        }`,
        context.branchId ? [context.tenantId, context.branchId] : [context.tenantId]
      ),
        this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT count(*)::text AS total FROM products WHERE tenant_id = $1 AND deleted_at IS NULL ${branchFilter}`,
        branchParams
      ),
        this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT count(*)::text AS total FROM customers WHERE tenant_id = $1 AND deleted_at IS NULL ${branchFilter}`,
        branchParams
      ),
        this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `
        SELECT count(*)::text AS total
        FROM products p
        LEFT JOIN stock_balances sb
          ON sb.tenant_id = p.tenant_id AND sb.product_id = p.id
        WHERE p.tenant_id = $1
          AND p.deleted_at IS NULL
          ${context.branchId ? "AND (p.branch_id = $2 OR p.branch_id IS NULL)" : ""}
          AND COALESCE(sb.quantity, 0) <= p.min_stock
        `,
        branchParams
      ),
        this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT COALESCE(sum(amount), 0)::text AS total FROM accounts_receivable WHERE tenant_id = $1 AND status = 'open' ${
          context.branchId ? "AND branch_id = $2" : ""
        }`,
        context.branchId ? [context.tenantId, context.branchId] : [context.tenantId]
      ),
        this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT COALESCE(sum(amount), 0)::text AS total FROM accounts_payable WHERE tenant_id = $1 AND status = 'open' ${
          context.branchId ? "AND branch_id = $2" : ""
        }`,
        context.branchId ? [context.tenantId, context.branchId] : [context.tenantId]
      ),
        this.database.tenantQuery<{ total: string }>(
          context.tenantId,
          `SELECT COALESCE(sum(total_amount), 0)::text AS total FROM sales WHERE tenant_id = $1 AND status = 'sold' AND created_at::date = CURRENT_DATE ${
            context.branchId ? "AND branch_id = $2" : ""
          }`,
          context.branchId ? [context.tenantId, context.branchId] : [context.tenantId]
        ),
        this.database.tenantQuery<{ total: string }>(
          context.tenantId,
          `SELECT COALESCE(sum(total_amount), 0)::text AS total FROM sales WHERE tenant_id = $1 AND status = 'sold' AND date_trunc('month', created_at) = date_trunc('month', now()) ${
            context.branchId ? "AND branch_id = $2" : ""
          }`,
          context.branchId ? [context.tenantId, context.branchId] : [context.tenantId]
        ),
        this.database.tenantQuery<{ total: string }>(
          context.tenantId,
          `SELECT COALESCE(avg(total_amount), 0)::text AS total FROM sales WHERE tenant_id = $1 AND status = 'sold' ${
            context.branchId ? "AND branch_id = $2" : ""
          }`,
          context.branchId ? [context.tenantId, context.branchId] : [context.tenantId]
        )
      ]);

    return {
      branches: Number(branches.rows[0]?.total ?? 0),
      products: Number(products.rows[0]?.total ?? 0),
      customers: Number(customers.rows[0]?.total ?? 0),
      lowStockProducts: Number(lowStock.rows[0]?.total ?? 0),
      accountsReceivableOpen: Number(receivable.rows[0]?.total ?? 0),
      accountsPayableOpen: Number(payable.rows[0]?.total ?? 0),
      salesToday: Number(salesToday.rows[0]?.total ?? 0),
      salesMonth: Number(salesMonth.rows[0]?.total ?? 0),
      averageTicket: Number(averageTicket.rows[0]?.total ?? 0)
    };
  }
}
