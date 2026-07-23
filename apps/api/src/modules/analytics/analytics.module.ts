import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";

@Module({
  imports: [DatabaseModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, PermissionsGuard, TenantContextGuard],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
