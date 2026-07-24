import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { IntegrationHubController } from "./integration-hub.controller";
import { IntegrationHubService } from "./integration-hub.service";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";

@Module({
  imports: [DatabaseModule],
  controllers: [IntegrationsController, IntegrationHubController],
  providers: [IntegrationsService, IntegrationHubService, PermissionsGuard, TenantContextGuard],
  exports: [IntegrationsService, IntegrationHubService],
})
export class IntegrationsModule {}
