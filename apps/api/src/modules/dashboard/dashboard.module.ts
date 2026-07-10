import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [DatabaseModule],
  controllers: [DashboardController],
  providers: [DashboardService, TenantContextGuard, PermissionsGuard]
})
export class DashboardModule {}
