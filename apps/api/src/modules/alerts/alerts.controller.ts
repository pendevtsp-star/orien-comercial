import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { alertRuleSchema } from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { AlertsService } from "./alerts.service";

@ApiTags("alerts")
@UseGuards(JwtAuthGuard,TenantContextGuard,PermissionsGuard)
@RequirePermissions(permissions.dashboard.read)
@Controller("alerts")
export class AlertsController { constructor(@Inject(AlertsService)private readonly service:AlertsService){}
  @Get("rules") rules(@CurrentTenant()tenant:TenantContext){return this.service.rules(tenant);}
  @Post("rules") create(@CurrentTenant()tenant:TenantContext,@Body(new ZodValidationPipe(alertRuleSchema))body:never){return this.service.createRule(tenant,body);}
  @Get("events") events(@CurrentTenant()tenant:TenantContext){return this.service.events(tenant);}
  @Post("run") run(@CurrentTenant()tenant:TenantContext){return this.service.run(tenant);}
}
