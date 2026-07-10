import { Inject, Injectable } from "@nestjs/common";
import type { ResourceListQuery, SupplierCreateInput, SupplierUpdateInput } from "@sgc/types";
import { ensureBranchAccess, ensureFound, pagination, resolveSort } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class SuppliersService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  async list(context: TenantContext, query: ResourceListQuery) {
    const page = pagination(query); const params: unknown[] = [context.tenantId]; const filters = ["tenant_id = $1", "deleted_at IS NULL"];
    if (context.branchId) { params.push(context.branchId); filters.push(`(branch_id = $${params.length} OR branch_id IS NULL)`); }
    if (query.search) { params.push(`%${query.search}%`); filters.push(`(name ILIKE $${params.length} OR document ILIKE $${params.length} OR email ILIKE $${params.length})`); }
    if (typeof query.isActive === "boolean") { params.push(query.isActive); filters.push(`is_active = $${params.length}`); }
    const sort = resolveSort(query, { name: "name", createdAt: "created_at" }, "name");
    const count = await this.database.tenantQuery<{ total: string }>(context.tenantId, `SELECT count(*)::text total FROM suppliers WHERE ${filters.join(" AND ")}`, params);
    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(context.tenantId, `SELECT id, branch_id AS "branchId", name, document, email, phone, whatsapp, notes, is_active AS "isActive", created_at AS "createdAt" FROM suppliers WHERE ${filters.join(" AND ")} ORDER BY ${sort.field} ${sort.direction}, name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }
  async create(context: TenantContext, input: SupplierCreateInput) {
    ensureBranchAccess(context, input.branchId);
    const row = await this.database.tenantQuery(context.tenantId, `INSERT INTO suppliers (tenant_id, branch_id, name, document, email, phone, whatsapp, notes, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [context.tenantId, context.branchId ?? input.branchId ?? null, input.name, input.document ?? null, input.email ?? null, input.phone ?? null, input.whatsapp ?? null, input.notes ?? null, input.isActive]);
    return row.rows[0];
  }
  async update(context: TenantContext, id: string, input: SupplierUpdateInput) {
    const found = await this.database.tenantQuery<{ branch_id: string | null }>(context.tenantId, "SELECT branch_id FROM suppliers WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL", [context.tenantId, id]);
    const existing = ensureFound(found.rows[0], "Fornecedor"); ensureBranchAccess(context, input.branchId ?? existing.branch_id);
    const row = await this.database.tenantQuery(context.tenantId, `UPDATE suppliers SET branch_id = COALESCE($3, branch_id), name = COALESCE($4, name), document = COALESCE($5, document), email = COALESCE($6, email), phone = COALESCE($7, phone), whatsapp = COALESCE($8, whatsapp), notes = COALESCE($9, notes), is_active = COALESCE($10, is_active), updated_at = now() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING *`, [context.tenantId, id, input.branchId ?? null, input.name ?? null, input.document ?? null, input.email ?? null, input.phone ?? null, input.whatsapp ?? null, input.notes ?? null, input.isActive ?? null]);
    return ensureFound(row.rows[0], "Fornecedor");
  }
  async remove(context: TenantContext, id: string) {
    const row = await this.database.tenantQuery(context.tenantId, "UPDATE suppliers SET deleted_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id", [context.tenantId, id]);
    ensureFound(row.rows[0], "Fornecedor");
    return { ok: true };
  }
}
