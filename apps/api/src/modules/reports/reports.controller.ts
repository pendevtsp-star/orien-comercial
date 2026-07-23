import { Controller, Get, Inject, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ReportsService } from "./reports.service";

@ApiTags("reports")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("reports")
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @RequirePermissions(permissions.dashboard.read)
  @Get("overview")
  overview(
    @CurrentTenant() tenant: TenantContext,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.reports.overview(tenant, startDate, endDate);
  }

  @RequirePermissions(permissions.sales.read)
  @Get("sales")
  sales(
    @CurrentTenant() tenant: TenantContext,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.reports.sales(tenant, startDate, endDate);
  }

  @RequirePermissions(permissions.financial.read)
  @Get("financial")
  financial(
    @CurrentTenant() tenant: TenantContext,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.reports.financial(tenant, startDate, endDate);
  }

  @RequirePermissions(permissions.stock.reports)
  @Get("stock")
  stock(@CurrentTenant() tenant: TenantContext) {
    return this.reports.stock(tenant);
  }

  @RequirePermissions(permissions.sales.read)
  @Get("commercial-documents")
  commercialDocuments(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reports.dataset(tenant, "commercial-documents", query);
  }

  @RequirePermissions(permissions.sales.read)
  @Get("commercial-documents/csv")
  async commercialDocumentsCsv(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "commercial-documents", query);
    response.type("text/csv; charset=utf-8");
    response.setHeader("content-disposition", 'attachment; filename="orien-documentos-comerciais.csv"');
    response.send(this.reports.csv(dataset));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("commercial-documents/document")
  async commercialDocumentsDocument(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "commercial-documents", query);
    const branding = await this.reports.branding(tenant);
    response.type("html");
    response.send(this.reports.html(dataset, branding));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("commercial-documents/pdf")
  async commercialDocumentsPdf(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "commercial-documents", query);
    const branding = await this.reports.branding(tenant);
    response.type("application/pdf");
    response.setHeader("content-disposition", 'attachment; filename="orien-documentos-comerciais.pdf"');
    response.send(this.reports.pdf(dataset, branding));
  }

  @RequirePermissions(permissions.financial.read)
  @Get("financial-net")
  financialNet(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reports.dataset(tenant, "financial-net", query);
  }

  @RequirePermissions(permissions.financial.read)
  @Get("financial-net/csv")
  async financialNetCsv(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "financial-net", query);
    response.type("text/csv; charset=utf-8");
    response.setHeader("content-disposition", 'attachment; filename="orien-financeiro-liquido.csv"');
    response.send(this.reports.csv(dataset));
  }

  @RequirePermissions(permissions.financial.read)
  @Get("financial-net/document")
  async financialNetDocument(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "financial-net", query);
    const branding = await this.reports.branding(tenant);
    response.type("html");
    response.send(this.reports.html(dataset, branding));
  }

  @RequirePermissions(permissions.financial.read)
  @Get("financial-net/pdf")
  async financialNetPdf(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "financial-net", query);
    const branding = await this.reports.branding(tenant);
    response.type("application/pdf");
    response.setHeader("content-disposition", 'attachment; filename="orien-financeiro-liquido.pdf"');
    response.send(this.reports.pdf(dataset, branding));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("billing")
  billing(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reports.dataset(tenant, "billing", query);
  }

  @RequirePermissions(permissions.sales.read)
  @Get("billing/csv")
  async billingCsv(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "billing", query);
    response.type("text/csv; charset=utf-8");
    response.setHeader("content-disposition", 'attachment; filename="orien-faturamento-davs.csv"');
    response.send(this.reports.csv(dataset));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("billing/document")
  async billingDocument(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "billing", query);
    const branding = await this.reports.branding(tenant);
    response.type("html");
    response.send(this.reports.html(dataset, branding));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("billing/pdf")
  async billingPdf(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "billing", query);
    const branding = await this.reports.branding(tenant);
    response.type("application/pdf");
    response.setHeader("content-disposition", 'attachment; filename="orien-faturamento-davs.pdf"');
    response.send(this.reports.pdf(dataset, branding));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("commission-by-payment")
  commissionByPayment(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reports.dataset(tenant, "commission-by-payment", query);
  }

  @RequirePermissions(permissions.sales.read)
  @Get("commission-by-payment/csv")
  async commissionByPaymentCsv(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "commission-by-payment", query);
    response.type("text/csv; charset=utf-8");
    response.setHeader("content-disposition", 'attachment; filename="orien-comissoes-por-pagamento.csv"');
    response.send(this.reports.csv(dataset));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("commission-by-payment/document")
  async commissionByPaymentDocument(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "commission-by-payment", query);
    const branding = await this.reports.branding(tenant);
    response.type("html");
    response.send(this.reports.html(dataset, branding));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("commission-by-payment/pdf")
  async commissionByPaymentPdf(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "commission-by-payment", query);
    const branding = await this.reports.branding(tenant);
    response.type("application/pdf");
    response.setHeader("content-disposition", 'attachment; filename="orien-comissoes-por-pagamento.pdf"');
    response.send(this.reports.pdf(dataset, branding));
  }

  @RequirePermissions(permissions.financial.read)
  @Get("reconciliation-defasaged")
  reconciliationDefasaged(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reports.dataset(tenant, "reconciliation-defasaged", query);
  }

  @RequirePermissions(permissions.financial.read)
  @Get("reconciliation-defasaged/csv")
  async reconciliationDefasagedCsv(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "reconciliation-defasaged", query);
    response.type("text/csv; charset=utf-8");
    response.setHeader("content-disposition", 'attachment; filename="orien-conciliacao-defasagem.csv"');
    response.send(this.reports.csv(dataset));
  }

  @RequirePermissions(permissions.financial.read)
  @Get("reconciliation-defasaged/document")
  async reconciliationDefasagedDocument(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "reconciliation-defasaged", query);
    const branding = await this.reports.branding(tenant);
    response.type("html");
    response.send(this.reports.html(dataset, branding));
  }

  @RequirePermissions(permissions.financial.read)
  @Get("reconciliation-defasaged/pdf")
  async reconciliationDefasagedPdf(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "reconciliation-defasaged", query);
    const branding = await this.reports.branding(tenant);
    response.type("application/pdf");
    response.setHeader("content-disposition", 'attachment; filename="orien-conciliacao-defasagem.pdf"');
    response.send(this.reports.pdf(dataset, branding));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("seller-performance")
  sellerPerformance(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reports.dataset(tenant, "seller-performance", query);
  }

  @RequirePermissions(permissions.sales.read)
  @Get("seller-performance/csv")
  async sellerPerformanceCsv(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "seller-performance", query);
    response.type("text/csv; charset=utf-8");
    response.setHeader("content-disposition", 'attachment; filename="orien-performance-vendedores.csv"');
    response.send(this.reports.csv(dataset));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("seller-performance/document")
  async sellerPerformanceDocument(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "seller-performance", query);
    const branding = await this.reports.branding(tenant);
    response.type("html");
    response.send(this.reports.html(dataset, branding));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("seller-performance/pdf")
  async sellerPerformancePdf(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "seller-performance", query);
    const branding = await this.reports.branding(tenant);
    response.type("application/pdf");
    response.setHeader("content-disposition", 'attachment; filename="orien-performance-vendedores.pdf"');
    response.send(this.reports.pdf(dataset, branding));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("monthly-consolidated")
  monthlyConsolidated(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reports.dataset(tenant, "monthly-consolidated", query);
  }

  @RequirePermissions(permissions.sales.read)
  @Get("monthly-consolidated/csv")
  async monthlyConsolidatedCsv(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "monthly-consolidated", query);
    response.type("text/csv; charset=utf-8");
    response.setHeader("content-disposition", 'attachment; filename="orien-relatorio-mensal-consolidado.csv"');
    response.send(this.reports.csv(dataset));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("monthly-consolidated/document")
  async monthlyConsolidatedDocument(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "monthly-consolidated", query);
    const branding = await this.reports.branding(tenant);
    response.type("html");
    response.send(this.reports.html(dataset, branding));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("monthly-consolidated/pdf")
  async monthlyConsolidatedPdf(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "monthly-consolidated", query);
    const branding = await this.reports.branding(tenant);
    response.type("application/pdf");
    response.setHeader("content-disposition", 'attachment; filename="orien-relatorio-mensal-consolidado.pdf"');
    response.send(this.reports.pdf(dataset, branding));
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("executive-dashboard")
  executiveDashboard(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reports.dataset(tenant, "executive-dashboard", query);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("executive-dashboard/csv")
  async executiveDashboardCsv(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const dataset = await this.reports.dataset(tenant, "executive-dashboard", query);
    response.type("text/csv; charset=utf-8");
    response.setHeader("content-disposition", 'attachment; filename="orien-dashboard-executivo.csv"');
    response.send(this.reports.csv(dataset));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("product-analysis")
  productAnalysis(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reports.dataset(tenant, "product-analysis", query);
  }

  @RequirePermissions(permissions.sales.read)
  @Get("customer-analysis")
  customerAnalysis(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reports.dataset(tenant, "customer-analysis", query);
  }

  @RequirePermissions(permissions.financial.read)
  @Get("cash-flow")
  cashFlow(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reports.dataset(tenant, "cash-flow", query);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("overview/document")
  async overviewDocument(
    @CurrentTenant() tenant: TenantContext,
    @Query("startDate") startDate: string | undefined,
    @Query("endDate") endDate: string | undefined,
    @Res() response: Response,
  ) {
    response.type("html");
    response.send(await this.reports.overviewDocument(tenant, startDate, endDate));
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("overview/pdf")
  async overviewPdf(
    @CurrentTenant() tenant: TenantContext,
    @Query("startDate") startDate: string | undefined,
    @Query("endDate") endDate: string | undefined,
    @Res() response: Response,
  ) {
    response.type("application/pdf");
    response.setHeader("content-disposition", 'attachment; filename="orien-relatorio-gerencial.pdf"');
    response.send(await this.reports.overviewDocumentPdf(tenant, startDate, endDate));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("sales/document")
  async salesDocument(
    @CurrentTenant() tenant: TenantContext,
    @Query("startDate") startDate: string | undefined,
    @Query("endDate") endDate: string | undefined,
    @Res() response: Response,
  ) {
    response.type("html");
    response.send(await this.reports.document(tenant, "sales", startDate, endDate));
  }

  @RequirePermissions(permissions.sales.read)
  @Get("sales/pdf")
  async salesPdf(
    @CurrentTenant() tenant: TenantContext,
    @Query("startDate") startDate: string | undefined,
    @Query("endDate") endDate: string | undefined,
    @Res() response: Response,
  ) {
    response.type("application/pdf");
    response.setHeader("content-disposition", 'attachment; filename="orien-relatorio-vendas.pdf"');
    response.send(await this.reports.documentPdf(tenant, "sales", startDate, endDate));
  }

  @RequirePermissions(permissions.financial.read)
  @Get("financial/document")
  async financialDocument(
    @CurrentTenant() tenant: TenantContext,
    @Query("startDate") startDate: string | undefined,
    @Query("endDate") endDate: string | undefined,
    @Res() response: Response,
  ) {
    response.type("html");
    response.send(await this.reports.document(tenant, "financial", startDate, endDate));
  }

  @RequirePermissions(permissions.financial.read)
  @Get("financial/pdf")
  async financialPdf(
    @CurrentTenant() tenant: TenantContext,
    @Query("startDate") startDate: string | undefined,
    @Query("endDate") endDate: string | undefined,
    @Res() response: Response,
  ) {
    response.type("application/pdf");
    response.setHeader("content-disposition", 'attachment; filename="orien-relatorio-financeiro.pdf"');
    response.send(await this.reports.documentPdf(tenant, "financial", startDate, endDate));
  }

  @RequirePermissions(permissions.stock.reports)
  @Get("stock/document")
  async stockDocument(@CurrentTenant() tenant: TenantContext, @Res() response: Response) {
    response.type("html");
    response.send(await this.reports.document(tenant, "stock"));
  }

  @RequirePermissions(permissions.stock.reports)
  @Get("stock/pdf")
  async stockPdf(@CurrentTenant() tenant: TenantContext, @Res() response: Response) {
    response.type("application/pdf");
    response.setHeader("content-disposition", 'attachment; filename="orien-relatorio-estoque.pdf"');
    response.send(await this.reports.documentPdf(tenant, "stock"));
  }
}
