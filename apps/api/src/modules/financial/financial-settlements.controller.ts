import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import {
  financialForecastListQuerySchema,
  paymentAcquirerCreateSchema,
  paymentAcquirerUpdateSchema,
  paymentFeeRuleCreateSchema,
  paymentFeeRuleDeactivateSchema,
  paymentSettlementBatchSchema,
  paymentSettlementCreateSchema,
  paymentSettlementReverseSchema,
  paymentSnapshotsResolveSchema,
  reconciliationBatchCreateSchema,
} from "@sgc/types";
import type { PaymentSnapshotsResolveInput } from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { FinancialSettlementsService } from "./financial-settlements.service";

@ApiTags("financial-settlements")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("financial")
export class FinancialSettlementsController {
  constructor(@Inject(FinancialSettlementsService) private readonly service: FinancialSettlementsService) {}

  @RequirePermissions(permissions.financial.read)
  @Get("acquirers")
  acquirers(@CurrentTenant() tenant: TenantContext) {
    return this.service.listAcquirers(tenant);
  }

  @RequirePermissions(permissions.financial.reconcile)
  @Post("acquirers")
  createAcquirer(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(paymentAcquirerCreateSchema)) body: never) {
    return this.service.createAcquirer(tenant, body);
  }

  @RequirePermissions(permissions.financial.reconcile)
  @Patch("acquirers/:id")
  updateAcquirer(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body(new ZodValidationPipe(paymentAcquirerUpdateSchema)) body: never) {
    return this.service.updateAcquirer(tenant, id, body);
  }

  @RequirePermissions(permissions.financial.reconcile)
  @Post("acquirers/:id/deactivate")
  deactivateAcquirer(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.service.deactivateAcquirer(tenant, id);
  }

  @RequirePermissions(permissions.financial.read)
  @Get("fee-rules")
  feeRules(@CurrentTenant() tenant: TenantContext, @Query("acquirerId") acquirerId?: string) {
    return this.service.listFeeRules(tenant, acquirerId);
  }

  @RequirePermissions(permissions.financial.reconcile)
  @Post("fee-rules")
  createFeeRule(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(paymentFeeRuleCreateSchema)) body: never) {
    return this.service.createFeeRule(tenant, body);
  }

  @RequirePermissions(permissions.financial.reconcile)
  @Post("fee-rules/:id/deactivate")
  deactivateFeeRule(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(paymentFeeRuleDeactivateSchema)) body: never,
  ) {
    return this.service.deactivateFeeRule(tenant, id, body);
  }

  @RequirePermissions(permissions.financial.read)
  @Post("payment-snapshots/resolve")
  resolveSnapshots(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(paymentSnapshotsResolveSchema)) body: PaymentSnapshotsResolveInput,
  ) {
    return this.service.resolvePaymentSnapshots(tenant, body.payments);
  }

  @RequirePermissions(permissions.financial.read)
  @Get("settlement-forecasts")
  forecasts(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(financialForecastListQuerySchema)) query: never) {
    return this.service.listForecasts(tenant, query);
  }

  @RequirePermissions(permissions.financial.reconcile)
  @Post("settlements")
  createSettlement(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(paymentSettlementCreateSchema)) body: never) {
    return this.service.createSettlement(tenant, body);
  }

  @RequirePermissions(permissions.financial.reconcile)
  @Post("settlements/batch")
  createSettlementBatch(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(paymentSettlementBatchSchema)) body: never) {
    return this.service.createSettlementBatch(tenant, body);
  }

  @RequirePermissions(permissions.financial.reconcile)
  @Post("settlements/:id/reverse")
  reverseSettlement(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(paymentSettlementReverseSchema)) body: never,
  ) {
    return this.service.reverseSettlement(tenant, id, body);
  }

  @RequirePermissions(permissions.financial.reconcile)
  @Post("reconciliation-batches")
  createReconciliationBatch(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(reconciliationBatchCreateSchema)) body: never,
  ) {
    return this.service.createReconciliationBatch(tenant, body);
  }
}
