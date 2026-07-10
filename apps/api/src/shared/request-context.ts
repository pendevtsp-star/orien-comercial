import type { Request } from "express";

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
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  tenant?: TenantContext;
}
