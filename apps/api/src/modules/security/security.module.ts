import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { SecurityController } from "./security.controller";
import { SecurityService } from "./security.service";

@Module({
  imports: [DatabaseModule],
  controllers: [SecurityController],
  providers: [SecurityService, TenantContextGuard, PermissionsGuard],
  exports: [SecurityService],
})
export class SecurityModule {}
