import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({ imports: [DatabaseModule], controllers: [TasksController], providers: [TasksService, TenantContextGuard, PermissionsGuard] })
export class TasksModule {}
