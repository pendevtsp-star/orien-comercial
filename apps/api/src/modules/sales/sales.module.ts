import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [DatabaseModule],
  controllers: [SalesController],
  providers: [SalesService, TenantContextGuard, PermissionsGuard]
})
export class SalesModule {}
