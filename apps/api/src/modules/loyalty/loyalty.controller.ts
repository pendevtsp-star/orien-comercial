import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant, CurrentUser } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { LoyaltyService } from "./loyalty.service";
@ApiTags("loyalty")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@RequirePermissions(permissions.customers.read)
@Controller("loyalty")
export class LoyaltyController {
  constructor(@Inject(LoyaltyService) private readonly service: LoyaltyService) {}
  @Get("overview") overview(@CurrentTenant() tenant: TenantContext) {
    return this.service.overview(tenant);
  }
  @Post("campaigns") campaign(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Body()
    body: {
      name: string;
      pointsPerReal?: number;
      branchId?: string;
      startsAt?: string;
      endsAt?: string;
      expiresInDays?: number;
      minimumSaleAmount?: number;
      productIds?: string[];
      categoryIds?: string[];
      maxRedemptionPoints?: number;
      approvalThresholdPoints?: number;
      automationType?: "birthday" | "first_purchase" | "inactivity";
      automationPoints?: number;
      inactivityDays?: number;
    },
  ) {
    return this.service.createCampaign(tenant, user.userId, body);
  }
  @Post("tiers") tier(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Body() body: { name: string; minimumPoints: number; multiplier?: number; benefits?: string },
  ) {
    return this.service.createTier(tenant, user.userId, body);
  }
  @Post("rewards") reward(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Body()
    body: {
      name: string;
      rewardType: "discount" | "coupon" | "cashback" | "bonus_product";
      pointsRequired: number;
      valueAmount?: number;
      productId?: string;
      couponCode?: string;
      endsAt?: string;
    },
  ) {
    return this.service.createReward(tenant, user.userId, body);
  }
  @Post("expire") expire(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.expirePoints(tenant, user.userId);
  }
  @Get("rewards/available")
  availableRewards(
    @CurrentTenant() tenant: TenantContext,
    @Query("customerId") customerId: string,
  ) {
    return this.service.availableRewards(tenant, customerId);
  }
  @Get("wallets") wallets(
    @CurrentTenant() tenant: TenantContext,
    @Query("search") search?: string,
  ) {
    return this.service.wallets(tenant, search);
  }
  @Post("award") award(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Body() body: { customerId: string; points: number; reason: string },
  ) {
    return this.service.award(tenant, user.userId, body);
  }
  @Post("redeem") redeem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Body() body: { customerId: string; points: number; reason: string },
  ) {
    return this.service.redeem(tenant, user.userId, body);
  }
}
