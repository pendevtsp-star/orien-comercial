import { Controller, Get, Post, Body, UseGuards, Inject, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { AiAssistantService } from "./ai-assistant.service";

@ApiTags("ai-assistant")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("ai")
export class AiAssistantController {
  constructor(@Inject(AiAssistantService) private readonly ai: AiAssistantService) {}

  @RequirePermissions(permissions.dashboard.read)
  @Post("chat")
  chat(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { message: string },
  ) {
    return this.ai.chat(tenant, body.message);
  }

  @RequirePermissions(permissions.dashboard.read)
  @Get("help")
  getHelp(@Query("page") page: string) {
    return this.ai.getHelpForPage(page ?? "dashboard");
  }
}
