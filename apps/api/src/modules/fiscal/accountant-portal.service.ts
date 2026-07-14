import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AccountantPortalAccessCreateInput } from "@sgc/types";
import { createHash, randomBytes } from "node:crypto";
import type { AppConfig } from "@sgc/config";
import { APP_CONFIG } from "../config/config.module";
import type { TenantContext } from "../../shared/request-context";
import { ensureBranchAccess, ensureFound } from "../../shared/resource-access";
import { DatabaseService } from "../database/database.service";

type PortalAccessRow = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  email: string;
  expires_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

type VerifiedAccess = PortalAccessRow & {
  tenant_name: string;
  branch_name: string | null;
};

@Injectable()
export class AccountantPortalService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async list(context: TenantContext) {
    const rows = await this.database.tenantQuery<PortalAccessRow & { branchName: string | null }>(
      context.tenantId,
      `SELECT a.id,a.branch_id,a.name,a.email,a.expires_at AS "expiresAt",a.last_used_at AS "lastUsedAt",
        a.revoked_at AS "revokedAt",a.created_at AS "createdAt",b.name AS "branchName"
       FROM accountant_portal_accesses a
       LEFT JOIN branches b ON b.id=a.branch_id
       WHERE a.tenant_id=$1
       ORDER BY a.created_at DESC`,
      [context.tenantId],
    );
    return { data: rows.rows };
  }

  async create(context: TenantContext, input: AccountantPortalAccessCreateInput) {
    if (input.branchId) ensureBranchAccess(context, input.branchId);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
    const created = await this.database.tenantQuery<{ id: string; expiresAt: Date }>(
      context.tenantId,
      `INSERT INTO accountant_portal_accesses(tenant_id,branch_id,name,email,token_hash,expires_at,created_by_user_id)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,expires_at AS "expiresAt"`,
      [
        context.tenantId,
        input.branchId ?? null,
        input.name,
        input.email,
        tokenHash,
        expiresAt,
        context.userId ?? null,
      ],
    );
    await this.database.tenantQuery(
      context.tenantId,
      "INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'accountant_portal.access_created','accountant_portal_access',$3,$4::jsonb)",
      [
        context.tenantId,
        context.userId ?? null,
        created.rows[0]!.id,
        JSON.stringify({ email: input.email, branchId: input.branchId ?? null, expiresAt }),
      ],
    );
    return {
      id: created.rows[0]!.id,
      expiresAt: created.rows[0]!.expiresAt,
      token,
      url: `${this.config.WEB_APP_URL.replace(/\/$/, "")}/contador?token=${encodeURIComponent(token)}`,
    };
  }

  async revoke(context: TenantContext, id: string) {
    const result = await this.database.tenantQuery<{ id: string }>(
      context.tenantId,
      `UPDATE accountant_portal_accesses
       SET revoked_at=now(),updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL
       RETURNING id`,
      [context.tenantId, id],
    );
    ensureFound(result.rows[0], "Acesso do contador");
    await this.database.tenantQuery(
      context.tenantId,
      "INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'accountant_portal.access_revoked','accountant_portal_access',$3,'{}'::jsonb)",
      [context.tenantId, context.userId ?? null, id],
    );
    return { ok: true };
  }

  async portalOverview(token: string, period?: string) {
    const access = await this.verify(token);
    const selectedPeriod = period ?? new Date().toISOString().slice(0, 7);
    const start = `${selectedPeriod}-01`;
    const params: unknown[] = [access.tenant_id, start];
    const branchFilter = access.branch_id ? "AND branch_id=$3" : "";
    if (access.branch_id) params.push(access.branch_id);
    const [documents, inbound, financial, stock] = await Promise.all([
      this.database.pool.query(
        `SELECT document_type AS "documentType",status,count(*)::int AS total
         FROM fiscal_documents
         WHERE tenant_id=$1 AND created_at >= $2::date AND created_at < ($2::date + interval '1 month') ${branchFilter}
         GROUP BY document_type,status ORDER BY document_type,status`,
        params,
      ),
      this.database.pool.query(
        `SELECT status,count(*)::int AS total,COALESCE(sum(total_amount),0)::text AS amount
         FROM purchase_fiscal_documents
         WHERE tenant_id=$1 AND COALESCE(issued_at,created_at) >= $2::date AND COALESCE(issued_at,created_at) < ($2::date + interval '1 month') ${branchFilter}
         GROUP BY status ORDER BY status`,
        params,
      ),
      this.database.pool.query(
        `SELECT origin,status,count(*)::int AS total,COALESCE(sum(amount),0)::text AS amount
         FROM (
          SELECT 'receber' AS origin,status,amount,due_date,branch_id FROM accounts_receivable WHERE tenant_id=$1
          UNION ALL
          SELECT 'pagar' AS origin,status,amount,due_date,branch_id FROM accounts_payable WHERE tenant_id=$1
         ) x
         WHERE due_date >= $2::date AND due_date < ($2::date + interval '1 month') ${branchFilter.replace("branch_id", "x.branch_id")}
         GROUP BY origin,status ORDER BY origin,status`,
        params,
      ),
      this.database.pool.query(
        `SELECT p.name AS "productName",b.name AS "branchName",sb.quantity::text AS quantity,p.min_stock::text AS "minStock"
         FROM stock_balances sb
         JOIN products p ON p.id=sb.product_id
         JOIN branches b ON b.id=sb.branch_id
         WHERE sb.tenant_id=$1 AND sb.quantity <= p.min_stock ${access.branch_id ? "AND sb.branch_id=$2" : ""}
         ORDER BY p.name LIMIT 50`,
        access.branch_id ? [access.tenant_id, access.branch_id] : [access.tenant_id],
      ),
    ]);
    return {
      tenant: {
        name: access.tenant_name,
        branchName: access.branch_name,
      },
      accountant: {
        name: access.name,
        email: access.email,
        expiresAt: access.expires_at,
      },
      period: selectedPeriod,
      documents: documents.rows,
      inbound: inbound.rows,
      financial: financial.rows,
      lowStock: stock.rows,
    };
  }

  async portalCsv(token: string, period?: string) {
    const overview = await this.portalOverview(token, period);
    const rows = [
      ["Portal do contador Orien"],
      ["Empresa", overview.tenant.name],
      ["Loja", overview.tenant.branchName ?? "Todas as lojas"],
      ["Competência", overview.period],
      [],
      ["Documentos fiscais"],
      ["Tipo", "Status", "Total"],
      ...overview.documents.map((row: Record<string, unknown>) => [
        row.documentType,
        row.status,
        row.total,
      ]),
      [],
      ["Financeiro"],
      ["Origem", "Status", "Total", "Valor"],
      ...overview.financial.map((row: Record<string, unknown>) => [
        row.origin,
        row.status,
        row.total,
        row.amount,
      ]),
      [],
      ["Estoque baixo"],
      ["Produto", "Loja", "Saldo", "Mínimo"],
      ...overview.lowStock.map((row: Record<string, unknown>) => [
        row.productName,
        row.branchName,
        row.quantity,
        row.minStock,
      ]),
    ];
    return Buffer.from(`\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`, "utf8");
  }

  private async verify(token: string) {
    const tokenHash = hashToken(token);
    const access = await this.database.pool.query<VerifiedAccess>(
      `SELECT a.*,t.name AS tenant_name,b.name AS branch_name
       FROM accountant_portal_accesses a
       JOIN tenants t ON t.id=a.tenant_id
       LEFT JOIN branches b ON b.id=a.branch_id
       WHERE a.token_hash=$1
       LIMIT 1`,
      [tokenHash],
    );
    const current = access.rows[0];
    if (!current || current.revoked_at) throw new UnauthorizedException("Acesso do contador inválido ou revogado.");
    if (current.expires_at.getTime() < Date.now()) throw new UnauthorizedException("Acesso do contador expirado.");
    await this.database.pool.query("UPDATE accountant_portal_accesses SET last_used_at=now(),updated_at=now() WHERE id=$1", [current.id]);
    return current;
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
