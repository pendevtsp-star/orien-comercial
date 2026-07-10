import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";

@Module({ imports: [DatabaseModule], controllers: [ImportsController], providers: [ImportsService, TenantContextGuard, PermissionsGuard] })
export class ImportsModule {}
