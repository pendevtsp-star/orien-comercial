import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";

@Module({
  imports: [DatabaseModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
