import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { resourceListQuerySchema, serviceCreateSchema, serviceUpdateSchema } from "@sgc/types";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CapabilitiesGuard } from "../../shared/capabilities.guard";
import { CurrentTenant } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import { RequireCapability } from "../../shared/require-capability.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { ServicesService } from "./services.service";

@ApiTags("services")
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard, CapabilitiesGuard)
@Controller("services")
export class ServicesController {
  constructor(@Inject(ServicesService) private readonly services: ServicesService) {}
  @Get() @RequirePermissions(permissions.services.read) @RequireCapability("services") list(
    @CurrentTenant() c: TenantContext,
    @Query(new ZodValidationPipe(resourceListQuerySchema)) q: never,
  ) {
    return this.services.list(c, q);
  }
  @Get(":id") @RequirePermissions(permissions.services.read) @RequireCapability("services") get(
    @CurrentTenant() c: TenantContext,
    @Param("id") id: string,
  ) {
    return this.services.get(c, id);
  }
  @Post() @RequirePermissions(permissions.services.manage) @RequireCapability("services") create(
    @CurrentTenant() c: TenantContext,
    @Body(new ZodValidationPipe(serviceCreateSchema)) b: never,
  ) {
    return this.services.create(c, b);
  }
  @Patch(":id")
  @RequirePermissions(permissions.services.manage)
  @RequireCapability("services")
  update(
    @CurrentTenant() c: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(serviceUpdateSchema)) b: never,
  ) {
    return this.services.update(c, id, b);
  }
  @Delete(":id")
  @RequirePermissions(permissions.services.manage)
  @RequireCapability("services")
  remove(@CurrentTenant() c: TenantContext, @Param("id") id: string) {
    return this.services.remove(c, id);
  }
}
