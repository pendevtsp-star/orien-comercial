import { Body, Controller, Get, Inject, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { saleCancelSchema, saleCreateSchema, salesListQuerySchema } from "@sgc/types";
import type { Response } from "express";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { SalesService } from "./sales.service";

@ApiTags("sales")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("sales")
export class SalesController {
  constructor(@Inject(SalesService) private readonly salesService: SalesService) {}

  @RequirePermissions(permissions.sales.read)
  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(salesListQuerySchema)) query: never) {
    return this.salesService.list(tenant, query);
  }

  @RequirePermissions(permissions.sales.create)
  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(saleCreateSchema)) body: never) {
    return this.salesService.create(tenant, body);
  }

  @RequirePermissions(permissions.sales.cancel)
  @Post(":id/cancel")
  cancel(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body(new ZodValidationPipe(saleCancelSchema)) body: never) {
    return this.salesService.cancel(tenant, id, body);
  }

  @RequirePermissions(permissions.sales.history)
  @Get(":id/history")
  history(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.salesService.history(tenant, id);
  }

  @RequirePermissions(permissions.sales.read)
  @Get(":id/document")
  async document(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Res() response: Response) {
    response.type("html");
    response.send(await this.salesService.document(tenant, id));
  }
}
