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
