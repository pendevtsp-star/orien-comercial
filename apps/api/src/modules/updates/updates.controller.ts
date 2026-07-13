import { Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { UpdatesService } from "./updates.service";

@ApiTags("updates")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("updates")
export class UpdatesController {
  constructor(@Inject(UpdatesService) private readonly updatesService: UpdatesService) {}

  @Get()
  @RequirePermissions(permissions.dashboard.read)
  list(@CurrentTenant() context: TenantContext) {
    return this.updatesService.list(context);
  }

  @Patch(":id/read")
  @RequirePermissions(permissions.dashboard.read)
  markRead(@CurrentTenant() context: TenantContext, @Param("id") id: string) {
    return this.updatesService.markRead(context, id);
  }

  @Post("read-all")
  @RequirePermissions(permissions.dashboard.read)
  markAllRead(@CurrentTenant() context: TenantContext) {
    return this.updatesService.markAllRead(context);
  }
}
