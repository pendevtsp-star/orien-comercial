import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ConfigModule } from "../config/config.module";
import { AiAssistantController } from "./ai-assistant.controller";
import { AiAssistantService } from "./ai-assistant.service";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService, PermissionsGuard, TenantContextGuard],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
