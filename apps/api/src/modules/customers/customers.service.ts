import { Inject, Injectable } from "@nestjs/common";
import type { CustomerCreateInput, CustomerUpdateInput, ResourceListQuery } from "@sgc/types";
import { ensureBranchAccess, ensureFound, pagination, resolveSort } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class CustomersService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(context: TenantContext, query: ResourceListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["c.tenant_id = $1", "c.deleted_at IS NULL"];
    const sort = resolveSort(
      query,
      { name: "c.name", email: "c.email", document: "c.document", createdAt: "c.created_at" },
      "name"
    );

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`(c.branch_id = $${params.length} OR c.branch_id IS NULL)`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(c.name ILIKE $${params.length} OR c.document ILIKE $${params.length} OR c.email ILIKE $${params.length})`);
    }

    if (typeof query.isActive === "boolean") {
      params.push(query.isActive);
      filters.push(`c.is_active = $${params.length}`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `SELECT count(*)::text AS total FROM customers c WHERE ${filters.join(" AND ")}`,
      params
    );

    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT
        c.id, c.type, c.name, c.document, c.phone, c.whatsapp, c.email,
        c.communication_opt_in AS "communicationOptIn",
        c.is_active AS "isActive",
        c.branch_id AS "branchId",
        b.name AS "branchName",
        c.created_at AS "createdAt"
      FROM customers c
      LEFT JOIN branches b ON b.id = c.branch_id AND b.tenant_id = c.tenant_id
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sort.field} ${sort.direction}, c.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async get(context: TenantContext, id: string) {
    const result = await this.database.tenantQuery(
      context.tenantId,
      "SELECT * FROM customers WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [context.tenantId, id]
    );
    const customer = ensureFound(result.rows[0], "Cliente");
    ensureBranchAccess(context, customer.branch_id as string | null);
    return customer;
  }

  async create(context: TenantContext, input: CustomerCreateInput) {
    ensureBranchAccess(context, input.branchId);

    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      INSERT INTO customers (
        tenant_id, branch_id, type, name, document, phone, whatsapp, email, birth_date,
        address_line1, city, state, zip_code, tags, notes, communication_opt_in, is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
      `,
      [
        context.tenantId,
        context.branchId ?? input.branchId ?? null,
        input.type,
        input.name,
        input.document ?? null,
        input.phone ?? null,
        input.whatsapp ?? null,
        input.email ?? null,
        input.birthDate ?? null,
        input.addressLine1 ?? null,
        input.city ?? null,
        input.state ?? null,
        input.zipCode ?? null,
        input.tags,
        input.notes ?? null,
        input.communicationOptIn,
        input.isActive
      ]
    );

    return result.rows[0];
  }

  async update(context: TenantContext, id: string, input: CustomerUpdateInput) {
    const existing = await this.get(context, id);
    ensureBranchAccess(context, input.branchId ?? (existing.branch_id as string | null));

    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      UPDATE customers
      SET
        branch_id = COALESCE($3, branch_id),
        type = COALESCE($4, type),
        name = COALESCE($5, name),
        document = COALESCE($6, document),
        phone = COALESCE($7, phone),
        whatsapp = COALESCE($8, whatsapp),
        email = COALESCE($9, email),
        birth_date = COALESCE($10, birth_date),
        address_line1 = COALESCE($11, address_line1),
        city = COALESCE($12, city),
        state = COALESCE($13, state),
        zip_code = COALESCE($14, zip_code),
        tags = COALESCE($15, tags),
        notes = COALESCE($16, notes),
        communication_opt_in = COALESCE($17, communication_opt_in),
        is_active = COALESCE($18, is_active),
        updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING *
      `,
      [
        context.tenantId,
        id,
        input.branchId ?? null,
        input.type ?? null,
        input.name ?? null,
        input.document ?? null,
        input.phone ?? null,
        input.whatsapp ?? null,
        input.email ?? null,
        input.birthDate ?? null,
        input.addressLine1 ?? null,
        input.city ?? null,
        input.state ?? null,
        input.zipCode ?? null,
        input.tags ?? null,
        input.notes ?? null,
        input.communicationOptIn ?? null,
        input.isActive ?? null
      ]
    );

    return ensureFound(result.rows[0], "Cliente");
  }

  async remove(context: TenantContext, id: string) {
    await this.get(context, id);
    const result = await this.database.tenantQuery(
      context.tenantId,
      "UPDATE customers SET deleted_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id",
      [context.tenantId, id]
    );
    ensureFound(result.rows[0], "Cliente");
    return { ok: true };
  }
}
