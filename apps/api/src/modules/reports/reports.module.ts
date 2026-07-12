import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({ imports: [DatabaseModule], controllers: [ReportsController], providers: [ReportsService, TenantContextGuard, PermissionsGuard] })
export class ReportsModule {}
