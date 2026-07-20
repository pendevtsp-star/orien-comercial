import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { DatabaseModule } from "../database/database.module";
import { OperationsFoundationModule } from "../operations-foundation/operations-foundation.module";
import { PlatformController } from "./platform.controller";
import { PublicMarketingController } from "./public-marketing.controller";
import { PlatformService } from "./platform.service";
@Module({ imports: [ConfigModule, DatabaseModule, OperationsFoundationModule], controllers: [PlatformController, PublicMarketingController], providers: [PlatformService] })
export class PlatformModule {}
