import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";
import { renderDocumentHtml, renderDocumentPdf, type DocumentRenderInput } from "@sgc/documents";
import type { TenantBranding } from "@sgc/documents";
import { reportFiltersSchema, type ReportFilters } from "@sgc/types";
import { loadTenantBranding } from "../../shared/tenant-branding";
import { ensureBranchAccess } from "../../shared/resource-access";
import {
  datasetToCsv,
  datasetToDocumentInput,
  type ReportDataset,
} from "./report-dataset";

type OverviewRow = { salesCount: number; grossRevenue: string; averageTicket: string; discounts: string };
type OverviewHealthRow = { grossMargin: string; overdueReceivables: string; lowStockProducts: string };
type ReportOverview = OverviewRow & Omit<OverviewHealthRow, "lowStockProducts"> & { customers: number; lowStockProducts: number; period: { startDate: string; endDate: string } };
type ReportKind = ReportDataset["kind"];

interface CommercialDocumentReportRow extends Record<string, string | number | null> {
  id: string;
  documentNumber: string;
  documentType: string;
  status: string;
  branchName: string;
  customerName: string;
  sellerName: string;
  totalAmount: string;
  validUntil: string;
  convertedSaleId: string | null;
  createdAt: string;
}

interface FinancialNetReportRow extends Record<string, string | number | null> {
  paymentId: string;
  saleId: string;
  branchName: string;
  sellerName: string;
  customerName: string;
  method: string;
  status: string;
  grossAmount: string;
  feeAmount: string | null;
  netAmount: string | null;
  acquirerName: string | null;
  cardBrand: string | null;
  expectedSettlementAt: string | null;
  createdAt: string;
}

const commercialDocumentColumns: ReportDataset["columns"] = [
  { key: "documentNumber", label: "Número", format: "text" },
  { key: "documentType", label: "Tipo", format: "text" },
  { key: "status", label: "Situação", format: "status" },
  { key: "branchName", label: "Loja", format: "text" },
  { key: "customerName", label: "Cliente", format: "text" },
  { key: "sellerName", label: "Vendedor", format: "text" },
  { key: "totalAmount", label: "Valor", format: "money" },
  { key: "validUntil", label: "Validade", format: "date" },
  { key: "createdAt", label: "Criado em", format: "datetime" },
];

const financialNetColumns: ReportDataset["columns"] = [
  { key: "createdAt", label: "Data", format: "datetime" },
  { key: "branchName", label: "Loja", format: "text" },
  { key: "saleId", label: "Venda", format: "text" },
  { key: "sellerName", label: "Vendedor", format: "text" },
  { key: "customerName", label: "Cliente", format: "text" },
  { key: "method", label: "Forma de pagamento", format: "text" },
  { key: "status", label: "Situação", format: "status" },
  { key: "acquirerName", label: "Adquirente", format: "text" },
  { key: "cardBrand", label: "Bandeira", format: "text" },
  { key: "grossAmount", label: "Bruto", format: "money" },
  { key: "feeAmount", label: "Taxa", format: "money-optional" },
  { key: "netAmount", label: "Líquido", format: "money-optional" },
  { key: "expectedSettlementAt", label: "Previsão", format: "date" },
];

const billingColumns: ReportDataset["columns"] = [
  { key: "documentNumber", label: "Número DAV", format: "text" },
  { key: "status", label: "Situação", format: "status" },
  { key: "billingStatus", label: "Status Faturamento", format: "text" },
  { key: "branchName", label: "Loja", format: "text" },
  { key: "customerName", label: "Cliente", format: "text" },
  { key: "sellerName", label: "Vendedor", format: "text" },
  { key: "totalAmount", label: "Valor DAV", format: "money" },
  { key: "saleAmount", label: "Valor Venda", format: "money-optional" },
  { key: "validUntil", label: "Validade", format: "date" },
  { key: "convertedAt", label: "Data Conversão", format: "datetime-optional" },
  { key: "createdAt", label: "Criado em", format: "datetime" },
];

const commissionByPaymentColumns: ReportDataset["columns"] = [
  { key: "sellerName", label: "Vendedor", format: "text" },
  { key: "branchName", label: "Loja", format: "text" },
  { key: "paymentMethod", label: "Forma de Pagamento", format: "text" },
  { key: "installments", label: "Parcelas", format: "text" },
  { key: "salesCount", label: "Vendas", format: "integer" },
  { key: "totalSalesAmount", label: "Valor Vendas", format: "money" },
  { key: "totalCommissionAmount", label: "Comissão Total", format: "money" },
  { key: "averageCommissionRate", label: "Taxa Média", format: "text" },
];

const reconciliationDefasagedColumns: ReportDataset["columns"] = [
  { key: "paymentId", label: "Pagamento", format: "text" },
  { key: "branchName", label: "Loja", format: "text" },
  { key: "sellerName", label: "Vendedor", format: "text" },
  { key: "customerName", label: "Cliente", format: "text" },
  { key: "paymentMethod", label: "Forma de Pagamento", format: "text" },
  { key: "paymentAmount", label: "Valor Pagamento", format: "money" },
  { key: "paymentDate", label: "Data Pagamento", format: "datetime" },
  { key: "settlementDate", label: "Data Liquidação", format: "datetime-optional" },
  { key: "reconciliationDate", label: "Data Conciliação", format: "datetime-optional" },
  { key: "defasagemDays", label: "Dias Defasados", format: "integer" },
  { key: "reconciliationStatus", label: "Status Conciliação", format: "text" },
  { key: "settlementStatus", label: "Status Liquidação", format: "text" },
];

const sellerPerformanceColumns: ReportDataset["columns"] = [
  { key: "sellerName", label: "Vendedor", format: "text" },
  { key: "branchName", label: "Loja", format: "text" },
  { key: "totalSales", label: "Valor Total Vendas", format: "money" },
  { key: "salesCount", label: "Qtd Vendas", format: "integer" },
  { key: "itemsCount", label: "Qtd Itens", format: "integer" },
  { key: "averageTicket", label: "Ticket Médio", format: "money" },
  { key: "salesTarget", label: "Meta", format: "money-optional" },
  { key: "targetPercentage", label: "% da Meta", format: "text" },
  { key: "targetDifference", label: "Diferença Meta", format: "money-optional" },
  { key: "customersCount", label: "Clientes Atendidos", format: "integer" },
  { key: "newCustomersCount", label: "Clientes Novos", format: "integer" },
  { key: "dailyPlan", label: "Plano Diário", format: "money-optional" },
];

