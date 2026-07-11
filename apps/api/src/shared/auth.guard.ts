import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import jwt from "jsonwebtoken";
import { APP_CONFIG } from "../modules/config/config.module";
import { SessionStateService } from "../modules/auth/session-state.service";
import type { AuthenticatedRequest, AuthUser } from "./request-context";

interface AccessTokenPayload {
  sub: string;
  sid: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SessionStateService) private readonly sessions?: SessionStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readAccessToken(request);

    if (!token) {
      throw new UnauthorizedException("Sessao ausente.");
    }

    try {
      const payload = jwt.verify(token, this.config.JWT_ACCESS_SECRET) as AccessTokenPayload;
      if (this.sessions && !(await this.sessions.isActive(payload.sid, payload.sub))) {
        throw new UnauthorizedException("Sessao encerrada ou expirada.");
      }
      request.user = { userId: payload.sub, sessionId: payload.sid } satisfies AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException("Sessao invalida ou expirada.");
    }
  }
}

function readAccessToken(request: AuthenticatedRequest): string | undefined {
  const cookieToken = request.cookies?.access_token as string | undefined;
  if (cookieToken) return cookieToken;

  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return undefined;
}
