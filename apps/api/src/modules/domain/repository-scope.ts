import type { TenantContext } from "../../shared/request-context";

export type RepositoryScopeErrorCode =
  | "INVALID_REPOSITORY_SCOPE"
  | "TENANT_SCOPE_MISMATCH"
  | "BRANCH_SCOPE_MISMATCH";

export class RepositoryScopeError extends Error {
  constructor(
    readonly code: RepositoryScopeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryScopeError";
  }
}

export interface TenantRepositoryScope {
  context: TenantContext;
  tenantId: string;
}

export interface BranchRepositoryScope extends TenantRepositoryScope {
  branchId: string;
}

export function assertTenantRepositoryScope(scope: TenantRepositoryScope): void {
  if (!scope.tenantId || !scope.context.tenantId) {
    throw new RepositoryScopeError("INVALID_REPOSITORY_SCOPE", "O tenant deve ser informado explicitamente.");
  }
  if (scope.tenantId !== scope.context.tenantId) {
    throw new RepositoryScopeError("TENANT_SCOPE_MISMATCH", "O tenant do repositorio diverge do contexto autenticado.");
  }
}

export function assertBranchRepositoryScope(scope: BranchRepositoryScope): void {
  assertTenantRepositoryScope(scope);
  if (!scope.branchId) {
    throw new RepositoryScopeError("INVALID_REPOSITORY_SCOPE", "A filial deve ser informada explicitamente.");
  }
  if (scope.context.branchId && scope.context.branchId !== scope.branchId) {
    throw new RepositoryScopeError("BRANCH_SCOPE_MISMATCH", "A filial do repositorio nao pertence ao contexto autenticado.");
  }
}
