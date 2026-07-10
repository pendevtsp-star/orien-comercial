import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { BranchesController } from "./branches.controller";
import { BranchesService } from "./branches.service";

@Module({
  imports: [DatabaseModule],
  controllers: [BranchesController],
  providers: [BranchesService, TenantContextGuard, PermissionsGuard]
})
export class BranchesModule {}
