import { Module } from "@nestjs/common";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { UpdatesController } from "./updates.controller";
import { UpdatesService } from "./updates.service";

@Module({
  controllers: [UpdatesController],
  providers: [UpdatesService, TenantContextGuard, PermissionsGuard],
})
export class UpdatesModule {}
