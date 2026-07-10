import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { importCommitSchema, importPreviewSchema } from "@sgc/types";
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
  @Post("preview") preview(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(importPreviewSchema)) body: never) { return this.service.preview(tenant, body); }
  @RequirePermissions(permissions.products.create, permissions.customers.create)
  @Post("commit") commit(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(importCommitSchema)) body: { jobId: string }) { return this.service.commit(tenant, body.jobId); }
}
