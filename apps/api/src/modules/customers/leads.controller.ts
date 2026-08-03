import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { leadCreateSchema, leadUpdateSchema, resourceListQuerySchema } from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { LeadsService } from "./leads.service";

@ApiTags("leads")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("leads")
export class LeadsController {
  constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}
  @Get() @RequirePermissions(permissions.customers.read) list(
    @CurrentTenant() c: TenantContext,
    @Query(new ZodValidationPipe(resourceListQuerySchema)) q: never,
  ) {
    return this.leads.list(c, q);
  }
  @Post() @RequirePermissions(permissions.customers.create) create(
    @CurrentTenant() c: TenantContext,
    @Body(new ZodValidationPipe(leadCreateSchema)) b: never,
  ) {
    return this.leads.create(c, b);
  }
  @Patch(":id") @RequirePermissions(permissions.customers.update) update(
    @CurrentTenant() c: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(leadUpdateSchema)) b: never,
  ) {
    return this.leads.update(c, id, b);
  }
  @Post(":id/convert") @RequirePermissions(permissions.customers.create) convert(
    @CurrentTenant() c: TenantContext,
    @Param("id") id: string,
  ) {
    return this.leads.convert(c, id);
  }
}
