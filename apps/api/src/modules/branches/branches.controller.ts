import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { branchCreateSchema, branchUpdateSchema, resourceListQuerySchema } from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { BranchesService } from "./branches.service";

@ApiTags("branches")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
@Controller("branches")
export class BranchesController {
  constructor(@Inject(BranchesService) private readonly branchesService: BranchesService) {}

  @RequirePermissions(permissions.branches.read)
  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query(new ZodValidationPipe(resourceListQuerySchema)) query: never) {
    return this.branchesService.list(tenant, query);
  }

  @RequirePermissions(permissions.branches.read)
  @Get(":id")
  get(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.branchesService.get(tenant, id);
  }

  @RequirePermissions(permissions.branches.create)
  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body(new ZodValidationPipe(branchCreateSchema)) body: never) {
    return this.branchesService.create(tenant, body);
  }

  @RequirePermissions(permissions.branches.update)
  @Patch(":id")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(branchUpdateSchema)) body: never
  ) {
    return this.branchesService.update(tenant, id, body);
  }

  @RequirePermissions(permissions.branches.delete)
  @Delete(":id")
  remove(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.branchesService.remove(tenant, id);
  }
}
