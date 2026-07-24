import type { PoolClient } from "pg";
import { assertBranchRepositoryScope, type BranchRepositoryScope } from "../../domain/repository-scope";

export interface PaymentSnapshot {
  id: string;
  branchId: string;
  saleId: string;
  status: string;
  settlementStatus: string;
  grossAmount: string;
  totalFeeAmount: string;
  netAmount: string;
}

export interface ReceivableSnapshot {
  id: string;
  branchId: string;
  saleId: string | null;
  salePaymentId: string | null;
  status: string;
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
}

export interface SettlementSnapshot {
  id: string;
  branchId: string;
  paymentId: string;
  externalReference: string;
  settledAmount: string;
  status: string;
}

export interface PaymentLookupScope extends BranchRepositoryScope {
  paymentId: string;
}

export interface ReceivableLookupScope extends BranchRepositoryScope {
  receivableId: string;
}

export interface SettlementReferenceScope extends BranchRepositoryScope {
  externalReference: string;
}

export interface FinancialRepository {
  findPaymentForUpdate(client: PoolClient, scope: PaymentLookupScope): Promise<PaymentSnapshot | null>;
  findReceivableForUpdate(client: PoolClient, scope: ReceivableLookupScope): Promise<ReceivableSnapshot | null>;
  findSettlementByExternalReferenceForUpdate(
    client: PoolClient,
    scope: SettlementReferenceScope,
  ): Promise<SettlementSnapshot | null>;
}

interface PaymentRow {
  id: string;
  branch_id: string;
  sale_id: string;
  status: string;
  settlement_status: string;
  gross_amount: string;
  total_fee_amount: string;
  net_amount: string;
}

interface ReceivableRow {
  id: string;
  branch_id: string;
  sale_id: string | null;
  sale_payment_id: string | null;
  status: string;
  gross_amount: string;
  fee_amount: string;
  net_amount: string;
}

interface SettlementRow {
  id: string;
  branch_id: string;
  payment_id: string;
  external_reference: string;
  settled_amount: string;
  status: string;
}

export class PgFinancialRepository implements FinancialRepository {
  async findPaymentForUpdate(client: PoolClient, scope: PaymentLookupScope): Promise<PaymentSnapshot | null> {
    assertBranchRepositoryScope(scope);
    const result = await client.query<PaymentRow>(
      `SELECT id,branch_id,sale_id,status,settlement_status,
              COALESCE(gross_amount,amount)::text AS gross_amount,
              COALESCE(total_fee_amount,0)::text AS total_fee_amount,
              COALESCE(net_amount,amount)::text AS net_amount
       FROM sale_payments
       WHERE tenant_id = $1 AND branch_id = $2 AND id = $3
       FOR UPDATE`,
      [scope.tenantId, scope.branchId, scope.paymentId],
    );
    const row = result.rows[0];
    return row ? mapPayment(row) : null;
  }

  async findReceivableForUpdate(client: PoolClient, scope: ReceivableLookupScope): Promise<ReceivableSnapshot | null> {
    assertBranchRepositoryScope(scope);
    const result = await client.query<ReceivableRow>(
      `SELECT id,branch_id,sale_id,sale_payment_id,status,
              COALESCE(gross_amount,amount)::text AS gross_amount,
              COALESCE(fee_amount,0)::text AS fee_amount,
              COALESCE(net_amount,amount)::text AS net_amount
       FROM accounts_receivable
       WHERE tenant_id = $1 AND branch_id = $2 AND id = $3
       FOR UPDATE`,
      [scope.tenantId, scope.branchId, scope.receivableId],
    );
    const row = result.rows[0];
    return row ? mapReceivable(row) : null;
  }

  async findSettlementByExternalReferenceForUpdate(
    client: PoolClient,
    scope: SettlementReferenceScope,
  ): Promise<SettlementSnapshot | null> {
    assertBranchRepositoryScope(scope);
    if (!scope.externalReference) throw new TypeError("Referencia externa obrigatoria.");
    const result = await client.query<SettlementRow>(
      `SELECT id,branch_id,payment_id,external_reference,settled_amount,status
       FROM payment_settlements
       WHERE tenant_id = $1 AND branch_id = $2 AND external_reference = $3
       FOR UPDATE`,
      [scope.tenantId, scope.branchId, scope.externalReference],
    );
    const row = result.rows[0];
    return row ? mapSettlement(row) : null;
  }
}

function mapPayment(row: PaymentRow): PaymentSnapshot {
  return {
    id: row.id,
    branchId: row.branch_id,
    saleId: row.sale_id,
    status: row.status,
    settlementStatus: row.settlement_status,
    grossAmount: row.gross_amount,
    totalFeeAmount: row.total_fee_amount,
    netAmount: row.net_amount,
  };
}

function mapReceivable(row: ReceivableRow): ReceivableSnapshot {
  return {
    id: row.id,
    branchId: row.branch_id,
    saleId: row.sale_id,
    salePaymentId: row.sale_payment_id,
    status: row.status,
    grossAmount: row.gross_amount,
    feeAmount: row.fee_amount,
    netAmount: row.net_amount,
  };
}

function mapSettlement(row: SettlementRow): SettlementSnapshot {
  return {
    id: row.id,
    branchId: row.branch_id,
    paymentId: row.payment_id,
    externalReference: row.external_reference,
    settledAmount: row.settled_amount,
    status: row.status,
  };
}
