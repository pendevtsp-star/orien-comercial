import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  FinancialForecastListQuery,
  PaymentAcquirerCreateInput,
  PaymentAcquirerUpdateInput,
  PaymentFeeRuleCreateInput,
  PaymentFeeRuleDeactivateInput,
  PaymentSettlementBatchInput,
  PaymentSettlementCreateInput,
  PaymentSettlementReverseInput,
  PaymentSnapshotResolveInput,
  ReconciliationBatchCreateInput,
} from "@sgc/types";
import type { PoolClient } from "pg";
import { ensureBranchAccess, ensureFound, pagination, resolveSort } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";
import { resolvePaymentFee } from "./payment-fee-resolver";

interface FeeRuleRow {
  acquirer_id: string;
  branch_id: string | null;
  rule_id: string | null;
  version: number | null;
  percentage_basis_points: number | null;
  fixed_fee: string | null;
  anticipation_basis_points: number | null;
  settlement_days: number | null;
}

interface PaymentRow {
  id: string;
  branch_id: string;
  net_amount: string | null;
  amount: string;
  settlement_status: string;
}

interface PaymentAcquirerRow {
  id: string;
  branchId: string | null;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

interface PaymentFeeRuleRow {
  id: string;
  acquirerId: string;
  acquirerName: string;
  paymentMethod: string;
  brand: string | null;
  installmentFrom: number;
  installmentTo: number;
  percentageBasisPoints: number;
  fixedFee: string;
  anticipationBasisPoints: number;
  settlementDays: number;
  version: number;
  validFrom: Date;
  validUntil: Date | null;
  isActive: boolean;
}

interface FeeRuleMutationRow {
  id: string;
  version: number;
  isActive?: boolean;
}

interface FinancialForecastRow {
  id: string;
  branchId: string;
  saleId: string;
  method: string;
  brand: string | null;
  installments: number;
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  expectedSettlementDate: string;
  settlementStatus: string;
  settledAmount: string;
}

interface SettlementMutationRow {
  id: string;
  paymentId: string;
  settledAmount: string;
  effectiveAt: Date;
  status: string;
}

interface SettlementReversalRow {
  id: string;
  status: string;
}

interface ReconciliationBatchRow {
  id: string;
  status: string;
  expectedAmount: string;
  actualAmount: string;
  differenceAmount: string;
}

interface ReconciliationReplayRow extends ReconciliationBatchRow {
  request_hash: string;
  idempotentReplay: boolean;
}

@Injectable()
export class FinancialSettlementsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listAcquirers(context: TenantContext) {
    const params: unknown[] = [context.tenantId];
    const branchFilter = context.branchId ? "AND (branch_id IS NULL OR branch_id=$2)" : "";
    if (context.branchId) params.push(context.branchId);
    const result = await this.database.tenantQuery<PaymentAcquirerRow>(
      context.tenantId,
      `SELECT id,branch_id AS "branchId",name,code,is_active AS "isActive",created_at AS "createdAt",updated_at AS "updatedAt"
       FROM payment_acquirers WHERE tenant_id=$1 ${branchFilter} ORDER BY is_active DESC,name`,
      params,
    );
    return { data: result.rows };
  }

