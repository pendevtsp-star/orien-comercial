import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ensureBranchAccess, ensureFound } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class TasksService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  async list(context: TenantContext, status?: string) {
    const params: unknown[] = [context.tenantId]; const filters = ["t.tenant_id=$1"];
    if (context.branchId) { params.push(context.branchId); filters.push(`(t.branch_id IS NULL OR t.branch_id=$${params.length})`); }
    if (status) { params.push(status); filters.push(`t.status=$${params.length}`); }
    const rows = await this.database.tenantQuery(context.tenantId, `SELECT t.id,t.title,t.description,t.type,t.status,t.priority,t.branch_id AS "branchId",t.assignee_user_id AS "assigneeUserId",t.due_at AS "dueAt",t.recurrence,t.completed_at AS "completedAt",t.created_at AS "createdAt",b.name AS "branchName",u.name AS "assigneeName" FROM operational_tasks t LEFT JOIN branches b ON b.id=t.branch_id LEFT JOIN users u ON u.id=t.assignee_user_id WHERE ${filters.join(" AND ")} ORDER BY CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,t.due_at NULLS LAST,t.created_at DESC LIMIT 100`, params);
    return { data: rows.rows };
  }
  async create(context: TenantContext, input: Record<string, unknown>) {
    const branchId = input.branchId as string | null | undefined; ensureBranchAccess(context, branchId ?? null);
    const result = await this.database.tenantQuery(context.tenantId, `INSERT INTO operational_tasks(tenant_id,branch_id,title,description,type,priority,assignee_user_id,created_by_user_id,due_at,recurrence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [context.tenantId, context.branchId ?? branchId ?? null, input.title, input.description ?? null, input.type ?? "general", input.priority ?? "normal", input.assigneeUserId ?? null, context.userId ?? null, input.dueAt ?? null, input.recurrence ?? null]);
    return { id: result.rows[0]?.id };
  }
  async update(context: TenantContext, id: string, input: Record<string, unknown>) {
    const existing = await this.database.tenantQuery<{ branch_id: string | null }>(context.tenantId, "SELECT branch_id FROM operational_tasks WHERE tenant_id=$1 AND id=$2", [context.tenantId,id]); ensureBranchAccess(context, ensureFound(existing.rows[0], "Tarefa").branch_id);
    if (input.branchId !== undefined) ensureBranchAccess(context, input.branchId as string | null);
    if (input.status === "done" && !context.userId) throw new BadRequestException("Usuário responsável não identificado.");
    const result = await this.database.tenantQuery(context.tenantId, `UPDATE operational_tasks SET title=COALESCE($3,title),description=COALESCE($4,description),type=COALESCE($5,type),priority=COALESCE($6,priority),branch_id=COALESCE($7,branch_id),assignee_user_id=COALESCE($8,assignee_user_id),due_at=COALESCE($9,due_at),recurrence=COALESCE($10,recurrence),status=COALESCE($11,status),completed_at=CASE WHEN $11='done' THEN now() WHEN $11 IN ('open','in_progress') THEN NULL ELSE completed_at END,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status`,[context.tenantId,id,input.title??null,input.description??null,input.type??null,input.priority??null,input.branchId??null,input.assigneeUserId??null,input.dueAt??null,input.recurrence??null,input.status??null]);
    return ensureFound(result.rows[0], "Tarefa");
  }
}
