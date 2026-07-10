import { Inject, Injectable } from "@nestjs/common";
import { renderDocumentHtml } from "@sgc/documents";
import type {
  FinancialCategoryInput,
  FinancialEntryCreateInput,
  FinancialListQuery,
  FinancialMarkPaidInput,
  FinancialReconcileInput
} from "@sgc/types";
import type { PoolClient } from "pg";
import { ensureBranchAccess, ensureFound, pagination, resolveSort } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { loadTenantBranding } from "../../shared/tenant-branding";
import { DatabaseService } from "../database/database.service";

type FinancialKind = "receivables" | "payables";
interface CreatedFinancialEntry {
  id: string;
  amount: string;
  dueDate: string;
  status: string;
}

@Injectable()
export class FinancialService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(context: TenantContext, kind: FinancialKind, query: FinancialListQuery) {
    const table = kind === "receivables" ? "accounts_receivable" : "accounts_payable";
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["tenant_id = $1"];
    const sort = resolveSort(
      query,
      { dueDate: "due_date", amount: "amount", status: "status", createdAt: "created_at" },
      "dueDate"
    );

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`branch_id = $${params.length}`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`COALESCE(description, '') ILIKE $${params.length}`);
    }

    if (query.status) {
      params.push(query.status);
      filters.push(`status = $${params.length}`);
    }

    if (query.reconciliationStatus) {
      params.push(query.reconciliationStatus);
      filters.push(`COALESCE(reconciliation_status, 'pending') = $${params.length}`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `SELECT count(*)::text AS total FROM ${table} WHERE ${filters.join(" AND ")}`,
      params
    );

    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT id, branch_id AS "branchId", amount, due_date AS "dueDate", status, created_at AS "createdAt"
           , description
           , category_id AS "categoryId"
           , installment_number AS "installmentNumber"
           , installment_total AS "installmentTotal"
           , paid_at AS "paidAt"
           , payment_method AS "paymentMethod"
           , reconciliation_status AS "reconciliationStatus"
      FROM ${table}
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sort.field} ${sort.direction}, created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async create(context: TenantContext, kind: FinancialKind, input: FinancialEntryCreateInput) {
    ensureBranchAccess(context, input.branchId);
    const table = kind === "receivables" ? "accounts_receivable" : "accounts_payable";
    const partyColumn = kind === "receivables" ? "customer_id" : "supplier_id";
    const partyId = kind === "receivables" ? input.customerId : input.supplierId;

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const created: CreatedFinancialEntry[] = [];

      for (let index = 0; index < input.installmentCount; index += 1) {
        const dueDate = new Date(`${input.dueDate}T00:00:00`);
        dueDate.setMonth(dueDate.getMonth() + index);

        const result = await client.query<CreatedFinancialEntry>(
          `
          INSERT INTO ${table}
            (tenant_id, branch_id, ${partyColumn}, amount, due_date, status, description, category_id, installment_number, installment_total, payment_method)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, amount, due_date AS "dueDate", status
          `,
          [
            context.tenantId,
            context.branchId ?? input.branchId ?? null,
            partyId ?? null,
            input.amount,
            dueDate.toISOString().slice(0, 10),
            input.status,
            input.description ?? null,
            input.categoryId ?? null,
            index + 1,
            input.installmentCount,
            input.paymentMethod ?? null
          ]
        );
        created.push(ensureFound(result.rows[0], "Lancamento financeiro"));
      }

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: `${kind}.created`,
        entityType: table,
        metadata: { installmentCount: input.installmentCount, amount: input.amount, branchId: input.branchId ?? null }
      });

      return created;
    });
  }

  async markPaid(context: TenantContext, kind: FinancialKind, id: string, input: FinancialMarkPaidInput) {
    const table = kind === "receivables" ? "accounts_receivable" : "accounts_payable";
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const existing = await client.query<{ id: string; branch_id: string | null }>(
        `SELECT id, branch_id FROM ${table} WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [context.tenantId, id]
      );
      const entry = ensureFound(existing.rows[0], "Lancamento financeiro");
      ensureBranchAccess(context, entry.branch_id);

      const result = await client.query<{ id: string; status: string }>(
        `
        UPDATE ${table}
        SET status = 'paid', payment_method = $3, paid_at = COALESCE($4::timestamptz, now()), updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, status
        `,
        [context.tenantId, id, input.paymentMethod, input.paidAt ?? null]
      );

      const row = ensureFound(result.rows[0], "Lancamento financeiro");
      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: `${kind}.paid`,
        entityType: table,
        entityId: id,
        metadata: { paymentMethod: input.paymentMethod }
      });
      return row;
    });
  }

  async listCategories(context: TenantContext) {
    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT id, name, type
      FROM financial_categories
      WHERE tenant_id = $1
      ORDER BY type ASC, name ASC
      `,
      [context.tenantId]
    );
    return { data: result.rows };
  }

  async createCategory(context: TenantContext, input: FinancialCategoryInput) {
    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      INSERT INTO financial_categories (tenant_id, name, type)
      VALUES ($1, $2, $3)
      RETURNING id, name, type
      `,
      [context.tenantId, input.name, input.type]
    );
    return result.rows[0];
  }

  async reconcile(context: TenantContext, kind: FinancialKind, id: string, input: FinancialReconcileInput) {
    const table = kind === "receivables" ? "accounts_receivable" : "accounts_payable";
    const existing = await this.database.tenantQuery<{ id: string; branch_id: string | null }>(
      context.tenantId,
      `SELECT id, branch_id FROM ${table} WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [context.tenantId, id]
    );
    const entry = ensureFound(existing.rows[0], "Lancamento financeiro");
    ensureBranchAccess(context, entry.branch_id);

    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      UPDATE ${table}
      SET reconciliation_status = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2
      RETURNING id, reconciliation_status AS "reconciliationStatus"
      `,
      [context.tenantId, id, input.reconciliationStatus]
    );
    return ensureFound(result.rows[0], "Lancamento financeiro");
  }

  async cashflow(context: TenantContext) {
    const params: unknown[] = [context.tenantId];
    let branchFilter = "";
    if (context.branchId) {
      params.push(context.branchId);
      branchFilter = ` AND branch_id = $${params.length}`;
    }

    const [receivableOpen, payableOpen, paidIn, paidOut, byStatus] = await Promise.all([
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT COALESCE(sum(amount), 0)::text AS total FROM accounts_receivable WHERE tenant_id = $1 ${branchFilter} AND status = 'open'`,
        params
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT COALESCE(sum(amount), 0)::text AS total FROM accounts_payable WHERE tenant_id = $1 ${branchFilter} AND status = 'open'`,
        params
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT COALESCE(sum(amount), 0)::text AS total FROM accounts_receivable WHERE tenant_id = $1 ${branchFilter} AND status = 'paid'`,
        params
      ),
      this.database.tenantQuery<{ total: string }>(
        context.tenantId,
        `SELECT COALESCE(sum(amount), 0)::text AS total FROM accounts_payable WHERE tenant_id = $1 ${branchFilter} AND status = 'paid'`,
        params
      ),
      this.database.tenantQuery<{
        source: string;
        status: string;
        total: string;
      }>(
        context.tenantId,
        `
        SELECT source, status, COALESCE(sum(amount), 0)::text AS total
        FROM (
          SELECT 'receivable'::text AS source, status, amount, branch_id FROM accounts_receivable WHERE tenant_id = $1
          UNION ALL
          SELECT 'payable'::text AS source, status, amount, branch_id FROM accounts_payable WHERE tenant_id = $1
        ) entries
        WHERE 1 = 1 ${context.branchId ? `AND branch_id = $2` : ""}
        GROUP BY source, status
        ORDER BY source, status
        `,
        params
      )
    ]);

    return {
      receivableOpen: Number(receivableOpen.rows[0]?.total ?? 0),
      payableOpen: Number(payableOpen.rows[0]?.total ?? 0),
      paidIn: Number(paidIn.rows[0]?.total ?? 0),
      paidOut: Number(paidOut.rows[0]?.total ?? 0),
      projectedBalance:
        Number(receivableOpen.rows[0]?.total ?? 0) -
        Number(payableOpen.rows[0]?.total ?? 0) +
        Number(paidIn.rows[0]?.total ?? 0) -
        Number(paidOut.rows[0]?.total ?? 0),
      byStatus: byStatus.rows
    };
  }

  async cashflowDocument(context: TenantContext) {
    const branding = await loadTenantBranding(this.database, context.tenantId);
    const cashflow = await this.cashflow(context);
    return renderDocumentHtml({
      title: "Relatorio de fluxo de caixa",
      subtitle: "Visao consolidada de caixa, aberto, pago e conciliacao inicial.",
      badge: "Financeiro",
      branding,
      meta: [
        { label: "Empresa", value: branding.companyName },
        { label: "Escopo", value: context.branchId ? "Filial atual" : "Tenant completo" },
        { label: "Emitido em", value: new Date().toLocaleString("pt-BR") },
        { label: "Status agrupados", value: String(cashflow.byStatus.length) }
      ],
      sections: [
        {
          title: "Resumo executivo",
          metrics: [
            { label: "A receber aberto", value: toMoney(cashflow.receivableOpen) },
            { label: "A pagar aberto", value: toMoney(cashflow.payableOpen) },
            { label: "Saldo projetado", value: toMoney(cashflow.projectedBalance) }
          ]
        },
        {
          title: "Consolidado por status",
          table: {
            columns: [
              { key: "source", label: "Origem" },
              { key: "status", label: "Status" },
              { key: "total", label: "Total" }
            ],
            rows: cashflow.byStatus.map((row) => ({
              source: row.source,
              status: row.status,
              total: toMoney(row.total)
            }))
          }
        }
      ]
    });
  }
}

async function insertAuditLog(
  client: PoolClient,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await client.query(
    `
    INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      input.tenantId,
      input.actorUserId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

function toMoney(value: string | number) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
