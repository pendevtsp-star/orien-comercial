import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { LoyaltyController } from "./loyalty.controller";
import { LoyaltyService } from "./loyalty.service";
@Module({imports:[DatabaseModule],controllers:[LoyaltyController],providers:[LoyaltyService,TenantContextGuard,PermissionsGuard]})
export class LoyaltyModule {}
