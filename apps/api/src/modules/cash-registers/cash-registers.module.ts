import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { CashRegistersController } from "./cash-registers.controller";
import { CashRegistersService } from "./cash-registers.service";
import { CapabilitiesModule } from "../capabilities/capabilities.module";

@Module({
  imports: [DatabaseModule, CapabilitiesModule],
  controllers: [CashRegistersController],
  providers: [CashRegistersService, TenantContextGuard, PermissionsGuard],
})
export class CashRegistersModule {}
