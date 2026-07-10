import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ConfigModule } from "../config/config.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantContextGuard, PermissionsGuard]
})
export class TenantsModule {}
