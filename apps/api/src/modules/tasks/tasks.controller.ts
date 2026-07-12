import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { permissions } from "@sgc/auth";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { TasksService } from "./tasks.service";

const input = z.object({ title: z.string().min(3).max(180), description: z.string().max(1000).optional(), branchId: z.string().uuid().nullable().optional(), assigneeUserId: z.string().uuid().nullable().optional(), dueAt: z.string().datetime().nullable().optional(), priority: z.enum(["low","normal","high","critical"]).default("normal"), type: z.string().max(50).default("general"), recurrence: z.enum(["daily","weekly","monthly"]).nullable().optional() });
const update = input.partial().extend({ status: z.enum(["open","in_progress","done","cancelled"]).optional() });
@ApiTags("tasks")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@RequirePermissions(permissions.dashboard.read)
@Controller("tasks")
export class TasksController {
  constructor(@Inject(TasksService) private readonly service: TasksService) {}
  @Get() list(@CurrentTenant() tenant: TenantContext, @Query("status") status?: string) { return this.service.list(tenant, status); }
  @Post() create(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(input)) body: never) { return this.service.create(tenant, body); }
  @Patch(":id") update(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body(new ZodValidationPipe(update)) body: never) { return this.service.update(tenant, id, body); }
}
