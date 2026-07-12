import { Module } from "@nestjs/common";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ConfigModule } from "../config/config.module";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, TenantContextGuard, PermissionsGuard]
})
export class SubscriptionsModule {}
