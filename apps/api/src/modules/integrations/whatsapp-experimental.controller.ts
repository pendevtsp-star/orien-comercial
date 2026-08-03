import { Body, Controller, Delete, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { whatsappConsentSchema, whatsappTextMessageSchema } from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { WhatsAppExperimentalService } from "./whatsapp-experimental.service";

@ApiTags("whatsapp-experimental")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("integrations/whatsapp")
export class WhatsAppExperimentalController {
  constructor(@Inject(WhatsAppExperimentalService) private readonly whatsapp: WhatsAppExperimentalService) {}

  @RequirePermissions(permissions.integrations.read)
  @Get()
  list(@CurrentTenant() context: TenantContext) {
    return this.whatsapp.list(context);
  }

  @RequirePermissions(permissions.integrations.manage)
  @Post("connect")
  connect(
    @CurrentTenant() context: TenantContext,
    @Body(new ZodValidationPipe(whatsappConsentSchema)) body: { consent: true },
  ) {
    return this.whatsapp.connect(context, body);
  }

  @RequirePermissions(permissions.integrations.manage)
  @Post("reconnect")
  reconnect(@CurrentTenant() context: TenantContext) {
    return this.whatsapp.reconnect(context);
  }

  @RequirePermissions(permissions.integrations.manage)
  @Post("disconnect")
  disconnect(@CurrentTenant() context: TenantContext) {
    return this.whatsapp.disconnect(context);
  }

  @RequirePermissions(permissions.integrations.manage)
  @Delete("session")
  deleteSession(@CurrentTenant() context: TenantContext) {
    return this.whatsapp.deleteSession(context);
  }

  @RequirePermissions(permissions.integrations.manage)
  @Post("messages")
  sendText(
    @CurrentTenant() context: TenantContext,
    @Body(new ZodValidationPipe(whatsappTextMessageSchema)) body: never,
  ) {
    return this.whatsapp.sendText(context, body);
  }
}
