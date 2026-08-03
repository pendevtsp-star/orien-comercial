import type { Request } from "express";
import type { TenantCapabilities } from "@sgc/auth";

export interface AuthUser {
  userId: string;
  sessionId: string;
}

export interface TenantContext {
  userId?: string;
  tenantId: string;
  membershipId: string;
  roleSlug: string;
  permissions: string[];
  branchId: string | null;
  tenantStatus?: string;
  planSlug?: string | null;
  capabilities?: TenantCapabilities;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  tenant?: TenantContext;
}
