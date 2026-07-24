import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { BulkStatusUpdateInput, CustomerCreateInput, CustomerUpdateInput, ResourceListQuery } from "@sgc/types";
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
        c.customer_segment_id AS "customerSegmentId",
        cs.name AS "customerSegmentName",
        c.is_active AS "isActive",
        c.branch_id AS "branchId",
        b.name AS "branchName",
        c.created_at AS "createdAt"
      FROM customers c
      LEFT JOIN branches b ON b.id = c.branch_id AND b.tenant_id = c.tenant_id
      LEFT JOIN customer_segments cs ON cs.id = c.customer_segment_id AND cs.tenant_id = c.tenant_id
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

  async history(context: TenantContext, id: string) {
    const customer = await this.get(context, id);
    const [sales, receivables, wallet, credits, audit] = await Promise.all([
      this.database.tenantQuery(
        context.tenantId,
        `SELECT s.id, s.status, s.total_amount::text AS "totalAmount", s.created_at AS "createdAt", b.name AS "branchName"
         FROM sales s JOIN branches b ON b.id=s.branch_id
         WHERE s.tenant_id=$1 AND s.customer_id=$2 AND s.deleted_at IS NULL
         ORDER BY s.created_at DESC LIMIT 20`,
        [context.tenantId, id],
      ),
      this.database.tenantQuery(
        context.tenantId,
        `SELECT id, amount::text AS amount, due_date AS "dueDate", status, created_at AS "createdAt"
         FROM accounts_receivable WHERE tenant_id=$1 AND customer_id=$2
         ORDER BY created_at DESC LIMIT 20`,
        [context.tenantId, id],
      ),
      this.database.tenantQuery(
        context.tenantId,
        `SELECT points_balance AS "pointsBalance", balance::text AS balance, updated_at AS "updatedAt"
         FROM loyalty_wallets WHERE tenant_id=$1 AND customer_id=$2 LIMIT 1`,
        [context.tenantId, id],
      ),
      this.database.tenantQuery(
        context.tenantId,
        `SELECT amount::text AS amount, balance::text AS balance, status, expires_at AS "expiresAt", created_at AS "createdAt"
         FROM customer_credits WHERE tenant_id=$1 AND customer_id=$2 ORDER BY created_at DESC LIMIT 10`,
        [context.tenantId, id],
      ),
      this.database.tenantQuery(
        context.tenantId,
        `SELECT a.action, a.metadata, a.created_at AS "createdAt", u.name AS "actorName"
         FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
         WHERE a.tenant_id=$1 AND (a.entity_id=$2 OR a.metadata::text ILIKE $3)
         ORDER BY a.created_at DESC LIMIT 20`,
        [context.tenantId, id, `%${id}%`],
      ),
    ]);
    return { customer, sales: sales.rows, receivables: receivables.rows, loyalty: wallet.rows[0] ?? null, credits: credits.rows, audit: audit.rows };
  }

  async create(context: TenantContext, input: CustomerCreateInput) {
    ensureBranchAccess(context, input.branchId);
    if (input.customerSegmentId) await this.assertSegment(context, input.customerSegmentId);

    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      INSERT INTO customers (
        tenant_id, branch_id, customer_segment_id, type, name, document, phone, whatsapp, email, birth_date,
        address_line1, city, state, zip_code, tags, notes, communication_opt_in, is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
      `,
      [
        context.tenantId,
        context.branchId ?? input.branchId ?? null,
        input.customerSegmentId ?? null,
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
    if (input.customerSegmentId) await this.assertSegment(context, input.customerSegmentId);

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
        customer_segment_id = CASE WHEN $20::boolean THEN $19::uuid ELSE customer_segment_id END,
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
        input.isActive ?? null,
        input.customerSegmentId ?? null,
        input.customerSegmentId !== undefined,
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

  async bulkUpdateStatus(context: TenantContext, input: BulkStatusUpdateInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const current = await client.query<{
        id: string;
        branch_id: string | null;
        is_active: boolean;
      }>(
        `SELECT id, branch_id, is_active
         FROM customers
         WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL
         ORDER BY id FOR UPDATE`,
        [context.tenantId, input.ids],
      );
      if (current.rows.length !== input.ids.length) {
        throw new BadRequestException("Um ou mais clientes não estão disponíveis no seu escopo.");
      }
      current.rows.forEach((row) => ensureBranchAccess(context, row.branch_id));

      const updated = await client.query<{ id: string }>(
        `UPDATE customers SET is_active=$3, updated_at=now()
         WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL
         RETURNING id`,
        [context.tenantId, input.ids, input.isActive],
      );
      const batchId = randomUUID();
      for (const row of current.rows) {
        await client.query(
          `INSERT INTO audit_logs (tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
           VALUES ($1,$2,'customer.bulk_status_updated','customer',$3,$4::jsonb)`,
          [
            context.tenantId,
            context.userId ?? null,
            row.id,
            JSON.stringify({
              batchId,
              previousIsActive: row.is_active,
              isActive: input.isActive,
              reason: input.reason ?? null,
              batchSize: input.ids.length,
            }),
          ],
        );
      }
      return { ok: true, updatedCount: updated.rows.length, ids: input.ids, isActive: input.isActive };
    });
  }

  private async assertSegment(context: TenantContext, segmentId: string) {
    const segment = await this.database.tenantQuery(
      context.tenantId,
      "SELECT id FROM customer_segments WHERE tenant_id=$1 AND id=$2 AND is_active=true",
      [context.tenantId, segmentId],
    );
    ensureFound(segment.rows[0], "Segmento de cliente");
  }
}
