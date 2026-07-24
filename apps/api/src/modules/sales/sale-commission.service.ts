import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import { ensureBranchAccess } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";

interface ProvisionInput {
  saleId: string;
  branchId: string;
  baseAmount: string | number;
}

type ProvisionResult =
  | { status: "none"; reason: "missing_user" | "rule_not_found" | "zero_rate" }
  | {
      status: "created" | "existing";
      commissionId: string;
      amountCents: number;
      baseAmountCents: number;
      ratePercent: string;
      ruleId: string;
    };

interface CommissionRuleRow {
  id: string;
  branch_id: string | null;
  rate_percent: string;
}

interface CommissionRow {
  id: string;
  amount: string;
  base_amount: string;
  status: string;
  adjusted_at?: string | Date | null;
  adjustment_reason?: string | null;
}

@Injectable()
export class SaleCommissionService {
  async provisionInTransaction(
    client: PoolClient,
    context: TenantContext,
    input: ProvisionInput,
  ): Promise<ProvisionResult> {
    ensureBranchAccess(context, input.branchId);
    if (!context.userId) return { status: "none", reason: "missing_user" };

    const ruleResult = await client.query<CommissionRuleRow>(
      `SELECT id,branch_id,rate_percent::text
         FROM seller_commission_rules
        WHERE tenant_id=$1 AND user_id=$2 AND is_active=true
          AND (branch_id=$3 OR branch_id IS NULL)
        ORDER BY (branch_id=$3) DESC,updated_at DESC,id DESC
        LIMIT 1`,
      [context.tenantId, context.userId, input.branchId],
    );
    const rule = ruleResult.rows[0];
    if (!rule) return { status: "none", reason: "rule_not_found" };

    const rateHundredths = percentToHundredths(rule.rate_percent);
    if (rateHundredths === 0) return { status: "none", reason: "zero_rate" };

    const baseAmountCents = decimalToCents(input.baseAmount);
    if (baseAmountCents < 0) {
      throw new BadRequestException("A base da comissao nao pode ser negativa.");
    }
    const amountCents = multiplyPercentRoundHalfUp(baseAmountCents, rateHundredths);
    const amount = centsToDecimal(amountCents);
    const baseAmount = centsToDecimal(baseAmountCents);

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO seller_commissions(tenant_id,sale_id,user_id,amount,base_amount,status)
       VALUES($1,$2,$3,$4,$5,'pending')
       ON CONFLICT(tenant_id,sale_id,user_id) DO NOTHING
       RETURNING id`,
      [context.tenantId, input.saleId, context.userId, amount, baseAmount],
    );
    const created = inserted.rows[0];

    if (!created) {
      const existingResult = await client.query<CommissionRow>(
        `SELECT id,amount::text,base_amount::text,status
           FROM seller_commissions
          WHERE tenant_id=$1 AND sale_id=$2 AND user_id=$3`,
        [context.tenantId, input.saleId, context.userId],
      );
      const existing = existingResult.rows[0];
      if (!existing) {
        throw new NotFoundException("Comissao da venda nao encontrada apos repeticao.");
      }
      return {
        status: "existing",
        commissionId: existing.id,
        amountCents: decimalToCents(existing.amount),
        baseAmountCents: decimalToCents(existing.base_amount),
        ratePercent: normalizePercent(rule.rate_percent),
        ruleId: rule.id,
      };
    }

    await insertAudit(client, context, "seller_commission.provisioned", created.id, {
      saleId: input.saleId,
      branchId: input.branchId,
      sellerUserId: context.userId,
      ruleId: rule.id,
      ruleBranchId: rule.branch_id,
      before: null,
      after: {
        amount,
        baseAmount,
        ratePercent: normalizePercent(rule.rate_percent),
        status: "pending",
      },
    });

    return {
      status: "created",
      commissionId: created.id,
      amountCents,
      baseAmountCents,
      ratePercent: normalizePercent(rule.rate_percent),
      ruleId: rule.id,
    };
  }

  async cancelInTransaction(
    client: PoolClient,
    context: TenantContext,
    saleId: string,
    reason: string,
  ) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new BadRequestException("Informe o motivo do cancelamento da comissao.");
    }

    const saleResult = await client.query<{ branch_id: string }>(
      `SELECT branch_id
         FROM sales
        WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL`,
      [context.tenantId, saleId],
    );
    const sale = saleResult.rows[0];
    if (!sale) throw new NotFoundException("Venda nao encontrada.");
    ensureBranchAccess(context, sale.branch_id);

    const commissions = await client.query<CommissionRow>(
      `SELECT id,amount::text,base_amount::text,status,adjusted_at,adjustment_reason
         FROM seller_commissions
        WHERE tenant_id=$1 AND sale_id=$2
        ORDER BY id
        FOR UPDATE`,
      [context.tenantId, saleId],
    );

    let cancelled = 0;
    let paidPreserved = 0;
    for (const current of commissions.rows) {
      if (current.status === "paid") {
        paidPreserved += 1;
        continue;
      }

      const updatedResult = await client.query<CommissionRow>(
        `UPDATE seller_commissions
            SET amount=0,status='cancelled',adjusted_at=now(),adjustment_reason=$3
          WHERE tenant_id=$1 AND id=$2 AND status<>'paid'
          RETURNING id,amount::text,base_amount::text,status,adjusted_at,adjustment_reason`,
        [context.tenantId, current.id, normalizedReason],
      );
      const updated = updatedResult.rows[0];
      if (!updated) continue;

      await insertAudit(client, context, "seller_commission.cancelled", current.id, {
        saleId,
        branchId: sale.branch_id,
        reason: normalizedReason,
        before: auditSnapshot(current),
        after: auditSnapshot(updated),
      });
      cancelled += 1;
    }

    return { cancelled, paidPreserved };
  }
}

function decimalToCents(value: string | number) {
  const normalized = String(value).trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new BadRequestException("Valor financeiro invalido.");
  const cents = BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new BadRequestException("Valor financeiro fora do limite seguro.");
  }
  return Number(cents);
}

function percentToHundredths(value: string | number) {
  const normalized = String(value).trim();
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new BadRequestException("Percentual de comissao invalido.");
  const hundredths = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (hundredths < 0 || hundredths > 10_000) {
    throw new BadRequestException("Percentual de comissao fora do limite permitido.");
  }
  return hundredths;
}

function multiplyPercentRoundHalfUp(amountCents: number, rateHundredths: number) {
  const result = (BigInt(amountCents) * BigInt(rateHundredths) + 5_000n) / 10_000n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new BadRequestException("Comissao fora do limite financeiro seguro.");
  }
  return Number(result);
}

function centsToDecimal(cents: number) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function normalizePercent(value: string | number) {
  const hundredths = percentToHundredths(value);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

function auditSnapshot(row: CommissionRow) {
  return {
    amount: centsToDecimal(decimalToCents(row.amount)),
    baseAmount: centsToDecimal(decimalToCents(row.base_amount)),
    status: row.status,
    adjustedAt:
      row.adjusted_at instanceof Date
        ? row.adjusted_at.toISOString()
        : (row.adjusted_at ?? null),
    adjustmentReason: row.adjustment_reason ?? null,
  };
}

async function insertAudit(
  client: PoolClient,
  context: TenantContext,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
     VALUES($1,$2,$3,'seller_commission',$4,$5::jsonb)`,
    [
      context.tenantId,
      context.userId ?? null,
      action,
      entityId,
      JSON.stringify(metadata),
    ],
  );
}
