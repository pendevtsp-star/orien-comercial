import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import type { Response } from "express";
import { z } from "zod";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { OperationsService } from "./operations.service";

const uuid = z.string().uuid();
const returnSchema = z.object({
  saleId: uuid,
  reason: z.string().min(3).max(300),
  refundMethod: z.enum(["original", "cash", "customer_credit"]),
  items: z.array(z.object({ saleItemId: uuid, quantity: z.coerce.number().positive() })).min(1),
});
const priceSchema = z.object({
  name: z.string().min(2),
  branchId: uuid.optional(),
  customerGroup: z.string().max(80).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  productId: uuid,
  minQuantity: z.coerce.number().positive(),
  fixedPrice: z.coerce.number().nonnegative().optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
});
const quoteSchema = z.object({
  branchId: uuid,
  customerId: uuid.optional(),
  validUntil: z.string(),
  notes: z.string().max(500).optional(),
  reserveStock: z.boolean().default(false),
  items: z
    .array(
      z.object({
        productId: uuid,
        quantity: z.coerce.number().positive(),
        unitPrice: z.coerce.number().nonnegative(),
        discountAmount: z.coerce.number().nonnegative().default(0),
      }),
    )
    .min(1),
});
const creditSchema = z.object({
  customerId: uuid,
  creditLimit: z.coerce.number().nonnegative(),
  blocked: z.boolean().default(false),
  blockReason: z.string().max(300).optional(),
});
const renegotiateSchema = z.object({
  customerId: uuid,
  originalAmount: z.coerce.number().positive(),
  negotiatedAmount: z.coerce.number().positive(),
  installments: z.coerce.number().int().min(1).max(48),
  firstDueDate: z.string(),
});

@ApiTags("operations")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("operations")
export class OperationsController {
  constructor(@Inject(OperationsService) private readonly service: OperationsService) {}
  @Get("overview") @RequirePermissions(permissions.dashboard.read) overview(
    @CurrentTenant() c: TenantContext,
  ) {
    return this.service.overview(c);
  }
  @Get("returns") @RequirePermissions(permissions.sales.read) returns(
    @CurrentTenant() c: TenantContext,
  ) {
    return this.service.returns(c);
  }
  @Post("returns") @RequirePermissions(permissions.sales.cancel) createReturn(
    @CurrentTenant() c: TenantContext,
    @Body(new ZodValidationPipe(returnSchema)) b: never,
  ) {
    return this.service.createReturn(c, b);
  }
  @Get("sales/:id/items") @RequirePermissions(permissions.sales.read) saleItems(
    @CurrentTenant() c: TenantContext,
    @Param("id") id: string,
  ) {
    return this.service.saleItems(c, id);
  }
  @Get("prices") @RequirePermissions(permissions.products.read) prices(
    @CurrentTenant() c: TenantContext,
  ) {
    return this.service.prices(c);
  }
  @Post("prices") @RequirePermissions(permissions.products.update) createPrice(
    @CurrentTenant() c: TenantContext,
    @Body(new ZodValidationPipe(priceSchema)) b: never,
  ) {
    return this.service.createPrice(c, b);
  }
  @Get("prices/resolve") @RequirePermissions(permissions.products.read) resolve(
    @CurrentTenant() c: TenantContext,
    @Query("productId") p: string,
    @Query("branchId") b: string,
    @Query("quantity") q: string,
    @Query("customerGroup") g?: string,
  ) {
    return this.service.resolvePrice(c, p, b, Number(q), g);
  }
  @Get("quotes") @RequirePermissions(permissions.sales.read) quotes(
    @CurrentTenant() c: TenantContext,
  ) {
    return this.service.quotes(c);
  }
  @Post("quotes") @RequirePermissions(permissions.sales.create) createQuote(
    @CurrentTenant() c: TenantContext,
    @Body(new ZodValidationPipe(quoteSchema)) b: never,
  ) {
    return this.service.createQuote(c, b);
  }
  @Post("quotes/:id/convert") @RequirePermissions(permissions.sales.create) convert(
    @CurrentTenant() c: TenantContext,
    @Param("id") id: string,
  ) {
    return this.service.convertQuote(c, id);
  }
  @Get("quotes/:id/document") @RequirePermissions(permissions.sales.read) async document(
    @CurrentTenant() c: TenantContext,
    @Param("id") id: string,
    @Res() r: Response,
  ) {
    r.type("html").send(await this.service.quoteDocument(c, id));
  }
  @Get("credit") @RequirePermissions(permissions.financial.read) credit(
    @CurrentTenant() c: TenantContext,
    @Query("customerId") id?: string,
  ) {
    return this.service.credit(c, id);
  }
  @Post("credit") @RequirePermissions(permissions.financial.reconcile) setCredit(
    @CurrentTenant() c: TenantContext,
    @Body(new ZodValidationPipe(creditSchema)) b: never,
  ) {
    return this.service.setCredit(c, b);
  }
  @Post("credit/renegotiate") @RequirePermissions(permissions.financial.reconcile) renegotiate(
    @CurrentTenant() c: TenantContext,
    @Body(new ZodValidationPipe(renegotiateSchema)) b: never,
  ) {
    return this.service.renegotiate(c, b);
  }
  @Get("analytics/abc") @RequirePermissions(permissions.dashboard.read) abc(
    @CurrentTenant() c: TenantContext,
    @Query("startDate") s?: string,
    @Query("endDate") e?: string,
  ) {
    return this.service.abc(c, s, e);
  }
  @Get("notifications") @RequirePermissions(permissions.dashboard.read) notifications(
    @CurrentTenant() c: TenantContext,
  ) {
    return this.service.notifications(c);
  }
  @Post("notifications/refresh") @RequirePermissions(permissions.dashboard.read) refresh(
    @CurrentTenant() c: TenantContext,
  ) {
    return this.service.refreshNotifications(c);
  }
  @Patch("notifications/:id/read") @RequirePermissions(permissions.dashboard.read) read(
    @CurrentTenant() c: TenantContext,
    @Param("id") id: string,
  ) {
    return this.service.readNotification(c, id);
  }
}
