import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import {
  branchFiscalSettingsSchema,
  fiscalCancelSchema,
  fiscalCredentialSchema,
  fiscalDocumentListQuerySchema,
  fiscalIssueSchema,
  fiscalNumberVoidSchema,
  fiscalProductionActionSchema,
  fiscalReviewSchema,
  inboundFiscalListQuerySchema,
  inboundFiscalItemResolutionSchema,
  inboundFiscalManifestSchema,
  inboundFiscalReceiveSchema,
  accountingClosureSchema,
} from "@sgc/types";
import type { Response } from "express";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { FiscalService } from "./fiscal.service";
import { InboundFiscalService } from "./inbound-fiscal.service";

@ApiTags("fiscal")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("fiscal")
export class FiscalController {
  constructor(
    @Inject(FiscalService) private readonly fiscal: FiscalService,
    @Inject(InboundFiscalService) private readonly inboundFiscal: InboundFiscalService,
  ) {}

  @RequirePermissions(permissions.fiscal.read)
  @Get("inbound")
  inboundDocuments(
    @CurrentTenant() context: TenantContext,
    @Query(new ZodValidationPipe(inboundFiscalListQuerySchema)) query: never,
  ) {
    return this.inboundFiscal.list(context, query);
  }

  @RequirePermissions(permissions.fiscal.read)
  @Get("inbound/:id")
  inboundDocumentDetail(@CurrentTenant() context: TenantContext, @Param("id") id: string) {
    return this.inboundFiscal.detail(context, id);
  }

