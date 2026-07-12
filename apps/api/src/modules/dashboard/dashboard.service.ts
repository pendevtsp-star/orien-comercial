import { Inject, Injectable } from "@nestjs/common";
import type { OnboardingStateInput } from "@sgc/types";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class DashboardService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async operationalStatus(context: TenantContext) {
    const branchFilter = context.branchId ? "AND branch_id = $2" : "";
    const branchOrGlobalFilter = context.branchId ? "AND (branch_id = $2 OR branch_id IS NULL)" : "";
    const params = context.branchId ? [context.tenantId, context.branchId] : [context.tenantId];

    const [
      branches,
      products,
      customers,
      operators,
      stockBalances,
      testSales,
      openCash,
      criticalStock,
      overdueReceivables,
      pendingTasks,
      integrationErrors,
      onboarding,
    ] = await Promise.all([
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT count(*)::text total FROM branches WHERE tenant_id=$1 AND deleted_at IS NULL ${context.branchId ? "AND id=$2" : ""}`,
        params,
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT count(*)::text total FROM products WHERE tenant_id=$1 AND deleted_at IS NULL ${branchOrGlobalFilter}`,
        params,
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT count(*)::text total FROM customers WHERE tenant_id=$1 AND deleted_at IS NULL ${branchOrGlobalFilter}`,
        params,
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT count(*)::text total FROM memberships WHERE tenant_id=$1 AND status='active' AND deleted_at IS NULL ${branchOrGlobalFilter}`,
        params,
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT count(*)::text total FROM stock_balances WHERE tenant_id=$1 AND quantity > 0 ${branchFilter}`,
        params,
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT count(*)::text total FROM sales WHERE tenant_id=$1 AND status='sold' ${branchFilter}`,
        params,
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT count(*)::text total FROM cash_register_sessions WHERE tenant_id=$1 AND status='open' ${branchFilter}`,
        params,
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `
        SELECT count(*)::text total
        FROM products p
        LEFT JOIN stock_balances sb ON sb.tenant_id=p.tenant_id AND sb.product_id=p.id ${context.branchId ? "AND sb.branch_id=$2" : ""}
        WHERE p.tenant_id=$1 AND p.deleted_at IS NULL ${context.branchId ? "AND (p.branch_id=$2 OR p.branch_id IS NULL)" : ""}
          AND COALESCE(sb.quantity,0) <= p.min_stock
        `,
        params,
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT count(*)::text total FROM accounts_receivable WHERE tenant_id=$1 AND status IN ('open','overdue') AND due_date < CURRENT_DATE ${branchFilter}`,
        params,
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT count(*)::text total FROM operational_tasks WHERE tenant_id=$1 AND status IN ('open','in_progress') ${branchFilter}`,
        params,
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        "SELECT count(*)::text total FROM tenant_integrations WHERE tenant_id=$1 AND status='error'",
        [context.tenantId],
      ),
      this.database.tenantQuery<{ value: { dismissed?: boolean; completedKeys?: string[] } | null }>(
        context.tenantId,
        "SELECT value FROM tenant_settings WHERE tenant_id=$1 AND key='onboarding' AND deleted_at IS NULL LIMIT 1",
        [context.tenantId],
      ),
    ]);

    const counts = {
      branches: Number(branches.rows[0]?.total ?? 0),
      products: Number(products.rows[0]?.total ?? 0),
      customers: Number(customers.rows[0]?.total ?? 0),
      operators: Number(operators.rows[0]?.total ?? 0),
      stockBalances: Number(stockBalances.rows[0]?.total ?? 0),
      testSales: Number(testSales.rows[0]?.total ?? 0),
      openCash: Number(openCash.rows[0]?.total ?? 0),
      criticalStock: Number(criticalStock.rows[0]?.total ?? 0),
      overdueReceivables: Number(overdueReceivables.rows[0]?.total ?? 0),
      pendingTasks: Number(pendingTasks.rows[0]?.total ?? 0),
      integrationErrors: Number(integrationErrors.rows[0]?.total ?? 0),
    };

    const persisted = onboarding.rows[0]?.value ?? {};
    const completedKeys = new Set(persisted.completedKeys ?? []);
    const checklist = [
      { key: "branch", label: "Cadastrar loja", autoDone: counts.branches > 0, href: "/branches" },
      { key: "products", label: "Cadastrar produtos", autoDone: counts.products > 0, href: "/products" },
      { key: "customers", label: "Cadastrar clientes", autoDone: counts.customers > 0, href: "/customers" },
      { key: "operator", label: "Convidar operador", autoDone: counts.operators > 1, href: "/team" },
      { key: "stock", label: "Informar estoque inicial", autoDone: counts.stockBalances > 0, href: "/stock" },
      { key: "sale", label: "Realizar venda teste", autoDone: counts.testSales > 0, href: "/pos" },
    ].map((item) => ({ ...item, done: item.autoDone || completedKeys.has(item.key) }));

    const completed = checklist.filter((item) => item.done).length;
    return {
      counts,
      checklist,
      progressPercent: Math.round((completed / checklist.length) * 100),
      nextAction: checklist.find((item) => !item.done) ?? null,
      onboarding: {
        dismissed: Boolean(persisted.dismissed),
        completedKeys: Array.from(new Set([...completedKeys, ...checklist.filter((item) => item.autoDone).map((item) => item.key)])),
      },
    };
  }

  async updateOnboarding(context: TenantContext, input: OnboardingStateInput) {
    const current = await this.database.tenantQuery<{ value: { dismissed?: boolean; completedKeys?: string[] } | null }>(
      context.tenantId,
      "SELECT value FROM tenant_settings WHERE tenant_id=$1 AND key='onboarding' AND deleted_at IS NULL LIMIT 1",
      [context.tenantId],
    );
    const value = {
      dismissed: input.dismissed ?? Boolean(current.rows[0]?.value?.dismissed),
      completedKeys: Array.from(new Set([...(current.rows[0]?.value?.completedKeys ?? []), ...(input.completedKeys ?? [])])),
      updatedAt: new Date().toISOString(),
    };
    await this.database.tenantQuery(
      context.tenantId,
      `
      INSERT INTO tenant_settings (tenant_id, key, value)
      VALUES ($1, 'onboarding', $2::jsonb)
      ON CONFLICT (tenant_id, key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = now(), deleted_at = NULL
      `,
      [context.tenantId, JSON.stringify(value)],
    );
    return this.operationalStatus(context);
  }

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

    const [branches, products, customers, lowStock, receivable, payable, salesToday, salesMonth, averageTicket, periodSales, previousSales, forecast, goal, health, suggestions, commissions, salesHistory, branchGoals] =
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
        ,this.database.tenantQuery<{ date:string; total:string }>(context.tenantId,`SELECT d::date::text date,COALESCE(sum(s.total_amount),0)::text total FROM generate_series($2::date,$3::date,interval '1 day') d LEFT JOIN sales s ON s.tenant_id=$1 AND s.status='sold' AND s.created_at::date=d::date ${context.branchId?"AND s.branch_id=$4":""} GROUP BY d ORDER BY d`,context.branchId?[context.tenantId,startDate,endDate,context.branchId]:[context.tenantId,startDate,endDate])
        ,this.database.tenantQuery<{ branchId:string; name:string; target:string; sales:string }>(context.tenantId,`SELECT b.id AS "branchId",b.name,COALESCE((SELECT sum(g.sales_target) FROM branch_goals g WHERE g.tenant_id=$1 AND g.branch_id=b.id AND g.period_start<=$3 AND g.period_end>=$2),0)::text target,COALESCE((SELECT sum(s.total_amount) FROM sales s WHERE s.tenant_id=$1 AND s.branch_id=b.id AND s.status='sold' AND s.created_at::date BETWEEN $2 AND $3),0)::text sales FROM branches b WHERE b.tenant_id=$1 AND b.deleted_at IS NULL ${context.branchId?"AND b.id=$4":""} ORDER BY b.name`,context.branchId?[context.tenantId,startDate,endDate,context.branchId]:[context.tenantId,startDate,endDate])
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
      },
      salesHistory: salesHistory.rows,
      branchGoals: branchGoals.rows,
    };
  }
}
