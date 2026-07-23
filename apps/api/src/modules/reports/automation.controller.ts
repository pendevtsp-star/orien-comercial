import { Controller, Get, Post, Delete, Patch, Body, Param, UseGuards, Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { AutomationService } from "./automation.service";

@ApiTags("automation")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("automation")
export class AutomationController {
  constructor(@Inject(AutomationService) private readonly automation: AutomationService) {}

  // Scheduled Reports
  @RequirePermissions(permissions.dashboard.read)
  @Get("scheduled-reports")
  listScheduledReports(@CurrentTenant() tenant: TenantContext) {
    return this.automation.listScheduledReports(tenant);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Post("scheduled-reports")
  createScheduledReport(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: {
      name: string;
      reportType: string;
      frequency: string;
      dayOfWeek?: number;
      dayOfMonth?: number;
      hour?: number;
      minute?: number;
      recipients: string[];
      filters?: Record<string, unknown>;
    },
  ) {
    return this.automation.createScheduledReport(tenant, body);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Patch("scheduled-reports/:id")
  updateScheduledReport(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body() body: Partial<{
      name: string;
      frequency: string;
      recipients: string[];
      filters: Record<string, unknown>;
    }>,
  ) {
    return this.automation.updateScheduledReport(tenant, id, body);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Delete("scheduled-reports/:id")
  deleteScheduledReport(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
  ) {
    return this.automation.deleteScheduledReport(tenant, id);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Patch("scheduled-reports/:id/toggle")
  toggleScheduledReport(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
  ) {
    return this.automation.toggleScheduledReport(tenant, id);
  }
}
