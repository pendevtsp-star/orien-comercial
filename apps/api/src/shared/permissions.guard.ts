import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasEveryPermission } from "@sgc/auth";
import { PERMISSIONS_KEY } from "./require-permissions.decorator";
import type { AuthenticatedRequest } from "./request-context";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const granted = request.tenant?.permissions ?? [];

    if (!hasEveryPermission(granted, required)) {
      throw new ForbiddenException("Permissao insuficiente.");
    }

    return true;
  }
}
