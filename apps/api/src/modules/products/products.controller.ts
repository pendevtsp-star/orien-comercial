import {
  Body,
  Controller,
  Delete,
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
import {
  productBarcodeLookupSchema,
  productCreateSchema,
  productSkuSuggestionSchema,
  productUpdateSchema,
  resourceListQuerySchema,
} from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import type { Response } from "express";
import { ProductsService } from "./products.service";

@ApiTags("products")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("products")
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly productsService: ProductsService) {}

  @RequirePermissions(permissions.products.read)
  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(resourceListQuerySchema)) query: never,
  ) {
    return this.productsService.list(tenant, query);
  }

  @RequirePermissions(permissions.products.read)
  @Get("labels/print")
  async labels(
    @CurrentTenant() tenant: TenantContext,
    @Query("items") items: string | undefined,
    @Query("ids") legacyIds: string | undefined,
    @Query("size") size: string | undefined,
    @Query("autoprint") autoprint: string | undefined,
    @Res() response: Response,
  ) {
    response.type("html");
    response.send(
      await this.productsService.labels(
        tenant,
        items ?? legacyIds ?? "",
        size,
        autoprint !== "false",
      ),
    );
  }

  @RequirePermissions(permissions.products.read)
  @Get("barcode-lookup")
  barcodeLookup(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(productBarcodeLookupSchema)) query: never,
  ) {
    return this.productsService.lookupBarcode(tenant, (query as { barcode: string }).barcode);
  }

  @RequirePermissions(permissions.products.create)
  @Get("sku-suggestion")
  skuSuggestion(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(productSkuSuggestionSchema)) query: never,
  ) {
    return this.productsService.suggestSku(tenant, (query as { prefix?: string }).prefix);
  }

  @RequirePermissions(permissions.products.read)
  @Get("fiscal/summary")
  fiscalSummary(@CurrentTenant() tenant: TenantContext) {
    return this.productsService.fiscalSummary(tenant);
  }

  @RequirePermissions(permissions.products.read)
  @Get(":id")
  get(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.productsService.get(tenant, id);
  }

  @RequirePermissions(permissions.products.create)
  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(productCreateSchema)) body: never,
  ) {
    return this.productsService.create(tenant, body);
  }

  @RequirePermissions(permissions.products.update)
  @Patch(":id")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(productUpdateSchema)) body: never,
  ) {
    return this.productsService.update(tenant, id, body);
  }

  @RequirePermissions(permissions.products.delete)
  @Delete(":id")
  remove(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.productsService.remove(tenant, id);
  }

  @RequirePermissions(permissions.products.update)
  @Delete(":id/image")
  removeImage(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.productsService.removePrimaryImage(tenant, id);
  }
}
