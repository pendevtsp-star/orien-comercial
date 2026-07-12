import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { branchGoalSchema, dashboardQuerySchema } from "@sgc/types";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboardService: DashboardService) {}

  @RequirePermissions(permissions.dashboard.read)
  @Get("summary")
  summary(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(dashboardQuerySchema)) query: never) {
    return this.dashboardService.summary(tenant, query);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("operational-status")
  operationalStatus(@CurrentTenant() tenant: TenantContext) {
    return this.dashboardService.operationalStatus(tenant);
  }

  @RequirePermissions(permissions.branches.update)
  @Post("goals")
  goal(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(branchGoalSchema)) body: never) {
    return this.dashboardService.setGoal(tenant, body);
  }
}
