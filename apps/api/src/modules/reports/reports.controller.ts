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
  @Get("overview") overview(@CurrentTenant() tenant: TenantContext, @Query("startDate") startDate?: string, @Query("endDate") endDate?: string) { return this.reports.overview(tenant, startDate, endDate); }

  @RequirePermissions(permissions.sales.read)
  @Get("sales") sales(@CurrentTenant() tenant: TenantContext, @Query("startDate") startDate?: string, @Query("endDate") endDate?: string) { return this.reports.sales(tenant, startDate, endDate); }

  @RequirePermissions(permissions.financial.read)
  @Get("financial") financial(@CurrentTenant() tenant: TenantContext, @Query("startDate") startDate?: string, @Query("endDate") endDate?: string) { return this.reports.financial(tenant, startDate, endDate); }

  @RequirePermissions(permissions.stock.reports)
  @Get("stock") stock(@CurrentTenant() tenant: TenantContext) { return this.reports.stock(tenant); }

  @RequirePermissions(permissions.dashboard.read)
  @Get("overview/document") async overviewDocument(@CurrentTenant() tenant: TenantContext, @Query("startDate") startDate: string | undefined, @Query("endDate") endDate: string | undefined, @Res() response: Response) { response.type("html"); response.send(await this.reports.overviewDocument(tenant, startDate, endDate)); }
}
