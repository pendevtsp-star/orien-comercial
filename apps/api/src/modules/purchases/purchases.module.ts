import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { PurchasesController } from "./purchases.controller";
import { PurchasesService } from "./purchases.service";

@Module({ imports: [DatabaseModule], controllers: [PurchasesController], providers: [PurchasesService, TenantContextGuard, PermissionsGuard] })
export class PurchasesModule {}
