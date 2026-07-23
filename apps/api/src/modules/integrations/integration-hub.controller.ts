import { Controller, Get, Post, Query, UseGuards, Inject, Body } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { IntegrationHubService } from "./integration-hub.service";

@ApiTags("integrations")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("integrations/hub")
export class IntegrationHubController {
  constructor(
    @Inject(IntegrationHubService) private readonly hub: IntegrationHubService,
  ) {}

  @RequirePermissions(permissions.dashboard.read)
  @Get("health")
  checkHealth(@CurrentTenant() tenant: TenantContext) {
    return this.hub.checkIntegrationHealth(tenant);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("stats")
  getStats(@CurrentTenant() tenant: TenantContext) {
    return this.hub.getIntegrationStats(tenant);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("logs")
  getLogs(
    @CurrentTenant() tenant: TenantContext,
    @Query("provider") provider?: string,
    @Query("limit") limit?: string,
  ) {
    return this.hub.getIntegrationLogs(tenant, provider, Number(limit) || 50);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Post("bank-statement/import")
  importBankStatement(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { fileName: string; fileContent: string; branchId?: string },
  ) {
    return this.hub.importBankStatement(
      tenant,
      body.fileName,
      body.fileContent,
      body.branchId,
    );
  }
}
