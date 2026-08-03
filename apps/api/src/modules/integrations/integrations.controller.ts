import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import {
  branchIntegrationOverrideSchema,
  integrationCredentialSchema,
  integrationSettingsSchema,
} from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { CapabilitiesGuard } from "../../shared/capabilities.guard";
import { RequireCapability } from "../../shared/require-capability.decorator";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { IntegrationsService } from "./integrations.service";

@ApiTags("integrations")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard, CapabilitiesGuard)
@RequireCapability("integrations")
@Controller("integrations")
export class IntegrationsController {
  constructor(@Inject(IntegrationsService) private readonly service: IntegrationsService) {}

  @RequirePermissions(permissions.integrations.read)
  @Get()
  list(@CurrentTenant() context: TenantContext) {
    return this.service.list(context);
  }

  @RequirePermissions(permissions.integrations.read)
  @Get("branches")
  branches(@CurrentTenant() context: TenantContext) {
    return this.service.branchOverrides(context);
  }

  @RequirePermissions(permissions.integrations.manage)
  @Put("branches/override")
  branchOverride(
    @CurrentTenant() context: TenantContext,
    @Body(new ZodValidationPipe(branchIntegrationOverrideSchema)) body: never,
  ) {
    return this.service.saveBranchOverride(context, body);
  }

  @RequirePermissions(permissions.integrations.manage)
  @Put(":provider")
  save(
    @CurrentTenant() context: TenantContext,
    @Param("provider") provider: string,
    @Body(new ZodValidationPipe(integrationSettingsSchema)) body: never,
  ) {
    return this.service.save(context, provider, body);
  }

  @RequirePermissions(permissions.integrations.manage)
  @Put(":provider/credential")
  credential(
    @CurrentTenant() context: TenantContext,
    @Param("provider") provider: string,
    @Body(new ZodValidationPipe(integrationCredentialSchema)) body: { secret: string },
  ) {
    return this.service.credential(context, provider, body.secret);
  }

  @RequirePermissions(permissions.integrations.manage)
  @Post(":provider/test")
  test(@CurrentTenant() context: TenantContext, @Param("provider") provider: string) {
    return this.service.test(context, provider);
  }
}
