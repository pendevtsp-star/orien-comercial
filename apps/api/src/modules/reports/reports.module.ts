import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { AutomationService } from "./automation.service";
import { AutomationController } from "./automation.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [ReportsController, AutomationController],
  providers: [ReportsService, AutomationService, TenantContextGuard, PermissionsGuard],
  exports: [AutomationService],
})
export class ReportsModule {}
