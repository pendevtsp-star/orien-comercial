import { Module } from "@nestjs/common";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { DatabaseModule } from "../database/database.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { FiscalController } from "./fiscal.controller";
import { FiscalService } from "./fiscal.service";

@Module({
  imports: [DatabaseModule, IntegrationsModule],
  controllers: [FiscalController],
  providers: [FiscalService, PermissionsGuard, TenantContextGuard],
  exports: [FiscalService],
})
export class FiscalModule {}
