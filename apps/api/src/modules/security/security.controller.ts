import { Controller, Get, Delete, Param, UseGuards, Inject, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { SecurityService } from "./security.service";

@ApiTags("security")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("security")
export class SecurityController {
  constructor(@Inject(SecurityService) private readonly security: SecurityService) {}

  @RequirePermissions(permissions.dashboard.read)
  @Get("summary")
  getSecuritySummary(@CurrentTenant() tenant: TenantContext) {
    return this.security.getSecuritySummary(tenant);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("events")
  getSecurityEvents(
    @CurrentTenant() tenant: TenantContext,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = Number(limit) || 100;
    return this.security.getSecurityEvents(tenant, parsedLimit);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("sessions")
  getActiveSessions(@CurrentTenant() tenant: TenantContext) {
    return this.security.getActiveSessions(tenant);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Delete("sessions/:id")
  revokeSession(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
  ) {
    return this.security.revokeSession(tenant, id);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Delete("sessions")
  revokeAllSessions(@CurrentTenant() tenant: TenantContext) {
    return this.security.revokeAllSessions(tenant, "");
  }
}
