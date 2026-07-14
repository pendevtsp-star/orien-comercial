import { Module } from "@nestjs/common";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { DatabaseModule } from "../database/database.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { FiscalController } from "./fiscal.controller";
import { FiscalWebhookController } from "./fiscal-webhook.controller";
import { FiscalOperationsService } from "./fiscal-operations.service";
import { FiscalService } from "./fiscal.service";
import { InboundFiscalService } from "./inbound-fiscal.service";

@Module({
  imports: [DatabaseModule, IntegrationsModule],
  controllers: [FiscalController, FiscalWebhookController],
  providers: [FiscalService, FiscalOperationsService, InboundFiscalService, PermissionsGuard, TenantContextGuard],
  exports: [FiscalService, InboundFiscalService],
})
export class FiscalModule {}
