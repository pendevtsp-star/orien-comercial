import { Inject, Injectable } from "@nestjs/common";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class DashboardService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async setGoal(context: TenantContext, input: { branchId:string;periodStart:string;periodEnd:string;salesTarget:number }) {
    if (context.branchId && context.branchId !== input.branchId) throw new Error("Filial fora do escopo do usuario.");
    const result = await this.database.tenantQuery(context.tenantId, `INSERT INTO branch_goals (tenant_id,branch_id,period_start,period_end,sales_target) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,branch_id,period_start,period_end) DO UPDATE SET sales_target=EXCLUDED.sales_target,updated_at=now() RETURNING *`, [context.tenantId,input.branchId,input.periodStart,input.periodEnd,input.salesTarget]);
    return result.rows[0];
  }

  async summary(context: TenantContext, query: { startDate?: string; endDate?: string }) {
    const now = new Date();
    const startDate = query.startDate ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = query.endDate ?? now.toISOString().slice(0, 10);
    const days = Math.max(1, Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000) + 1);
    const previousEnd = new Date(new Date(`${startDate}T00:00:00Z`).getTime() - 86400000);
    const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86400000);
    const branchFilter = context.branchId ? "AND (branch_id = $2 OR branch_id IS NULL)" : "";
    const branchParams = context.branchId ? [context.tenantId, context.branchId] : [context.tenantId];

    const [branches, products, customers, lowStock, receivable, payable, salesToday, salesMonth, averageTicket, periodSales, previousSales, forecast, goal, health, suggestions, commissions] =
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
        ),
        this.database.tenantQuery<{ total:string; count:string; average:string }>(context.tenantId,`SELECT COALESCE(sum(total_amount),0)::text total,count(*)::text count,COALESCE(avg(total_amount),0)::text average FROM sales WHERE tenant_id=$1 AND status='sold' AND created_at::date BETWEEN $2 AND $3 ${context.branchId?"AND branch_id=$4":""}`,context.branchId?[context.tenantId,startDate,endDate,context.branchId]:[context.tenantId,startDate,endDate]),
        this.database.tenantQuery<{ total:string }>(context.tenantId,`SELECT COALESCE(sum(total_amount),0)::text total FROM sales WHERE tenant_id=$1 AND status='sold' AND created_at::date BETWEEN $2 AND $3 ${context.branchId?"AND branch_id=$4":""}`,context.branchId?[context.tenantId,previousStart.toISOString().slice(0,10),previousEnd.toISOString().slice(0,10),context.branchId]:[context.tenantId,previousStart.toISOString().slice(0,10),previousEnd.toISOString().slice(0,10)]),
        this.database.tenantQuery<{ receivable:string; payable:string }>(context.tenantId,`SELECT (SELECT COALESCE(sum(amount),0) FROM accounts_receivable WHERE tenant_id=$1 AND status='open' AND due_date<=$2 ${context.branchId?"AND branch_id=$3":""})::text receivable,(SELECT COALESCE(sum(amount),0) FROM accounts_payable WHERE tenant_id=$1 AND status='open' AND due_date<=$2 ${context.branchId?"AND branch_id=$3":""})::text payable`,context.branchId?[context.tenantId,endDate,context.branchId]:[context.tenantId,endDate]),
        this.database.tenantQuery<{ total:string }>(context.tenantId,`SELECT COALESCE(sum(sales_target),0)::text total FROM branch_goals WHERE tenant_id=$1 AND period_start<=$3 AND period_end>=$2 ${context.branchId?"AND branch_id=$4":""}`,context.branchId?[context.tenantId,startDate,endDate,context.branchId]:[context.tenantId,startDate,endDate])
        ,this.database.tenantQuery<{ margin:string; turnover:string; overdue:string }>(context.tenantId,`
          SELECT
            COALESCE((SELECT SUM((si.unit_price * si.quantity) - si.discount_amount - (p.cost_price * si.quantity))
              FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN products p ON p.id=si.product_id
              WHERE si.tenant_id=$1 AND s.status='sold' AND s.created_at::date BETWEEN $2 AND $3 ${context.branchId?"AND s.branch_id=$4":""}),0)::text AS margin,
            COALESCE((SELECT SUM(ABS(sm.quantity)) / NULLIF((SELECT SUM(quantity) FROM stock_balances WHERE tenant_id=$1 ${context.branchId?"AND branch_id=$4":""}),0)
              FROM stock_movements sm WHERE sm.tenant_id=$1 AND sm.movement_type='sale_out' AND sm.created_at::date BETWEEN $2 AND $3 ${context.branchId?"AND sm.branch_id=$4":""}),0)::text AS turnover,
            COALESCE((SELECT SUM(amount) FROM accounts_receivable WHERE tenant_id=$1 AND status IN('open','overdue') AND due_date<CURRENT_DATE ${context.branchId?"AND branch_id=$4":""}),0)::text AS overdue
        `, context.branchId?[context.tenantId,startDate,endDate,context.branchId]:[context.tenantId,startDate,endDate])
        ,this.database.tenantQuery<{ name:string; quantity:string; minStock:string; suggestedQuantity:string }>(context.tenantId,`
          SELECT p.name, COALESCE(sb.quantity,0)::text quantity, p.min_stock::text AS "minStock",
                 GREATEST((p.min_stock * 2)-COALESCE(sb.quantity,0), p.min_stock)::text AS "suggestedQuantity"
          FROM products p LEFT JOIN stock_balances sb ON sb.tenant_id=p.tenant_id AND sb.product_id=p.id ${context.branchId?"AND sb.branch_id=$2":""}
          WHERE p.tenant_id=$1 AND p.deleted_at IS NULL AND COALESCE(sb.quantity,0)<=p.min_stock ${context.branchId?"AND (p.branch_id=$2 OR p.branch_id IS NULL)":""}
          ORDER BY (p.min_stock-COALESCE(sb.quantity,0)) DESC LIMIT 5
        `, branchParams)
        ,this.database.tenantQuery<{ total:string }>(context.tenantId,`SELECT COALESCE(sum(amount),0)::text total FROM seller_commissions WHERE tenant_id=$1 AND user_id=$2 AND created_at::date BETWEEN $3 AND $4`,[context.tenantId,context.userId ?? "00000000-0000-0000-0000-000000000000",startDate,endDate])
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
      averageTicket: Number(averageTicket.rows[0]?.total ?? 0),
      period: { startDate, endDate, previousStartDate: previousStart.toISOString().slice(0,10), previousEndDate: previousEnd.toISOString().slice(0,10) },
      periodSales: Number(periodSales.rows[0]?.total ?? 0),
      periodSalesCount: Number(periodSales.rows[0]?.count ?? 0),
      periodAverageTicket: Number(periodSales.rows[0]?.average ?? 0),
      previousPeriodSales: Number(previousSales.rows[0]?.total ?? 0),
      salesVariationPercent: Number(previousSales.rows[0]?.total ?? 0) > 0 ? ((Number(periodSales.rows[0]?.total ?? 0) / Number(previousSales.rows[0]?.total ?? 1)) - 1) * 100 : null,
      cashForecast: Number(forecast.rows[0]?.receivable ?? 0) - Number(forecast.rows[0]?.payable ?? 0),
      salesGoal: Number(goal.rows[0]?.total ?? 0),
      goalProgressPercent: Number(goal.rows[0]?.total ?? 0) > 0 ? Number(periodSales.rows[0]?.total ?? 0) / Number(goal.rows[0]?.total ?? 1) * 100 : null
      ,roleFocus: context.roleSlug,
      sellerCommission: Number(commissions.rows[0]?.total ?? 0),
      health: {
        grossMargin: Number(health.rows[0]?.margin ?? 0),
        stockTurnover: Number(health.rows[0]?.turnover ?? 0),
        overdueReceivables: Number(health.rows[0]?.overdue ?? 0),
        stockoutRisk: Number(lowStock.rows[0]?.total ?? 0),
        purchaseSuggestions: suggestions.rows,
      }
    };
  }
}
