import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { CashRegisterCloseInput, CashRegisterOpenInput } from "@sgc/types";
import type { PoolClient } from "pg";
import { ensureBranchAccess, ensureFound } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class CashRegistersService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async current(context: TenantContext, query: { branchId: string }) {
    ensureBranchAccess(context, query.branchId);
    const result = await this.database.tenantQuery(context.tenantId, `SELECT crs.*, b.name AS "branchName" FROM cash_register_sessions crs JOIN branches b ON b.id = crs.branch_id WHERE crs.tenant_id = $1 AND crs.branch_id = $2 AND crs.status = 'open' ORDER BY crs.opened_at DESC LIMIT 1`, [context.tenantId, query.branchId]);
    return result.rows[0] ?? null;
  }

  async open(context: TenantContext, input: CashRegisterOpenInput) {
    ensureBranchAccess(context, input.branchId);
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const branch = await client.query("SELECT id FROM branches WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL AND is_active = true", [context.tenantId, input.branchId]);
      ensureFound(branch.rows[0], "Loja");
      const existing = await client.query("SELECT id FROM cash_register_sessions WHERE tenant_id = $1 AND branch_id = $2 AND status = 'open' FOR UPDATE", [context.tenantId, input.branchId]);
      if (existing.rowCount) throw new BadRequestException("Ja existe um caixa aberto nesta loja.");
      const result = await client.query(`INSERT INTO cash_register_sessions (tenant_id, branch_id, opened_by_user_id, opening_amount, expected_amount, notes) VALUES ($1,$2,$3,$4,$4,$5) RETURNING *`, [context.tenantId, input.branchId, context.userId ?? null, input.openingAmount, input.notes ?? null]);
      await audit(client, context, "cash_register.opened", result.rows[0]!.id, { branchId: input.branchId, openingAmount: input.openingAmount });
      return result.rows[0];
    });
  }

  async close(context: TenantContext, id: string, input: CashRegisterCloseInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const found = await client.query<{ branch_id: string; opening_amount: string; opened_at: Date }>("SELECT branch_id, opening_amount, opened_at FROM cash_register_sessions WHERE tenant_id = $1 AND id = $2 AND status = 'open' FOR UPDATE", [context.tenantId, id]);
      const session = ensureFound(found.rows[0], "Caixa aberto"); ensureBranchAccess(context, session.branch_id);
      const payments = await client.query<{ total: string }>(`SELECT COALESCE(sum(sp.amount),0)::text total FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE sp.tenant_id = $1 AND s.branch_id = $2 AND sp.status = 'paid' AND sp.paid_at >= $3 AND s.status = 'sold'`, [context.tenantId, session.branch_id, session.opened_at]);
      const expectedAmount = Number(session.opening_amount) + Number(payments.rows[0]?.total ?? 0);
      const differenceAmount = input.closingAmount - expectedAmount;
      const result = await client.query(`UPDATE cash_register_sessions SET status = 'closed', closed_by_user_id = $3, expected_amount = $4, closing_amount = $5, difference_amount = $6, notes = COALESCE($7, notes), closed_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *`, [context.tenantId, id, context.userId ?? null, expectedAmount, input.closingAmount, differenceAmount, input.notes ?? null]);
      await audit(client, context, "cash_register.closed", id, { branchId: session.branch_id, expectedAmount, closingAmount: input.closingAmount, differenceAmount });
      return result.rows[0];
    });
  }
}

async function audit(client: PoolClient, context: TenantContext, action: string, entityId: string, metadata: Record<string, unknown>) {
  await client.query("INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,'cash_register',$4,$5)", [context.tenantId, context.userId ?? null, action, entityId, JSON.stringify(metadata)]);
}
