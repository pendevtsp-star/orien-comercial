import { Inject, Injectable } from "@nestjs/common";
import type { ServiceCreateInput, ServiceUpdateInput, ResourceListQuery } from "@sgc/types";
import {
  ensureBranchAccess,
  ensureFound,
  pagination,
  resolveSort,
} from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class ServicesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(context: TenantContext, query: ResourceListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["s.tenant_id=$1", "s.deleted_at IS NULL"];
    const sort = resolveSort(
      query,
      { name: "s.name", basePrice: "s.base_price", createdAt: "s.created_at" },
      "name",
    );
    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`(s.branch_id=$${params.length} OR s.branch_id IS NULL)`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`);
    }
    if (typeof query.isActive === "boolean") {
      params.push(query.isActive);
      filters.push(`s.is_active=$${params.length}`);
    }
    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `SELECT count(*)::text total FROM services s WHERE ${filters.join(" AND ")}`,
      params,
    );
    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `SELECT s.id,s.name,s.description,s.base_price "basePrice",s.estimated_minutes "estimatedMinutes",s.is_active "isActive",s.branch_id "branchId",b.name "branchName",s.created_at "createdAt" FROM services s LEFT JOIN branches b ON b.id=s.branch_id AND b.tenant_id=s.tenant_id WHERE ${filters.join(" AND ")} ORDER BY ${sort.field} ${sort.direction},s.name LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async get(context: TenantContext, id: string) {
    const result = await this.database.tenantQuery(
      context.tenantId,
      'SELECT id,name,description,base_price "basePrice",estimated_minutes "estimatedMinutes",is_active "isActive",branch_id "branchId" FROM services WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL',
      [context.tenantId, id],
    );
    const service = ensureFound(result.rows[0], "Serviço") as Record<string, unknown>;
    ensureBranchAccess(context, service.branchId as string | null);
    return service;
  }

  async create(context: TenantContext, input: ServiceCreateInput) {
    ensureBranchAccess(context, input.branchId ?? null);
    const result = await this.database.tenantQuery(
      context.tenantId,
      "INSERT INTO services(tenant_id,branch_id,name,description,base_price,estimated_minutes,is_active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [
        context.tenantId,
        input.branchId ?? context.branchId ?? null,
        input.name,
        input.description ?? null,
        input.basePrice,
        input.estimatedMinutes ?? null,
        input.isActive,
      ],
    );
    return this.get(context, result.rows[0]!.id as string);
  }

  async update(context: TenantContext, id: string, input: ServiceUpdateInput) {
    const existing = await this.get(context, id);
    ensureBranchAccess(context, input.branchId ?? (existing.branchId as string | null));
    const result = await this.database.tenantQuery(
      context.tenantId,
      "UPDATE services SET branch_id=COALESCE($3,branch_id),name=COALESCE($4,name),description=COALESCE($5,description),base_price=COALESCE($6,base_price),estimated_minutes=COALESCE($7,estimated_minutes),is_active=COALESCE($8,is_active),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id",
      [
        context.tenantId,
        id,
        input.branchId ?? null,
        input.name ?? null,
        input.description ?? null,
        input.basePrice ?? null,
        input.estimatedMinutes ?? null,
        input.isActive ?? null,
      ],
    );
    return this.get(context, ensureFound(result.rows[0], "Serviço").id as string);
  }

  async remove(context: TenantContext, id: string) {
    await this.get(context, id);
    await this.database.tenantQuery(
      context.tenantId,
      "UPDATE services SET deleted_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
      [context.tenantId, id],
    );
    return { ok: true };
  }
}