  async createAcquirer(context: TenantContext, input: PaymentAcquirerCreateInput) {
    ensureBranchAccess(context, input.branchId);
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<PaymentAcquirerRow>(
        `INSERT INTO payment_acquirers(tenant_id,branch_id,name,code,is_active,created_by_user_id)
         VALUES($1,$2,$3,$4,$5,$6)
         RETURNING id,branch_id AS "branchId",name,code,is_active AS "isActive",created_at AS "createdAt"`,
        [context.tenantId, input.branchId ?? context.branchId ?? null, input.name, input.code, input.isActive, context.userId ?? null],
      );
      const row = ensureFound(result.rows[0], "Adquirente");
      await audit(client, context, "financial.acquirer.created", "payment_acquirer", row.id, {
        branchId: input.branchId ?? context.branchId ?? null,
        code: input.code,
      });
      return row;
    });
  }

  async updateAcquirer(context: TenantContext, id: string, input: PaymentAcquirerUpdateInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const existing = ensureFound((await client.query<{ branch_id: string | null }>(
        "SELECT branch_id FROM payment_acquirers WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [context.tenantId, id],
      )).rows[0], "Adquirente");
      ensureBranchAccess(context, existing.branch_id);
      ensureBranchAccess(context, input.branchId);
      const result = await client.query<PaymentAcquirerRow>(
        `UPDATE payment_acquirers SET
           branch_id=COALESCE($3,branch_id),name=COALESCE($4,name),code=COALESCE($5,code),
           is_active=COALESCE($6,is_active),updated_at=now()
         WHERE tenant_id=$1 AND id=$2
         RETURNING id,branch_id AS "branchId",name,code,is_active AS "isActive",updated_at AS "updatedAt"`,
        [context.tenantId, id, input.branchId ?? null, input.name ?? null, input.code ?? null, input.isActive ?? null],
      );
      await audit(client, context, "financial.acquirer.updated", "payment_acquirer", id, { fields: Object.keys(input) });
      return ensureFound(result.rows[0], "Adquirente");
    });
  }

  async deactivateAcquirer(context: TenantContext, id: string) {
    return this.updateAcquirer(context, id, { isActive: false });
  }

  async listFeeRules(context: TenantContext, acquirerId?: string) {
    const params: unknown[] = [context.tenantId];
    const filters = ["pfr.tenant_id=$1"];
    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`(pa.branch_id IS NULL OR pa.branch_id=$${params.length})`);
    }
    if (acquirerId) {
      params.push(acquirerId);
      filters.push(`pfr.acquirer_id=$${params.length}`);
    }
    const result = await this.database.tenantQuery<PaymentFeeRuleRow>(
      context.tenantId,
      `SELECT pfr.id,pfr.acquirer_id AS "acquirerId",pa.name AS "acquirerName",pfr.payment_method AS "paymentMethod",
              pfr.brand,pfr.installment_from AS "installmentFrom",pfr.installment_to AS "installmentTo",
              pfr.percentage_basis_points AS "percentageBasisPoints",pfr.fixed_fee AS "fixedFee",
              pfr.anticipation_basis_points AS "anticipationBasisPoints",pfr.settlement_days AS "settlementDays",
              pfr.version,pfr.valid_from AS "validFrom",pfr.valid_until AS "validUntil",pfr.is_active AS "isActive"
       FROM payment_fee_rules pfr JOIN payment_acquirers pa ON pa.tenant_id=pfr.tenant_id AND pa.id=pfr.acquirer_id
       WHERE ${filters.join(" AND ")} ORDER BY pfr.created_at DESC`,
      params,
    );
    return { data: result.rows };
  }

  async createFeeRule(context: TenantContext, input: PaymentFeeRuleCreateInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const acquirer = ensureFound((await client.query<{ id: string; branch_id: string | null }>(
        "SELECT id,branch_id FROM payment_acquirers WHERE tenant_id=$1 AND id=$2 AND is_active=true LIMIT 1",
        [context.tenantId, input.acquirerId],
      )).rows[0], "Adquirente");
      ensureBranchAccess(context, acquirer.branch_id);
      const brand = input.brand ?? "";
      const lockKey = [input.acquirerId, input.paymentMethod, brand, input.installmentFrom, input.installmentTo].join(":");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${context.tenantId}:${lockKey}`]);
      const versionResult = await client.query<{ version: number; supersedes_rule_id: string }>(
        `SELECT version,id AS supersedes_rule_id FROM payment_fee_rules
         WHERE tenant_id=$1 AND acquirer_id=$2 AND payment_method=$3 AND COALESCE(brand,'')=$4
           AND installment_from=$5 AND installment_to=$6
         ORDER BY version DESC LIMIT 1`,
        [context.tenantId, input.acquirerId, input.paymentMethod, brand, input.installmentFrom, input.installmentTo],
      );
      const version = Number(versionResult.rows[0]?.version ?? 0) + 1;
      const supersedesRuleId = versionResult.rows[0]?.supersedes_rule_id ?? null;
      const result = await client.query<FeeRuleMutationRow>(
        `INSERT INTO payment_fee_rules(
           tenant_id,acquirer_id,payment_method,brand,installment_from,installment_to,
           percentage_basis_points,fixed_fee,anticipation_basis_points,settlement_days,version,
           valid_from,valid_until,supersedes_rule_id,created_by_user_id
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id,version`,
        [
          context.tenantId, input.acquirerId, input.paymentMethod, input.brand ?? null,
          input.installmentFrom, input.installmentTo, input.percentageBasisPoints,
          centsToDecimal(input.fixedFeeCents), input.anticipationBasisPoints, input.settlementDays,
          version, input.validFrom, input.validUntil ?? null, supersedesRuleId, context.userId ?? null,
        ],
      );
      const row = ensureFound(result.rows[0], "Regra de taxa");
      await audit(client, context, "financial.fee_rule.version_created", "payment_fee_rule", row.id, {
        acquirerId: input.acquirerId,
        paymentMethod: input.paymentMethod,
        version,
      });
      return row;
    });
  }

  async deactivateFeeRule(context: TenantContext, id: string, input: PaymentFeeRuleDeactivateInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<FeeRuleMutationRow>(
        `UPDATE payment_fee_rules pfr SET is_active=false,deactivated_at=now(),deactivated_by_user_id=$3,
           deactivation_reason=$4
         FROM payment_acquirers pa
         WHERE pfr.tenant_id=$1 AND pfr.id=$2 AND pa.tenant_id=pfr.tenant_id AND pa.id=pfr.acquirer_id
           AND ($5::uuid IS NULL OR pa.branch_id IS NULL OR pa.branch_id=$5)
         RETURNING pfr.id,pfr.version,pfr.is_active AS "isActive"`,
        [context.tenantId, id, context.userId ?? null, input.reason, context.branchId],
      );
      const row = ensureFound(result.rows[0], "Regra de taxa");
      await audit(client, context, "financial.fee_rule.deactivated", "payment_fee_rule", id, { reason: input.reason });
      return row;
    });
  }

  async resolvePaymentSnapshots(context: TenantContext, inputs: PaymentSnapshotResolveInput[]) {
    return this.database.tenantTransaction(context.tenantId, (client) =>
      this.resolvePaymentSnapshotsInTransaction(client, context, inputs),
    );
  }

  async resolvePaymentSnapshotsInTransaction(client: PoolClient, context: TenantContext, inputs: PaymentSnapshotResolveInput[]) {
    const snapshots = [];
    for (const input of inputs) snapshots.push(await this.resolvePaymentSnapshotInTransaction(client, context, input));
    return snapshots;
  }

  async resolvePaymentSnapshotInTransaction(client: PoolClient, context: TenantContext, input: PaymentSnapshotResolveInput) {
    ensureBranchAccess(context, input.branchId);
    let rule: FeeRuleRow | undefined;
    if (input.acquirerId) {
      const result = await client.query<FeeRuleRow>(
        `SELECT pa.id AS acquirer_id,pa.branch_id,pfr.id AS rule_id,pfr.version,
                pfr.percentage_basis_points,pfr.fixed_fee,pfr.anticipation_basis_points,pfr.settlement_days
         FROM payment_acquirers pa
         LEFT JOIN LATERAL (
           SELECT candidate.id,candidate.version,candidate.percentage_basis_points,candidate.fixed_fee,
                  candidate.anticipation_basis_points,candidate.settlement_days,candidate.brand,candidate.valid_from
           FROM payment_fee_rules candidate
           WHERE candidate.tenant_id=pa.tenant_id AND candidate.acquirer_id=pa.id
             AND candidate.is_active=true AND candidate.payment_method=$4
             AND (candidate.brand IS NULL OR candidate.brand=$5)
             AND $6 BETWEEN candidate.installment_from AND candidate.installment_to
             AND candidate.valid_from<=$7::timestamptz
             AND (candidate.valid_until IS NULL OR candidate.valid_until>=$7::timestamptz)
           ORDER BY (candidate.brand IS NOT NULL) DESC,candidate.valid_from DESC,candidate.version DESC
           LIMIT 1
         ) pfr ON true
         WHERE pa.tenant_id=$1 AND pa.id=$2 AND (pa.branch_id IS NULL OR pa.branch_id=$3) AND pa.is_active=true
         LIMIT 1`,
        [context.tenantId, input.acquirerId, input.branchId, input.paymentMethod, input.brand ?? null, input.installments, input.occurredAt],
      );
      rule = ensureFound(result.rows[0], "Adquirente");
      ensureBranchAccess(context, rule.branch_id);
    }

    const resolution = resolvePaymentFee({
      grossAmountCents: input.grossAmountCents,
      percentageBasisPoints: Number(rule?.percentage_basis_points ?? 0),
      fixedFeeCents: decimalToCents(rule?.fixed_fee ?? "0"),
      anticipationBasisPoints: Number(rule?.anticipation_basis_points ?? 0),
      settlementDays: Number(rule?.settlement_days ?? 0),
      occurredAt: new Date(input.occurredAt),
    });
    return {
      branchId: input.branchId,
      acquirerId: rule?.acquirer_id ?? null,
      feeRuleId: rule?.rule_id ?? null,
      feeRuleVersion: rule?.version ?? null,
      paymentMethod: input.paymentMethod,
      brand: input.brand ?? null,
      installments: input.installments,
      ...resolution,
    };
  }

  async listForecasts(context: TenantContext, query: FinancialForecastListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["sp.tenant_id=$1", "sp.snapshot_locked_at IS NOT NULL"];
    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`sp.branch_id=$${params.length}`);
    } else if (query.branchId) {
      ensureBranchAccess(context, query.branchId);
      params.push(query.branchId);
      filters.push(`sp.branch_id=$${params.length}`);
    }
    for (const [value, sql] of [
      [query.acquirerId, "sp.acquirer_id"], [query.paymentMethod, "sp.method"], [query.status, "sp.settlement_status"],
    ] as const) {
      if (value) { params.push(value); filters.push(`${sql}=$${params.length}`); }
    }
    if (query.expectedFrom) { params.push(query.expectedFrom); filters.push(`sp.expected_settlement_date>=$${params.length}::date`); }
    if (query.expectedTo) { params.push(query.expectedTo); filters.push(`sp.expected_settlement_date<=$${params.length}::date`); }
    const sort = resolveSort(query, {
      expectedSettlementDate: "sp.expected_settlement_date",
      grossAmount: "sp.gross_amount",
      netAmount: "sp.net_amount",
      createdAt: "sp.created_at",
    }, "expectedSettlementDate");
    const count = await this.database.tenantQuery<{ total: string }>(context.tenantId,
      `SELECT count(*)::text AS total FROM sale_payments sp WHERE ${filters.join(" AND ")}`, params);
    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery<FinancialForecastRow>(context.tenantId,
      `SELECT sp.id,sp.branch_id AS "branchId",sp.sale_id AS "saleId",sp.method,sp.brand,sp.installments,
              sp.gross_amount AS "grossAmount",sp.total_fee_amount AS "feeAmount",sp.net_amount AS "netAmount",
              sp.expected_settlement_date AS "expectedSettlementDate",sp.settlement_status AS "settlementStatus",
              COALESCE(SUM(CASE WHEN ps.status='posted' THEN ps.settled_amount ELSE -ps.settled_amount END),0) AS "settledAmount"
       FROM sale_payments sp LEFT JOIN payment_settlements ps ON ps.tenant_id=sp.tenant_id AND ps.payment_id=sp.id
       WHERE ${filters.join(" AND ")}
       GROUP BY sp.id ORDER BY ${sort.field} ${sort.direction},sp.id
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async createSettlement(context: TenantContext, input: PaymentSettlementCreateInput) {
    return this.database.tenantTransaction(context.tenantId, (client) => this.createSettlementInTransaction(client, context, input));
  }

  async createSettlementBatch(context: TenantContext, input: PaymentSettlementBatchInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const data = [];
      for (const settlement of input.settlements) data.push(await this.createSettlementInTransaction(client, context, settlement));
      await audit(client, context, "financial.settlement.batch_created", "payment_settlement", null, { count: data.length });
      return { data };
    });
  }

  private async createSettlementInTransaction(client: PoolClient, context: TenantContext, input: PaymentSettlementCreateInput) {
    const replay = (await client.query<{
      id: string; payment_id: string; settled_amount: string; effective_at: Date; status: string;
    }>(
      `SELECT id,payment_id,settled_amount,effective_at,status FROM payment_settlements
       WHERE tenant_id=$1 AND external_reference=$2 LIMIT 1`,
      [context.tenantId, input.externalReference],
    )).rows[0];
    if (replay) {
      const same = replay.payment_id === input.paymentId
        && decimalToCents(replay.settled_amount) === input.settledAmountCents
        && replay.effective_at.toISOString() === new Date(input.effectiveAt).toISOString()
        && replay.status === input.status;
      if (!same) throw new ConflictException("A referência externa já foi usada por outra liquidação.");
      return { ...replay, idempotentReplay: true };
    }

    const payment = ensureFound((await client.query<PaymentRow>(
      `SELECT sp.id,COALESCE(sp.branch_id,s.branch_id) AS branch_id,sp.net_amount,sp.amount,sp.settlement_status
       FROM sale_payments sp JOIN sales s ON s.tenant_id=sp.tenant_id AND s.id=sp.sale_id
       WHERE sp.tenant_id=$1 AND sp.id=$2 FOR UPDATE`,
      [context.tenantId, input.paymentId],
    )).rows[0], "Pagamento");
    ensureBranchAccess(context, payment.branch_id);
    const totals = await client.query<{ settled_total: string }>(
      `SELECT COALESCE(SUM(CASE WHEN status='posted' THEN settled_amount ELSE -settled_amount END),0)::text AS settled_total
       FROM payment_settlements WHERE tenant_id=$1 AND payment_id=$2`,
      [context.tenantId, input.paymentId],
    );
    const netAmountCents = decimalToCents(payment.net_amount ?? payment.amount);
    const alreadySettledCents = decimalToCents(totals.rows[0]?.settled_total ?? "0");
    if (alreadySettledCents + input.settledAmountCents > netAmountCents) {
      throw new BadRequestException("A liquidação excede o valor líquido pendente.");
    }
    const status = alreadySettledCents + input.settledAmountCents === netAmountCents ? "settled" : "partially_settled";
    const inserted = await client.query<SettlementMutationRow>(
      `INSERT INTO payment_settlements(
         tenant_id,branch_id,payment_id,receivable_id,settled_amount,effective_at,external_reference,status,actor_user_id,notes
       ) VALUES($1,$2,$3,$4,$5,$6,$7,'posted',$8,$9)
       RETURNING id,payment_id AS "paymentId",settled_amount AS "settledAmount",effective_at AS "effectiveAt",status`,
      [context.tenantId, payment.branch_id, input.paymentId, input.receivableId ?? null, centsToDecimal(input.settledAmountCents), input.effectiveAt, input.externalReference, context.userId ?? null, input.notes ?? null],
    );
    const row = ensureFound(inserted.rows[0], "Liquidação");
    await client.query(
      "UPDATE sale_payments SET settlement_status=$3 WHERE tenant_id=$1 AND id=$2",
      [context.tenantId, input.paymentId, status],
    );
    if (input.receivableId) {
      await client.query(
        `UPDATE accounts_receivable SET status=CASE WHEN $3='settled' THEN 'paid' ELSE status END,
           effective_settlement_at=CASE WHEN $3='settled' THEN $4::timestamptz ELSE effective_settlement_at END,updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND sale_payment_id=$5`,
        [context.tenantId, input.receivableId, status, input.effectiveAt, input.paymentId],
      );
    }
    await audit(client, context, "financial.settlement.created", "payment_settlement", row.id, {
      paymentId: input.paymentId,
      amountCents: input.settledAmountCents,
      settlementStatus: status,
    });
    return { ...row, settlementStatus: status, idempotentReplay: false };
  }

  async reverseSettlement(context: TenantContext, id: string, input: PaymentSettlementReverseInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const original = ensureFound((await client.query<{
        id: string; branch_id: string; payment_id: string; receivable_id: string | null; settled_amount: string;
      }>(
        `SELECT id,branch_id,payment_id,receivable_id,settled_amount FROM payment_settlements
         WHERE tenant_id=$1 AND id=$2 AND status='posted' FOR UPDATE`, [context.tenantId, id],
      )).rows[0], "Liquidação");
      ensureBranchAccess(context, original.branch_id);
      const duplicate = await client.query<{ id: string; status: string; reversed_settlement_id: string | null; notes: string | null }>(
        `SELECT id,status,reversed_settlement_id,notes FROM payment_settlements
         WHERE tenant_id=$1 AND external_reference=$2`, [context.tenantId, input.externalReference],
      );
      if (duplicate.rows[0]) {
        const replay = duplicate.rows[0];
        if (replay.status !== "reversed" || replay.reversed_settlement_id !== id || replay.notes !== input.reason) {
          throw new ConflictException("A referência externa já foi usada por outro estorno.");
        }
        return { ...replay, idempotentReplay: true };
      }
      const previousReversal = await client.query<{ id: string; external_reference: string }>(
        `SELECT id,external_reference FROM payment_settlements
         WHERE tenant_id=$1 AND reversed_settlement_id=$2 LIMIT 1`,
        [context.tenantId, id],
      );
      if (previousReversal.rows[0]) {
        throw new ConflictException({
          code: "SETTLEMENT_ALREADY_REVERSED",
          message: "Esta liquidação já foi estornada.",
          reversalId: previousReversal.rows[0].id,
          externalReference: previousReversal.rows[0].external_reference,
        });
      }
      const reversal = await client.query<SettlementReversalRow>(
        `INSERT INTO payment_settlements(
           tenant_id,branch_id,payment_id,receivable_id,settled_amount,effective_at,external_reference,status,
           actor_user_id,reversed_settlement_id,notes
         ) VALUES($1,$2,$3,$4,$5,now(),$6,'reversed',$7,$8,$9)
         ON CONFLICT (tenant_id,reversed_settlement_id) WHERE reversed_settlement_id IS NOT NULL DO NOTHING
         RETURNING id,status`,
        [context.tenantId, original.branch_id, original.payment_id, original.receivable_id, original.settled_amount,
          input.externalReference, context.userId ?? null, id, input.reason],
      );
      if (!reversal.rows[0]) {
        throw new ConflictException({
          code: "SETTLEMENT_ALREADY_REVERSED",
          message: "Esta liquidação já foi estornada.",
        });
      }
      await this.refreshPaymentSettlementStatus(client, context.tenantId, original.payment_id);
      await audit(client, context, "financial.settlement.reversed", "payment_settlement", id, {
        reversalId: reversal.rows[0]?.id ?? null,
        reason: input.reason,
      });
      return ensureFound(reversal.rows[0], "Estorno de liquidação");
    });
  }

  private async refreshPaymentSettlementStatus(client: PoolClient, tenantId: string, paymentId: string) {
    await client.query(
      `UPDATE sale_payments sp SET settlement_status=CASE
         WHEN totals.settled<=0 THEN 'pending'
         WHEN totals.settled<COALESCE(sp.net_amount,sp.amount) THEN 'partially_settled'
         ELSE 'settled' END
       FROM (SELECT COALESCE(SUM(CASE WHEN status='posted' THEN settled_amount ELSE -settled_amount END),0) AS settled
             FROM payment_settlements WHERE tenant_id=$1 AND payment_id=$2) totals
       WHERE sp.tenant_id=$1 AND sp.id=$2`,
      [tenantId, paymentId],
    );
  }

  async createReconciliationBatch(context: TenantContext, input: ReconciliationBatchCreateInput) {
    assertUniqueReconciliationItems(input);
    ensureBranchAccess(context, input.branchId);
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const requestHash = reconciliationRequestHash(input);
      const replay = await client.query<ReconciliationReplayRow>(
        `SELECT id,status,expected_amount AS "expectedAmount",actual_amount AS "actualAmount",
                difference_amount AS "differenceAmount",request_hash,true AS "idempotentReplay"
         FROM reconciliation_batches WHERE tenant_id=$1 AND external_reference=$2 LIMIT 1`,
        [context.tenantId, input.externalReference],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) {
          throw new ConflictException("A referência externa já foi usada por outro lote de conciliação.");
        }
        return replay.rows[0];
      }
      const acquirer = ensureFound((await client.query<{ id: string; branch_id: string | null }>(
        "SELECT id,branch_id FROM payment_acquirers WHERE tenant_id=$1 AND id=$2 AND is_active=true",
        [context.tenantId, input.acquirerId],
      )).rows[0], "Adquirente");
      ensureBranchAccess(context, acquirer.branch_id);
      if (acquirer.branch_id && acquirer.branch_id !== input.branchId) throw new BadRequestException("Adquirente não pertence à filial informada.");
      const batch = ensureFound((await client.query<{ id: string }>(
        `INSERT INTO reconciliation_batches(tenant_id,branch_id,acquirer_id,external_reference,request_hash,statement_date,actor_user_id)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [context.tenantId, input.branchId, input.acquirerId, input.externalReference, requestHash, input.statementDate ?? null, context.userId ?? null],
      )).rows[0], "Lote de conciliação");
      let expectedTotalCents = 0;
      let actualTotalCents = 0;
      for (const item of input.items) {
        const payment = ensureFound((await client.query<PaymentRow>(
          `SELECT sp.id,COALESCE(sp.branch_id,s.branch_id) AS branch_id,sp.net_amount,sp.amount,sp.settlement_status
           FROM sale_payments sp JOIN sales s ON s.tenant_id=sp.tenant_id AND s.id=sp.sale_id
           WHERE sp.tenant_id=$1 AND sp.id=$2 AND sp.acquirer_id=$3 FOR UPDATE`,
          [context.tenantId, item.paymentId, input.acquirerId],
        )).rows[0], "Pagamento");
        ensureBranchAccess(context, payment.branch_id);
        if (payment.branch_id !== input.branchId) throw new BadRequestException("Pagamento não pertence à filial do lote.");
        const settlementTotals = await client.query<{ settled_total: string }>(
          `SELECT COALESCE(SUM(CASE WHEN status='posted' THEN settled_amount ELSE -settled_amount END),0)::text AS settled_total
           FROM payment_settlements
           WHERE tenant_id=$1 AND payment_id=$2 AND status IN ('posted','reversed')`,
          [context.tenantId, item.paymentId],
        );
        const netCents = decimalToCents(payment.net_amount ?? payment.amount);
        const settledCents = decimalToCents(settlementTotals.rows[0]?.settled_total ?? "0");
        const expectedCents = Math.max(0, netCents - settledCents);
        const differenceCents = item.actualAmountCents - expectedCents;
        const itemStatus = differenceCents === 0 ? "reconciled" : "diverged";
        await client.query(
          `INSERT INTO reconciliation_items(
             tenant_id,branch_id,batch_id,payment_id,external_reference,expected_amount,actual_amount,difference_amount,status,effective_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id,status,difference_amount`,
          [context.tenantId, input.branchId, batch.id, item.paymentId, item.externalReference,
            centsToDecimal(expectedCents), centsToDecimal(item.actualAmountCents), centsToDecimal(differenceCents), itemStatus, item.effectiveAt ?? null],
        );
        await client.query("UPDATE sale_payments SET reconciliation_status=$3 WHERE tenant_id=$1 AND id=$2",
          [context.tenantId, item.paymentId, itemStatus]);
        expectedTotalCents += expectedCents;
        actualTotalCents += item.actualAmountCents;
      }
      const differenceTotalCents = actualTotalCents - expectedTotalCents;
      const status = differenceTotalCents === 0 ? "reconciled" : "diverged";
      const result = await client.query<ReconciliationBatchRow>(
        `UPDATE reconciliation_batches SET status=$3,expected_amount=$4,actual_amount=$5,difference_amount=$6,processed_at=now()
         WHERE tenant_id=$1 AND id=$2
         RETURNING id,status,expected_amount AS "expectedAmount",actual_amount AS "actualAmount",difference_amount AS "differenceAmount"`,
        [context.tenantId, batch.id, status, centsToDecimal(expectedTotalCents), centsToDecimal(actualTotalCents), centsToDecimal(differenceTotalCents)],
      );
      await audit(client, context, "financial.reconciliation.processed", "reconciliation_batch", batch.id, {
        itemCount: input.items.length,
        differenceCents: differenceTotalCents,
        status,
      });
      return ensureFound(result.rows[0], "Lote de conciliação");
    });
  }
}

function assertUniqueReconciliationItems(input: ReconciliationBatchCreateInput) {
  const paymentIds = new Set<string>();
  const references = new Set<string>();
  for (const item of input.items) {
    if (paymentIds.has(item.paymentId)) {
      throw new BadRequestException("Um pagamento não pode aparecer mais de uma vez no lote.");
    }
    if (references.has(item.externalReference)) {
      throw new BadRequestException("A referência de um item não pode se repetir no lote.");
    }
    paymentIds.add(item.paymentId);
    references.add(item.externalReference);
  }
}

function reconciliationRequestHash(input: ReconciliationBatchCreateInput) {
  const canonical = {
    branchId: input.branchId,
    acquirerId: input.acquirerId,
    externalReference: input.externalReference,
    statementDate: input.statementDate ?? null,
    items: [...input.items]
      .map((item) => ({
        paymentId: item.paymentId,
        actualAmountCents: item.actualAmountCents,
        externalReference: item.externalReference,
        effectiveAt: item.effectiveAt ?? null,
      }))
      .sort((left, right) => `${left.externalReference}:${left.paymentId}`.localeCompare(`${right.externalReference}:${right.paymentId}`)),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function centsToDecimal(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function decimalToCents(value: string | number) {
  const normalized = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new BadRequestException("Valor financeiro inválido.");
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] === "-" ? -cents : cents;
}

async function audit(
  client: PoolClient,
  context: TenantContext,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [context.tenantId, context.userId ?? null, action, entityType, entityId, JSON.stringify(metadata)],
  );
}
