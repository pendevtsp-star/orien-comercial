import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import {
  auditLogListQuerySchema,
  inviteListQuerySchema,
  membershipListQuerySchema,
  membershipUpdateSchema,
  printerProfileSchema,
  printingSettingsSchema,
  rolePermissionsUpdateSchema,
  tenantBrandingSchema,
  userInviteSchema
} from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant, CurrentUser } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { AuthUser, TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { TenantsService } from "./tenants.service";

@ApiTags("tenants")
@Controller()
export class TenantsController {
  constructor(@Inject(TenantsService) private readonly tenantsService: TenantsService) {}

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.tenantsService.getMe(user.userId);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.tenants.read)
  @Get("tenants/current")
  current(@CurrentTenant() tenant: TenantContext) {
    return this.tenantsService.getCurrentTenant(tenant);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.tenants.read)
  @Get("tenants/current/branding")
  branding(@CurrentTenant() tenant: TenantContext) {
    return this.tenantsService.getBranding(tenant);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.tenants.update)
  @Patch("tenants/current/branding")
  updateBranding(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(tenantBrandingSchema)) body: never) {
    return this.tenantsService.updateBranding(tenant, body);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.branches.read)
  @Get("printing-settings")
  printingSettings(@CurrentTenant() tenant: TenantContext, @Query("branchId") branchId?: string) {
    return this.tenantsService.getPrintingSettings(tenant, branchId);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.branches.update)
  @Patch("printing-settings")
  updatePrintingSettings(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(printingSettingsSchema)) body: never
  ) {
    return this.tenantsService.updatePrintingSettings(tenant, body);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.branches.read)
  @Get("printer-profiles")
  printerProfiles(@CurrentTenant() tenant: TenantContext, @Query("branchId") branchId: string) {
    return this.tenantsService.listPrinterProfiles(tenant, branchId);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.branches.update)
  @Post("printer-profiles")
  savePrinterProfile(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(printerProfileSchema)) body: never) {
    return this.tenantsService.savePrinterProfile(tenant, body);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.branches.update)
  @Patch("printer-profiles/:id")
  updatePrinterProfile(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body(new ZodValidationPipe(printerProfileSchema.partial())) body: never) {
    return this.tenantsService.updatePrinterProfile(tenant, id, body);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.users.read)
  @Get("memberships")
  members(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(membershipListQuerySchema)) query: never) {
    return this.tenantsService.listMembers(tenant, query);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.users.manageMemberships)
  @Patch("memberships/:id")
  updateMembership(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(membershipUpdateSchema)) body: never
  ) {
    return this.tenantsService.updateMembership(tenant, id, body);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.users.read)
  @Get("invites")
  invites(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(inviteListQuerySchema)) query: never) {
    return this.tenantsService.listInvites(tenant, query);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.users.invite)
  @Post("invites")
  invite(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(userInviteSchema)) body: never) {
    return this.tenantsService.inviteMember(tenant, body);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.users.read)
  @Get("audit-logs")
  auditLogs(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(auditLogListQuerySchema)) query: never) {
    return this.tenantsService.listAuditLogs(tenant, query);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.users.read)
  @Get("roles")
  roles(@CurrentTenant() tenant: TenantContext) {
    return this.tenantsService.listRoles(tenant);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.users.manageRoles)
  @Patch("roles/:id/permissions")
  updateRolePermissions(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rolePermissionsUpdateSchema)) body: { permissions: string[] }
  ) {
    return this.tenantsService.updateRolePermissions(tenant, id, body.permissions);
  }
}
