import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { FinancialController } from "./financial.controller";
import { FinancialService } from "./financial.service";
import { FinancialSettlementsController } from "./financial-settlements.controller";
import { FinancialSettlementsService } from "./financial-settlements.service";

@Module({
  imports: [DatabaseModule],
  controllers: [FinancialController, FinancialSettlementsController],
  providers: [FinancialService, FinancialSettlementsService, TenantContextGuard, PermissionsGuard],
  exports: [FinancialSettlementsService],
})
export class FinancialModule {}
