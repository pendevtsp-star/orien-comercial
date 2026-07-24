import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { bulkStatusUpdateSchema, customerCreateSchema, customerUpdateSchema, resourceListQuerySchema } from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { CustomersService } from "./customers.service";

@ApiTags("customers")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("customers")
export class CustomersController {
  constructor(@Inject(CustomersService) private readonly customersService: CustomersService) {}

  @RequirePermissions(permissions.customers.read)
  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(resourceListQuerySchema)) query: never) {
    return this.customersService.list(tenant, query);
  }

  @RequirePermissions(permissions.customers.read)
  @Get(":id/history")
  history(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.customersService.history(tenant, id);
  }

  @RequirePermissions(permissions.customers.read)
  @Get(":id")
  get(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.customersService.get(tenant, id);
  }

  @RequirePermissions(permissions.customers.create)
  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(customerCreateSchema)) body: never) {
    return this.customersService.create(tenant, body);
  }

  @RequirePermissions(permissions.customers.update)
  @Post("bulk/status")
  bulkStatus(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(bulkStatusUpdateSchema)) body: never,
  ) {
    return this.customersService.bulkUpdateStatus(tenant, body);
  }

  @RequirePermissions(permissions.customers.update)
  @Patch(":id")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(customerUpdateSchema)) body: never
  ) {
    return this.customersService.update(tenant, id, body);
  }

  @RequirePermissions(permissions.customers.delete)
  @Delete(":id")
  remove(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.customersService.remove(tenant, id);
  }
}
