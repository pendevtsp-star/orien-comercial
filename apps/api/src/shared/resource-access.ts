import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { ResourceListQuery } from "@sgc/types";
import type { TenantContext } from "./request-context";

export function ensureBranchAccess(context: TenantContext, branchId?: string | null) {
  if (context.branchId && branchId && context.branchId !== branchId) {
    throw new ForbiddenException("Usuario nao possui acesso a filial informada.");
  }
}

export function ensureFound<T>(resource: T | undefined | null, label = "Registro"): T {
  if (!resource) {
    throw new NotFoundException(`${label} nao encontrado.`);
  }
  return resource;
}

export function pagination(input: { page?: number; pageSize?: number }) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

export function resolveSort(
  query: Pick<ResourceListQuery, "sortBy" | "sortDirection">,
  allowed: Record<string, string>,
  fallbackKey: string
) {
  const sortKey = query.sortBy && allowed[query.sortBy] ? query.sortBy : fallbackKey;
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  return {
    field: allowed[sortKey],
    direction
  };
}
