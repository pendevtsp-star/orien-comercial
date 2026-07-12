import { Controller, Get, Inject } from "@nestjs/common";
import { PlatformService } from "./platform.service";

@Controller("public")
export class PublicMarketingController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get("landing")
  landing() {
    return this.platform.publicLandingSettings();
  }
}
