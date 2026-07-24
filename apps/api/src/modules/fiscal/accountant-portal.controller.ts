import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import {
  accountantPortalAccessCreateSchema,
  accountantPortalExportQuerySchema,
  accountantPortalLoginRequestSchema,
  accountantPortalLoginVerifySchema,
  accountantPortalTokenSchema,
} from "@sgc/types";
import type { Request, Response } from "express";
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
  overview(@Query(new ZodValidationPipe(accountantPortalTokenSchema)) query: never, @Req() request: Request) {
    const input = query as { token?: string; sessionToken?: string; period?: string };
    return this.portal.portalOverview(
      { sessionToken: input.sessionToken },
      input.period,
      requestMeta(request),
    );
  }

  @Post("accountant-portal/login/request")
  requestCode(
    @Body(new ZodValidationPipe(accountantPortalLoginRequestSchema)) body: never,
    @Req() request: Request,
  ) {
    return this.portal.requestCode(body, requestMeta(request));
  }

  @Post("accountant-portal/login/verify")
  verifyCode(
    @Body(new ZodValidationPipe(accountantPortalLoginVerifySchema)) body: never,
    @Req() request: Request,
  ) {
    return this.portal.verifyCode(body, requestMeta(request));
  }

  @Get("accountant-portal/export")
  async export(
    @Query(new ZodValidationPipe(accountantPortalExportQuerySchema)) query: never,
    @Res({ passthrough: true }) response: Response,
    @Req() request: Request,
  ) {
    const input = query as { token?: string; sessionToken?: string; period?: string; format: "csv" | "pdf" | "xml" };
    const auth = { sessionToken: input.sessionToken };
    const filename = `orien-contador-${input.period ?? "competencia"}`;
    if (input.format === "pdf") {
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
      return new StreamableFile(await this.portal.portalPdf(auth, input.period, requestMeta(request)));
    }
    if (input.format === "xml") {
      response.setHeader("Content-Type", "application/zip");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}-xml.zip"`);
      return new StreamableFile(await this.portal.portalXmlZip(auth, input.period, requestMeta(request)));
    }
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    return new StreamableFile(await this.portal.portalCsv(auth, input.period, requestMeta(request)));
  }
}

function requestMeta(request: Request) {
  return {
    ipAddress: String(request.headers["x-forwarded-for"] ?? request.ip ?? "").split(",")[0]?.trim(),
    userAgent: request.headers["user-agent"],
  };
}
