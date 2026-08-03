import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CustomersController, LeadsController],
  providers: [CustomersService, LeadsService, TenantContextGuard, PermissionsGuard],
})
export class CustomersModule {}
