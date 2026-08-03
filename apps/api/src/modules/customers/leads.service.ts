import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { LeadCreateInput, LeadUpdateInput, ResourceListQuery } from "@sgc/types";
import { ensureBranchAccess, ensureFound, pagination } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class LeadsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(c: TenantContext, query: ResourceListQuery) {
    const page = pagination(query);
    const params: unknown[] = [c.tenantId];
    const filters = ["l.tenant_id=$1", "l.deleted_at IS NULL"];
    if (c.branchId) {
      params.push(c.branchId);
      filters.push(`l.branch_id=$${params.length}`);
    }
    if (c.roleSlug === "seller" && c.userId) {
      params.push(c.userId);
      filters.push(`l.owner_user_id=$${params.length}`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(l.name ILIKE $${params.length} OR l.whatsapp ILIKE $${params.length})`);
    }
    const count = await this.database.tenantQuery<{ total: string }>(
      c.tenantId,
      `SELECT count(*)::text total FROM leads l WHERE ${filters.join(" AND ")}`,
      params,
    );
    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      c.tenantId,
      `SELECT l.id,l.name,l.whatsapp,l.notes,l.status,l.next_action "nextAction",l.follow_up_at "followUpAt",l.customer_id "customerId",b.name "branchName",u.name "ownerName" FROM leads l JOIN branches b ON b.id=l.branch_id LEFT JOIN users u ON u.id=l.owner_user_id WHERE ${filters.join(" AND ")} ORDER BY l.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async create(c: TenantContext, input: LeadCreateInput) {
    ensureBranchAccess(c, input.branchId);
    const result = await this.database.tenantQuery<{ id: string }>(
      c.tenantId,
      "INSERT INTO leads(tenant_id,branch_id,owner_user_id,name,whatsapp,notes,next_action,follow_up_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
      [
        c.tenantId,
        input.branchId,
        c.userId ?? null,
        input.name,
        input.whatsapp ?? null,
        input.notes ?? null,
        input.nextAction ?? null,
        input.followUpAt ?? null,
      ],
    );
    return { id: result.rows[0]!.id };
  }

  async update(c: TenantContext, id: string, input: LeadUpdateInput) {
    const existing = await this.getVisibleLead(c, id);
    ensureBranchAccess(c, input.branchId ?? existing.branch_id);
    const result = await this.database.tenantQuery(
      c.tenantId,
      "UPDATE leads SET branch_id=COALESCE($3,branch_id),name=COALESCE($4,name),whatsapp=COALESCE($5,whatsapp),notes=COALESCE($6,notes),next_action=COALESCE($7,next_action),follow_up_at=COALESCE($8,follow_up_at),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id",
      [
        c.tenantId,
        id,
        input.branchId ?? null,
        input.name ?? null,
        input.whatsapp ?? null,
        input.notes ?? null,
        input.nextAction ?? null,
        input.followUpAt ?? null,
      ],
    );
    return ensureFound(result.rows[0], "Lead");
  }

  async convert(c: TenantContext, id: string) {
    return this.database.tenantTransaction(c.tenantId, async (client) => {
      const lead = ensureFound(
        (
          await client.query<{
            id: string;
            branch_id: string;
            owner_user_id: string | null;
            customer_id: string | null;
            name: string;
            whatsapp: string | null;
          }>(
            "SELECT id,branch_id,owner_user_id,customer_id,name,whatsapp FROM leads WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE",
            [c.tenantId, id],
          )
        ).rows[0],
        "Lead",
      );
      ensureBranchAccess(c, lead.branch_id);
      if (c.roleSlug === "seller" && lead.owner_user_id !== c.userId) {
        throw new ForbiddenException("Lead fora do escopo do vendedor.");
      }
      if (lead.customer_id) return { customerId: lead.customer_id };
      const customer = await client.query<{ id: string }>(
        "INSERT INTO customers(tenant_id,branch_id,type,name,whatsapp,communication_opt_in,is_active) VALUES($1,$2,'individual',$3,$4,false,true) RETURNING id",
        [c.tenantId, lead.branch_id, lead.name, lead.whatsapp],
      );
      await client.query(
        "UPDATE leads SET customer_id=$3,status='converted',updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [c.tenantId, id, customer.rows[0]!.id],
      );
      return { customerId: customer.rows[0]!.id };
    });
  }

  private async getVisibleLead(c: TenantContext, id: string) {
    const result = await this.database.tenantQuery<{
      id: string;
      branch_id: string;
      owner_user_id: string | null;
    }>(
      c.tenantId,
      "SELECT id,branch_id,owner_user_id FROM leads WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
      [c.tenantId, id],
    );
    const lead = ensureFound(result.rows[0], "Lead");
    ensureBranchAccess(c, lead.branch_id);
    if (c.roleSlug === "seller" && lead.owner_user_id !== c.userId) {
      throw new ForbiddenException("Lead fora do escopo do vendedor.");
    }
    return lead;
  }
}
