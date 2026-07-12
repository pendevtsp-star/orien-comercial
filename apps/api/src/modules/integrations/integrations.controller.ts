import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { integrationCredentialSchema, integrationSettingsSchema } from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { IntegrationsService } from "./integrations.service";
@ApiTags("integrations") @UseGuards(JwtAuthGuard,TenantContextGuard,PermissionsGuard) @Controller("integrations") export class IntegrationsController { constructor(@Inject(IntegrationsService) private readonly service:IntegrationsService){} @RequirePermissions(permissions.tenants.read) @Get() list(@CurrentTenant() c:TenantContext){return this.service.list(c)} @RequirePermissions(permissions.tenants.update) @Put(":provider") save(@CurrentTenant() c:TenantContext,@Param("provider") provider:string,@Body(new ZodValidationPipe(integrationSettingsSchema)) body:never){return this.service.save(c,provider,body)} @RequirePermissions(permissions.tenants.update) @Put(":provider/credential") credential(@CurrentTenant() c:TenantContext,@Param("provider") provider:string,@Body(new ZodValidationPipe(integrationCredentialSchema)) body:never){return this.service.credential(c,provider,body.secret)} @RequirePermissions(permissions.tenants.update) @Post(":provider/test") test(@CurrentTenant() c:TenantContext,@Param("provider") provider:string){return this.service.test(c,provider)} }
