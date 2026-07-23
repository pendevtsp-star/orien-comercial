import { Controller, Get, Query, UseGuards, Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { AnalyticsService } from "./analytics.service";

@ApiTags("analytics")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("analytics")
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}

  @RequirePermissions(permissions.dashboard.read)
  @Get("summary")
  getSummary(@CurrentTenant() tenant: TenantContext) {
    return this.analytics.getAnalyticsSummary(tenant);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("forecast")
  getForecast(
    @CurrentTenant() tenant: TenantContext,
    @Query("days") days?: string,
  ) {
    return this.analytics.getSalesForecast(tenant, Number(days) || 30);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("recommendations")
  getRecommendations(
    @CurrentTenant() tenant: TenantContext,
    @Query("productId") productId: string,
    @Query("limit") limit?: string,
  ) {
    return this.analytics.getProductRecommendations(tenant, productId, Number(limit) || 5);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("segments")
  getSegments(@CurrentTenant() tenant: TenantContext) {
    return this.analytics.getCustomerSegmentation(tenant);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("anomalies")
  getAnomalies(@CurrentTenant() tenant: TenantContext) {
    return this.analytics.detectAnomalies(tenant);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("trend")
  getTrend(
    @CurrentTenant() tenant: TenantContext,
    @Query("days") days?: string,
  ) {
    return this.analytics.getSalesTrend(tenant, Number(days) || 30);
  }
}
