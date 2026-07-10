import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CustomersController],
  providers: [CustomersService, TenantContextGuard, PermissionsGuard]
})
export class CustomersModule {}
