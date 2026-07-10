import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";

@Module({ imports: [DatabaseModule], controllers: [SuppliersController], providers: [SuppliersService, TenantContextGuard, PermissionsGuard] })
export class SuppliersModule {}
