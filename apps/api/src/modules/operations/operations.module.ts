import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";
import { SalesModule } from "../sales/sales.module";
import { SalesService } from "../sales/sales.service";
import {
  COMMERCIAL_SALE_CREATOR,
  CommercialDocumentsService,
} from "./commercial-documents.service";

@Module({
  imports: [DatabaseModule, SalesModule],
  controllers: [OperationsController],
  providers: [
    OperationsService,
    CommercialDocumentsService,
    { provide: COMMERCIAL_SALE_CREATOR, useExisting: SalesService },
  ],
})
export class OperationsModule {}
