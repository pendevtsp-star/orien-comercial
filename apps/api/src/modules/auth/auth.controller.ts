import { Body, Controller, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { forgotPasswordSchema, inviteAcceptSchema, loginSchema, resetPasswordSchema } from "@sgc/types";
import type { Request, Response } from "express";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentUser } from "../../shared/current-user.decorator";
import type { AuthUser } from "../../shared/request-context";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe";
import { AuthService } from "./auth.service";

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
  sameSite: "lax" as const,
  path: "/"
};

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const tokens = await this.authService.login(body as never, {
      userAgent: request.headers["user-agent"],
      ipAddress: request.ip
    });

    setAuthCookies(response, tokens);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(user.sessionId);
    clearAuthCookies(response);
    return { ok: true };
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post("refresh")
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.authService.refresh(request.cookies?.refresh_token as string | undefined, {
      userAgent: request.headers["user-agent"],
      ipAddress: request.ip
    });

    setAuthCookies(response, tokens);
    return { ok: true };
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("password/forgot")
  async forgot(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: { email: string }) {
    return this.authService.createPasswordReset(body.email);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("password/reset")
  reset(@Body(new ZodValidationPipe(resetPasswordSchema)) body: { token: string; password: string }) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("invites/accept")
  async acceptInvite(
    @Body(new ZodValidationPipe(inviteAcceptSchema)) body: unknown,
    @Res({ passthrough: true }) response: Response
  ) {
    const tokens = await this.authService.acceptInvite(body as never);
    setAuthCookies(response, tokens);
    return { ok: true };
  }
}

function setAuthCookies(response: Response, tokens: { accessToken: string; refreshToken: string }) {
  response.cookie("access_token", tokens.accessToken, {
    ...cookieBase,
    maxAge: 1000 * 60 * 15
  });
  response.cookie("refresh_token", tokens.refreshToken, {
    ...cookieBase,
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
}

function clearAuthCookies(response: Response) {
  response.clearCookie("access_token", cookieBase);
  response.clearCookie("refresh_token", cookieBase);
}
