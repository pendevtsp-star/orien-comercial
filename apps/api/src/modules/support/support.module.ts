import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";

@Module({
  imports: [DatabaseModule],
  controllers: [SupportController],
  providers: [SupportService, TenantContextGuard, PermissionsGuard],
  exports: [SupportService],
})
export class SupportModule {}
