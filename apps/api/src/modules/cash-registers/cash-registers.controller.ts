import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { cashRegisterCloseSchema, cashRegisterCurrentQuerySchema, cashRegisterOpenSchema } from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { CashRegistersService } from "./cash-registers.service";

@ApiTags("cash-registers")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("cash-registers")
export class CashRegistersController {
  constructor(@Inject(CashRegistersService) private readonly service: CashRegistersService) {}
  @RequirePermissions(permissions.sales.read)
  @Get("current") current(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(cashRegisterCurrentQuerySchema)) query: never) { return this.service.current(tenant, query); }
  @RequirePermissions(permissions.sales.create)
  @Post("open") open(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(cashRegisterOpenSchema)) body: never) { return this.service.open(tenant, body); }
  @RequirePermissions(permissions.sales.create)
  @Post(":id/close") close(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body(new ZodValidationPipe(cashRegisterCloseSchema)) body: never) { return this.service.close(tenant, id, body); }
}
