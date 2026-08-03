import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { CapabilitiesGuard } from "../../shared/capabilities.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { ServicesController } from "./services.controller";
import { ServicesService } from "./services.service";

@Module({
  imports: [DatabaseModule, CapabilitiesModule],
  controllers: [ProductsController, ServicesController],
  providers: [
    ProductsService,
    ServicesService,
    TenantContextGuard,
    PermissionsGuard,
    CapabilitiesGuard,
  ],
})
export class ProductsModule {}
