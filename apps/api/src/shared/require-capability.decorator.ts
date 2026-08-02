import { SetMetadata } from "@nestjs/common";
import type { CapabilityKey } from "@sgc/auth";

export const CAPABILITIES_KEY = "capabilities";

export const RequireCapability = (capability: CapabilityKey, featureFlag?: string) =>
  SetMetadata(CAPABILITIES_KEY, { capability, featureFlag });
