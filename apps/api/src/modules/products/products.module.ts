import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [DatabaseModule],
  controllers: [ProductsController],
  providers: [ProductsService, TenantContextGuard, PermissionsGuard]
})
export class ProductsModule {}
