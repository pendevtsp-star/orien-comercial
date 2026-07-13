import { Inject, Injectable } from "@nestjs/common";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";
import { renderDocumentHtml, renderDocumentPdf, type DocumentRenderInput } from "@sgc/documents";
import { loadTenantBranding } from "../../shared/tenant-branding";

@Injectable()
export class ReportsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private period(startDate?: string, endDate?: string) {
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : new Date();
    const start = startDate
      ? new Date(`${startDate}T00:00:00.000Z`)
      : new Date(end.getTime() - 29 * 86400000);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async overview(context: TenantContext, startDate?: string, endDate?: string) {
    const { start, end } = this.period(startDate, endDate);
    const branch = context.branchId ? " AND s.branch_id=$4" : "";
    const params = context.branchId
      ? [context.tenantId, start, end, context.branchId]
      : [context.tenantId, start, end];
    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT count(*)::int AS "salesCount", COALESCE(sum(s.total_amount),0)::text AS "grossRevenue", COALESCE(avg(s.total_amount),0)::text AS "averageTicket",
      COALESCE(sum(s.discount_amount),0)::text AS "discounts"
      FROM sales s WHERE s.tenant_id=$1 AND s.status='sold' AND s.created_at BETWEEN $2 AND $3${branch}`,
      params,
    );
    const customers = await this.database.tenantQuery(
      context.tenantId,
      "SELECT count(*)::int AS total FROM customers WHERE tenant_id=$1 AND deleted_at IS NULL",
      [context.tenantId],
    );
    return {
      period: { startDate: start.slice(0, 10), endDate: end.slice(0, 10) },
      ...result.rows[0],
      customers: customers.rows[0]?.total ?? 0,
    };
  }

  async sales(context: TenantContext, startDate?: string, endDate?: string) {
    const { start, end } = this.period(startDate, endDate);
    const branch = context.branchId ? " AND s.branch_id=$4" : "";
    const params = context.branchId
      ? [context.tenantId, start, end, context.branchId]
      : [context.tenantId, start, end];
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `SELECT COALESCE(p.name,'Produto removido') AS "productName", sum(si.quantity)::text AS quantity, sum(si.total_amount)::text AS revenue
      FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN products p ON p.id=si.product_id
      WHERE s.tenant_id=$1 AND s.status='sold' AND s.created_at BETWEEN $2 AND $3${branch}
      GROUP BY p.name ORDER BY sum(si.total_amount) DESC LIMIT 20`,
      params,
    );
    return {
      period: { startDate: start.slice(0, 10), endDate: end.slice(0, 10) },
      topProducts: rows.rows,
    };
  }

  async financial(context: TenantContext, startDate?: string, endDate?: string) {
    const { start, end } = this.period(startDate, endDate);
    const branch = context.branchId ? " AND f.branch_id=$4" : "";
    const params = context.branchId
      ? [context.tenantId, start, end, context.branchId]
      : [context.tenantId, start, end];
    const receivables = await this.database.tenantQuery(
      context.tenantId,
      `SELECT 'A receber' AS type, status, COALESCE(sum(amount),0)::text AS amount, count(*)::int AS count
      FROM accounts_receivable WHERE tenant_id=$1 AND due_date BETWEEN $2::date AND $3::date${context.branchId ? " AND branch_id=$4" : ""} GROUP BY status`,
      params,
    );
    const payables = await this.database.tenantQuery(
      context.tenantId,
      `SELECT 'A pagar' AS type, status, COALESCE(sum(amount),0)::text AS amount, count(*)::int AS count
      FROM accounts_payable WHERE tenant_id=$1 AND due_date BETWEEN $2::date AND $3::date${context.branchId ? " AND branch_id=$4" : ""} GROUP BY status`,
      params,
    );
    return {
      period: { startDate: start.slice(0, 10), endDate: end.slice(0, 10) },
      entries: [...receivables.rows, ...payables.rows],
    };
  }

  async stock(context: TenantContext) {
    const branch = context.branchId ? " AND sb.branch_id=$2" : "";
    const params = context.branchId ? [context.tenantId, context.branchId] : [context.tenantId];
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `SELECT p.name AS "productName", b.name AS "branchName", sb.quantity::text AS quantity, p.min_stock::text AS "minStock", (sb.quantity*p.cost_price)::text AS "stockValue"
      FROM stock_balances sb JOIN products p ON p.id=sb.product_id JOIN branches b ON b.id=sb.branch_id
      WHERE sb.tenant_id=$1${branch} ORDER BY sb.quantity <= p.min_stock DESC, p.name LIMIT 100`,
      params,
    );
    return { items: rows.rows };
  }

  async overviewDocument(context: TenantContext, startDate?: string, endDate?: string) {
    return renderDocumentHtml(await this.overviewDocumentInput(context, startDate, endDate));
  }

  async overviewDocumentPdf(context: TenantContext, startDate?: string, endDate?: string) {
    return renderDocumentPdf(await this.overviewDocumentInput(context, startDate, endDate));
  }

  private async overviewDocumentInput(context: TenantContext, startDate?: string, endDate?: string): Promise<DocumentRenderInput> {
    const [branding, rawData] = await Promise.all([
      loadTenantBranding(this.database, context.tenantId),
      this.overview(context, startDate, endDate),
    ]);
    const data = rawData as Record<string, any> & {
      period: { startDate: string; endDate: string };
    };
    return {
      title: "Relatório gerencial",
      subtitle: "Leitura executiva de vendas e relacionamento no período selecionado.",
      badge: "Orien Relatórios",
      branding,
      meta: [
        { label: "Período", value: `${data.period.startDate} a ${data.period.endDate}` },
        { label: "Escopo", value: context.branchId ? "Filial autorizada" : "Todas as lojas" },
        { label: "Emitido em", value: new Date().toLocaleString("pt-BR") },
      ],
      sections: [
        {
          title: "Resumo executivo",
          metrics: [
            { label: "Vendas", value: String(data.salesCount ?? 0) },
            {
              label: "Receita",
              value: Number(data.grossRevenue ?? 0).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              }),
            },
            {
              label: "Ticket médio",
              value: Number(data.averageTicket ?? 0).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              }),
            },
          ],
          contentHtml: `<p>Base ativa de clientes: <strong>${data.customers ?? 0}</strong>. Descontos concedidos: <strong>${Number(data.discounts ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>.</p>`,
        },
      ],
    };
  }

  async document(
    context: TenantContext,
    kind: "overview" | "sales" | "financial" | "stock",
    startDate?: string,
    endDate?: string,
  ) {
    if (kind === "overview") return this.overviewDocument(context, startDate, endDate);
    return renderDocumentHtml(await this.documentInput(context, kind, startDate, endDate));
  }

  async documentPdf(
    context: TenantContext,
    kind: "overview" | "sales" | "financial" | "stock",
    startDate?: string,
    endDate?: string,
  ) {
    if (kind === "overview") return this.overviewDocumentPdf(context, startDate, endDate);
    return renderDocumentPdf(await this.documentInput(context, kind, startDate, endDate));
  }

  private async documentInput(
    context: TenantContext,
    kind: "sales" | "financial" | "stock",
    startDate?: string,
    endDate?: string,
  ): Promise<DocumentRenderInput> {
    const [branding, data] = await Promise.all([
      loadTenantBranding(this.database, context.tenantId),
      kind === "sales"
        ? this.sales(context, startDate, endDate)
        : kind === "financial"
          ? this.financial(context, startDate, endDate)
          : this.stock(context),
    ]);
    const report = data as Record<string, unknown>;
    const rows = (
      kind === "sales" ? report.topProducts : kind === "financial" ? report.entries : report.items
    ) as Array<Record<string, unknown>>;
    const definitions = {
      sales: {
        title: "Relatório de vendas",
        subtitle: "Produtos vendidos e receita no período selecionado.",
        columns: [
          { key: "productName", label: "Produto" },
          { key: "quantity", label: "Quantidade" },
          { key: "revenue", label: "Receita" },
        ],
      },
      financial: {
        title: "Relatório financeiro",
        subtitle: "Situação de contas a receber e a pagar no período selecionado.",
        columns: [
          { key: "type", label: "Tipo" },
          { key: "status", label: "Situação" },
          { key: "amount", label: "Valor" },
          { key: "count", label: "Lançamentos" },
        ],
      },
      stock: {
        title: "Relatório de estoque",
        subtitle: "Saldo atual e estoque mínimo por produto e loja.",
        columns: [
          { key: "productName", label: "Produto" },
          { key: "branchName", label: "Loja" },
          { key: "quantity", label: "Quantidade" },
          { key: "minStock", label: "Estoque mínimo" },
          { key: "stockValue", label: "Valor em estoque" },
        ],
      },
    }[kind];
    return {
      title: definitions.title,
      subtitle: definitions.subtitle,
      badge: "Orien Relatórios",
      branding,
      meta: [
        {
          label: "Período",
          value:
            kind === "stock"
              ? "Posição atual"
              : `${startDate ?? "Últimos 30 dias"} a ${endDate ?? "Hoje"}`,
        },
        { label: "Escopo", value: context.branchId ? "Filial autorizada" : "Todas as lojas" },
        { label: "Emitido em", value: new Date().toLocaleString("pt-BR") },
      ],
      sections: [
        {
          title: definitions.title,
          table: { columns: definitions.columns, rows: rows.map((row) => formatDocumentRow(row)) },
        },
      ],
    };
  }
}

function formatDocumentRow(row: Record<string, unknown>) {
  const monetary = new Set(["revenue", "amount", "stockValue"]);
  const statuses: Record<string, string> = {
    open: "Em aberto",
    paid: "Pago",
    cancelled: "Cancelado",
    pending: "Pendente",
    reconciled: "Conciliado",
    diverged: "Com divergência",
  };
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (monetary.has(key))
        return [
          key,
          Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        ];
      if (key === "status") return [key, statuses[String(value)] ?? String(value ?? "-")];
      return [key, value as string | number | null | undefined];
    }),
  );
}
