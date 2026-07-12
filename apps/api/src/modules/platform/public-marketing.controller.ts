import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { PlatformService } from "./platform.service";

@Controller("public")
export class PublicMarketingController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get("landing")
  landing() {
    return this.platform.publicLandingSettings();
  }

  @Get("testimonials/:token")
  testimonial(@Param("token") token: string) {
    return this.platform.testimonialForPublic(token);
  }

  @Post("testimonials/:token")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  submitTestimonial(
    @Param("token") token: string,
    @Body()
    body: {
      name?: string;
      company?: string;
      role?: string;
      quote?: string;
      imageUrl?: string;
      consentPublication?: boolean;
    },
  ) {
    return this.platform.submitPublicTestimonial(token, body);
  }
}
