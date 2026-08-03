import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import {
  cashRegisterCloseSchema,
  cashRegisterCurrentQuerySchema,
  cashRegisterMovementSchema,
  cashRegisterOpenSchema,
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
import { CashRegistersService } from "./cash-registers.service";

@ApiTags("cash-registers")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard, CapabilitiesGuard)
@Controller("cash-registers")
@RequireCapability("cash")
export class CashRegistersController {
  constructor(@Inject(CashRegistersService) private readonly service: CashRegistersService) {}
  @RequirePermissions(permissions.cash.read)
  @Get()
  history(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(cashRegisterCurrentQuerySchema)) query: never,
  ) {
    return this.service.history(tenant, query);
  }
  @RequirePermissions(permissions.cash.read)
  @Get("current")
  current(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(cashRegisterCurrentQuerySchema)) query: never,
  ) {
    return this.service.current(tenant, query);
  }
  @RequirePermissions(permissions.cash.open)
  @Post("open")
  open(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(cashRegisterOpenSchema)) body: never,
  ) {
    return this.service.open(tenant, body);
  }
  @RequirePermissions(permissions.cash.close)
  @Post(":id/close")
  close(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cashRegisterCloseSchema)) body: never,
  ) {
    return this.service.close(tenant, id, body);
  }
  @RequirePermissions(permissions.cash.manage)
  @Post(":id/movements")
  movement(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cashRegisterMovementSchema)) body: never,
  ) {
    return this.service.movement(tenant, id, body);
  }
  @RequirePermissions(permissions.cash.read)
  @Get(":id/summary")
  summary(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.service.summary(tenant, id);
  }
  @RequirePermissions(permissions.cash.manage)
  @Post(":id/approve")
  approve(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.service.approve(tenant, id);
  }
}
