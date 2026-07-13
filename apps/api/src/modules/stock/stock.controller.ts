import { Body, Controller, Get, Inject, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import {
  inventoryCountCreateSchema,
  purchaseXmlCommitSchema,
  purchaseXmlPreviewSchema,
  purchaseEntryCreateSchema,
  stockAdjustmentSchema,
  stockListQuerySchema,
  stockMovementListQuerySchema,
  stockTransferCreateSchema
} from "@sgc/types";
import type { Response } from "express";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { StockService } from "./stock.service";

@ApiTags("stock")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("stock")
export class StockController {
  constructor(@Inject(StockService) private readonly stockService: StockService) {}

  @RequirePermissions(permissions.stock.read)
  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(stockListQuerySchema)) query: never) {
    return this.stockService.list(tenant, query);
  }

  @RequirePermissions(permissions.stock.adjust)
  @Post("adjustments")
  adjust(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(stockAdjustmentSchema)) body: never) {
    return this.stockService.adjust(tenant, body);
  }

  @RequirePermissions(permissions.stock.read)
  @Get("movements")
  movements(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(stockMovementListQuerySchema)) query: never) {
    return this.stockService.movements(tenant, query);
  }

  @RequirePermissions(permissions.stock.transfer)
  @Post("transfers")
  transfer(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(stockTransferCreateSchema)) body: never) {
    return this.stockService.transfer(tenant, body);
  }

  @RequirePermissions(permissions.stock.inventory)
  @Post("inventory-counts")
  inventory(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(inventoryCountCreateSchema)) body: never) {
    return this.stockService.inventory(tenant, body);
  }

  @RequirePermissions(permissions.stock.purchase)
  @Post("purchase-entries")
  purchaseEntry(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(purchaseEntryCreateSchema)) body: never) {
    return this.stockService.purchaseEntry(tenant, body);
  }

  @RequirePermissions(permissions.stock.purchase)
  @Post("purchase-imports/xml/preview")
  previewPurchaseXml(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(purchaseXmlPreviewSchema)) body: never) {
    return this.stockService.previewPurchaseXml(tenant, body);
  }

  @RequirePermissions(permissions.stock.purchase)
  @Post("purchase-imports/xml/commit")
  commitPurchaseXml(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(purchaseXmlCommitSchema)) body: never) {
    return this.stockService.commitPurchaseXml(tenant, body);
  }

  @RequirePermissions(permissions.stock.reports)
  @Get("reports")
  reports(@CurrentTenant() tenant: TenantContext) {
    return this.stockService.reports(tenant);
  }

  @RequirePermissions(permissions.stock.reports)
  @Get("reports/document")
  async reportsDocument(
    @CurrentTenant() tenant: TenantContext,
    @Query("kind") kind: "low-stock" | "slow-moving" | undefined,
    @Res() response: Response
  ) {
    response.type("html");
    response.send(await this.stockService.reportsDocument(tenant, kind === "slow-moving" ? "slow-moving" : "low-stock"));
  }
}