const monthlyConsolidatedColumns: ReportDataset["columns"] = [
  { key: "saleDate", label: "Data", format: "datetime" },
  { key: "saleNumber", label: "NF", format: "text" },
  { key: "customerName", label: "Cliente", format: "text" },
  { key: "productName", label: "Produto", format: "text" },
  { key: "categoryName", label: "Categoria", format: "text" },
  { key: "quantity", label: "Quantidade", format: "integer" },
  { key: "unitPrice", label: "Preço Unit.", format: "money" },
  { key: "saleTotal", label: "Valor Total", format: "money" },
  { key: "commissionRate", label: "% Comissão", format: "text" },
  { key: "commissionValue", label: "Valor Comissão", format: "money" },
  { key: "sellerName", label: "Vendedor", format: "text" },
  { key: "paymentMethod", label: "Forma Pgto", format: "text" },
];

@Injectable()
export class ReportsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async dataset(
    context: TenantContext,
    kind: ReportDataset["kind"],
    rawFilters: unknown,
  ): Promise<ReportDataset> {
    const filters = reportFiltersSchema.parse(rawFilters);
    if (filters.branchId) ensureBranchAccess(context, filters.branchId);
    const branchId = context.branchId ?? filters.branchId ?? null;
    const period = resolveReportPeriod(filters);
    const timezone = await this.tenantTimezone(context.tenantId);
    if (kind === "commercial-documents") {
      return this.commercialDocumentsDataset(context, filters, branchId, period, timezone);
    }
    if (kind === "billing") {
      return this.billingDataset(context, filters, branchId, period, timezone);
    }
    if (kind === "commission-by-payment") {
      return this.commissionByPaymentDataset(context, filters, branchId, period, timezone);
    }
    if (kind === "reconciliation-defasaged") {
      return this.reconciliationDefasagedDataset(context, filters, branchId, period, timezone);
    }
    if (kind === "seller-performance") {
      return this.sellerPerformanceDataset(context, filters, branchId, period, timezone);
    }
    if (kind === "monthly-consolidated") {
      return this.monthlyConsolidatedDataset(context, filters, branchId, period, timezone);
    }
    if (kind === "executive-dashboard") {
      return this.executiveDashboardDataset(context, filters, branchId, period, timezone);
    }
    if (kind === "product-analysis") {
      return this.productAnalysisDataset(context, filters, branchId, period, timezone);
    }
    if (kind === "customer-analysis") {
      return this.customerAnalysisDataset(context, filters, branchId, period, timezone);
    }
    if (kind === "cash-flow") {
      return this.cashFlowDataset(context, filters, branchId, period, timezone);
    }
    return this.financialNetDataset(context, filters, branchId, period, timezone);
  }

  csv(dataset: ReportDataset) {
    return datasetToCsv(dataset);
  }

  html(dataset: ReportDataset, branding: TenantBranding) {
    return renderDocumentHtml(datasetToDocumentInput(dataset, branding));
  }

  pdf(dataset: ReportDataset, branding: TenantBranding) {
    return renderDocumentPdf(datasetToDocumentInput(dataset, branding));
  }

  branding(context: TenantContext) {
    return loadTenantBranding(this.database, context.tenantId);
  }

  private async tenantTimezone(tenantId: string) {
    const result = await this.database.tenantQuery<{ timezone: string | null }>(
      tenantId,
      `SELECT value->>'timezone' AS timezone
       FROM tenant_settings
       WHERE tenant_id = $1 AND key = 'regional' AND deleted_at IS NULL
       LIMIT 1`,
      [tenantId],
    );
    const timezone = result.rows[0]?.timezone;
    return validTimezone(timezone) ? timezone : "America/Sao_Paulo";
  }

  private async commercialDocumentsDataset(
    context: TenantContext,
    filters: ReportFilters,
    branchId: string | null,
    period: { startDate: string; endDate: string },
    timezone: string,
  ): Promise<ReportDataset> {
    assertReportStatus(filters.status, "commercial-documents");
    const params: unknown[] = [context.tenantId, timezone, period.startDate, period.endDate];
    const where = [
      "q.tenant_id = $1",
      "(q.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date",
    ];
    addFilter(where, params, "q.branch_id", branchId);
    addFilter(where, params, "q.seller_user_id", filters.sellerId);
    addFilter(where, params, "q.customer_id", filters.customerId);
    addFilter(where, params, "q.commercial_document_type", filters.documentType);
    addFilter(where, params, "q.status", filters.status);
    const result = await this.database.tenantQuery<CommercialDocumentReportRow>(
      context.tenantId,
      `SELECT q.id,
              q.document_number::text AS "documentNumber",
              q.commercial_document_type AS "documentType",
              q.status,
              b.name AS "branchName",
              COALESCE(c.name, 'Consumidor não informado') AS "customerName",
              COALESCE(u.name, 'Vendedor não informado') AS "sellerName",
              q.total_amount::text AS "totalAmount",
              q.valid_until::text AS "validUntil",
              q.converted_sale_id AS "convertedSaleId",
              q.created_at AS "createdAt"
       FROM quotes q
       JOIN branches b ON b.tenant_id = q.tenant_id AND b.id = q.branch_id
       LEFT JOIN customers c ON c.tenant_id = q.tenant_id AND c.id = q.customer_id
       LEFT JOIN users u ON u.id = q.seller_user_id
       WHERE ${where.join(" AND ")}
       ORDER BY q.created_at DESC, q.id DESC
       LIMIT 10000`,
      params,
    );
    const rows = result.rows.map((row) => ({ ...row }));
    return {
      kind: "commercial-documents",
      title: "Documentos comerciais",
      subtitle: "Orçamentos, pedidos e DAVs conforme os filtros autorizados.",
      generatedAt: new Date().toISOString(),
      timezone,
      period,
      scopeLabel: branchId ? "Filial selecionada" : "Todas as lojas",
      columns: commercialDocumentColumns,
      rows,
      summary: [
        { label: "Documentos", value: rows.length, format: "integer" },
        { label: "Convertidos", value: rows.filter((row) => row.status === "converted").length, format: "integer" },
        { label: "Valor total", value: sumMoney(rows, "totalAmount"), format: "money" },
      ],
      warnings: [],
    };
  }

  private async financialNetDataset(
    context: TenantContext,
    filters: ReportFilters,
    branchId: string | null,
    period: { startDate: string; endDate: string },
    timezone: string,
  ): Promise<ReportDataset> {
    assertReportStatus(filters.status, "financial-net");
    const params: unknown[] = [context.tenantId, timezone, period.startDate, period.endDate];
    const where = [
      "sp.tenant_id = $1",
      "(sp.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date",
    ];
    addFilter(where, params, "s.branch_id", branchId);
    addFilter(where, params, "s.seller_user_id", filters.sellerId);
    addFilter(where, params, "s.customer_id", filters.customerId);
    addFilter(where, params, "sp.status", filters.status);
    addFilter(where, params, "sp.acquirer_id", filters.acquirerId);
    if (filters.cardBrand) {
      params.push(filters.cardBrand);
      where.push(`lower(sp.brand) = $${params.length}`);
    }
    const result = await this.database.tenantQuery<FinancialNetReportRow>(
      context.tenantId,
      `SELECT sp.id AS "paymentId",
              s.id AS "saleId",
              b.name AS "branchName",
              COALESCE(u.name, 'Vendedor não informado') AS "sellerName",
              COALESCE(c.name, 'Consumidor não informado') AS "customerName",
              sp.method,
              sp.status,
              sp.gross_amount::text AS "grossAmount",
              sp.total_fee_amount::text AS "feeAmount",
              sp.net_amount::text AS "netAmount",
              pa.name AS "acquirerName",
              sp.brand AS "cardBrand",
              sp.expected_settlement_date::text AS "expectedSettlementAt",
              sp.created_at AS "createdAt"
       FROM sale_payments sp
       JOIN sales s ON s.tenant_id = sp.tenant_id AND s.id = sp.sale_id
       JOIN branches b ON b.tenant_id = s.tenant_id AND b.id = s.branch_id
       LEFT JOIN payment_acquirers pa ON pa.tenant_id = sp.tenant_id AND pa.id = sp.acquirer_id
       LEFT JOIN customers c ON c.tenant_id = s.tenant_id AND c.id = s.customer_id
       LEFT JOIN users u ON u.id = s.seller_user_id
       WHERE ${where.join(" AND ")}
       ORDER BY sp.created_at DESC, sp.id DESC
       LIMIT 10000`,
      params,
    );
    const rows = result.rows.map((row) => ({ ...row }));
    const missingSnapshots = rows.filter((row) => row.feeAmount === null || row.netAmount === null).length;
    return {
      kind: "financial-net",
      title: "Financeiro bruto, taxas e líquido",
      subtitle: "Valores registrados por pagamento, sem estimativas não homologadas.",
      generatedAt: new Date().toISOString(),
      timezone,
      period,
      scopeLabel: branchId ? "Filial selecionada" : "Todas as lojas",
      columns: financialNetColumns,
      rows,
      summary: [
        { label: "Pagamentos", value: rows.length, format: "integer" },
        { label: "Bruto", value: sumMoney(rows, "grossAmount"), format: "money" },
        { label: "Taxas registradas", value: sumMoney(rows, "feeAmount"), format: "money" },
        { label: "Líquido conhecido", value: sumMoney(rows, "netAmount"), format: "money" },
      ],
      warnings: missingSnapshots
        ? [`${missingSnapshots} pagamento(s) sem snapshot de taxa e líquido; esses campos permanecem não informados.`]
        : [],
    };
  }

  private async billingDataset(
    context: TenantContext,
    filters: ReportFilters,
    branchId: string | null,
    period: { startDate: string; endDate: string },
    timezone: string,
  ): Promise<ReportDataset> {
    const params: unknown[] = [context.tenantId, timezone, period.startDate, period.endDate];
    const where = [
      "q.tenant_id = $1",
      "q.commercial_document_type = 'dav'",
      "(q.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date",
    ];
    addFilter(where, params, "q.branch_id", branchId);
    addFilter(where, params, "q.seller_user_id", filters.sellerId);
    addFilter(where, params, "q.customer_id", filters.customerId);
    if (filters.status) {
      params.push(filters.status);
      where.push(`q.status = $${params.length}`);
    }
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT q.id,
              q.document_number::text AS "documentNumber",
              q.commercial_document_type AS "documentType",
              q.status,
              b.name AS "branchName",
              COALESCE(c.name, 'Consumidor não informado') AS "customerName",
              COALESCE(u.name, 'Vendedor não informado') AS "sellerName",
              q.total_amount::text AS "totalAmount",
              q.valid_until::text AS "validUntil",
              q.converted_sale_id AS "convertedSaleId",
              q.converted_at::text AS "convertedAt",
              q.created_at AS "createdAt",
              s.total_amount::text AS "saleAmount",
              s.created_at::text AS "saleDate",
              CASE
                WHEN q.status = 'converted' AND q.converted_sale_id IS NOT NULL THEN 'Faturada'
                WHEN q.status IN ('approved', 'reserved') THEN 'Pendente'
                WHEN q.status = 'draft' THEN 'Rascunho'
                ELSE 'Não faturável'
              END AS "billingStatus"
       FROM quotes q
       JOIN branches b ON b.tenant_id = q.tenant_id AND b.id = q.branch_id
       LEFT JOIN customers c ON c.tenant_id = q.tenant_id AND c.id = q.customer_id
       LEFT JOIN users u ON u.id = q.seller_user_id
       LEFT JOIN sales s ON s.tenant_id = q.tenant_id AND s.id = q.converted_sale_id
       WHERE ${where.join(" AND ")}
       ORDER BY q.created_at DESC, q.id DESC
       LIMIT 10000`,
      params,
    );
    const rows = result.rows.map((row) => ({ ...row }));
    const faturadas = rows.filter((row) => row.billingStatus === "Faturada");
    const pendentes = rows.filter((row) => row.billingStatus === "Pendente");
    return {
      kind: "billing",
      title: "Faturamento de DAVs",
      subtitle: "Documento Auxiliar de Venda: pendentes e faturadas no período.",
      generatedAt: new Date().toISOString(),
      timezone,
      period,
      scopeLabel: branchId ? "Filial selecionada" : "Todas as lojas",
      columns: billingColumns,
      rows,
      summary: [
        { label: "Total DAVs", value: rows.length, format: "integer" },
        { label: "Faturadas", value: faturadas.length, format: "integer" },
        { label: "Pendentes", value: pendentes.length, format: "integer" },
        { label: "Valor total DAVs", value: sumMoney(rows, "totalAmount"), format: "money" },
        { label: "Valor faturado", value: sumMoney(faturadas, "saleAmount"), format: "money" },
      ],
      warnings: [],
    };
  }

  private async commissionByPaymentDataset(
    context: TenantContext,
    filters: ReportFilters,
    branchId: string | null,
    period: { startDate: string; endDate: string },
    timezone: string,
  ): Promise<ReportDataset> {
    const params: unknown[] = [context.tenantId, timezone, period.startDate, period.endDate];
    const where = [
      "sc.tenant_id = $1",
      "sc.status = 'pending'",
      "(s.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date",
    ];
    addFilter(where, params, "s.branch_id", branchId);
    addFilter(where, params, "s.seller_user_id", filters.sellerId);
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT u.name AS "sellerName",
              b.name AS "branchName",
              COALESCE(sp.method, 'Não informado') AS "paymentMethod",
              COALESCE(sp.installments::text, '1') || 'x' AS "installments",
              count(DISTINCT sc.sale_id)::int AS "salesCount",
              sum(sp.amount)::text AS "totalSalesAmount",
              sum(sc.amount)::text AS "totalCommissionAmount",
              CASE WHEN sum(sc.base_amount) > 0 
                THEN ROUND((sum(sc.amount) / sum(sc.base_amount) * 100), 2)::text || '%'
                ELSE '0%' 
              END AS "averageCommissionRate"
       FROM seller_commissions sc
       JOIN sales s ON s.tenant_id = sc.tenant_id AND s.id = sc.sale_id
       LEFT JOIN sale_payments sp ON sp.tenant_id = sc.tenant_id AND sp.sale_id = sc.sale_id
       LEFT JOIN users u ON u.id = sc.user_id
       LEFT JOIN branches b ON b.tenant_id = sc.tenant_id AND b.id = s.branch_id
       WHERE ${where.join(" AND ")}
       GROUP BY u.name, b.name, sp.method, sp.installments
       ORDER BY u.name, sum(sc.amount) DESC`,
      params,
    );
    const rows = result.rows.map((row) => ({ ...row }));
    const totalCommission = rows.reduce((sum, row) => sum + Number(row.totalCommissionAmount ?? 0), 0);
    const totalSales = rows.reduce((sum, row) => sum + Number(row.totalSalesAmount ?? 0), 0);
    return {
      kind: "commission-by-payment",
      title: "Comissões por Forma de Pagamento",
      subtitle: "Comissões pendentes detalhadas por vendedor, forma de pagamento e parcelamento.",
      generatedAt: new Date().toISOString(),
      timezone,
      period,
      scopeLabel: branchId ? "Filial selecionada" : "Todas as lojas",
      columns: commissionByPaymentColumns,
      rows,
      summary: [
        { label: "Total vendedores", value: new Set(rows.map((r) => r.sellerName)).size, format: "integer" },
        { label: "Total vendas", value: rows.reduce((sum, r) => sum + (r.salesCount ?? 0), 0), format: "integer" },
        { label: "Valor vendas", value: totalSales.toFixed(2), format: "money" },
        { label: "Total comissões", value: totalCommission.toFixed(2), format: "money" },
      ],
      warnings: [],
    };
  }

  private async reconciliationDefasagedDataset(
    context: TenantContext,
    filters: ReportFilters,
    branchId: string | null,
    period: { startDate: string; endDate: string },
    timezone: string,
  ): Promise<ReportDataset> {
    const params: unknown[] = [context.tenantId, timezone, period.startDate, period.endDate];
    const where = [
      "sp.tenant_id = $1",
      "(sp.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date",
    ];
    addFilter(where, params, "sp.branch_id", branchId);
    addFilter(where, params, "s.seller_user_id", filters.sellerId);
    if (filters.status) {
      params.push(filters.status);
      where.push(`sp.reconciliation_status = $${params.length}`);
    }
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT sp.id AS "paymentId",
              b.name AS "branchName",
              COALESCE(u.name, 'Vendedor não informado') AS "sellerName",
              COALESCE(c.name, 'Consumidor não informado') AS "customerName",
              sp.method AS "paymentMethod",
              sp.amount::text AS "paymentAmount",
              sp.created_at AS "paymentDate",
              ps.effective_at AS "settlementDate",
              ri.effective_at AS "reconciliationDate",
              COALESCE(
                EXTRACT(DAY FROM COALESCE(ri.effective_at, ps.effective_at) - sp.created_at)::int,
                0
              ) AS "defasagemDays",
              sp.reconciliation_status AS "reconciliationStatus",
              sp.settlement_status AS "settlementStatus"
       FROM sale_payments sp
       JOIN sales s ON s.tenant_id = sp.tenant_id AND s.id = sp.sale_id
       LEFT JOIN branches b ON b.tenant_id = sp.tenant_id AND b.id = sp.branch_id
       LEFT JOIN users u ON u.id = s.seller_user_id
       LEFT JOIN customers c ON c.tenant_id = sp.tenant_id AND c.id = s.customer_id
       LEFT JOIN payment_settlements ps ON ps.tenant_id = sp.tenant_id AND ps.payment_id = sp.id AND ps.status = 'posted'
       LEFT JOIN reconciliation_items ri ON ri.tenant_id = sp.tenant_id AND ri.payment_id = sp.id
       WHERE ${where.join(" AND ")}
       ORDER BY sp.created_at DESC, sp.id DESC
       LIMIT 10000`,
      params,
    );
    const rows = result.rows.map((row) => ({ ...row }));
    const pendingReconciliation = rows.filter((r) => r.reconciliationStatus === "pending");
    const reconciled = rows.filter((r) => r.reconciliationStatus === "reconciled");
    const defasaged = rows.filter((r) => r.defasagemDays > 0);
    return {
      kind: "reconciliation-defasaged",
      title: "Conciliação e Defasagem",
      subtitle: "Pagamentos com status de conciliação e liquidação, incluindo análise de defasagem.",
      generatedAt: new Date().toISOString(),
      timezone,
      period,
      scopeLabel: branchId ? "Filial selecionada" : "Todas as lojas",
      columns: reconciliationDefasagedColumns,
      rows,
      summary: [
        { label: "Total pagamentos", value: rows.length, format: "integer" },
        { label: "Pendentes conciliação", value: pendingReconciliation.length, format: "integer" },
        { label: "Conciliados", value: reconciled.length, format: "integer" },
        { label: "Com defasagem", value: defasaged.length, format: "integer" },
        { label: "Defasagem média (dias)", value: defasaged.length > 0 ? (defasaged.reduce((sum, r) => sum + r.defasagemDays, 0) / defasaged.length).toFixed(1) : "0", format: "text" },
      ],
      warnings: defasaged.length > 0
        ? [`${defasaged.length} pagamento(s) com defasagem entre meses diferentes.`]
        : [],
    };
  }

  private async sellerPerformanceDataset(
    context: TenantContext,
    filters: ReportFilters,
    branchId: string | null,
    period: { startDate: string; endDate: string },
    timezone: string,
  ): Promise<ReportDataset> {
    const params: unknown[] = [context.tenantId, timezone, period.startDate, period.endDate];
    const where = [
      "s.tenant_id = $1",
      "s.status = 'sold'",
      "(s.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date",
    ];
    addFilter(where, params, "s.branch_id", branchId);
    addFilter(where, params, "s.seller_user_id", filters.sellerId);
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT u.name AS "sellerName",
              b.name AS "branchName",
              sum(s.total_amount)::text AS "totalSales",
              count(DISTINCT s.id)::int AS "salesCount",
              COALESCE(sum(si.quantity), 0)::int AS "itemsCount",
              CASE WHEN count(DISTINCT s.id) > 0
                THEN (sum(s.total_amount) / count(DISTINCT s.id))::numeric(12,2)::text
                ELSE '0'
              END AS "averageTicket",
              sg.sales_target::text AS "salesTarget",
              CASE WHEN sg.sales_target > 0
                THEN ROUND((sum(s.total_amount) / sg.sales_target * 100), 1)::text || '%'
                ELSE '-'
              END AS "targetPercentage",
              CASE WHEN sg.sales_target > 0
                THEN (sum(s.total_amount) - sg.sales_target)::numeric(12,2)::text
                ELSE NULL
              END AS "targetDifference",
              count(DISTINCT s.customer_id)::int AS "customersCount",
              0 AS "newCustomersCount",
              CASE WHEN sg.period_end > sg.period_start
                THEN (sg.sales_target / (sg.period_end - sg.period_start + 1))::numeric(12,2)::text
                ELSE NULL
              END AS "dailyPlan"
       FROM sales s
       LEFT JOIN sale_items si ON si.tenant_id = s.tenant_id AND si.sale_id = s.id
       LEFT JOIN users u ON u.id = s.seller_user_id
       LEFT JOIN branches b ON b.tenant_id = s.tenant_id AND b.id = s.branch_id
       LEFT JOIN seller_goals sg ON sg.tenant_id = s.tenant_id 
         AND sg.user_id = s.seller_user_id
         AND sg.period_start <= (s.created_at AT TIME ZONE $2)::date
         AND sg.period_end >= (s.created_at AT TIME ZONE $2)::date
       WHERE ${where.join(" AND ")}
       GROUP BY u.name, b.name, sg.sales_target, sg.period_start, sg.period_end
       ORDER BY sum(s.total_amount) DESC`,
      params,
    );
    const rows = result.rows.map((row) => ({ ...row }));
    const totalSales = rows.reduce((sum, r) => sum + Number(r.totalSales ?? 0), 0);
    const totalTarget = rows.reduce((sum, r) => sum + Number(r.salesTarget ?? 0), 0);
    return {
      kind: "seller-performance",
      title: "Performance por Vendedor",
      subtitle: "Desempenho de vendas por vendedor com meta e indicadores.",
      generatedAt: new Date().toISOString(),
      timezone,
      period,
      scopeLabel: branchId ? "Filial selecionada" : "Todas as lojas",
      columns: sellerPerformanceColumns,
      rows,
      summary: [
        { label: "Total vendedores", value: rows.length, format: "integer" },
        { label: "Total vendas", value: totalSales.toFixed(2), format: "money" },
        { label: "Total metas", value: totalTarget.toFixed(2), format: "money" },
        { label: "Atingimento geral", value: totalTarget > 0 ? (totalSales / totalTarget * 100).toFixed(1) + '%' : '-', format: "text" },
      ],
      warnings: totalTarget === 0
        ? ["Nenhuma meta cadastrada para o período selecionado."]
        : [],
    };
  }

  private async monthlyConsolidatedDataset(
    context: TenantContext,
    filters: ReportFilters,
    branchId: string | null,
    period: { startDate: string; endDate: string },
    timezone: string,
  ): Promise<ReportDataset> {
    const params: unknown[] = [context.tenantId, timezone, period.startDate, period.endDate];
    const where = [
      "s.tenant_id = $1",
      "s.status = 'sold'",
      "(s.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date",
    ];
    addFilter(where, params, "s.branch_id", branchId);
    addFilter(where, params, "s.seller_user_id", filters.sellerId);
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT s.created_at AS "saleDate",
              s.id::text AS "saleNumber",
              COALESCE(c.name, 'Consumidor') AS "customerName",
              COALESCE(p.name, 'Produto removido') AS "productName",
              COALESCE(pc.name, 'Sem categoria') AS "categoryName",
              si.quantity::int AS "quantity",
              si.unit_price::text AS "unitPrice",
              ((si.unit_price * si.quantity) - COALESCE(si.discount_amount, 0))::text AS "saleTotal",
              '0%' AS "commissionRate",
              '0' AS "commissionValue",
              u.name AS "sellerName",
              COALESCE(
                (SELECT sp.method FROM sale_payments sp WHERE sp.tenant_id = s.tenant_id AND sp.sale_id = s.id LIMIT 1),
                'Não informado'
              ) AS "paymentMethod"
       FROM sale_items si
       JOIN sales s ON s.tenant_id = si.tenant_id AND s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       LEFT JOIN customers c ON c.tenant_id = s.tenant_id AND c.id = s.customer_id
       LEFT JOIN users u ON u.id = s.seller_user_id
       WHERE ${where.join(" AND ")}
       ORDER BY u.name, s.created_at DESC, si.id`,
      params,
    );
    const rows = result.rows.map((row) => ({ ...row }));
    const totalValue = rows.reduce((sum, r) => sum + Number(r.saleTotal ?? 0), 0);
    return {
      kind: "monthly-consolidated",
      title: "Relatório Consolidado Mensal",
      subtitle: "Vendas detalhadas por vendedor com comissões e formas de pagamento.",
      generatedAt: new Date().toISOString(),
      timezone,
      period,
      scopeLabel: branchId ? "Filial selecionada" : "Todas as lojas",
      columns: monthlyConsolidatedColumns,
      rows,
      summary: [
        { label: "Total itens vendidos", value: rows.length, format: "integer" },
        { label: "Valor total vendas", value: totalValue.toFixed(2), format: "money" },
        { label: "Ticket médio", value: rows.length > 0 ? (totalValue / rows.length).toFixed(2) : "0", format: "money" },
      ],
      warnings: [],
    };
  }

  private async executiveDashboardDataset(
    context: TenantContext,
    filters: ReportFilters,
    branchId: string | null,
    period: { startDate: string; endDate: string },
    timezone: string,
  ): Promise<ReportDataset> {
    const params: unknown[] = [context.tenantId, timezone, period.startDate, period.endDate];
    const branchFilter = branchId ? " AND s.branch_id = $5" : "";
    if (branchId) params.push(branchId);
    
    const salesResult = await this.database.tenantQuery(
      context.tenantId,
      `SELECT 
        count(*)::int AS "totalSales",
        COALESCE(sum(s.total_amount), 0)::text AS "totalRevenue",
        COALESCE(avg(s.total_amount), 0)::text AS "averageTicket",
        COALESCE(sum(CASE WHEN s.created_at >= (NOW() - interval '7 days') THEN s.total_amount ELSE 0 END), 0)::text AS "last7DaysRevenue",
        COALESCE(sum(CASE WHEN s.created_at >= (NOW() - interval '30 days') THEN s.total_amount ELSE 0 END), 0)::text AS "last30DaysRevenue"
       FROM sales s 
       WHERE s.tenant_id = $1 AND s.status = 'sold' 
         AND (s.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date${branchFilter}`,
      params,
    );
    
    const customersResult = await this.database.tenantQuery(
      context.tenantId,
      `SELECT count(*)::int AS "totalCustomers",
        COALESCE(sum(CASE WHEN c.created_at >= (NOW() - interval '30 days') THEN 1 ELSE 0 END), 0)::int AS "newCustomers30Days"
       FROM customers c 
       WHERE c.tenant_id = $1 AND c.deleted_at IS NULL`,
      [context.tenantId],
    );
    
    const pendingResult = await this.database.tenantQuery(
      context.tenantId,
      `SELECT 
        COALESCE(sum(CASE WHEN sp.status = 'pending' THEN sp.amount ELSE 0 END), 0)::text AS "pendingPayments",
        COALESCE(sum(CASE WHEN sp.status = 'paid' THEN sp.amount ELSE 0 END), 0)::text AS "paidPayments"
       FROM sale_payments sp
       JOIN sales s ON s.tenant_id = sp.tenant_id AND s.id = sp.sale_id
       WHERE sp.tenant_id = $1 AND (sp.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date${branchFilter}`,
      params,
    );
    
    const topProductsResult = await this.database.tenantQuery(
      context.tenantId,
      `SELECT p.name AS "productName", sum(si.quantity)::int AS "totalQuantity", 
        sum((si.unit_price * si.quantity) - COALESCE(si.discount_amount, 0))::text AS "totalRevenue"
       FROM sale_items si
       JOIN sales s ON s.tenant_id = si.tenant_id AND s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE s.tenant_id = $1 AND s.status = 'sold'
         AND (s.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date${branchFilter}
       GROUP BY p.name
       ORDER BY sum((si.unit_price * si.quantity) - COALESCE(si.discount_amount, 0)) DESC
       LIMIT 5`,
      params,
    );
    
    const salesData = salesResult.rows[0] ?? { totalSales: 0, totalRevenue: "0", averageTicket: "0", last7DaysRevenue: "0", last30DaysRevenue: "0" };
    const customersData = customersResult.rows[0] ?? { totalCustomers: 0, newCustomers30Days: 0 };
    const pendingData = pendingResult.rows[0] ?? { pendingPayments: "0", paidPayments: "0" };
    
    return {
      kind: "executive-dashboard",
      title: "Dashboard Executivo",
      subtitle: "Visão consolidada do desempenho do negócio.",
      generatedAt: new Date().toISOString(),
      timezone,
      period,
      scopeLabel: branchId ? "Filial selecionada" : "Todas as lojas",
      columns: [
        { key: "metric", label: "Métrica", format: "text" },
        { key: "value", label: "Valor", format: "text" },
        { key: "trend", label: "Tendência", format: "text" },
      ],
      rows: [
        { metric: "Total de Vendas", value: salesData.totalSales, trend: "positive" },
        { metric: "Receita Total", value: `R$ ${Number(salesData.totalRevenue).toLocaleString("pt-BR")}`, trend: "positive" },
        { metric: "Ticket Médio", value: `R$ ${Number(salesData.averageTicket).toLocaleString("pt-BR")}`, trend: "neutral" },
        { metric: "Receita Últimos 7 dias", value: `R$ ${Number(salesData.last7DaysRevenue).toLocaleString("pt-BR")}`, trend: "positive" },
        { metric: "Receita Últimos 30 dias", value: `R$ ${Number(salesData.last30DaysRevenue).toLocaleString("pt-BR")}`, trend: "positive" },
        { metric: "Total de Clientes", value: customersData.totalCustomers, trend: "neutral" },
        { metric: "Novos Clientes (30 dias)", value: customersData.newCustomers30Days, trend: "positive" },
        { metric: "Pagamentos Pendentes", value: `R$ ${Number(pendingData.pendingPayments).toLocaleString("pt-BR")}`, trend: "warning" },
        { metric: "Pagamentos Recebidos", value: `R$ ${Number(pendingData.paidPayments).toLocaleString("pt-BR")}`, trend: "positive" },
      ],
      summary: [
        { label: "Receita Total", value: salesData.totalRevenue, format: "money" },
        { label: "Ticket Médio", value: salesData.averageTicket, format: "money" },
        { label: "Total Clientes", value: customersData.totalCustomers, format: "integer" },
        { label: "Pendentes", value: pendingData.pendingPayments, format: "money" },
      ],
      warnings: Number(pendingData.pendingPayments) > 0
        ? ["Existem pagamentos pendentes de liquidação."]
        : [],
    };
  }

  private async productAnalysisDataset(
    context: TenantContext,
    filters: ReportFilters,
    branchId: string | null,
    period: { startDate: string; endDate: string },
    timezone: string,
  ): Promise<ReportDataset> {
    const params: unknown[] = [context.tenantId, timezone, period.startDate, period.endDate];
    const branchFilter = branchId ? " AND s.branch_id = $5" : "";
    if (branchId) params.push(branchId);
    
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT 
        p.name AS "productName",
        p.sku,
        pc.name AS "categoryName",
        COALESCE(sum(si.quantity), 0)::int AS "totalQuantity",
        COALESCE(sum((si.unit_price * si.quantity) - COALESCE(si.discount_amount, 0)), 0)::text AS "totalRevenue",
        COALESCE(avg(si.unit_price), 0)::text AS "averagePrice",
        COALESCE(sb.quantity, 0)::int AS "currentStock",
        p.min_stock::int AS "minStock",
        CASE 
          WHEN COALESCE(sb.quantity, 0) <= 0 THEN 'Zerado'
          WHEN COALESCE(sb.quantity, 0) <= p.min_stock THEN 'Crítico'
          ELSE 'Saudável'
        END AS "stockStatus"
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       LEFT JOIN stock_balances sb ON sb.tenant_id = p.tenant_id AND sb.product_id = p.id
       LEFT JOIN sale_items si ON si.tenant_id = p.tenant_id AND si.product_id = p.id
       LEFT JOIN sales s ON s.tenant_id = si.tenant_id AND s.id = si.sale_id AND s.status = 'sold'
         AND (s.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date${branchFilter}
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND p.is_active = true
       GROUP BY p.id, p.name, p.sku, pc.name, sb.quantity, p.min_stock
       ORDER BY sum((si.unit_price * si.quantity) - COALESCE(si.discount_amount, 0)) DESC NULLS LAST`,
      params,
    );
    
    const rows = result.rows.map((row) => ({ ...row }));
    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.totalRevenue ?? 0), 0);
    const criticalProducts = rows.filter((r) => r.stockStatus === "Crítico").length;
    
    return {
      kind: "product-analysis",
      title: "Análise de Produtos",
      subtitle: "Desempenho de vendas e estoque por produto.",
      generatedAt: new Date().toISOString(),
      timezone,
      period,
      scopeLabel: branchId ? "Filial selecionada" : "Todas as lojas",
      columns: [
        { key: "productName", label: "Produto", format: "text" },
        { key: "sku", label: "SKU", format: "text" },
        { key: "categoryName", label: "Categoria", format: "text" },
        { key: "totalQuantity", label: "Qtd Vendida", format: "integer" },
        { key: "totalRevenue", label: "Receita", format: "money" },
        { key: "averagePrice", label: "Preço Médio", format: "money" },
        { key: "currentStock", label: "Estoque Atual", format: "integer" },
        { key: "minStock", label: "Estoque Mínimo", format: "integer" },
        { key: "stockStatus", label: "Status", format: "text" },
      ],
      rows,
      summary: [
        { label: "Total Produtos", value: rows.length, format: "integer" },
        { label: "Receita Total", value: totalRevenue.toFixed(2), format: "money" },
        { label: "Produtos Críticos", value: criticalProducts, format: "integer" },
      ],
      warnings: criticalProducts > 0 
        ? [`${criticalProducts} produto(s) com estoque abaixo do mínimo.`] 
        : [],
    };
  }

  private async customerAnalysisDataset(
    context: TenantContext,
    filters: ReportFilters,
    branchId: string | null,
    period: { startDate: string; endDate: string },
    timezone: string,
  ): Promise<ReportDataset> {
    const params: unknown[] = [context.tenantId, timezone, period.startDate, period.endDate];
    const branchFilter = branchId ? " AND s.branch_id = $5" : "";
    if (branchId) params.push(branchId);
    
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT 
        c.name AS "customerName",
        c.document AS "customerDocument",
        c.phone,
        count(DISTINCT s.id)::int AS "totalPurchases",
        COALESCE(sum(s.total_amount), 0)::text AS "totalValue",
        COALESCE(avg(s.total_amount), 0)::text AS "averageTicket",
        max(s.created_at)::date AS "lastPurchaseDate",
        CASE 
          WHEN max(s.created_at) >= (NOW() - interval '30 days') THEN 'Ativo'
          WHEN max(s.created_at) >= (NOW() - interval '90 days') THEN 'Regular'
          WHEN max(s.created_at) >= (NOW() - interval '180 days') THEN 'Em Risco'
          ELSE 'Inativo'
        END AS "customerStatus"
       FROM customers c
       LEFT JOIN sales s ON s.tenant_id = c.tenant_id AND s.customer_id = c.id AND s.status = 'sold'
         AND (s.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date${branchFilter}
       WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
       GROUP BY c.id, c.name, c.document, c.phone
       ORDER BY sum(s.total_amount) DESC NULLS LAST
       LIMIT 50`,
      params,
    );
    
    const rows = result.rows.map((row) => ({ ...row }));
    const totalCustomers = rows.length;
    const activeCustomers = rows.filter((r) => r.customerStatus === "Ativo").length;
    const totalValue = rows.reduce((sum, r) => sum + Number(r.totalValue ?? 0), 0);
    
    return {
      kind: "customer-analysis",
      title: "Análise de Clientes",
      subtitle: "Comportamento de compra e segmentação de clientes.",
      generatedAt: new Date().toISOString(),
      timezone,
      period,
      scopeLabel: branchId ? "Filial selecionada" : "Todas as lojas",
      columns: [
        { key: "customerName", label: "Cliente", format: "text" },
        { key: "customerDocument", label: "Documento", format: "text" },
        { key: "phone", label: "Telefone", format: "text" },
        { key: "totalPurchases", label: "Total Compras", format: "integer" },
        { key: "totalValue", label: "Valor Total", format: "money" },
        { key: "averageTicket", label: "Ticket Médio", format: "money" },
        { key: "lastPurchaseDate", label: "Última Compra", format: "date" },
        { key: "customerStatus", label: "Status", format: "text" },
      ],
      rows,
      summary: [
        { label: "Total Clientes", value: totalCustomers, format: "integer" },
        { label: "Clientes Ativos", value: activeCustomers, format: "integer" },
        { label: "Receita Total", value: totalValue.toFixed(2), format: "money" },
      ],
      warnings: [],
    };
  }

  private async cashFlowDataset(
    context: TenantContext,
    filters: ReportFilters,
    branchId: string | null,
    period: { startDate: string; endDate: string },
    timezone: string,
  ): Promise<ReportDataset> {
    const params: unknown[] = [context.tenantId, timezone, period.startDate, period.endDate];
    const branchFilter = branchId ? " AND ar.branch_id = $5" : "";
    if (branchId) params.push(branchId);
    
    const receivablesResult = await this.database.tenantQuery(
      context.tenantId,
      `SELECT 
        ar.due_date::text AS "date",
        'A Receber' AS "type",
        c.name AS "description",
        ar.amount::text AS "amount",
        ar.status
       FROM accounts_receivable ar
       LEFT JOIN customers c ON c.tenant_id = ar.tenant_id AND c.id = ar.customer_id
       WHERE ar.tenant_id = $1 
         AND (ar.due_date AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date${branchFilter}
       ORDER BY ar.due_date`,
      params,
    );
    
    const payablesResult = await this.database.tenantQuery(
      context.tenantId,
      `SELECT 
        ap.due_date::text AS "date",
        'A Pagar' AS "type",
        s.name AS "description",
        ap.amount::text AS "amount",
        ap.status
       FROM accounts_payable ap
       LEFT JOIN suppliers s ON s.tenant_id = ap.tenant_id AND s.id = ap.supplier_id
       WHERE ap.tenant_id = $1 
         AND (ap.due_date AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date${branchFilter}
       ORDER BY ap.due_date`,
      params,
    );
    
    const rows = [...receivablesResult.rows, ...payablesResult.rows]
      .sort((a, b) => a.date.localeCompare(b.date));
    
    const totalReceivable = receivablesResult.rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
    const totalPayable = payablesResult.rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
    
    return {
      kind: "cash-flow",
      title: "Fluxo de Caixa",
      subtitle: "Previsão de entradas e saídas por período.",
      generatedAt: new Date().toISOString(),
      timezone,
      period,
      scopeLabel: branchId ? "Filial selecionada" : "Todas as lojas",
      columns: [
        { key: "date", label: "Data", format: "date" },
        { key: "type", label: "Tipo", format: "text" },
        { key: "description", label: "Descrição", format: "text" },
        { key: "amount", label: "Valor", format: "money" },
        { key: "status", label: "Status", format: "text" },
      ],
      rows,
      summary: [
        { label: "Total a Receber", value: totalReceivable.toFixed(2), format: "money" },
        { label: "Total a Pagar", value: totalPayable.toFixed(2), format: "money" },
        { label: "Saldo Projetado", value: (totalReceivable - totalPayable).toFixed(2), format: "money" },
      ],
      warnings: totalReceivable < totalPayable 
        ? ["Atenção: Despesas maiores que receitas no período."] 
        : [],
    };
  }

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
    const result = await this.database.tenantQuery<OverviewRow>(
      context.tenantId,
      `
      SELECT count(*)::int AS "salesCount", COALESCE(sum(s.total_amount),0)::text AS "grossRevenue", COALESCE(avg(s.total_amount),0)::text AS "averageTicket",
      COALESCE(sum(0),0)::text AS "discounts"
      FROM sales s WHERE s.tenant_id=$1 AND s.status='sold' AND s.created_at BETWEEN $2 AND $3${branch}`,
      params,
    );
    const customers = await this.database.tenantQuery<{ total: number }>(
      context.tenantId,
      "SELECT count(*)::int AS total FROM customers WHERE tenant_id=$1 AND deleted_at IS NULL",
      [context.tenantId],
    );
    const health = await this.database.tenantQuery<OverviewHealthRow>(
      context.tenantId,
      `
      SELECT
        COALESCE((SELECT SUM((si.unit_price * si.quantity) - COALESCE(si.discount_amount, 0) - (p.cost_price * si.quantity))
          FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN products p ON p.id=si.product_id
          WHERE si.tenant_id=$1 AND s.status='sold' AND s.created_at BETWEEN $2 AND $3${branch}),0)::text AS "grossMargin",
        COALESCE((SELECT SUM(amount) FROM accounts_receivable WHERE tenant_id=$1 AND status IN ('open','overdue') AND due_date<CURRENT_DATE${context.branchId ? " AND branch_id=$4" : ""}),0)::text AS "overdueReceivables",
        COALESCE((SELECT count(*) FROM products p LEFT JOIN stock_balances sb ON sb.tenant_id=p.tenant_id AND sb.product_id=p.id ${context.branchId ? "AND sb.branch_id=$4" : ""}
          WHERE p.tenant_id=$1 AND p.deleted_at IS NULL ${context.branchId ? "AND (p.branch_id=$4 OR p.branch_id IS NULL)" : ""} AND COALESCE(sb.quantity,0)<=p.min_stock),0)::text AS "lowStockProducts"
      `,
      params,
    );
    return {
      period: { startDate: start.slice(0, 10), endDate: end.slice(0, 10) },
      ...result.rows[0],
      customers: customers.rows[0]?.total ?? 0,
      grossMargin: health.rows[0]?.grossMargin ?? "0",
      overdueReceivables: health.rows[0]?.overdueReceivables ?? "0",
      lowStockProducts: Number(health.rows[0]?.lowStockProducts ?? 0),
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
      `SELECT COALESCE(p.name,'Produto removido') AS "productName", sum(si.quantity)::text AS quantity, sum((si.unit_price * si.quantity) - COALESCE(si.discount_amount, 0))::text AS revenue
      FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN products p ON p.id=si.product_id
      WHERE s.tenant_id=$1 AND s.status='sold' AND s.created_at BETWEEN $2 AND $3${branch}
      GROUP BY p.name ORDER BY sum((si.unit_price * si.quantity) - COALESCE(si.discount_amount, 0)) DESC LIMIT 20`,
      params,
    );
    return {
      period: { startDate: start.slice(0, 10), endDate: end.slice(0, 10) },
      topProducts: rows.rows,
    };
  }

  async financial(context: TenantContext, startDate?: string, endDate?: string) {
    const { start, end } = this.period(startDate, endDate);
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
    const data = rawData as ReportOverview;
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
            {
              label: "Margem bruta",
              value: Number(data.grossMargin ?? 0).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              }),
            },
            {
              label: "Inadimplência",
              value: Number(data.overdueReceivables ?? 0).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              }),
            },
          ],
          contentHtml: `<p>Base ativa de clientes: <strong>${data.customers ?? 0}</strong>. Descontos concedidos: <strong>${Number(data.discounts ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>. Produtos em estoque crítico: <strong>${data.lowStockProducts ?? 0}</strong>.</p>`,
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
      if (key === "status") {
        const status = typeof value === "string" ? value : "-";
        return [key, statuses[status] ?? status];
      }
      return [key, value as string | number | null | undefined];
    }),
  );
}

function resolveReportPeriod(filters: ReportFilters) {
  const endDate = filters.endDate ?? new Date().toISOString().slice(0, 10);
  const startDate = filters.startDate ?? new Date(Date.parse(`${endDate}T00:00:00.000Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  const days = (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000;
  if (days < 0) throw new BadRequestException("A data final deve ser igual ou posterior à inicial.");
  if (days > 366) throw new BadRequestException("O período máximo para exportação é de 366 dias.");
  return { startDate, endDate };
}

function validTimezone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function addFilter(
  where: string[],
  params: unknown[],
  expression: string,
  value: string | null | undefined,
) {
  if (!value) return;
  params.push(value);
  where.push(`${expression} = $${params.length}`);
}

function assertReportStatus(status: ReportFilters["status"], kind: ReportKind) {
  if (!status) return;
  const allowed = kind === "commercial-documents"
    ? new Set(["draft", "sent", "approved", "reserved", "converted", "expired", "cancelled"])
    : new Set(["pending", "paid", "refunded", "cancelled"]);
  if (!allowed.has(status)) {
    throw new BadRequestException("A situação informada não pertence ao relatório selecionado.");
  }
}

function sumMoney(rows: Array<Record<string, string | number | null>>, key: string) {
  const cents = rows.reduce((total, row) => {
    const value = row[key];
    return value === null || value === undefined ? total : total + Math.round(Number(value) * 100);
  }, 0);
  return (cents / 100).toFixed(2);
}
