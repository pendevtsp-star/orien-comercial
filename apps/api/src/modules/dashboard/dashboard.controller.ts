import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboardService: DashboardService) {}

  @RequirePermissions(permissions.dashboard.read)
  @Get("summary")
  summary(@CurrentTenant() tenant: TenantContext) {
    return this.dashboardService.summary(tenant);
  }
}
