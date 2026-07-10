import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import {
  financialListQuerySchema,
  financialCategorySchema,
  financialEntryCreateSchema,
  financialMarkPaidSchema,
  financialReconcileSchema,
} from "@sgc/types";
import type { Response } from "express";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { FinancialService } from "./financial.service";

@ApiTags("financial")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("financial")
export class FinancialController {
  constructor(@Inject(FinancialService) private readonly financialService: FinancialService) {}

  @RequirePermissions(permissions.financial.read)
  @Get("receivables")
  receivables(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(financialListQuerySchema)) query: never) {
    return this.financialService.list(tenant, "receivables", query);
  }

  @RequirePermissions(permissions.financial.read)
  @Get("payables")
  payables(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(financialListQuerySchema)) query: never) {
    return this.financialService.list(tenant, "payables", query);
  }

  @RequirePermissions(permissions.financial.receive)
  @Post("receivables")
  createReceivable(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(financialEntryCreateSchema)) body: never
  ) {
    return this.financialService.create(tenant, "receivables", body);
  }

  @RequirePermissions(permissions.financial.pay)
  @Post("payables")
  createPayable(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(financialEntryCreateSchema)) body: never
  ) {
    return this.financialService.create(tenant, "payables", body);
  }

  @RequirePermissions(permissions.financial.receive)
  @Patch("receivables/:id/pay")
  payReceivable(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(financialMarkPaidSchema)) body: never
  ) {
    return this.financialService.markPaid(tenant, "receivables", id, body);
  }

  @RequirePermissions(permissions.financial.pay)
  @Patch("payables/:id/pay")
  payPayable(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(financialMarkPaidSchema)) body: never
  ) {
    return this.financialService.markPaid(tenant, "payables", id, body);
  }

  @RequirePermissions(permissions.financial.categories)
  @Get("categories")
  categories(@CurrentTenant() tenant: TenantContext) {
    return this.financialService.listCategories(tenant);
  }

  @RequirePermissions(permissions.financial.categories)
  @Post("categories")
  createCategory(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(financialCategorySchema)) body: never) {
    return this.financialService.createCategory(tenant, body);
  }

  @RequirePermissions(permissions.financial.reconcile)
  @Patch("receivables/:id/reconcile")
  reconcileReceivable(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(financialReconcileSchema)) body: never
  ) {
    return this.financialService.reconcile(tenant, "receivables", id, body);
  }

  @RequirePermissions(permissions.financial.reconcile)
  @Patch("payables/:id/reconcile")
  reconcilePayable(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(financialReconcileSchema)) body: never
  ) {
    return this.financialService.reconcile(tenant, "payables", id, body);
  }

  @RequirePermissions(permissions.financial.read)
  @Get("cashflow")
  cashflow(@CurrentTenant() tenant: TenantContext) {
    return this.financialService.cashflow(tenant);
  }

  @RequirePermissions(permissions.financial.read)
  @Get("cashflow/document")
  async cashflowDocument(@CurrentTenant() tenant: TenantContext, @Res() response: Response) {
    response.type("html");
    response.send(await this.financialService.cashflowDocument(tenant));
  }
}
