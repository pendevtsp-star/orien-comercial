import { Body, Controller, Headers, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { FiscalService } from "./fiscal.service";

@ApiTags("fiscal-webhooks")
@Controller("fiscal/webhooks")
export class FiscalWebhookController {
  constructor(@Inject(FiscalService) private readonly fiscal: FiscalService) {}

  @Post("focus")
  @HttpCode(202)
  receiveFocus(
    @Headers("x-orien-webhook-token") token: string | undefined,
    @Headers("x-focus-event-id") eventId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.fiscal.receiveFocusWebhook(token, eventId, body);
  }
}
