import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  CashRegisterCloseInput,
  CashRegisterMovementInput,
  CashRegisterOpenInput,
} from "@sgc/types";
import type { PoolClient } from "pg";
import { ensureBranchAccess, ensureFound } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class CashRegistersService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async history(context: TenantContext, query: { branchId: string }) {
    ensureBranchAccess(context, query.branchId);
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT id,status,opening_amount::text AS "openingAmount",expected_amount::text AS "expectedAmount",closing_amount::text AS "closingAmount",difference_amount::text AS "differenceAmount",approval_status AS "approvalStatus",opened_at AS "openedAt",closed_at AS "closedAt" FROM cash_register_sessions WHERE tenant_id=$1 AND branch_id=$2 ORDER BY opened_at DESC LIMIT 50`,
      [context.tenantId, query.branchId],
    );
    return { data: result.rows };
  }

  async current(context: TenantContext, query: { branchId: string }) {
    ensureBranchAccess(context, query.branchId);
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT crs.*, b.name AS "branchName" FROM cash_register_sessions crs JOIN branches b ON b.id = crs.branch_id WHERE crs.tenant_id = $1 AND crs.branch_id = $2 AND crs.status = 'open' ORDER BY crs.opened_at DESC LIMIT 1`,
      [context.tenantId, query.branchId],
    );
    return result.rows[0] ?? null;
  }

  async open(context: TenantContext, input: CashRegisterOpenInput) {
    ensureBranchAccess(context, input.branchId);
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const branch = await client.query(
        "SELECT id FROM branches WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL AND is_active = true",
        [context.tenantId, input.branchId],
      );
      ensureFound(branch.rows[0], "Loja");
      const existing = await client.query(
        "SELECT id FROM cash_register_sessions WHERE tenant_id = $1 AND branch_id = $2 AND status = 'open' FOR UPDATE",
        [context.tenantId, input.branchId],
      );
      if (existing.rowCount) throw new BadRequestException("Ja existe um caixa aberto nesta loja.");
      const result = await client.query(
        `INSERT INTO cash_register_sessions (tenant_id, branch_id, opened_by_user_id, opening_amount, expected_amount, notes) VALUES ($1,$2,$3,$4,$4,$5) RETURNING *`,
        [
          context.tenantId,
          input.branchId,
          context.userId ?? null,
          input.openingAmount,
          input.notes ?? null,
        ],
      );
      await audit(client, context, "cash_register.opened", result.rows[0]!.id, {
        branchId: input.branchId,
        openingAmount: input.openingAmount,
      });
      return result.rows[0];
    });
  }

  async close(context: TenantContext, id: string, input: CashRegisterCloseInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const found = await client.query<{
        branch_id: string;
        opening_amount: string;
        opened_at: Date;
      }>(
        "SELECT branch_id, opening_amount, opened_at FROM cash_register_sessions WHERE tenant_id = $1 AND id = $2 AND status = 'open' FOR UPDATE",
        [context.tenantId, id],
      );
      const session = ensureFound(found.rows[0], "Caixa aberto");
      ensureBranchAccess(context, session.branch_id);
      const payments = await client.query<{ total: string }>(
        `SELECT COALESCE(sum(sp.amount),0)::text total FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE sp.tenant_id = $1 AND s.cash_register_session_id = $2 AND sp.status = 'paid' AND s.status = 'sold'`,
        [context.tenantId, id],
      );
      const movements = await client.query<{ supply: string; withdrawal: string }>(
        `SELECT COALESCE(sum(amount) FILTER (WHERE type = 'supply'),0)::text supply, COALESCE(sum(amount) FILTER (WHERE type = 'withdrawal'),0)::text withdrawal FROM cash_register_movements WHERE tenant_id = $1 AND cash_register_session_id = $2`,
        [context.tenantId, id],
      );
      const expectedAmount =
        Number(session.opening_amount) +
        Number(payments.rows[0]?.total ?? 0) +
        Number(movements.rows[0]?.supply ?? 0) -
        Number(movements.rows[0]?.withdrawal ?? 0);
      const differenceAmount = input.closingAmount - expectedAmount;
      const approvalStatus = Math.abs(differenceAmount) > 0.01 ? "pending" : "not_required";
      const result = await client.query(
        `UPDATE cash_register_sessions SET status = 'closed', closed_by_user_id = $3, expected_amount = $4, closing_amount = $5, blind_closing_amount=$5, difference_amount = $6, approval_status=$8, notes = COALESCE($7, notes), closed_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [
          context.tenantId,
          id,
          context.userId ?? null,
          expectedAmount,
          input.closingAmount,
          differenceAmount,
          input.notes ?? null,
          approvalStatus,
        ],
      );
      await audit(client, context, "cash_register.closed", id, {
        branchId: session.branch_id,
        expectedAmount,
        closingAmount: input.closingAmount,
        differenceAmount,
      });
      return result.rows[0];
    });
  }

  async approve(context: TenantContext, id: string) {
    const result = await this.database.tenantQuery(
      context.tenantId,
      `UPDATE cash_register_sessions SET approval_status='approved',approved_by_user_id=$3,approved_at=now() WHERE tenant_id=$1 AND id=$2 AND status='closed' AND approval_status='pending' RETURNING id`,
      [context.tenantId, id, context.userId ?? null],
    );
    ensureFound(result.rows[0], "Divergencia pendente");
    return { ok: true };
  }

  async movement(context: TenantContext, id: string, input: CashRegisterMovementInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const found = await client.query<{ branch_id: string }>(
        "SELECT branch_id FROM cash_register_sessions WHERE tenant_id = $1 AND id = $2 AND status = 'open'",
        [context.tenantId, id],
      );
      const session = ensureFound(found.rows[0], "Caixa aberto");
      ensureBranchAccess(context, session.branch_id);
      const result = await client.query(
        `INSERT INTO cash_register_movements (tenant_id, cash_register_session_id, branch_id, type, amount, reason, actor_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          context.tenantId,
          id,
          session.branch_id,
          input.type,
          input.amount,
          input.reason,
          context.userId ?? null,
        ],
      );
      await audit(client, context, `cash_register.${input.type}`, id, {
        amount: input.amount,
        reason: input.reason,
      });
      return result.rows[0];
    });
  }

  async summary(context: TenantContext, id: string) {
    const session = await this.database.tenantQuery<{ branch_id: string }>(
      context.tenantId,
      "SELECT branch_id FROM cash_register_sessions WHERE tenant_id = $1 AND id = $2",
      [context.tenantId, id],
    );
    ensureBranchAccess(context, ensureFound(session.rows[0], "Caixa").branch_id);
    const [payments, movements] = await Promise.all([
      this.database.tenantQuery(
        context.tenantId,
        `SELECT sp.method, COALESCE(sum(sp.amount),0)::text amount FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE sp.tenant_id = $1 AND s.cash_register_session_id = $2 AND sp.status = 'paid' AND s.status = 'sold' GROUP BY sp.method ORDER BY sp.method`,
        [context.tenantId, id],
      ),
      this.database.tenantQuery(
        context.tenantId,
        `SELECT id, type, amount::text, reason, created_at AS "createdAt" FROM cash_register_movements WHERE tenant_id = $1 AND cash_register_session_id = $2 ORDER BY created_at DESC`,
        [context.tenantId, id],
      ),
    ]);
    return { payments: payments.rows, movements: movements.rows };
  }
}

async function audit(
  client: PoolClient,
  context: TenantContext,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  await client.query(
    "INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,'cash_register',$4,$5)",
    [context.tenantId, context.userId ?? null, action, entityId, JSON.stringify(metadata)],
  );
}
