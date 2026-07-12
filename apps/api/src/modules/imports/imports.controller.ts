import { Body, Controller, Get, Inject, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { importCommitSchema, importPreviewSchema } from "@sgc/types";
import type { Response } from "express";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { ImportsService } from "./imports.service";

@ApiTags("imports")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("imports")
export class ImportsController {
  constructor(@Inject(ImportsService) private readonly service: ImportsService) {}
  @RequirePermissions(permissions.products.create, permissions.customers.create)
  @Get("template")
  async template(@Query("entityType") entityType: "products" | "customers" = "products", @Res() response: Response) {
    const buffer = await this.service.template(entityType === "customers" ? "customers" : "products");
    response.setHeader("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("content-disposition", `attachment; filename="orien-modelo-${entityType === "customers" ? "clientes" : "produtos"}.xlsx"`);
    response.send(buffer);
  }

  @RequirePermissions(permissions.products.create, permissions.customers.create)
  @Post("preview") preview(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(importPreviewSchema)) body: never) { return this.service.preview(tenant, body); }
  @RequirePermissions(permissions.products.create, permissions.customers.create)
  @Post("commit") commit(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(importCommitSchema)) body: { jobId: string; ignoreRejectedRows?: boolean }) { return this.service.commit(tenant, body.jobId, body.ignoreRejectedRows ?? false); }
}
