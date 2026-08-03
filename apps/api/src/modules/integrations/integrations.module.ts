import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { IntegrationHubController } from "./integration-hub.controller";
import { IntegrationHubService } from "./integration-hub.service";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OperationsFoundationModule } from "../operations-foundation/operations-foundation.module";
import { WhatsAppExperimentalController } from "./whatsapp-experimental.controller";
import { WhatsAppExperimentalService } from "./whatsapp-experimental.service";

@Module({
  imports: [DatabaseModule, CapabilitiesModule, OperationsFoundationModule],
  controllers: [IntegrationsController, IntegrationHubController, WhatsAppExperimentalController],
  providers: [
    IntegrationsService,
    IntegrationHubService,
    WhatsAppExperimentalService,
    PermissionsGuard,
    TenantContextGuard,
  ],
  exports: [IntegrationsService, IntegrationHubService, WhatsAppExperimentalService],
})
export class IntegrationsModule {}
