import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { BranchCreateInput, BranchUpdateInput, ResourceListQuery } from "@sgc/types";
import { ensureBranchAccess, ensureFound, pagination, resolveSort } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class BranchesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(context: TenantContext, query: ResourceListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["tenant_id = $1", "deleted_at IS NULL"];
    const sort = resolveSort(query, { name: "name", code: "code", city: "city", createdAt: "created_at" }, "name");

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`id = $${params.length}`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length})`);
    }

    if (typeof query.isActive === "boolean") {
      params.push(query.isActive);
      filters.push(`is_active = $${params.length}`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `SELECT count(*)::text AS total FROM branches WHERE ${filters.join(" AND ")}`,
      params
    );

    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT id, name, code, phone, email, city, state, is_active AS "isActive", created_at AS "createdAt"
      FROM branches
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sort.field} ${sort.direction}, name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async get(context: TenantContext, id: string) {
    ensureBranchAccess(context, id);
    const row = await this.database.tenantQuery(
      context.tenantId,
      "SELECT * FROM branches WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [context.tenantId, id]
    );
    return ensureFound(row.rows[0], "Filial");
  }

  async create(context: TenantContext, input: BranchCreateInput) {
    if (context.branchId) {
      throw new ForbiddenException("Usuario com escopo de filial nao pode criar filial.");
    }

    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      INSERT INTO branches (
        tenant_id, legal_entity_id, name, code, phone, email, address_line1, city, state, zip_code, is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
      `,
      [
        context.tenantId,
        input.legalEntityId ?? null,
        input.name,
        input.code,
        input.phone ?? null,
        input.email ?? null,
        input.addressLine1 ?? null,
        input.city ?? null,
        input.state ?? null,
        input.zipCode ?? null,
        input.isActive
      ]
    );
    return result.rows[0];
  }

  async update(context: TenantContext, id: string, input: BranchUpdateInput) {
    ensureBranchAccess(context, id);

    const existing = await this.get(context, id);
    ensureFound(existing, "Filial");

    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      UPDATE branches
      SET
        legal_entity_id = COALESCE($3, legal_entity_id),
        name = COALESCE($4, name),
        code = COALESCE($5, code),
        phone = COALESCE($6, phone),
        email = COALESCE($7, email),
        address_line1 = COALESCE($8, address_line1),
        city = COALESCE($9, city),
        state = COALESCE($10, state),
        zip_code = COALESCE($11, zip_code),
        is_active = COALESCE($12, is_active),
        updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING *
      `,
      [
        context.tenantId,
        id,
        input.legalEntityId ?? null,
        input.name ?? null,
        input.code ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.addressLine1 ?? null,
        input.city ?? null,
        input.state ?? null,
        input.zipCode ?? null,
        input.isActive ?? null
      ]
    );
    return ensureFound(result.rows[0], "Filial");
  }

  async remove(context: TenantContext, id: string) {
    ensureBranchAccess(context, id);
    const result = await this.database.tenantQuery(
      context.tenantId,
      "UPDATE branches SET deleted_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id",
      [context.tenantId, id]
    );
    ensureFound(result.rows[0], "Filial");
    return { ok: true };
  }
}
