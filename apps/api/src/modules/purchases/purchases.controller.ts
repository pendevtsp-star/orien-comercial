import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { purchaseOrderCreateSchema, purchaseOrderReceiveSchema, resourceListQuerySchema } from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { PurchasesService } from "./purchases.service";

@ApiTags("purchases")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@RequirePermissions(permissions.stock.purchase)
@Controller("purchases")
export class PurchasesController {
  constructor(@Inject(PurchasesService) private readonly service: PurchasesService) {}
  @Get() list(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(resourceListQuerySchema)) query: never) { return this.service.list(tenant, query); }
  @Get(":id") get(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) { return this.service.get(tenant, id); }
  @Post() create(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(purchaseOrderCreateSchema)) body: never) { return this.service.create(tenant, body); }
  @Post(":id/approve") approve(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) { return this.service.approve(tenant, id); }
  @Post(":id/receive") receive(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body(new ZodValidationPipe(purchaseOrderReceiveSchema)) body: never) { return this.service.receive(tenant, id, body); }
}
