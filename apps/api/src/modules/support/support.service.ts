import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { SupportTicketListQuery } from "@sgc/types";
import { ensureBranchAccess, ensureFound, pagination } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

type TicketInput = {
  branchId?: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  pageUrl?: string;
  requestId?: string;
};

@Injectable()
export class SupportService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(context: TenantContext, query: SupportTicketListQuery) {
    const { page, pageSize, offset } = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["t.tenant_id=$1", "t.deleted_at IS NULL"];
    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`(t.branch_id IS NULL OR t.branch_id=$${params.length})`);
    }
    if (query.status) {
      params.push(query.status);
      filters.push(`t.status=$${params.length}`);
    }
    if (query.category) {
      params.push(query.category);
      filters.push(`t.category=$${params.length}`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(t.subject ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
    }
    params.push(pageSize, offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT t.id,t.subject,t.category,t.priority,t.status,t.page_url AS "pageUrl",
        t.request_id AS "requestId",t.created_at AS "createdAt",t.updated_at AS "updatedAt",
        b.name AS "branchName",u.name AS "openedByName",
        (SELECT count(*)::int FROM support_ticket_messages m WHERE m.ticket_id=t.id AND m.internal_note=false) AS "messageCount"
      FROM support_tickets t
      LEFT JOIN branches b ON b.id=t.branch_id
      LEFT JOIN users u ON u.id=t.opened_by_user_id
      WHERE ${filters.join(" AND ")}
      ORDER BY CASE t.status WHEN 'open' THEN 1 WHEN 'waiting_support' THEN 2 WHEN 'waiting_customer' THEN 3 WHEN 'resolved' THEN 4 ELSE 5 END,
        CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
        t.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    );
    const total = await this.database.tenantQuery<{ total: number }>(
      context.tenantId,
      `SELECT count(*)::int total FROM support_tickets t WHERE ${filters.join(" AND ")}`,
      params.slice(0, -2),
    );
    return { data: rows.rows, pagination: { page, pageSize, total: total.rows[0]?.total ?? 0 } };
  }

  async create(context: TenantContext, input: TicketInput) {
    ensureBranchAccess(context, input.branchId ?? null);
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const branchId = context.branchId ?? input.branchId ?? null;
      const ticket = await client.query<{ id: string }>(
        `INSERT INTO support_tickets
          (tenant_id,branch_id,opened_by_user_id,subject,description,category,priority,page_url,request_id,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open')
         RETURNING id`,
        [
          context.tenantId,
          branchId,
          context.userId ?? null,
          input.subject.trim(),
          input.description.trim(),
          input.category,
          input.priority,
          input.pageUrl ?? null,
          input.requestId ?? null,
        ],
      );
      const ticketId = ticket.rows[0]!.id;
      await client.query(
        `INSERT INTO support_ticket_messages (ticket_id,tenant_id,author_user_id,author_kind,body)
         VALUES ($1,$2,$3,'tenant_user',$4)`,
        [ticketId, context.tenantId, context.userId ?? null, input.description.trim()],
      );
      await client.query(
        `INSERT INTO audit_logs (tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES ($1,$2,'support.ticket.created','support_ticket',$3,$4)`,
        [context.tenantId, context.userId ?? null, ticketId, JSON.stringify({ category: input.category, priority: input.priority })],
      );
      return { id: ticketId };
    });
  }

  async detail(context: TenantContext, id: string) {
    const ticket = await this.database.tenantQuery(
      context.tenantId,
      `SELECT t.id,t.subject,t.description,t.category,t.priority,t.status,t.page_url AS "pageUrl",
        t.request_id AS "requestId",t.created_at AS "createdAt",t.updated_at AS "updatedAt",
        t.branch_id AS "branchId",b.name AS "branchName",u.name AS "openedByName"
       FROM support_tickets t
       LEFT JOIN branches b ON b.id=t.branch_id
       LEFT JOIN users u ON u.id=t.opened_by_user_id
       WHERE t.tenant_id=$1 AND t.id=$2 AND t.deleted_at IS NULL`,
      [context.tenantId, id],
    );
    const current = ensureFound(ticket.rows[0], "Chamado");
    ensureBranchAccess(context, (current as { branchId?: string | null }).branchId ?? null);
    const messages = await this.database.tenantQuery(
      context.tenantId,
      `SELECT m.id,m.author_kind AS "authorKind",m.body,m.created_at AS "createdAt",
        COALESCE(u.name,u.email,'Orien') AS "authorName"
       FROM support_ticket_messages m
       LEFT JOIN users u ON u.id=m.author_user_id
       WHERE m.tenant_id=$1 AND m.ticket_id=$2 AND m.internal_note=false
       ORDER BY m.created_at ASC`,
      [context.tenantId, id],
    );
    return { ticket: current, messages: messages.rows };
  }

  async addTenantMessage(context: TenantContext, id: string, body: string) {
    const ticket = await this.database.tenantQuery<{ branch_id: string | null; status: string }>(
      context.tenantId,
      "SELECT branch_id,status FROM support_tickets WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
      [context.tenantId, id],
    );
    const current = ensureFound(ticket.rows[0], "Chamado");
    ensureBranchAccess(context, current.branch_id);
    if (["resolved", "closed"].includes(current.status)) throw new BadRequestException("Reabra o chamado antes de responder.");
    await this.database.tenantTransaction(context.tenantId, async (client) => {
      await client.query(
        `INSERT INTO support_ticket_messages (ticket_id,tenant_id,author_user_id,author_kind,body)
         VALUES ($1,$2,$3,'tenant_user',$4)`,
        [id, context.tenantId, context.userId ?? null, body.trim()],
      );
      await client.query(
        "UPDATE support_tickets SET status='waiting_support',updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [context.tenantId, id],
      );
    });
    return { ok: true };
  }

  async updateTenantStatus(context: TenantContext, id: string, status: string) {
    if (!["resolved", "closed", "open"].includes(status)) throw new BadRequestException("Status inválido para o cliente.");
    const result = await this.database.tenantQuery(
      context.tenantId,
      `UPDATE support_tickets
       SET status=$3,resolved_at=CASE WHEN $3='resolved' THEN now() ELSE resolved_at END,
         closed_at=CASE WHEN $3='closed' THEN now() ELSE closed_at END,updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL
       RETURNING id,status`,
      [context.tenantId, id, status],
    );
    return ensureFound(result.rows[0], "Chamado");
  }
}
