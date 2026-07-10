import { Body, Controller, Get, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { asaasWebhookSchema, subscriptionCheckoutSchema } from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { SubscriptionsService } from "./subscriptions.service";

@ApiTags("subscriptions")
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(@Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService) {}

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.subscriptions.read)
  @Get("current")
  current(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionsService.current(tenant);
  }

  @UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
  @RequirePermissions(permissions.subscriptions.manage)
  @Post("checkout")
  checkout(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(subscriptionCheckoutSchema)) body: never) {
    return this.subscriptionsService.checkout(tenant, body);
  }

  @Post("webhooks/asaas")
  asaasWebhook(
    @Body(new ZodValidationPipe(asaasWebhookSchema)) body: never,
    @Headers("asaas-access-token") token?: string
  ) {
    return this.subscriptionsService.handleAsaasWebhook(body, token);
  }
}
