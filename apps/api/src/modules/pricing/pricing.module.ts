import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { PricingController } from "./pricing.controller";
import { PricingService } from "./pricing.service";

@Module({
  imports: [DatabaseModule],
  controllers: [PricingController],
  providers: [PricingService, TenantContextGuard, PermissionsGuard],
  exports: [PricingService],
})
export class PricingModule {}
