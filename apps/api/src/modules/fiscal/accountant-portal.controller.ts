import { Body, Controller, Get, Inject, Param, Post, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import {
  accountantPortalAccessCreateSchema,
  accountantPortalTokenSchema,
} from "@sgc/types";
import type { Response } from "express";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { AccountantPortalService } from "./accountant-portal.service";

@ApiTags("accountant-portal")
@Controller()
export class AccountantPortalController {
  constructor(@Inject(AccountantPortalService) private readonly portal: AccountantPortalService) {}

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.fiscal.review)
  @Get("fiscal/accounting/access")
  listAccess(@CurrentTenant() context: TenantContext) {
    return this.portal.list(context);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.fiscal.review)
  @Post("fiscal/accounting/access")
  createAccess(
    @CurrentTenant() context: TenantContext,
    @Body(new ZodValidationPipe(accountantPortalAccessCreateSchema)) body: never,
  ) {
    return this.portal.create(context, body);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.fiscal.review)
  @Post("fiscal/accounting/access/:id/revoke")
  revokeAccess(@CurrentTenant() context: TenantContext, @Param("id") id: string) {
    return this.portal.revoke(context, id);
  }

  @Get("accountant-portal/overview")
  overview(@Query(new ZodValidationPipe(accountantPortalTokenSchema)) query: never) {
    const input = query as { token: string; period?: string };
    return this.portal.portalOverview(input.token, input.period);
  }

  @Get("accountant-portal/export")
  async export(
    @Query(new ZodValidationPipe(accountantPortalTokenSchema)) query: never,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = query as { token: string; period?: string };
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="orien-contador-${input.period ?? "competencia"}.csv"`,
    );
    return new StreamableFile(await this.portal.portalCsv(input.token, input.period));
  }
}
