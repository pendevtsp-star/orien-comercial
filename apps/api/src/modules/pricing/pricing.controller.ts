import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import {
  customerSegmentCreateSchema,
  pricePolicyCreateSchema,
  pricePolicyListQuerySchema,
  pricePolicyResolveQuerySchema,
  pricingApprovalDecisionSchema,
  pricingApprovalRequestSchema,
} from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { PricingService } from "./pricing.service";

@ApiTags("pricing")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("pricing")
export class PricingController {
  constructor(@Inject(PricingService) private readonly pricing: PricingService) {}

  @RequirePermissions(permissions.products.read)
  @Get("segments")
  listSegments(@CurrentTenant() tenant: TenantContext) {
    return this.pricing.listSegments(tenant);
  }

  @RequirePermissions(permissions.pricing.manage)
  @Post("segments")
  createSegment(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(customerSegmentCreateSchema)) body: never) {
    return this.pricing.createSegment(tenant, body);
  }

  @RequirePermissions(permissions.pricing.manage)
  @Get("policies")
  listPolicies(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(pricePolicyListQuerySchema)) query: never) {
    return this.pricing.listPolicies(tenant, query);
  }

  @RequirePermissions(permissions.pricing.manage)
  @Post("policies")
  createPolicy(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(pricePolicyCreateSchema)) body: never) {
    return this.pricing.createPolicy(tenant, body);
  }

  @RequirePermissions(permissions.pricing.manage)
  @Post("policies/:id/deactivate")
  deactivatePolicy(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.pricing.deactivatePolicy(tenant, id);
  }

  @RequirePermissions(permissions.products.read)
  @Get("resolve")
  resolve(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(pricePolicyResolveQuerySchema)) query: never) {
    return this.pricing.resolve(tenant, query);
  }

  @RequirePermissions(permissions.pricing.authorizeException)
  @Get("approvals")
  listApprovals(@CurrentTenant() tenant: TenantContext) {
    return this.pricing.listPendingApprovals(tenant);
  }

  @RequirePermissions(permissions.sales.create)
  @Post("approvals")
  requestApproval(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(pricingApprovalRequestSchema)) body: never) {
    return this.pricing.createApproval(tenant, body);
  }

  @RequirePermissions(permissions.pricing.authorizeException)
  @Post("approvals/:id/decision")
  decideApproval(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(pricingApprovalDecisionSchema)) body: never,
  ) {
    return this.pricing.decideApproval(tenant, id, body);
  }
}
