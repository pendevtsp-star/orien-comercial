import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { DatabaseModule } from "../database/database.module";
import { TrialLifecycleService } from "./trial-lifecycle.service";

@Module({ imports: [ConfigModule, DatabaseModule], providers: [TrialLifecycleService] })
export class TrialLifecycleModule {}
