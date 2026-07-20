import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { DatabaseModule } from "../database/database.module";
import { OperationsFoundationController } from "./operations-foundation.controller";
import { OperationsFoundationService } from "./operations-foundation.service";
import { OperationsFoundationWorker } from "./operations-foundation.worker";

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [OperationsFoundationController],
  providers: [OperationsFoundationService, OperationsFoundationWorker],
  exports: [OperationsFoundationService, OperationsFoundationWorker],
})
export class OperationsFoundationModule {}
