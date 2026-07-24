import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";
import { FiscalModule } from "../fiscal/fiscal.module";
import { LoyaltyModule } from "../loyalty/loyalty.module";
import { PricingModule } from "../pricing/pricing.module";
import { SaleCompositionService } from "./sale-composition.service";
import { FinancialModule } from "../financial/financial.module";
import { SaleCommissionService } from "./sale-commission.service";

@Module({
  imports: [DatabaseModule, FiscalModule, PricingModule, LoyaltyModule, FinancialModule],
  controllers: [SalesController],
  providers: [SalesService, SaleCompositionService, SaleCommissionService, TenantContextGuard, PermissionsGuard],
  exports: [SalesService],
})
export class SalesModule {}
