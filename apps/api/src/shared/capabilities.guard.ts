import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { CapabilityKey } from "@sgc/auth";
import { CapabilitiesService } from "../modules/capabilities/capabilities.service";
import { CAPABILITIES_KEY } from "./require-capability.decorator";
import type { AuthenticatedRequest } from "./request-context";

interface CapabilityMetadata {
  capability: CapabilityKey;
  featureFlag?: string;
}

@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(CapabilitiesService) private readonly capabilities: CapabilitiesService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<CapabilityMetadata>(CAPABILITIES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.tenant) return false;
    await this.capabilities.assertCapability(request.tenant, required.capability, required.featureFlag);
    return true;
  }
}
