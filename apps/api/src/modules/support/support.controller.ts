import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import {
  supportTicketCreateSchema,
  supportTicketListQuerySchema,
  supportTicketMessageSchema,
  supportTicketStatusSchema,
  type SupportTicketListQuery,
} from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { SupportService } from "./support.service";

@ApiTags("support")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@RequirePermissions(permissions.dashboard.read)
@Controller("support")
export class SupportController {
  constructor(@Inject(SupportService) private readonly support: SupportService) {}

  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(supportTicketListQuerySchema)) query: SupportTicketListQuery,
  ) {
    return this.support.list(tenant, query);
  }

  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(supportTicketCreateSchema)) body: never,
  ) {
    return this.support.create(tenant, body);
  }

  @Get(":id")
  detail(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.support.detail(tenant, id);
  }

  @Post(":id/messages")
  message(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(supportTicketMessageSchema)) body: { body: string },
  ) {
    return this.support.addTenantMessage(tenant, id, body.body);
  }

  @Patch(":id/status")
  status(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(supportTicketStatusSchema)) body: { status: string },
  ) {
    return this.support.updateTenantStatus(tenant, id, body.status);
  }
}
