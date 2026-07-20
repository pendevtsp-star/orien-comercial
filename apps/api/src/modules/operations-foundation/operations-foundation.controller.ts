import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentUser } from "../../shared/current-user.decorator";
import type { AuthUser } from "../../shared/request-context";
import { OperationsFoundationService } from "./operations-foundation.service";

@ApiTags("platform-operations")
@UseGuards(JwtAuthGuard)
@Controller("platform/operations")
export class OperationsFoundationController {
  constructor(@Inject(OperationsFoundationService) private readonly operations: OperationsFoundationService) {}

  private async operator(user: AuthUser) {
    await this.operations.assertPlatformOperator(user.userId);
  }

  @Get("feature-flags")
  async listFeatureFlags(@CurrentUser() user: AuthUser) {
    await this.operator(user);
    return this.operations.listFeatureFlags();
  }

  @Post("feature-flags")
  async upsertFeatureFlag(
    @CurrentUser() user: AuthUser,
    @Body() body: { key: string; description?: string; defaultEnabled: boolean },
  ) {
    await this.operator(user);
    return this.operations.upsertFeatureFlag(body);
  }

  @Post("feature-flags/:key/tenants/:tenantId")
  async setTenantFeatureFlag(
    @CurrentUser() user: AuthUser,
    @Param("key") key: string,
    @Param("tenantId") tenantId: string,
    @Body() body: { enabled: boolean },
  ) {
    await this.operator(user);
    return this.operations.setTenantFeatureFlag(tenantId, user.userId, { key, enabled: body.enabled });
  }

  @Get("feature-flags/:key/tenants/:tenantId")
  async resolveFeatureFlag(
    @CurrentUser() user: AuthUser,
    @Param("key") key: string,
    @Param("tenantId") tenantId: string,
  ) {
    await this.operator(user);
    return this.operations.resolveFeatureFlag(tenantId, key);
  }

  @Post("configuration-versions")
  async recordConfigurationVersion(
    @CurrentUser() user: AuthUser,
    @Body()
    body: { tenantId: string; branchId?: string | null; configurationKey: string; value: Record<string, unknown> },
  ) {
    await this.operator(user);
    return this.operations.recordConfigurationVersion({ ...body, actorUserId: user.userId });
  }

  @Post("jobs")
  async enqueueJob(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      tenantId?: string | null;
      type: string;
      payload?: Record<string, unknown>;
      idempotencyKey: string;
      availableAt?: string;
      maxAttempts?: number;
    },
  ) {
    await this.operator(user);
    return this.operations.enqueueJob({
      ...body,
      availableAt: body.availableAt ? new Date(body.availableAt) : undefined,
    });
  }

  @Get("jobs")
  async listJobs(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    await this.operator(user);
    return this.operations.listJobs(limit ? Number(limit) : undefined);
  }

  @Get("health")
  async health(@CurrentUser() user: AuthUser) {
    await this.operator(user);
    return this.operations.operationalHealth();
  }
}
