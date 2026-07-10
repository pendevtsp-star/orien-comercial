import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";

@Module({
  imports: [DatabaseModule],
  controllers: [StockController],
  providers: [StockService, TenantContextGuard, PermissionsGuard]
})
export class StockModule {}
