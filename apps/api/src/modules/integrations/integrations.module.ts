import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
@Module({
  imports: [DatabaseModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, PermissionsGuard, TenantContextGuard],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
