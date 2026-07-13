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
  fiscalReviewSchema,
} from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { FiscalService } from "./fiscal.service";

@ApiTags("fiscal")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("fiscal")
export class FiscalController {
  constructor(@Inject(FiscalService) private readonly fiscal: FiscalService) {}

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

  @RequirePermissions(permissions.fiscal.read)
  @Get("documents")
  documents(
    @CurrentTenant() context: TenantContext,
    @Query(new ZodValidationPipe(fiscalDocumentListQuerySchema)) query: never,
  ) {
    return this.fiscal.listDocuments(context, query);
  }

  @RequirePermissions(permissions.fiscal.read)
  @Get("documents/:id")
  document(@CurrentTenant() context: TenantContext, @Param("id") id: string) {
    return this.fiscal.getDocument(context, id);
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