  @RequirePermissions(permissions.stock.purchase)
  @Put("inbound/:id/items/:itemId")
  resolveInboundDocumentItem(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(inboundFiscalItemResolutionSchema)) body: never,
  ) {
    return this.inboundFiscal.resolveItem(context, id, itemId, body);
  }

  @RequirePermissions(permissions.stock.purchase)
  @Post("inbound/:id/receive")
  receiveInboundDocument(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(inboundFiscalReceiveSchema)) body: never,
  ) {
    return this.inboundFiscal.receiveExisting(context, id, body);
  }

  @RequirePermissions(permissions.fiscal.read)
  @Get("inbound/:id/report")
  inboundDocumentReport(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    return this.inboundFiscal.reportHtml(context, id);
  }

  @RequirePermissions(permissions.fiscal.read)
  @Get("inbound/:id/export")
  async inboundDocumentExport(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="orien-conferencia-nfe-${id.slice(0, 8)}.csv"`);
    return new StreamableFile(Buffer.from(await this.inboundFiscal.reportCsv(context, id), "utf8"));
  }

  @RequirePermissions(permissions.stock.purchase)
  @Post("inbound/:id/manifest")
  manifestInbound(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(inboundFiscalManifestSchema)) body: never,
  ) {
    return this.inboundFiscal.manifest(context, id, body);
  }

  @RequirePermissions(permissions.fiscal.review)
  @Get("accounting/closures")
  accountingClosures(@CurrentTenant() context: TenantContext) {
    return this.inboundFiscal.closures(context);
  }

  @RequirePermissions(permissions.fiscal.review)
  @Get("accounting/package")
  async accountingPackage(
    @CurrentTenant() context: TenantContext,
    @Query(new ZodValidationPipe(accountingClosureSchema)) body: never,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = body as { period: string };
    response.setHeader("Content-Type", "application/zip");
    response.setHeader("Content-Disposition", `attachment; filename="orien-contabilidade-${input.period}.zip"`);
    return new StreamableFile(await this.inboundFiscal.accountingPackage(context, body));
  }

  @RequirePermissions(permissions.fiscal.review)
  @Post("accounting/close")
  closeAccountingPeriod(
    @CurrentTenant() context: TenantContext,
    @Body(new ZodValidationPipe(accountingClosureSchema)) body: never,
  ) {
    return this.inboundFiscal.closePeriod(context, body);
  }

  @RequirePermissions(permissions.fiscal.read)
  @Get("branches/:branchId/settings")
  settings(@CurrentTenant() context: TenantContext, @Param("branchId") branchId: string) {
    return this.fiscal.branchSettings(context, branchId);
  }

  @RequirePermissions(permissions.fiscal.configure)
  @Put("branches/:branchId/settings")
  saveSettings(
    @CurrentTenant() context: TenantContext,
    @Param("branchId") branchId: string,
    @Body(new ZodValidationPipe(branchFiscalSettingsSchema)) body: never,
  ) {
    return this.fiscal.saveBranchSettings(context, branchId, body);
  }

  @RequirePermissions(permissions.fiscal.configure)
  @Put("branches/:branchId/credentials")
  credentials(
    @CurrentTenant() context: TenantContext,
    @Param("branchId") branchId: string,
    @Body(new ZodValidationPipe(fiscalCredentialSchema)) body: never,
  ) {
    return this.fiscal.saveBranchCredentials(context, branchId, body);
  }

  @RequirePermissions(permissions.fiscal.read)
  @Get("branches/:branchId/readiness")
  readiness(@CurrentTenant() context: TenantContext, @Param("branchId") branchId: string) {
    return this.fiscal.readiness(context, branchId);
  }

  @RequirePermissions(permissions.fiscal.configure)
  @Post("branches/:branchId/webhook-token")
  webhookToken(@CurrentTenant() context: TenantContext, @Param("branchId") branchId: string) {
    return this.fiscal.rotateWebhookToken(context, branchId);
  }

  @RequirePermissions(permissions.fiscal.configure)
  @Post("branches/:branchId/production/request")
  requestProduction(
    @CurrentTenant() context: TenantContext,
    @Param("branchId") branchId: string,
    @Body(new ZodValidationPipe(fiscalProductionActionSchema)) body: never,
  ) {
    return this.fiscal.requestProduction(context, branchId, body);
  }

  @RequirePermissions(permissions.fiscal.activate)
  @Post("branches/:branchId/production/approve")
  approveProduction(
    @CurrentTenant() context: TenantContext,
    @Param("branchId") branchId: string,
    @Body(new ZodValidationPipe(fiscalProductionActionSchema)) body: never,
  ) {
    return this.fiscal.approveProduction(context, branchId, body);
  }

  @RequirePermissions(permissions.fiscal.activate)
  @Post("branches/:branchId/production/revoke")
  revokeProduction(
    @CurrentTenant() context: TenantContext,
    @Param("branchId") branchId: string,
    @Body(new ZodValidationPipe(fiscalProductionActionSchema)) body: never,
  ) {
    return this.fiscal.revokeProduction(context, branchId, body);
  }

  @RequirePermissions(permissions.fiscal.review)
  @Get("accounting/overview")
  accountingOverview(
    @CurrentTenant() context: TenantContext,
    @Query("branchId") branchId?: string,
  ) {
    return this.fiscal.accountingOverview(context, branchId);
  }

  @RequirePermissions(permissions.fiscal.review)
  @Get("accounting/export")
  async accountingExport(
    @CurrentTenant() context: TenantContext,
    @Res({ passthrough: true }) response: Response,
    @Query("branchId") branchId?: string,
  ) {
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", 'attachment; filename="orien-fiscal-contabilidade.csv"');
    return new StreamableFile(await this.fiscal.accountingExport(context, branchId));
  }

  @RequirePermissions(permissions.fiscal.read)
  @Get("documents")
  documents(
    @CurrentTenant() context: TenantContext,
    @Query(new ZodValidationPipe(fiscalDocumentListQuerySchema)) query: never,
  ) {
    return this.fiscal.listDocuments(context, query);
  }

  @RequirePermissions(permissions.fiscal.read)
  @Get("contingency")
  contingency(@CurrentTenant() context: TenantContext, @Query("branchId") branchId?: string) {
    return this.fiscal.contingencyQueue(context, branchId);
  }

  @RequirePermissions(permissions.fiscal.read)
  @Get("number-voids")
  numberVoids(@CurrentTenant() context: TenantContext, @Query("branchId") branchId?: string) {
    return this.fiscal.numberVoids(context, branchId);
  }

  @RequirePermissions(permissions.fiscal.read)
  @Get("documents/:id")
  document(@CurrentTenant() context: TenantContext, @Param("id") id: string) {
    return this.fiscal.getDocument(context, id);
  }

  @RequirePermissions(permissions.fiscal.read)
  @Get("documents/:id/artifacts/:kind")
  async artifact(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Param("kind") kind: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const artifact = await this.fiscal.artifact(context, id, kind);
    response.setHeader("Content-Type", artifact.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${artifact.filename}"`);
    return new StreamableFile(artifact.content);
  }

  @RequirePermissions(permissions.fiscal.issue)
  @Post("documents")
  issue(
    @CurrentTenant() context: TenantContext,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(fiscalIssueSchema)) body: never,
  ) {
    return this.fiscal.issueSale(context, body, idempotencyKey);
  }

  @RequirePermissions(permissions.fiscal.issue)
  @Get("sales/:saleId/precheck")
  precheckSale(@CurrentTenant() context: TenantContext, @Param("saleId") saleId: string) {
    return this.fiscal.precheckSale(context, saleId);
  }

  @RequirePermissions(permissions.fiscal.cancel)
  @Post("branches/:branchId/number-voids")
  voidNumbers(
    @CurrentTenant() context: TenantContext,
    @Param("branchId") branchId: string,
    @Body(new ZodValidationPipe(fiscalNumberVoidSchema)) body: never,
  ) {
    return this.fiscal.voidNumbers(context, branchId, body);
  }

  @RequirePermissions(permissions.fiscal.issue)
  @Post("documents/:id/sync")
  sync(@CurrentTenant() context: TenantContext, @Param("id") id: string) {
    return this.fiscal.sync(context, id);
  }

  @RequirePermissions(permissions.fiscal.issue)
  @Post("documents/:id/retry")
  retry(@CurrentTenant() context: TenantContext, @Param("id") id: string) {
    return this.fiscal.retry(context, id);
  }

  @RequirePermissions(permissions.fiscal.cancel)
  @Post("documents/:id/cancel")
  cancel(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(fiscalCancelSchema)) body: never,
  ) {
    return this.fiscal.cancel(context, id, body);
  }

  @RequirePermissions(permissions.fiscal.review)
  @Post("products/:productId/review")
  reviewProduct(
    @CurrentTenant() context: TenantContext,
    @Param("productId") productId: string,
    @Body(new ZodValidationPipe(fiscalReviewSchema)) body: never,
  ) {
    return this.fiscal.reviewProduct(context, productId, body);
  }

  @RequirePermissions(permissions.fiscal.review)
  @Post("branches/:branchId/review")
  reviewBranch(
    @CurrentTenant() context: TenantContext,
    @Param("branchId") branchId: string,
    @Body(new ZodValidationPipe(fiscalReviewSchema)) body: never,
  ) {
    return this.fiscal.reviewBranch(context, branchId, body);
  }
}
