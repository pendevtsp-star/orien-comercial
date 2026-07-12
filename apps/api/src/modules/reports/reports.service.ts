import { Inject, Injectable } from "@nestjs/common";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class ReportsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private period(startDate?: string, endDate?: string) {
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : new Date();
    const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : new Date(end.getTime() - 29 * 86400000);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async overview(context: TenantContext, startDate?: string, endDate?: string) {
    const { start, end } = this.period(startDate, endDate);
    const branch = context.branchId ? " AND s.branch_id=$4" : "";
    const params = context.branchId ? [context.tenantId, start, end, context.branchId] : [context.tenantId, start, end];
    const result = await this.database.tenantQuery(context.tenantId, `
      SELECT count(*)::int AS "salesCount", COALESCE(sum(s.total_amount),0)::text AS "grossRevenue", COALESCE(avg(s.total_amount),0)::text AS "averageTicket",
      COALESCE(sum(s.discount_amount),0)::text AS "discounts"
      FROM sales s WHERE s.tenant_id=$1 AND s.status='sold' AND s.created_at BETWEEN $2 AND $3${branch}`, params);
    const customers = await this.database.tenantQuery(context.tenantId, "SELECT count(*)::int AS total FROM customers WHERE tenant_id=$1 AND deleted_at IS NULL", [context.tenantId]);
    return { period: { startDate: start.slice(0, 10), endDate: end.slice(0, 10) }, ...result.rows[0], customers: customers.rows[0]?.total ?? 0 };
  }

  async sales(context: TenantContext, startDate?: string, endDate?: string) {
    const { start, end } = this.period(startDate, endDate);
    const branch = context.branchId ? " AND s.branch_id=$4" : "";
    const params = context.branchId ? [context.tenantId, start, end, context.branchId] : [context.tenantId, start, end];
    const rows = await this.database.tenantQuery(context.tenantId, `SELECT COALESCE(p.name,'Produto removido') AS "productName", sum(si.quantity)::text AS quantity, sum(si.total_amount)::text AS revenue
      FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN products p ON p.id=si.product_id
      WHERE s.tenant_id=$1 AND s.status='sold' AND s.created_at BETWEEN $2 AND $3${branch}
      GROUP BY p.name ORDER BY sum(si.total_amount) DESC LIMIT 20`, params);
    return { period: { startDate: start.slice(0,10), endDate: end.slice(0,10) }, topProducts: rows.rows };
  }

  async financial(context: TenantContext, startDate?: string, endDate?: string) {
    const { start, end } = this.period(startDate, endDate);
    const branch = context.branchId ? " AND f.branch_id=$4" : "";
    const params = context.branchId ? [context.tenantId, start, end, context.branchId] : [context.tenantId, start, end];
    const receivables = await this.database.tenantQuery(context.tenantId, `SELECT 'A receber' AS type, status, COALESCE(sum(amount),0)::text AS amount, count(*)::int AS count
      FROM accounts_receivable WHERE tenant_id=$1 AND due_date BETWEEN $2::date AND $3::date${context.branchId ? " AND branch_id=$4" : ""} GROUP BY status`, params);
    const payables = await this.database.tenantQuery(context.tenantId, `SELECT 'A pagar' AS type, status, COALESCE(sum(amount),0)::text AS amount, count(*)::int AS count
      FROM accounts_payable WHERE tenant_id=$1 AND due_date BETWEEN $2::date AND $3::date${context.branchId ? " AND branch_id=$4" : ""} GROUP BY status`, params);
    return { period: { startDate: start.slice(0,10), endDate: end.slice(0,10) }, entries: [...receivables.rows, ...payables.rows] };
  }

  async stock(context: TenantContext) {
    const branch = context.branchId ? " AND sb.branch_id=$2" : "";
    const params = context.branchId ? [context.tenantId, context.branchId] : [context.tenantId];
    const rows = await this.database.tenantQuery(context.tenantId, `SELECT p.name AS "productName", b.name AS "branchName", sb.quantity::text AS quantity, p.min_stock::text AS "minStock", (sb.quantity*p.cost_price)::text AS "stockValue"
      FROM stock_balances sb JOIN products p ON p.id=sb.product_id JOIN branches b ON b.id=sb.branch_id
      WHERE sb.tenant_id=$1${branch} ORDER BY sb.quantity <= p.min_stock DESC, p.name LIMIT 100`, params);
    return { items: rows.rows };
  }
}
