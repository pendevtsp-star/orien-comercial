import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ConfigModule } from "../config/config.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";
import { CapabilitiesModule } from "../capabilities/capabilities.module";

@Module({
  imports: [ConfigModule, DatabaseModule, CapabilitiesModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantContextGuard, PermissionsGuard]
})
export class TenantsModule {}
