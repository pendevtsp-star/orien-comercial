import { Body, Controller, Get, Inject, Patch, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentUser } from "../../shared/current-user.decorator";
import type { AuthUser } from "../../shared/request-context";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { PreferencesService } from "./preferences.service";
const schema = z.object({
  theme: z.enum(["orien", "safira", "esmeralda", "grafite", "rubi", "solaris"]),
  colorMode: z.enum(["light", "dark", "system"]),
  sidebarMode: z.enum(["expanded", "compact", "collapsed"]),
  density: z.enum(["comfortable", "compact"]),
  startPage: z.string().startsWith("/").max(80),
  dateFormat: z.enum(["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]),
  reduceMotion: z.boolean(),
  notifyInApp: z.boolean(),
  notifyEmail: z.boolean(),
  quietHoursStart: z.string().nullable().optional(),
  quietHoursEnd: z.string().nullable().optional(),
  favoriteRoutes: z.array(z.string().startsWith("/")).max(8),
  dashboardWidgets: z.array(
    z.enum(["executive", "financial", "indicators", "performance", "period", "goals", "role-focus", "health"]),
  ),
});
@ApiTags("preferences")
@UseGuards(JwtAuthGuard)
@Controller("preferences")
export class PreferencesController {
  constructor(@Inject(PreferencesService) private readonly service: PreferencesService) {}
  @Get() get(@CurrentUser() u: AuthUser) {
    return this.service.get(u.userId);
  }
  @Patch() update(@CurrentUser() u: AuthUser, @Body(new ZodValidationPipe(schema)) body: never) {
    return this.service.update(u.userId, body);
  }
}
