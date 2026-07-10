import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { FinancialController } from "./financial.controller";
import { FinancialService } from "./financial.service";

@Module({
  imports: [DatabaseModule],
  controllers: [FinancialController],
  providers: [FinancialService, TenantContextGuard, PermissionsGuard]
})
export class FinancialModule {}
