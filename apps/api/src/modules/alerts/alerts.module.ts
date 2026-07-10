import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";

@Module({ imports:[DatabaseModule],controllers:[AlertsController],providers:[AlertsService,TenantContextGuard,PermissionsGuard] })
export class AlertsModule {}
