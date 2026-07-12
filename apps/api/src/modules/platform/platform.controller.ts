import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentUser } from "../../shared/current-user.decorator";
import type { AuthUser } from "../../shared/request-context";
import { PlatformService } from "./platform.service";
@UseGuards(JwtAuthGuard)
@Controller("platform")
export class PlatformController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}
  @Get("overview") async overview(@CurrentUser() user: AuthUser) { await this.platform.assertOwner(user.userId); return this.platform.overview(); }
  @Get("tenants") async tenants(@CurrentUser() user: AuthUser) { await this.platform.assertOwner(user.userId); return this.platform.tenants(); }
}
