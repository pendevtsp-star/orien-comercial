import { Body, Controller, Get, Inject, Patch, Post, Query, Param, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { resourceListQuerySchema, supplierCreateSchema, supplierUpdateSchema } from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { SuppliersService } from "./suppliers.service";

@ApiTags("suppliers")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("suppliers")
export class SuppliersController {
  constructor(@Inject(SuppliersService) private readonly suppliers: SuppliersService) {}
  @RequirePermissions(permissions.stock.purchase)
  @Get() list(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(resourceListQuerySchema)) query: never) { return this.suppliers.list(tenant, query); }
  @RequirePermissions(permissions.stock.purchase)
  @Post() create(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(supplierCreateSchema)) body: never) { return this.suppliers.create(tenant, body); }
  @RequirePermissions(permissions.stock.purchase)
  @Patch(":id") update(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body(new ZodValidationPipe(supplierUpdateSchema)) body: never) { return this.suppliers.update(tenant, id, body); }
}
