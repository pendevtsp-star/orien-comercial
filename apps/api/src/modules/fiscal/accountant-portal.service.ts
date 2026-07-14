import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type {
  AccountantPortalAccessCreateInput,
  AccountantPortalLoginRequestInput,
  AccountantPortalLoginVerifyInput,
} from "@sgc/types";
import { renderDocumentPdf } from "@sgc/documents";
import type { AppConfig } from "@sgc/config";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import JSZip from "jszip";
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
  allowed_period_start: Date | null;
  allowed_period_end: Date | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

type VerifiedAccess = PortalAccessRow & {
  tenant_name: string;
  branch_name: string | null;
  session_expires_at: Date | null;
};

type PortalEventMeta = {
  ipAddress?: string;
  userAgent?: string;
  period?: string;
  exportFormat?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AccountantPortalService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async list(context: TenantContext) {
    const rows = await this.database.tenantQuery<
      PortalAccessRow & {
        branchName: string | null;
        expiresAt: Date;
        allowedPeriodStart: Date | null;
        allowedPeriodEnd: Date | null;
        lastUsedAt: Date | null;
        revokedAt: Date | null;
        createdAt: Date;
        recentEvents: Array<{
          eventType: string;
          period: string | null;
          exportFormat: string | null;
          ipAddress: string | null;
          createdAt: string;
        }>;
      }
    >(
      context.tenantId,
      `SELECT a.id,a.branch_id,a.name,a.email,a.expires_at AS "expiresAt",
        a.allowed_period_start AS "allowedPeriodStart",a.allowed_period_end AS "allowedPeriodEnd",
        a.last_used_at AS "lastUsedAt",a.revoked_at AS "revokedAt",a.created_at AS "createdAt",
        b.name AS "branchName",
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'eventType',e.event_type,
            'period',e.period,
            'exportFormat',e.export_format,
            'ipAddress',e.ip_address,
            'createdAt',e.created_at
          ) ORDER BY e.created_at DESC)
          FROM (
            SELECT event_type,period,export_format,ip_address,created_at
            FROM accountant_portal_events
            WHERE tenant_id=a.tenant_id AND access_id=a.id
            ORDER BY created_at DESC
            LIMIT 8
          ) e
        ),'[]'::jsonb) AS "recentEvents"
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
    const tokenHash = hashSecret(token);
    const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
    const created = await this.database.tenantQuery<{ id: string; expiresAt: Date }>(
      context.tenantId,
      `INSERT INTO accountant_portal_accesses(
        tenant_id,branch_id,name,email,token_hash,expires_at,allowed_period_start,allowed_period_end,created_by_user_id
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id,expires_at AS "expiresAt"`,
      [
        context.tenantId,
        input.branchId ?? null,
        input.name,
        input.email,
        tokenHash,
        expiresAt,
        input.allowedPeriodStart ? `${input.allowedPeriodStart}-01` : null,
        input.allowedPeriodEnd ? `${input.allowedPeriodEnd}-01` : null,
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
        JSON.stringify({
          email: input.email,
          branchId: input.branchId ?? null,
          expiresAt,
          allowedPeriodStart: input.allowedPeriodStart ?? null,
          allowedPeriodEnd: input.allowedPeriodEnd ?? null,
        }),
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
       SET revoked_at=now(),session_token_hash=NULL,session_expires_at=NULL,updated_at=now()
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
    await this.logEvent(context.tenantId, id, "access_revoked", {});
    return { ok: true };
  }

  async requestCode(input: AccountantPortalLoginRequestInput, meta: PortalEventMeta) {
    const access = await this.verifyLinkToken(input.token);
    if (access.email.toLowerCase() !== input.email.toLowerCase()) {
      await this.logEvent(access.tenant_id, access.id, "login_failed", { ...meta, metadata: { reason: "email_mismatch" } });
      throw new UnauthorizedException("E-mail não autorizado para este acesso.");
    }
    const code = String(randomInt(100000, 999999));
    await this.database.pool.query(
      `UPDATE accountant_portal_accesses
       SET login_code_hash=$2,login_code_expires_at=now()+interval '10 minutes',
        login_code_requested_at=now(),updated_at=now()
       WHERE id=$1`,
      [access.id, hashSecret(code)],
    );
    const sent = await this.sendLoginCode(access, code);
    await this.logEvent(access.tenant_id, access.id, "code_requested", { ...meta, metadata: { sent } });
    return {
      ok: true,
      sent,
      expiresInMinutes: 10,
      ...(sent ? {} : { devCode: code }),
    };
  }

  async verifyCode(input: AccountantPortalLoginVerifyInput, meta: PortalEventMeta) {
    const access = await this.verifyLinkToken(input.token, { includeLoginCode: true });
    if (access.email.toLowerCase() !== input.email.toLowerCase()) {
      await this.logEvent(access.tenant_id, access.id, "login_failed", { ...meta, metadata: { reason: "email_mismatch" } });
      throw new UnauthorizedException("E-mail não autorizado para este acesso.");
    }
    const codeResult = await this.database.pool.query<{ login_code_hash: string | null; login_code_expires_at: Date | null }>(
      "SELECT login_code_hash,login_code_expires_at FROM accountant_portal_accesses WHERE id=$1",
      [access.id],
    );
    const codeRow = codeResult.rows[0];
    if (!codeRow?.login_code_hash || !codeRow.login_code_expires_at || codeRow.login_code_expires_at.getTime() < Date.now()) {
      await this.logEvent(access.tenant_id, access.id, "login_failed", { ...meta, metadata: { reason: "expired_code" } });
      throw new UnauthorizedException("Código expirado. Solicite um novo código.");
    }
    if (codeRow.login_code_hash !== hashSecret(input.code)) {
      await this.logEvent(access.tenant_id, access.id, "login_failed", { ...meta, metadata: { reason: "invalid_code" } });
      throw new UnauthorizedException("Código inválido.");
    }
    const sessionToken = randomBytes(36).toString("base64url");
    const sessionExpiresAt = new Date(Math.min(access.expires_at.getTime(), Date.now() + 12 * 60 * 60 * 1000));
    await this.database.pool.query(
      `UPDATE accountant_portal_accesses
       SET session_token_hash=$2,session_expires_at=$3,session_created_at=now(),
        login_code_hash=NULL,login_code_expires_at=NULL,last_used_at=now(),updated_at=now()
       WHERE id=$1`,
      [access.id, hashSecret(sessionToken), sessionExpiresAt],
    );
    await this.logEvent(access.tenant_id, access.id, "code_verified", meta);
    return {
      sessionToken,
      expiresAt: sessionExpiresAt,
      accountant: { name: access.name, email: access.email },
      tenant: { name: access.tenant_name, branchName: access.branch_name },
    };
  }

  async portalOverview(auth: { token?: string; sessionToken?: string }, period?: string, meta: PortalEventMeta = {}) {
    const access = await this.verify(auth);
    const overview = await this.buildOverview(access, period);
    await this.logEvent(access.tenant_id, access.id, "overview_viewed", { ...meta, period: overview.period });
    return overview;
  }

  async portalCsv(auth: { token?: string; sessionToken?: string }, period?: string, meta: PortalEventMeta = {}) {
    const overview = await this.portalOverview(auth, period, meta);
    await this.logEvent(overview.access.tenantId, overview.access.id, "export_downloaded", { ...meta, period: overview.period, exportFormat: "csv" });
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

  async portalPdf(auth: { token?: string; sessionToken?: string }, period?: string, meta: PortalEventMeta = {}) {
    const overview = await this.portalOverview(auth, period, meta);
    await this.logEvent(overview.access.tenantId, overview.access.id, "export_downloaded", { ...meta, period: overview.period, exportFormat: "pdf" });
    const totalDocuments = overview.documents.reduce((sum: number, row: { total: number }) => sum + Number(row.total), 0);
    const attention = overview.documents
      .filter((row: { status: string }) => ["rejected", "error", "retry_pending"].includes(row.status))
      .reduce((sum: number, row: { total: number }) => sum + Number(row.total), 0);
    return Buffer.from(renderDocumentPdf({
      title: "Resumo contábil mensal",
      subtitle: "Documentos fiscais, financeiro e alertas operacionais liberados para o contador.",
      badge: "Portal do contador",
      branding: {
        companyName: overview.tenant.name,
        tradingName: overview.tenant.branchName ?? overview.tenant.name,
        primaryColor: "#0B1D3D",
        accentColor: "#F5C34A",
        website: "useorien.com.br",
        footerNote: "Documento gerado automaticamente pela Orien para conferência contábil.",
      },
      meta: [
        { label: "Competência", value: overview.period },
        { label: "Loja", value: overview.tenant.branchName ?? "Todas as lojas" },
        { label: "Contador", value: overview.accountant.name },
        { label: "Emitido em", value: new Date().toLocaleString("pt-BR") },
      ],
      sections: [
        {
          title: "Resumo executivo",
          metrics: [
            { label: "Documentos", value: String(totalDocuments) },
            { label: "Atenção fiscal", value: String(attention) },
            { label: "Estoque baixo", value: String(overview.lowStock.length) },
          ],
        },
        {
          title: "Documentos fiscais",
          table: {
            columns: [
              { key: "documentType", label: "Tipo" },
              { key: "statusLabel", label: "Status" },
              { key: "total", label: "Total" },
            ],
            rows: overview.documents.map((row: { documentType: string; status: string; total: number }) => ({
              ...row,
              statusLabel: statusLabel(row.status),
            })),
          },
        },
        {
          title: "Financeiro",
          table: {
            columns: [
              { key: "origin", label: "Origem" },
              { key: "statusLabel", label: "Status" },
              { key: "total", label: "Qtd" },
              { key: "amountLabel", label: "Valor" },
            ],
            rows: overview.financial.map((row: { origin: string; status: string; total: number; amount: string }) => ({
              ...row,
              statusLabel: statusLabel(row.status),
              amountLabel: money(row.amount),
            })),
          },
        },
      ],
    }));
  }

  async portalXmlZip(auth: { token?: string; sessionToken?: string }, period?: string, meta: PortalEventMeta = {}) {
    const access = await this.verify(auth);
    const selectedPeriod = this.periodAllowed(access, period ?? new Date().toISOString().slice(0, 7));
    const params: unknown[] = [access.tenant_id, `${selectedPeriod}-01`];
    const branchFilter = access.branch_id ? "AND fd.branch_id=$3" : "";
    if (access.branch_id) params.push(access.branch_id);
    const artifacts = await this.database.pool.query<{
      document_reference: string;
      kind: string;
      storage_key: string;
      content_type: string | null;
    }>(
      `SELECT fd.reference AS document_reference,fa.kind,fa.storage_key,fa.content_type
       FROM fiscal_artifacts fa
       JOIN fiscal_documents fd ON fd.id=fa.fiscal_document_id
       WHERE fa.tenant_id=$1 AND fd.created_at >= $2::date AND fd.created_at < ($2::date + interval '1 month')
        ${branchFilter} AND fa.status='ready' AND fa.kind IN ('xml','cancellation_xml') AND fa.storage_key IS NOT NULL
       ORDER BY fd.created_at,fa.kind`,
      params,
    );
    const zip = new JSZip();
    const root = this.config.UPLOAD_DIR;
    for (const artifact of artifacts.rows) {
      const target = isAbsolute(artifact.storage_key) ? artifact.storage_key : resolve(root, artifact.storage_key);
      try {
        const content = await readFile(target);
        zip.file(`${safeName(artifact.document_reference)}-${artifact.kind}.xml`, content);
      } catch {
        zip.file(`${safeName(artifact.document_reference)}-${artifact.kind}-indisponivel.txt`, "Arquivo não encontrado no armazenamento.");
      }
    }
    if (!artifacts.rows.length) {
      zip.file("sem-xml-disponivel.txt", "Nenhum XML pronto foi encontrado para a competência e escopo liberados.");
    }
    await this.logEvent(access.tenant_id, access.id, "export_downloaded", { ...meta, period: selectedPeriod, exportFormat: "xml" });
    return zip.generateAsync({ type: "nodebuffer" });
  }

  private async buildOverview(access: VerifiedAccess, period?: string) {
    const selectedPeriod = this.periodAllowed(access, period ?? new Date().toISOString().slice(0, 7));
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
      access: {
        id: access.id,
        tenantId: access.tenant_id,
        allowedPeriodStart: monthValue(access.allowed_period_start),
        allowedPeriodEnd: monthValue(access.allowed_period_end),
      },
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

  private async verify(auth: { token?: string; sessionToken?: string }) {
    if (auth.sessionToken) return this.verifySession(auth.sessionToken);
    if (auth.token) return this.verifyLinkToken(auth.token);
    throw new UnauthorizedException("Sessão do contador não informada.");
  }

  private async verifySession(sessionToken: string) {
    const access = await this.database.pool.query<VerifiedAccess>(
      `SELECT a.*,t.name AS tenant_name,b.name AS branch_name
       FROM accountant_portal_accesses a
       JOIN tenants t ON t.id=a.tenant_id
       LEFT JOIN branches b ON b.id=a.branch_id
       WHERE a.session_token_hash=$1
       LIMIT 1`,
      [hashSecret(sessionToken)],
    );
    const current = this.ensureAccess(access.rows[0]);
    if (!current.session_expires_at || current.session_expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException("Sessão do contador expirada. Entre novamente.");
    }
    await this.database.pool.query("UPDATE accountant_portal_accesses SET last_used_at=now(),updated_at=now() WHERE id=$1", [current.id]);
    return current;
  }

  private async verifyLinkToken(token: string, _options?: { includeLoginCode?: boolean }) {
    const access = await this.database.pool.query<VerifiedAccess>(
      `SELECT a.*,t.name AS tenant_name,b.name AS branch_name
       FROM accountant_portal_accesses a
       JOIN tenants t ON t.id=a.tenant_id
       LEFT JOIN branches b ON b.id=a.branch_id
       WHERE a.token_hash=$1
       LIMIT 1`,
      [hashSecret(token)],
    );
    return this.ensureAccess(access.rows[0]);
  }

  private ensureAccess<T extends VerifiedAccess & { session_expires_at?: Date | null }>(access?: T) {
    if (!access || access.revoked_at) throw new UnauthorizedException("Acesso do contador inválido ou revogado.");
    if (access.expires_at.getTime() < Date.now()) throw new UnauthorizedException("Acesso do contador expirado.");
    return access;
  }

  private periodAllowed(access: VerifiedAccess, period: string) {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new BadRequestException("Competência inválida.");
    const start = monthValue(access.allowed_period_start);
    const end = monthValue(access.allowed_period_end);
    if (start && period < start) throw new BadRequestException(`Competência anterior ao início liberado (${start}).`);
    if (end && period > end) throw new BadRequestException(`Competência posterior ao fim liberado (${end}).`);
    return period;
  }

  private async sendLoginCode(access: VerifiedAccess, code: string) {
    if (!this.config.RESEND_API_KEY) return false;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Orien <${this.config.EMAIL_FROM}>`,
        reply_to: this.config.SUPPORT_EMAIL,
        to: [access.email],
        subject: "Orien · Código de acesso do contador",
        html: `<main style="font-family:Arial,sans-serif;color:#0b1d3d;max-width:620px;margin:auto">
          <p style="color:#d6a100;font-weight:700;letter-spacing:.12em">ORIEN CONTÁBIL</p>
          <h1>Código de acesso</h1>
          <p>Use o código abaixo para acessar o portal externo do contador de <strong>${escapeHtml(access.tenant_name)}</strong>.</p>
          <p style="font-size:32px;letter-spacing:.18em;font-weight:800;background:#eef3f9;padding:16px;border-radius:12px;text-align:center">${code}</p>
          <p>O código expira em 10 minutos. Se você não solicitou esse acesso, ignore este e-mail.</p>
          <hr style="border:0;border-top:1px solid #d9e1ee"><small>Gestão inteligente para negócios em crescimento.</small>
        </main>`,
      }),
    });
    return response.ok;
  }

  private async logEvent(tenantId: string, accessId: string, eventType: string, meta: PortalEventMeta) {
    await this.database.pool.query(
      `INSERT INTO accountant_portal_events(tenant_id,access_id,event_type,period,export_format,ip_address,user_agent,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        tenantId,
        accessId,
        eventType,
        meta.period ?? null,
        meta.exportFormat ?? null,
        meta.ipAddress ?? null,
        meta.userAgent ?? null,
        JSON.stringify(meta.metadata ?? {}),
      ],
    );
  }
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function monthValue(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 7) : null;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function statusLabel(status: string) {
  return (
    {
      authorized: "Autorizado",
      cancelled: "Cancelado",
      rejected: "Rejeitado",
      error: "Erro",
      retry_pending: "Pendente",
      received: "Recebida",
      ready: "Pronta",
      review_pending: "Revisar",
      open: "Aberto",
      paid: "Pago",
      cancelled_financial: "Cancelado",
    } as Record<string, string>
  )[status] ?? status;
}

function money(value: string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "documento";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}
