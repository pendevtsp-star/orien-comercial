import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CapabilitiesService } from "./capabilities.service";
import { CapabilitiesGuard } from "../../shared/capabilities.guard";

@Module({
  imports: [DatabaseModule],
  providers: [CapabilitiesService, CapabilitiesGuard],
  exports: [CapabilitiesService, CapabilitiesGuard],
})
export class CapabilitiesModule {}
