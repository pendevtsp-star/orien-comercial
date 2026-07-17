import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import type {
  BranchFiscalSettingsInput,
  FiscalCancelInput,
  FiscalCredentialInput,
  FiscalDocumentListQuery,
  FiscalIssueInput,
  FiscalNumberVoidInput,
  FiscalProductionActionInput,
  FiscalReviewInput,
} from "@sgc/types";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { PoolClient } from "pg";
import { ensureBranchAccess, ensureFound, pagination } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";
import { APP_CONFIG } from "../config/config.module";
import { IntegrationsService } from "../integrations/integrations.service";
import { normalizeFocusResponse } from "./focus-nfe.provider";
import { createFiscalProvider } from "./fiscal-provider-registry";
import {
  FiscalProviderError,
  type FiscalDocumentType,
  type FiscalProvider,
  type FiscalProviderResult,
} from "./fiscal-provider";

type FiscalSettingsRow = {
  id: string;
  branch_id: string;
  provider: string;
  environment: "homologation" | "production";
  status: string;
  document_mode: string;
  tax_regime: string;
  legal_name: string | null;
  trade_name: string | null;
  tax_id: string | null;
  state_registration: string | null;
  municipal_registration: string | null;
  state: string | null;
  city_code: string | null;
  address_line: string | null;
  address_number: string | null;
  district: string | null;
  postal_code: string | null;
  csc_identifier: string | null;
  nfce_series: number;
  next_nfce_number: number;
  nfe_series: number;
  next_nfe_number: number;
  contingency_enabled: boolean;
  certificate_mode: string;
  certificate_expires_at: Date | null;
  accountant_review_status: string;
  accountant_review_note: string | null;
  accountant_reviewed_at: Date | null;
  accountant_reviewed_by_user_id: string | null;
  webhook_token_hash: string | null;
  webhook_token_last4: string | null;
  webhook_configured_at: Date | null;
  homologation_status: string;
  homologation_approved_at: Date | null;
  homologation_approved_by_user_id: string | null;
  production_requested_at: Date | null;
  production_requested_by_user_id: string | null;
  production_approved_at: Date | null;
  production_approved_by_user_id: string | null;
  production_revoked_at: Date | null;
};

type FiscalDocumentRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  sale_id: string;
  provider: string;
  document_type: FiscalDocumentType;
  environment: "homologation" | "production";
  status: string;
  reference: string;
  attempt_count: number;
  contingency_mode: boolean;
  contingency_synced_at: Date | null;
  contingency_deadline_at: Date | null;
};

@Injectable()
export class FiscalService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IntegrationsService) private readonly integrations: IntegrationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async branchSettings(context: TenantContext, branchId: string) {
    ensureBranchAccess(context, branchId);
    const branch = await this.database.tenantQuery<Record<string, unknown>>(
      context.tenantId,
      `SELECT b.id,b.name,b.address_line1,b.city,b.state,b.zip_code,
        le.name AS legal_name,le.document AS tax_id
       FROM branches b LEFT JOIN legal_entities le ON le.id=b.legal_entity_id AND le.tenant_id=b.tenant_id
       WHERE b.tenant_id=$1 AND b.id=$2 AND b.deleted_at IS NULL`,
      [context.tenantId, branchId],
    );
    const current = ensureFound(branch.rows[0], "Loja");
    const settings = await this.settingsRow(context.tenantId, branchId);
    const [hasCertificate, hasCsc, integration] = await Promise.all([
      this.integrations.hasScopedCredential(context, "fiscal", `fiscal:certificate:${branchId}`),
      this.integrations.hasScopedCredential(context, "fiscal", `fiscal:csc:${branchId}`),
      this.integrations.getFiscalConnection(context),
    ]);
    return {
      branch: { id: current.id, name: current.name },
      settings: settings ? mapSettings(settings) : defaultSettings(current),
      credentials: { hasCertificate, hasCsc, hasProviderToken: Boolean(integration) },
      webhook: {
        configured: Boolean(settings?.webhook_token_hash),
        tokenLast4: settings?.webhook_token_last4 ?? null,
        configuredAt: settings?.webhook_configured_at?.toISOString() ?? null,
        url: this.focusWebhookUrl(),
      },
    };
  }

  async rotateWebhookToken(context: TenantContext, branchId: string) {
    ensureBranchAccess(context, branchId);
    await this.branchSettings(context, branchId);
    const token = `orien_fiscal_${randomBytes(24).toString("base64url")}`;
    const hash = createHash("sha256").update(token).digest("hex");
    await this.database.tenantTransaction(context.tenantId, async (client) => {
      const result = await client.query(
        `UPDATE branch_fiscal_settings SET webhook_token_hash=$2,webhook_token_last4=$3,
          webhook_configured_at=now(),updated_at=now()
         WHERE tenant_id=$1 RETURNING id`,
        [context.tenantId, hash, token.slice(-4)],
      );
      ensureFound(result.rows[0], "Configuração fiscal");
      await insertAudit(client, context, "fiscal.webhook.token.rotated", "branch", branchId, {
        tokenLast4: token.slice(-4),
      });
    });
    return {
      url: this.focusWebhookUrl(),
      authorizationHeader: "X-Orien-Webhook-Token",
      authorization: token,
      notice: "Copie o token agora. Por segurança, ele não será exibido novamente.",
    };
  }

  async saveBranchSettings(
    context: TenantContext,
    branchId: string,
    input: BranchFiscalSettingsInput,
  ) {
    ensureBranchAccess(context, branchId);
    if (input.environment === "production") {
      throw new BadRequestException(
        "A produção fiscal permanece bloqueada nesta rodada. Conclua a homologação e a aprovação contábil primeiro.",
      );
    }
    await this.database.tenantTransaction(context.tenantId, async (client) => {
      await assertBranch(client, context.tenantId, branchId);
      await client.query(
        `INSERT INTO branch_fiscal_settings(
          tenant_id,branch_id,provider,environment,status,document_mode,tax_regime,legal_name,
          trade_name,tax_id,state_registration,municipal_registration,state,city_code,address_line,
          address_number,district,postal_code,csc_identifier,nfce_series,next_nfce_number,nfe_series,
          next_nfe_number,contingency_enabled,certificate_mode,certificate_expires_at
        ) VALUES($1,$2,$3,$4,'configured',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
        ON CONFLICT(tenant_id,branch_id) DO UPDATE SET
          provider=EXCLUDED.provider,environment=EXCLUDED.environment,status='configured',
          document_mode=EXCLUDED.document_mode,tax_regime=EXCLUDED.tax_regime,
          legal_name=EXCLUDED.legal_name,trade_name=EXCLUDED.trade_name,tax_id=EXCLUDED.tax_id,
          state_registration=EXCLUDED.state_registration,municipal_registration=EXCLUDED.municipal_registration,
          state=EXCLUDED.state,city_code=EXCLUDED.city_code,address_line=EXCLUDED.address_line,
          address_number=EXCLUDED.address_number,district=EXCLUDED.district,postal_code=EXCLUDED.postal_code,
          csc_identifier=EXCLUDED.csc_identifier,nfce_series=EXCLUDED.nfce_series,
          next_nfce_number=EXCLUDED.next_nfce_number,nfe_series=EXCLUDED.nfe_series,
          next_nfe_number=EXCLUDED.next_nfe_number,contingency_enabled=EXCLUDED.contingency_enabled,
          certificate_mode=EXCLUDED.certificate_mode,certificate_expires_at=EXCLUDED.certificate_expires_at,
          accountant_review_status='pending',accountant_reviewed_at=NULL,
          accountant_reviewed_by_user_id=NULL,homologation_status='pending',
          homologation_approved_at=NULL,homologation_approved_by_user_id=NULL,
          production_requested_at=NULL,production_requested_by_user_id=NULL,
          production_approved_at=NULL,production_approved_by_user_id=NULL,
          production_revoked_at=CASE WHEN branch_fiscal_settings.environment='production' THEN now()
            ELSE branch_fiscal_settings.production_revoked_at END,
          production_revoked_by_user_id=CASE WHEN branch_fiscal_settings.environment='production' THEN $26
            ELSE branch_fiscal_settings.production_revoked_by_user_id END,
          updated_at=now()`,
        [
          context.tenantId,
          branchId,
          input.provider,
          input.environment,
          input.documentMode,
          input.taxRegime,
          input.legalName,
          input.tradeName,
          input.taxId,
          input.stateRegistration,
          input.municipalRegistration ?? null,
          input.state,
          input.cityCode,
          input.addressLine,
          input.addressNumber,
          input.district,
          input.postalCode,
          input.cscIdentifier ?? null,
          input.nfceSeries,
          input.nextNfceNumber,
          input.nfeSeries,
          input.nextNfeNumber,
          input.contingencyEnabled,
          input.certificateMode,
          input.certificateExpiresAt ?? null,
          context.userId ?? null,
        ],
      );
      await insertAudit(client, context, "fiscal.branch.configured", "branch", branchId, {
        provider: input.provider,
        environment: input.environment,
        documentMode: input.documentMode,
      });
    });
    return this.branchSettings(context, branchId);
  }

  async saveBranchCredentials(
    context: TenantContext,
    branchId: string,
    input: FiscalCredentialInput,
  ) {
    ensureBranchAccess(context, branchId);
    await this.branchSettings(context, branchId);
    if (input.certificateBase64) {
      const raw = input.certificateBase64.replace(/^data:[^;]+;base64,/, "");
      const certificate = Buffer.from(raw, "base64");
      if (!certificate.length || certificate.length > 2 * 1024 * 1024) {
        throw new BadRequestException("O certificado A1 deve ser um arquivo PFX de até 2 MB.");
      }
      await this.integrations.putScopedCredential(
        context,
        "fiscal",
        `fiscal:certificate:${branchId}`,
        JSON.stringify({ pfx: raw, password: input.certificatePassword ?? "" }),
      );
    }
    if (input.cscToken) {
      await this.integrations.putScopedCredential(
        context,
        "fiscal",
        `fiscal:csc:${branchId}`,
        input.cscToken,
      );
    }
    await this.database.tenantQuery(
      context.tenantId,
      `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,'fiscal.branch.credentials.rotated','branch',$3,$4::jsonb)`,
      [
        context.tenantId,
        context.userId ?? null,
        branchId,
        JSON.stringify({
          certificate: Boolean(input.certificateBase64),
          csc: Boolean(input.cscToken),
        }),
      ],
    );
    return this.branchSettings(context, branchId);
  }

  async readiness(context: TenantContext, branchId: string) {
    ensureBranchAccess(context, branchId);
    const overview = await this.branchSettings(context, branchId);
    const settings = overview.settings as Record<string, unknown>;
    const required = [
      ["legalName", "Razão social"],
      ["tradeName", "Nome fantasia"],
      ["taxId", "CNPJ"],
      ["stateRegistration", "Inscrição estadual"],
      ["state", "UF"],
      ["cityCode", "Código IBGE"],
      ["addressLine", "Endereço"],
      ["addressNumber", "Número"],
      ["district", "Bairro"],
      ["postalCode", "CEP"],
    ] as const;
    const missingSettings = required.filter(([key]) => !settings[key]).map(([, label]) => label);
    const products = await this.database.tenantQuery<{
      id: string;
      name: string;
      missing: string[];
      review_status: string;
    }>(
      context.tenantId,
      `SELECT p.id,p.name,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN pf.ncm IS NULL THEN 'NCM' END,
          CASE WHEN pf.tax_origin IS NULL THEN 'Origem' END,
          CASE WHEN pf.cfop_domestic IS NULL THEN 'CFOP interno' END,
          CASE WHEN pf.cfop_interstate IS NULL THEN 'CFOP interestadual' END,
          CASE WHEN pf.icms_tax_code IS NULL THEN 'CST/CSOSN' END,
          CASE WHEN pf.pis_tax_code IS NULL THEN 'CST PIS' END,
          CASE WHEN pf.cofins_tax_code IS NULL THEN 'CST COFINS' END,
          CASE WHEN COALESCE(pf.subject_to_icms_st,false) AND pf.cest IS NULL THEN 'CEST' END
        ],NULL) AS missing,
        COALESCE(pf.accountant_review_status,'pending') AS review_status
       FROM products p LEFT JOIN product_fiscal_profiles pf ON pf.product_id=p.id AND pf.tenant_id=p.tenant_id
       WHERE p.tenant_id=$1 AND p.deleted_at IS NULL AND p.is_active=true
         AND (p.branch_id=$2 OR p.branch_id IS NULL)
       ORDER BY p.name`,
      [context.tenantId, branchId],
    );
    const pendingProducts = products.rows.filter((product) => product.missing.length > 0);
    const pendingReviews = products.rows.filter((product) => product.review_status !== "approved");
    const homologationDocuments = await this.database.tenantQuery<{ authorized: string }>(
      context.tenantId,
      `SELECT count(*) FILTER (WHERE status='authorized')::text AS authorized
       FROM fiscal_documents WHERE tenant_id=$1 AND branch_id=$2 AND environment='homologation'`,
      [context.tenantId, branchId],
    );
    const authorizedHomologation = Number(homologationDocuments.rows[0]?.authorized ?? 0);
    return {
      branchId,
      integrationConfigured: overview.credentials.hasProviderToken,
      missingSettings,
      products: {
        total: products.rows.length,
        technicallyReady: products.rows.length - pendingProducts.length,
        reviewed: products.rows.length - pendingReviews.length,
        pending: pendingProducts.slice(0, 50),
        reviewQueue: pendingReviews.slice(0, 50),
      },
      accountantReviewStatus: settings.accountantReviewStatus ?? "pending",
      homologation: {
        status: settings.homologationStatus ?? "pending",
        authorizedDocuments: authorizedHomologation,
        approvedAt: settings.homologationApprovedAt ?? null,
      },
      production: {
        requestedAt: settings.productionRequestedAt ?? null,
        approvedAt: settings.productionApprovedAt ?? null,
        revokedAt: settings.productionRevokedAt ?? null,
        active: settings.environment === "production" && settings.status === "active",
      },
      canIssueHomologation:
        overview.credentials.hasProviderToken && !missingSettings.length && !pendingProducts.length,
      canActivateProduction:
        overview.credentials.hasProviderToken &&
        !missingSettings.length &&
        !pendingProducts.length &&
        !pendingReviews.length &&
        settings.accountantReviewStatus === "approved" &&
        authorizedHomologation > 0,
    };
  }

  async listDocuments(context: TenantContext, query: FiscalDocumentListQuery) {
    const page = pagination(query);
    const values: unknown[] = [context.tenantId];
    const filters = ["fd.tenant_id=$1"];
    if (context.branchId) {
      values.push(context.branchId);
      filters.push(`fd.branch_id=$${values.length}`);
    } else if (query.branchId) {
      ensureBranchAccess(context, query.branchId);
      values.push(query.branchId);
      filters.push(`fd.branch_id=$${values.length}`);
    }
    if (query.status) {
      values.push(query.status);
      filters.push(`fd.status=$${values.length}`);
    }
    if (query.documentType) {
      values.push(query.documentType);
      filters.push(`fd.document_type=$${values.length}`);
    }
    if (query.search) {
      values.push(`%${query.search}%`);
      filters.push(
        `(fd.reference ILIKE $${values.length} OR fd.access_key ILIKE $${values.length} OR s.id::text ILIKE $${values.length})`,
      );
    }
    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `SELECT count(*)::text total FROM fiscal_documents fd LEFT JOIN sales s ON s.id=fd.sale_id WHERE ${filters.join(" AND ")}`,
      values,
    );
    values.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `SELECT fd.id,fd.sale_id AS "saleId",fd.branch_id AS "branchId",b.name AS "branchName",
        fd.document_type AS "documentType",fd.provider,fd.environment,fd.status,fd.reference,
        fd.access_key AS "accessKey",fd.protocol,fd.rejection_code AS "rejectionCode",
        fd.rejection_reason AS "rejectionReason",fd.attempt_count AS "attemptCount",
        fd.contingency_mode AS "contingency",fd.requested_at AS "requestedAt",
        fd.issued_at AS "issuedAt",fd.cancelled_at AS "cancelledAt",fd.created_at AS "createdAt",
        COALESCE((SELECT jsonb_object_agg(fa.kind,fa.status) FROM fiscal_artifacts fa
          WHERE fa.tenant_id=fd.tenant_id AND fa.fiscal_document_id=fd.id),'{}'::jsonb) AS artifacts
       FROM fiscal_documents fd JOIN branches b ON b.id=fd.branch_id
       LEFT JOIN sales s ON s.id=fd.sale_id
       WHERE ${filters.join(" AND ")}
       ORDER BY fd.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async getDocument(context: TenantContext, id: string) {
    const result = await this.database.tenantQuery<Record<string, unknown>>(
      context.tenantId,
      `SELECT fd.*,b.name AS branch_name FROM fiscal_documents fd JOIN branches b ON b.id=fd.branch_id
       WHERE fd.tenant_id=$1 AND fd.id=$2`,
      [context.tenantId, id],
    );
    const document = ensureFound(result.rows[0], "Documento fiscal");
    ensureBranchAccess(context, document.branch_id as string);
    const events = await this.database.tenantQuery(
      context.tenantId,
      `SELECT id,event_type AS "eventType",status_from AS "statusFrom",status_to AS "statusTo",
        provider_code AS "providerCode",message,metadata,created_at AS "createdAt"
       FROM fiscal_document_events WHERE tenant_id=$1 AND fiscal_document_id=$2 ORDER BY created_at DESC`,
      [context.tenantId, id],
    );
    const artifacts = await this.database.tenantQuery(
      context.tenantId,
      `SELECT kind,status,content_type AS "contentType",size_bytes AS "sizeBytes",
        sha256,attempt_count AS "attemptCount",last_error AS "lastError",
        downloaded_at AS "downloadedAt"
       FROM fiscal_artifacts WHERE tenant_id=$1 AND fiscal_document_id=$2 ORDER BY kind`,
      [context.tenantId, id],
    );
    return { document, events: events.rows, artifacts: artifacts.rows };
  }

  async saleDocuments(context: TenantContext, saleId: string) {
    const sale = await this.database.tenantQuery<{ branch_id: string }>(
      context.tenantId,
      "SELECT branch_id FROM sales WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
      [context.tenantId, saleId],
    );
    const row = ensureFound(sale.rows[0], "Venda");
    ensureBranchAccess(context, row.branch_id);
    const documents = await this.database.tenantQuery(
      context.tenantId,
      `SELECT id,provider,environment,document_type AS "documentType",status,
        external_id AS "externalId",reference,
        access_key AS "accessKey",protocol,attempt_count AS "attemptCount",
        rejection_code AS "rejectionCode",rejection_reason AS "rejectionReason",
        contingency_mode AS "contingency",contingency_deadline_at AS "contingencyDeadlineAt",
        contingency_synced_at AS "contingencySyncedAt",
        metadata,requested_at AS "requestedAt",issued_at AS "issuedAt",
        cancelled_at AS "cancelledAt",created_at AS "createdAt",
        COALESCE((SELECT jsonb_object_agg(fa.kind,fa.status) FROM fiscal_artifacts fa
          WHERE fa.tenant_id=fiscal_documents.tenant_id
            AND fa.fiscal_document_id=fiscal_documents.id),'{}'::jsonb) AS artifacts,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'eventType',fde.event_type,
            'statusFrom',fde.status_from,
            'statusTo',fde.status_to,
            'providerCode',fde.provider_code,
            'message',fde.message,
            'createdAt',fde.created_at
          ) ORDER BY fde.created_at DESC)
          FROM fiscal_document_events fde
          WHERE fde.tenant_id=fiscal_documents.tenant_id
            AND fde.fiscal_document_id=fiscal_documents.id),'[]'::jsonb) AS events
       FROM fiscal_documents
       WHERE tenant_id=$1 AND sale_id=$2
       ORDER BY created_at DESC`,
      [context.tenantId, saleId],
    );
    return { data: documents.rows };
  }

  async precheckSale(context: TenantContext, saleId: string) {
    const sale = await this.database.tenantQuery<Record<string, unknown>>(
      context.tenantId,
      `SELECT s.id,s.branch_id,s.status,s.total_amount,b.name AS branch_name
       FROM sales s JOIN branches b ON b.id=s.branch_id
       WHERE s.tenant_id=$1 AND s.id=$2 AND s.deleted_at IS NULL`,
      [context.tenantId, saleId],
    );
    const row = ensureFound(sale.rows[0], "Venda");
    ensureBranchAccess(context, row.branch_id as string);
    const settings = await this.settingsRow(context.tenantId, row.branch_id as string);
    const items = await this.database.tenantQuery<Record<string, unknown>>(
      context.tenantId,
      `SELECT si.product_id AS "productId",si.description,p.sku,p.barcode,
        pf.ncm,pf.cest,pf.tax_origin,pf.cfop_domestic,pf.cfop_interstate,pf.icms_tax_code,
        pf.pis_tax_code,pf.cofins_tax_code,pf.subject_to_icms_st,pf.accountant_review_status
       FROM sale_items si JOIN products p ON p.id=si.product_id AND p.tenant_id=si.tenant_id
       LEFT JOIN product_fiscal_profiles pf ON pf.product_id=p.id AND pf.tenant_id=p.tenant_id
       WHERE si.tenant_id=$1 AND si.sale_id=$2 ORDER BY si.id`,
      [context.tenantId, saleId],
    );
    const settingsMissing = settings ? fiscalSettingsMissing(settings) : ["Configuração fiscal da loja"];
    const itemResults = items.rows.map((item) => {
      const missing = [
        [item.ncm, "NCM"],
        [item.tax_origin, "Origem"],
        [item.cfop_domestic, "CFOP interno"],
        [item.cfop_interstate, "CFOP interestadual"],
        [item.icms_tax_code, "CST/CSOSN"],
        [item.pis_tax_code, "CST PIS"],
        [item.cofins_tax_code, "CST COFINS"],
        [!item.subject_to_icms_st || item.cest, "CEST"],
      ]
        .filter(([value]) => !value)
        .map(([, label]) => label);
      return {
        productId: item.productId,
        description: typeof item.description === "string" ? item.description : "Produto",
        sku: item.sku,
        barcode: item.barcode,
        missing,
        reviewStatus: item.accountant_review_status ?? "pending",
      };
    });
    const missingItems = itemResults.filter(
      (item) => item.missing.length || item.reviewStatus !== "approved",
    );
    const blockers = [
      ...(row.status === "cancelled" ? ["Venda cancelada"] : []),
      ...(!items.rows.length ? ["Venda sem produtos"] : []),
      ...settingsMissing.map((item) => `Loja: ${item}`),
      ...missingItems.map((item) => `Produto ${item.description}: ${item.missing.join(", ") || "revisão contábil pendente"}`),
    ];
    return {
      saleId,
      branchId: row.branch_id,
      branchName: row.branch_name,
      saleStatus: row.status,
      totalAmount: row.total_amount,
      ready: blockers.length === 0,
      status: blockers.length ? "blocked" : "ready",
      blockers,
      settings: {
        configured: Boolean(settings),
        environment: settings?.environment ?? null,
        provider: settings?.provider ?? null,
        documentMode: settings?.document_mode ?? null,
        contingencyEnabled: Boolean(settings?.contingency_enabled),
      },
      items: itemResults,
    };
  }

  async contingencyQueue(context: TenantContext, branchId?: string) {
    if (branchId) ensureBranchAccess(context, branchId);
    const selectedBranch = context.branchId ?? branchId ?? null;
    const values: unknown[] = [context.tenantId];
    const branchFilter = selectedBranch ? "AND fd.branch_id=$2" : "";
    if (selectedBranch) values.push(selectedBranch);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `SELECT fd.id,fd.sale_id AS "saleId",fd.branch_id AS "branchId",b.name AS "branchName",
        fd.document_type AS "documentType",fd.status,fd.reference,fd.access_key AS "accessKey",
        fd.protocol,fd.attempt_count AS "attemptCount",fd.contingency_deadline_at AS "deadlineAt",
        fd.contingency_synced_at AS "syncedAt",fd.created_at AS "createdAt",fd.last_error AS "lastError"
       FROM fiscal_documents fd JOIN branches b ON b.id=fd.branch_id
       WHERE fd.tenant_id=$1 ${branchFilter}
         AND (fd.contingency_mode=true OR fd.status='contingency')
       ORDER BY COALESCE(fd.contingency_deadline_at,fd.created_at) ASC
       LIMIT 100`,
      values,
    );
    return { data: rows.rows };
  }

  async numberVoids(context: TenantContext, branchId?: string) {
    if (branchId) ensureBranchAccess(context, branchId);
    const selectedBranch = context.branchId ?? branchId ?? null;
    const values: unknown[] = [context.tenantId];
    const branchFilter = selectedBranch ? "AND v.branch_id=$2" : "";
    if (selectedBranch) values.push(selectedBranch);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `SELECT v.id,v.branch_id AS "branchId",b.name AS "branchName",v.provider,v.environment,
        v.document_type AS "documentType",v.series,v.number_start AS "numberStart",
        v.number_end AS "numberEnd",v.justification,v.status,v.protocol,
        v.provider_code AS "providerCode",v.provider_message AS "providerMessage",
        v.requested_at AS "requestedAt",v.processed_at AS "processedAt"
       FROM fiscal_number_voids v JOIN branches b ON b.id=v.branch_id
       WHERE v.tenant_id=$1 ${branchFilter}
       ORDER BY v.requested_at DESC LIMIT 100`,
      values,
    );
    return { data: rows.rows };
  }

  async voidNumbers(context: TenantContext, branchId: string, input: FiscalNumberVoidInput) {
    ensureBranchAccess(context, branchId);
    const settings = await this.settingsRow(context.tenantId, branchId);
    if (!settings || settings.status === "draft") {
      throw new BadRequestException("Configure os dados fiscais desta loja antes de inutilizar numeração.");
    }
    if (!settings.tax_id) throw new BadRequestException("Informe o CNPJ fiscal da loja.");
    if (settings.provider !== "focus_nfe") {
      throw new BadRequestException("A inutilização está disponível para Focus NFe nesta rodada.");
    }
    const provider = await this.providerForSettings(context, settings);
    const inserted = await this.database.tenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO fiscal_number_voids(
          tenant_id,branch_id,provider,environment,document_type,series,number_start,number_end,
          justification,requested_by_user_id
        ) VALUES($1,$2,$3,$4,'nfce',$5,$6,$7,$8,$9) RETURNING id`,
        [
          context.tenantId,
          branchId,
          settings.provider,
          settings.environment,
          input.series,
          input.numberStart,
          input.numberEnd,
          input.justification,
          context.userId ?? null,
        ],
      );
      await insertAudit(client, context, "fiscal.number_void.requested", "branch", branchId, {
        series: input.series,
        numberStart: input.numberStart,
        numberEnd: input.numberEnd,
      });
      return result.rows[0]!.id;
    });
    try {
      const result = await provider.voidNumbers({
        documentType: "nfce",
        taxId: settings.tax_id,
        series: input.series,
        numberStart: input.numberStart,
        numberEnd: input.numberEnd,
        justification: input.justification,
      });
      await this.database.tenantQuery(
        context.tenantId,
        `UPDATE fiscal_number_voids SET status=$3,protocol=$4,provider_code=$5,
          provider_message=$6,provider_payload=$7::jsonb,processed_at=now(),updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [
          context.tenantId,
          inserted,
          result.status,
          result.protocol ?? null,
          result.providerCode ?? null,
          result.providerMessage ?? null,
          JSON.stringify(result.providerPayload ?? {}),
        ],
      );
    } catch (error) {
      await this.database.tenantQuery(
        context.tenantId,
        `UPDATE fiscal_number_voids SET status='failed',provider_message=$3,
          provider_payload='{}'::jsonb,processed_at=now(),updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [context.tenantId, inserted, safeError(error)],
      );
      throw error;
    }
    return this.numberVoids(context, branchId);
  }

  async issueSale(context: TenantContext, input: FiscalIssueInput, idempotencyKey?: string) {
    const key = idempotencyKey || `fiscal-${input.documentType}-${input.saleId}`;
    if (!/^[A-Za-z0-9_-]{16,160}$/.test(key)) {
      throw new BadRequestException("Chave de idempotência fiscal inválida.");
    }
    const prepared = await this.database.tenantTransaction(context.tenantId, async (client) => {
      const existing = await client.query<FiscalDocumentRow>(
        "SELECT * FROM fiscal_documents WHERE tenant_id=$1 AND idempotency_key=$2 LIMIT 1",
        [context.tenantId, key],
      );
      if (existing.rows[0]) return { document: existing.rows[0], created: false };
      const sale = await this.saleSnapshot(client, context, input.saleId);
      const settings = await this.requiredSettings(client, context.tenantId, sale.branchId);
      if (
        settings.environment === "production" &&
        (!settings.production_approved_at || settings.status !== "active")
      ) {
        throw new BadRequestException("A emissão em produção ainda não possui dupla aprovação.");
      }
      if (settings.provider !== "focus_nfe") {
        throw new BadRequestException("Selecione Focus NFe para a homologação atual.");
      }
      if (input.contingency && !settings.contingency_enabled) {
        throw new BadRequestException("A contingência não está habilitada para esta loja.");
      }
      const reference = `orien-${input.documentType}-${input.saleId}`;
      const created = await client.query<FiscalDocumentRow>(
        `INSERT INTO fiscal_documents(
          tenant_id,branch_id,sale_id,provider,document_type,status,environment,reference,
          idempotency_key,contingency_mode,requested_at,metadata
        ) VALUES($1,$2,$3,$4,$5,'queued',$6,$7,$8,$9,now(),$10::jsonb) RETURNING *`,
        [
          context.tenantId,
          sale.branchId,
          input.saleId,
          settings.provider,
          input.documentType,
          settings.environment,
          reference,
          key,
          input.contingency,
          JSON.stringify({ itemCount: sale.items.length, total: sale.total, source: "orien" }),
        ],
      );
      await event(
        client,
        context,
        created.rows[0]!.id,
        "queued",
        null,
        "queued",
        null,
        "Documento incluído na fila fiscal.",
      );
      await insertAudit(
        client,
        context,
        "fiscal.document.queued",
        "fiscal_document",
        created.rows[0]!.id,
        {
          saleId: input.saleId,
          documentType: input.documentType,
          contingency: input.contingency,
        },
      );
      return { document: created.rows[0]!, created: true };
    });
    if (
      !prepared.created &&
      !["rejected", "retry_pending", "error"].includes(prepared.document.status)
    ) {
      return this.getDocument(context, prepared.document.id);
    }
    return this.transmit(context, prepared.document.id);
  }

  async sync(context: TenantContext, id: string) {
    const document = await this.documentRow(context, id);
    const provider = await this.provider(context, document);
    try {
      const result = await provider.get(document.document_type, document.reference);
      await this.applyProviderResult(context, document, result, "synced");
    } catch (error) {
      await this.applyFailure(context, document, error, "sync_failed");
    }
    return this.getDocument(context, id);
  }

  async retry(context: TenantContext, id: string) {
    const document = await this.documentRow(context, id);
    if (!["rejected", "retry_pending", "error"].includes(document.status)) {
      throw new BadRequestException("Este documento não está aguardando uma nova tentativa.");
    }
    return this.transmit(context, id);
  }

  async cancel(context: TenantContext, id: string, input: FiscalCancelInput) {
    const document = await this.documentRow(context, id);
    if (document.status !== "authorized") {
      throw new BadRequestException("Apenas documentos autorizados podem ser cancelados.");
    }
    const provider = await this.provider(context, document);
    try {
      const result = await provider.cancel(
        document.document_type,
        document.reference,
        input.justification,
      );
      await this.applyProviderResult(
        context,
        document,
        { ...result, status: "cancelled" },
        "cancelled",
      );
    } catch (error) {
      await this.applyFailure(context, document, error, "cancellation_failed");
    }
    return this.getDocument(context, id);
  }

  async reviewProduct(context: TenantContext, productId: string, input: FiscalReviewInput) {
    await this.database.tenantTransaction(context.tenantId, async (client) => {
      const product = await client.query<{ id: string; branch_id: string | null }>(
        "SELECT id,branch_id FROM products WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
        [context.tenantId, productId],
      );
      const row = ensureFound(product.rows[0], "Produto");
      ensureBranchAccess(context, row.branch_id);
      const updated = await client.query(
        `UPDATE product_fiscal_profiles SET accountant_review_status=$3,accountant_review_note=$4,
          accountant_reviewed_at=now(),accountant_approved_at=CASE WHEN $3='approved' THEN now() ELSE NULL END,
          accountant_approved_by_user_id=CASE WHEN $3='approved' THEN $5 ELSE NULL END,updated_at=now()
         WHERE tenant_id=$1 AND product_id=$2 RETURNING product_id`,
        [context.tenantId, productId, input.status, input.note ?? null, context.userId ?? null],
      );
      if (!updated.rowCount)
        throw new BadRequestException("Complete o cadastro fiscal antes da revisão.");
      await insertAudit(client, context, `fiscal.product.${input.status}`, "product", productId, {
        note: input.note ?? null,
      });
    });
    return { ok: true };
  }

  async reviewBranch(context: TenantContext, branchId: string, input: FiscalReviewInput) {
    ensureBranchAccess(context, branchId);
    await this.database.tenantTransaction(context.tenantId, async (client) => {
      const result = await client.query(
        `UPDATE branch_fiscal_settings SET accountant_review_status=$3,accountant_review_note=$4,
          accountant_reviewed_at=now(),accountant_reviewed_by_user_id=$5,updated_at=now()
         WHERE tenant_id=$1 AND branch_id=$2 RETURNING id`,
        [context.tenantId, branchId, input.status, input.note ?? null, context.userId ?? null],
      );
      ensureFound(result.rows[0], "Configuração fiscal");
      await insertAudit(client, context, `fiscal.branch.${input.status}`, "branch", branchId, {
        note: input.note ?? null,
      });
    });
    return this.branchSettings(context, branchId);
  }

  async requestProduction(
    context: TenantContext,
    branchId: string,
    input: FiscalProductionActionInput,
  ) {
    ensureBranchAccess(context, branchId);
    const readiness = await this.readiness(context, branchId);
    if (!readiness.canActivateProduction) {
      throw new BadRequestException(
        "Conclua a configuração, a revisão contábil e ao menos uma emissão autorizada em homologação.",
      );
    }
    await this.database.tenantTransaction(context.tenantId, async (client) => {
      await client.query(
        `UPDATE branch_fiscal_settings SET homologation_status='passed',homologation_approved_at=now(),
          homologation_approved_by_user_id=$3,production_requested_at=now(),
          production_requested_by_user_id=$3,production_approved_at=NULL,
          production_approved_by_user_id=NULL,updated_at=now()
         WHERE tenant_id=$1 AND branch_id=$2`,
        [context.tenantId, branchId, context.userId ?? null],
      );
      await insertAudit(client, context, "fiscal.production.requested", "branch", branchId, {
        note: input.note,
      });
    });
    return this.branchSettings(context, branchId);
  }

  async approveProduction(
    context: TenantContext,
    branchId: string,
    input: FiscalProductionActionInput,
  ) {
    ensureBranchAccess(context, branchId);
    const settings = await this.settingsRow(context.tenantId, branchId);
    if (!settings?.production_requested_at || settings.homologation_status !== "passed") {
      throw new BadRequestException("Solicite a ativação somente depois da homologação concluída.");
    }
    if (!settings.accountant_reviewed_by_user_id) {
      throw new BadRequestException("A aprovação do contador ainda não foi registrada.");
    }
    if (settings.accountant_reviewed_by_user_id === context.userId) {
      throw new BadRequestException(
        "A aprovação operacional deve ser feita por uma pessoa diferente da revisão contábil.",
      );
    }
    await this.database.tenantTransaction(context.tenantId, async (client) => {
      await client.query(
        `UPDATE branch_fiscal_settings SET environment='production',status='active',
          production_approved_at=now(),production_approved_by_user_id=$3,
          production_revoked_at=NULL,production_revoked_by_user_id=NULL,updated_at=now()
         WHERE tenant_id=$1 AND branch_id=$2`,
        [context.tenantId, branchId, context.userId ?? null],
      );
      await insertAudit(client, context, "fiscal.production.approved", "branch", branchId, {
        note: input.note,
        accountantReviewerId: settings.accountant_reviewed_by_user_id,
      });
    });
    return this.branchSettings(context, branchId);
  }

  async revokeProduction(
    context: TenantContext,
    branchId: string,
    input: FiscalProductionActionInput,
  ) {
    ensureBranchAccess(context, branchId);
    await this.database.tenantTransaction(context.tenantId, async (client) => {
      const result = await client.query(
        `UPDATE branch_fiscal_settings SET environment='homologation',status='blocked',
          production_revoked_at=now(),production_revoked_by_user_id=$3,
          production_approved_at=NULL,production_approved_by_user_id=NULL,updated_at=now()
         WHERE tenant_id=$1 AND branch_id=$2 RETURNING id`,
        [context.tenantId, branchId, context.userId ?? null],
      );
      ensureFound(result.rows[0], "Configuração fiscal");
      await insertAudit(client, context, "fiscal.production.revoked", "branch", branchId, {
        note: input.note,
      });
    });
    return this.branchSettings(context, branchId);
  }

  async accountingOverview(context: TenantContext, branchId?: string) {
    if (branchId) ensureBranchAccess(context, branchId);
    const selectedBranch = context.branchId ?? branchId ?? null;
    const branchValues: unknown[] = [context.tenantId];
    const branchFilter = selectedBranch ? "AND b.id=$2" : "";
    if (selectedBranch) branchValues.push(selectedBranch);
    const [branches, products, documents, metrics, numberVoids] = await Promise.all([
      this.database.tenantQuery(
        context.tenantId,
        `SELECT b.id,b.name,COALESCE(fs.accountant_review_status,'pending') AS "reviewStatus",
          COALESCE(fs.homologation_status,'pending') AS "homologationStatus",fs.environment,fs.status,
          fs.production_requested_at AS "productionRequestedAt",
          fs.production_approved_at AS "productionApprovedAt"
         FROM branches b LEFT JOIN branch_fiscal_settings fs ON fs.branch_id=b.id AND fs.tenant_id=b.tenant_id
         WHERE b.tenant_id=$1 AND b.deleted_at IS NULL ${branchFilter} ORDER BY b.name`,
        branchValues,
      ),
      this.database.tenantQuery(
        context.tenantId,
        `SELECT p.id,p.name,p.sku,COALESCE(pf.accountant_review_status,'pending') AS "reviewStatus",
          pf.accountant_review_note AS "reviewNote",pf.ncm,pf.cest
         FROM products p LEFT JOIN product_fiscal_profiles pf ON pf.product_id=p.id AND pf.tenant_id=p.tenant_id
         WHERE p.tenant_id=$1 AND p.deleted_at IS NULL
           ${selectedBranch ? "AND (p.branch_id=$2 OR p.branch_id IS NULL)" : ""}
           AND COALESCE(pf.accountant_review_status,'pending')<>'approved'
         ORDER BY p.name LIMIT 100`,
        branchValues,
      ),
      this.database.tenantQuery(
        context.tenantId,
        `SELECT fd.id,fd.branch_id AS "branchId",b.name AS "branchName",fd.document_type AS "documentType",
          fd.status,fd.reference,fd.access_key AS "accessKey",fd.rejection_code AS "rejectionCode",
          fd.rejection_reason AS "rejectionReason",fd.created_at AS "createdAt",
          COALESCE(jsonb_object_agg(fa.kind,fa.status) FILTER (WHERE fa.id IS NOT NULL),'{}'::jsonb) AS artifacts
         FROM fiscal_documents fd JOIN branches b ON b.id=fd.branch_id
         LEFT JOIN fiscal_artifacts fa ON fa.fiscal_document_id=fd.id
         WHERE fd.tenant_id=$1 ${selectedBranch ? "AND fd.branch_id=$2" : ""}
         GROUP BY fd.id,b.name ORDER BY fd.created_at DESC LIMIT 100`,
        branchValues,
      ),
      this.database.tenantQuery(
        context.tenantId,
        `SELECT
          count(*)::int AS "totalDocuments",
          count(*) FILTER (WHERE status='authorized')::int AS "authorizedDocuments",
          count(*) FILTER (WHERE status='cancelled')::int AS "cancelledDocuments",
          count(*) FILTER (WHERE status IN ('rejected','error','retry_pending'))::int AS "attentionDocuments",
          count(*) FILTER (WHERE contingency_mode=true OR status='contingency')::int AS "contingencyDocuments",
          count(*) FILTER (WHERE access_key IS NOT NULL)::int AS "xmlEligibleDocuments"
         FROM fiscal_documents
         WHERE tenant_id=$1 ${selectedBranch ? "AND branch_id=$2" : ""}`,
        branchValues,
      ),
      this.database.tenantQuery(
        context.tenantId,
        `SELECT v.id,b.name AS "branchName",v.series,v.number_start AS "numberStart",
          v.number_end AS "numberEnd",v.status,v.protocol,v.requested_at AS "requestedAt"
         FROM fiscal_number_voids v JOIN branches b ON b.id=v.branch_id
         WHERE v.tenant_id=$1 ${selectedBranch ? "AND v.branch_id=$2" : ""}
         ORDER BY v.requested_at DESC LIMIT 20`,
        branchValues,
      ),
    ]);
    return {
      metrics: metrics.rows[0] ?? {
        totalDocuments: 0,
        authorizedDocuments: 0,
        cancelledDocuments: 0,
        attentionDocuments: 0,
        contingencyDocuments: 0,
        xmlEligibleDocuments: 0,
      },
      branches: branches.rows,
      products: products.rows,
      documents: documents.rows,
      numberVoids: numberVoids.rows,
    };
  }

  async accountingExport(context: TenantContext, branchId?: string) {
    const overview = await this.accountingOverview(context, branchId);
    const rows = [
      ["Loja", "Documento", "Referência", "Situação", "Chave", "Rejeição", "Emissão"],
      ...overview.documents.map((item) => {
        const row = item as Record<string, unknown>;
        return [
          row.branchName,
          typeof row.documentType === "string" ? row.documentType.toUpperCase() : "",
          row.reference,
          row.status,
          row.accessKey,
          [row.rejectionCode, row.rejectionReason].filter(Boolean).join(" - "),
          row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
        ];
      }),
    ];
    return Buffer.from(`\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`, "utf8");
  }

  async receiveFocusWebhook(token: string | undefined, eventId: string | undefined, body: unknown) {
    const normalized = normalizeFocusWebhook(body);
    const found = await this.database.pool.query<FiscalDocumentRow & { webhook_token_hash: string }>(
      `SELECT fd.*,fs.webhook_token_hash FROM fiscal_documents fd
       JOIN branch_fiscal_settings fs ON fs.tenant_id=fd.tenant_id AND fs.branch_id=fd.branch_id
       WHERE fd.provider='focus_nfe' AND fd.reference=$1`,
      [normalized.reference],
    );
    const document = found.rows.find(
      (candidate) =>
        candidate.webhook_token_hash && validWebhookToken(token, candidate.webhook_token_hash),
    );
    if (!document) {
      throw new UnauthorizedException("Webhook fiscal não autorizado.");
    }
    const payloadDigest = createHash("sha256").update(JSON.stringify(normalized.payload)).digest("hex");
    const eventKey = `${document.reference}:${eventId?.trim() || payloadDigest}`.slice(0, 128);
    const context = systemContext(document.tenant_id, document.branch_id);
    const inserted = await this.database.tenantQuery<{ id: string }>(
      document.tenant_id,
      `INSERT INTO fiscal_webhook_events(
        tenant_id,fiscal_document_id,provider,event_key,reference,event_type,payload,payload_digest,status,attempt_count
       ) VALUES($1,$2,'focus_nfe',$3,$4,$5,$6::jsonb,$7,'processing',1)
       ON CONFLICT(provider,event_key) DO NOTHING RETURNING id`,
      [
        document.tenant_id,
        document.id,
        eventKey,
        document.reference,
        normalized.eventType,
        JSON.stringify(normalized.payload),
        payloadDigest,
      ],
    );
    if (!inserted.rows[0]) return { accepted: true, duplicate: true };
    try {
      await this.applyProviderResult(context, document, normalized.result, "webhook_received");
      await this.database.tenantQuery(
        document.tenant_id,
        "UPDATE fiscal_webhook_events SET status='processed',processed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [document.tenant_id, inserted.rows[0].id],
      );
      return { accepted: true, duplicate: false };
    } catch (error) {
      await this.database.tenantQuery(
        document.tenant_id,
        "UPDATE fiscal_webhook_events SET status='failed',last_error=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [document.tenant_id, inserted.rows[0].id, safeError(error)],
      );
      throw new ServiceUnavailableException("O evento fiscal será processado novamente.");
    }
  }

  async processScheduledDocument(tenantId: string, branchId: string, id: string) {
    return this.transmit(systemContext(tenantId, branchId), id);
  }

  async reprocessWebhookEvent(tenantId: string, id: string) {
    const result = await this.database.tenantQuery<{
      fiscal_document_id: string;
      branch_id: string;
      payload: Record<string, unknown>;
    }>(
      tenantId,
      `SELECT we.fiscal_document_id,fd.branch_id,we.payload FROM fiscal_webhook_events we
       JOIN fiscal_documents fd ON fd.id=we.fiscal_document_id
       WHERE we.tenant_id=$1 AND we.id=$2`,
      [tenantId, id],
    );
    const row = ensureFound(result.rows[0], "Evento fiscal");
    const document = await this.documentRow(systemContext(tenantId, row.branch_id), row.fiscal_document_id);
    const normalized = normalizeFocusWebhook(row.payload);
    await this.applyProviderResult(
      systemContext(tenantId, row.branch_id),
      document,
      normalized.result,
      "webhook_reprocessed",
    );
    await this.database.tenantQuery(
      tenantId,
      `UPDATE fiscal_webhook_events SET status='processed',processed_at=now(),
        attempt_count=attempt_count+1,last_error=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id],
    );
  }

  async processArtifact(tenantId: string, artifactId: string) {
    const found = await this.database.tenantQuery<{
      id: string;
      fiscal_document_id: string;
      branch_id: string;
      kind: "xml" | "danfe" | "cancellation_xml";
      source_url: string;
      attempt_count: number;
    }>(
      tenantId,
      `SELECT fa.id,fa.fiscal_document_id,fd.branch_id,fa.kind,fa.source_url,fa.attempt_count
       FROM fiscal_artifacts fa JOIN fiscal_documents fd ON fd.id=fa.fiscal_document_id
       WHERE fa.tenant_id=$1 AND fa.id=$2`,
      [tenantId, artifactId],
    );
    const artifact = ensureFound(found.rows[0], "Artefato fiscal");
    const context = systemContext(tenantId, artifact.branch_id);
    const document = await this.documentRow(context, artifact.fiscal_document_id);
    const provider = await this.provider(context, document);
    await this.database.tenantQuery(
      tenantId,
      "UPDATE fiscal_artifacts SET status='downloading',attempt_count=attempt_count+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
      [tenantId, artifactId],
    );
    try {
      const downloaded = await provider.downloadArtifact(artifact.source_url);
      const extension = artifact.kind === "danfe" ? "pdf" : "xml";
      const storageKey = `fiscal/${tenantId}/${artifact.fiscal_document_id}/${artifact.kind}.${extension}`;
      const target = resolve(this.config.UPLOAD_DIR, storageKey);
      const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(temporary, downloaded.content, { flag: "wx" });
      await rename(temporary, target);
      await this.database.tenantQuery(
        tenantId,
        `UPDATE fiscal_artifacts SET status='ready',storage_key=$3,content_type=$4,sha256=$5,
          size_bytes=$6,downloaded_at=now(),last_error=NULL,updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [
          tenantId,
          artifactId,
          storageKey,
          downloaded.contentType,
          createHash("sha256").update(downloaded.content).digest("hex"),
          downloaded.content.length,
        ],
      );
    } catch (error) {
      const retryMinutes = Math.min(60, 2 ** Math.min(artifact.attempt_count + 1, 5));
      await this.database.tenantQuery(
        tenantId,
        `UPDATE fiscal_artifacts SET status='failed',last_error=$3,
          next_retry_at=now()+($4||' minutes')::interval,updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [tenantId, artifactId, safeError(error), retryMinutes],
      );
    }
  }

  async artifact(context: TenantContext, documentId: string, kind: string) {
    if (!["xml", "danfe", "cancellation_xml"].includes(kind)) {
      throw new BadRequestException("Artefato fiscal inválido.");
    }
    const result = await this.database.tenantQuery<{
      branch_id: string;
      storage_key: string | null;
      content_type: string | null;
      status: string;
    }>(
      context.tenantId,
      `SELECT fd.branch_id,fa.storage_key,fa.content_type,fa.status
       FROM fiscal_artifacts fa JOIN fiscal_documents fd ON fd.id=fa.fiscal_document_id
       WHERE fa.tenant_id=$1 AND fa.fiscal_document_id=$2 AND fa.kind=$3`,
      [context.tenantId, documentId, kind],
    );
    const artifact = ensureFound(result.rows[0], "Artefato fiscal");
    ensureBranchAccess(context, artifact.branch_id);
    if (artifact.status !== "ready" || !artifact.storage_key) {
      throw new BadRequestException("O artefato ainda está sendo preparado.");
    }
    const root = resolve(this.config.UPLOAD_DIR);
    const target = resolve(root, artifact.storage_key);
    const pathWithinStorage = relative(root, target);
    if (pathWithinStorage.startsWith("..") || isAbsolute(pathWithinStorage)) {
      throw new BadRequestException("Caminho de artefato inválido.");
    }
    return {
      content: await readFile(target),
      contentType: artifact.content_type ?? (kind === "danfe" ? "application/pdf" : "application/xml"),
      filename: `${kind}-${documentId.slice(0, 8)}.${kind === "danfe" ? "pdf" : "xml"}`,
    };
  }

  private async transmit(context: TenantContext, id: string) {
    let document = await this.documentRow(context, id);
    const provider = await this.provider(context, document);
    const snapshot = await this.database.tenantTransaction(context.tenantId, async (client) => {
      const sale = await this.saleSnapshot(client, context, document.sale_id);
      const settings = await this.requiredSettings(client, context.tenantId, document.branch_id);
      const payload = await buildFocusPayload(client, context.tenantId, sale, settings, document);
      await client.query(
        "UPDATE fiscal_documents SET status='transmitting',attempt_count=attempt_count+1,last_error=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [context.tenantId, id],
      );
      await event(
        client,
        context,
        id,
        "transmission_started",
        document.status,
        "transmitting",
        null,
        "Transmissão iniciada no ambiente de homologação.",
      );
      return payload;
    });
    document = { ...document, status: "transmitting", attempt_count: document.attempt_count + 1 };
    try {
      const result = await provider.issue({
        reference: document.reference,
        documentType: document.document_type,
        payload: snapshot,
        contingency: document.contingency_mode,
      });
      await this.applyProviderResult(context, document, result, "provider_response");
    } catch (error) {
      await this.applyFailure(context, document, error, "transmission_failed");
    }
    return this.getDocument(context, id);
  }

  private async provider(
    context: TenantContext,
    document: FiscalDocumentRow,
  ): Promise<FiscalProvider> {
    const settings = await this.settingsRow(context.tenantId, document.branch_id);
    if (settings) return this.providerForSettings(context, settings);
    throw new BadRequestException("Configure os dados fiscais desta loja antes de emitir.");
  }

  private async providerForSettings(
    context: TenantContext,
    settings: FiscalSettingsRow,
  ): Promise<FiscalProvider> {
    const integration = await this.integrations.getFiscalConnection(context);
    if (!integration)
      throw new BadRequestException("Configure e teste o provedor fiscal em Integrações.");
    return createFiscalProvider(integration.settings.provider, integration.secret, settings.environment);
  }

  private async applyProviderResult(
    context: TenantContext,
    document: FiscalDocumentRow,
    result: FiscalProviderResult,
    eventType: string,
  ) {
    await this.database.tenantTransaction(context.tenantId, async (client) => {
      await client.query(
        `UPDATE fiscal_documents SET status=$3,external_id=COALESCE($4,external_id),
          access_key=COALESCE($5,access_key),protocol=COALESCE($6,protocol),
          rejection_code=$7,rejection_reason=$8,last_error=NULL,next_retry_at=NULL,
          issued_at=CASE WHEN $3='authorized' THEN COALESCE(issued_at,now()) ELSE issued_at END,
          cancelled_at=CASE WHEN $3='cancelled' THEN now() ELSE cancelled_at END,
          contingency_deadline_at=CASE WHEN $3='contingency' THEN COALESCE(contingency_deadline_at,now()+interval '24 hours') ELSE contingency_deadline_at END,
          contingency_synced_at=CASE WHEN $3='authorized' AND contingency_mode=true THEN COALESCE(contingency_synced_at,now()) ELSE contingency_synced_at END,
          provider_updated_at=now(),metadata=metadata||$9::jsonb,updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [
          context.tenantId,
          document.id,
          result.status,
          result.externalId ?? null,
          result.accessKey ?? null,
          result.protocol ?? null,
          result.status === "rejected" ? (result.rejectionCode ?? null) : null,
          result.status === "rejected" ? (result.rejectionReason ?? null) : null,
          JSON.stringify({
            xmlUrl: result.xmlUrl ?? null,
            pdfUrl: result.pdfUrl ?? null,
            providerStatus: result.providerStatus ?? null,
          }),
        ],
      );
      await event(
        client,
        context,
        document.id,
        eventType,
        document.status,
        result.status,
        result.rejectionCode ?? null,
        result.rejectionReason ?? providerMessage(result.status),
      );
      await insertAudit(
        client,
        context,
        `fiscal.document.${result.status}`,
        "fiscal_document",
        document.id,
        {
          saleId: document.sale_id,
          providerCode: result.rejectionCode ?? null,
        },
      );
      await queueArtifacts(client, context.tenantId, document.id, result);
      if (result.status === "rejected") {
        await queueFiscalAlert(
          client,
          context,
          document,
          result.rejectionReason ?? "O documento fiscal foi rejeitado pelo provedor.",
        );
      }
    });
  }

  private async applyFailure(
    context: TenantContext,
    document: FiscalDocumentRow,
    error: unknown,
    eventType: string,
  ) {
    const providerError =
      error instanceof FiscalProviderError
        ? error
        : new FiscalProviderError("Não foi possível concluir a operação fiscal.", "unknown", true);
    const status = providerError.retryable ? "retry_pending" : "rejected";
    const retryMinutes = Math.min(60, 2 ** Math.min(document.attempt_count, 5));
    await this.database.tenantTransaction(context.tenantId, async (client) => {
      await client.query(
        `UPDATE fiscal_documents SET status=$3,last_error=$4,rejection_code=$5,rejection_reason=$4,
          next_retry_at=CASE WHEN $3='retry_pending' THEN now()+($6||' minutes')::interval ELSE NULL END,
          updated_at=now() WHERE tenant_id=$1 AND id=$2`,
        [
          context.tenantId,
          document.id,
          status,
          providerError.message,
          providerError.code ?? null,
          retryMinutes,
        ],
      );
      await event(
        client,
        context,
        document.id,
        eventType,
        document.status,
        status,
        providerError.code ?? null,
        providerError.message,
      );
      if (!providerError.retryable) {
        await queueFiscalAlert(client, context, document, providerError.message);
      }
    });
  }

  private async documentRow(context: TenantContext, id: string) {
    const result = await this.database.tenantQuery<FiscalDocumentRow>(
      context.tenantId,
      "SELECT * FROM fiscal_documents WHERE tenant_id=$1 AND id=$2",
      [context.tenantId, id],
    );
    const document = ensureFound(result.rows[0], "Documento fiscal");
    ensureBranchAccess(context, document.branch_id);
    return document;
  }

  private async settingsRow(tenantId: string, branchId: string) {
    const result = await this.database.tenantQuery<FiscalSettingsRow>(
      tenantId,
      "SELECT * FROM branch_fiscal_settings WHERE tenant_id=$1 AND branch_id=$2",
      [tenantId, branchId],
    );
    return result.rows[0] ?? null;
  }

  private async requiredSettings(client: PoolClient, tenantId: string, branchId: string) {
    const result = await client.query<FiscalSettingsRow>(
      "SELECT * FROM branch_fiscal_settings WHERE tenant_id=$1 AND branch_id=$2",
      [tenantId, branchId],
    );
    const settings = result.rows[0];
    if (!settings || settings.status === "draft") {
      throw new BadRequestException("Configure os dados fiscais desta loja antes de emitir.");
    }
    const missing = fiscalSettingsMissing(settings);
    if (missing.length) {
      throw new BadRequestException(
        `Complete os dados fiscais da loja antes de emitir: ${missing.join(", ")}.`,
      );
    }
    return settings;
  }

  private async saleSnapshot(client: PoolClient, context: TenantContext, saleId: string) {
    const sale = await client.query<Record<string, unknown>>(
      `SELECT s.id,s.branch_id,s.total_amount,s.created_at,s.status,s.customer_document,
        c.name AS customer_name,c.document AS customer_tax_id,c.email AS customer_email,
        c.phone AS customer_phone,c.address_line1 AS customer_address,c.city AS customer_city,
        c.state AS customer_state,c.zip_code AS customer_zip
       FROM sales s LEFT JOIN customers c ON c.id=s.customer_id AND c.tenant_id=s.tenant_id
       WHERE s.tenant_id=$1 AND s.id=$2 AND s.deleted_at IS NULL`,
      [context.tenantId, saleId],
    );
    const row = ensureFound(sale.rows[0], "Venda");
    ensureBranchAccess(context, row.branch_id as string);
    if (row.status === "cancelled")
      throw new BadRequestException("Venda cancelada não pode emitir documento fiscal.");
    const items = await client.query<Record<string, unknown>>(
      `SELECT si.product_id,si.description,si.quantity,si.unit_price,si.discount_amount,p.sku,p.barcode,p.unit,
        pf.ncm,pf.cest,pf.tax_origin,pf.cfop_domestic,pf.cfop_interstate,pf.icms_tax_code,
        pf.pis_tax_code,pf.cofins_tax_code,pf.ipi_tax_code,pf.subject_to_icms_st,
        pf.icms_rate,pf.icms_st_rate,pf.icms_st_mva_rate,pf.fcp_rate,pf.pis_rate,pf.cofins_rate,
        pf.ipi_rate,pf.tax_benefit_code,pf.accountant_review_status
       FROM sale_items si JOIN products p ON p.id=si.product_id AND p.tenant_id=si.tenant_id
       LEFT JOIN product_fiscal_profiles pf ON pf.product_id=p.id AND pf.tenant_id=p.tenant_id
       WHERE si.tenant_id=$1 AND si.sale_id=$2 ORDER BY si.id`,
      [context.tenantId, saleId],
    );
    if (!items.rows.length)
      throw new BadRequestException("A venda não possui produtos para emissão fiscal.");
    const incomplete = items.rows.filter((item) =>
      [
        item.ncm,
        item.tax_origin,
        item.cfop_domestic,
        item.cfop_interstate,
        item.icms_tax_code,
        item.pis_tax_code,
        item.cofins_tax_code,
      ].some((value) => !value),
    );
    if (incomplete.length) {
      throw new BadRequestException(
        `Revise o cadastro fiscal de ${incomplete.length} produto(s) antes de emitir.`,
      );
    }
    const payments = await client.query<Record<string, unknown>>(
      "SELECT method,amount,status FROM sale_payments WHERE tenant_id=$1 AND sale_id=$2 ORDER BY created_at",
      [context.tenantId, saleId],
    );
    return {
      id: row.id as string,
      branchId: row.branch_id as string,
      total: Number(row.total_amount),
      createdAt: row.created_at as Date,
      customer: {
        name: row.customer_name as string | null,
        taxId: (row.customer_tax_id || row.customer_document) as string | null,
        email: row.customer_email as string | null,
        phone: row.customer_phone as string | null,
        address: row.customer_address as string | null,
        city: row.customer_city as string | null,
        state: row.customer_state as string | null,
        zip: row.customer_zip as string | null,
      },
      items: items.rows,
      payments: payments.rows,
    };
  }

  private focusWebhookUrl() {
    const base = (this.config.NEXT_PUBLIC_API_URL ?? `http://localhost:${this.config.API_PORT}/api/v1`)
      .replace(/\/$/, "");
    return `${base}/fiscal/webhooks/focus`;
  }
}

async function buildFocusPayload(
  client: PoolClient,
  tenantId: string,
  sale: Awaited<ReturnType<FiscalService["saleSnapshot"]>>,
  settings: FiscalSettingsRow,
  document: FiscalDocumentRow,
) {
  const simple = settings.tax_regime !== "regime_normal";
  const payload: Record<string, unknown> = {
    natureza_operacao: "VENDA DE MERCADORIA",
    data_emissao: sale.createdAt.toISOString(),
    tipo_documento: 1,
    finalidade_emissao: 1,
    consumidor_final: 1,
    presenca_comprador: 1,
    items: sale.items.map((item, index) => {
      const gross = Number(item.quantity) * Number(item.unit_price);
      const fiscalItem: Record<string, unknown> = {
        numero_item: index + 1,
        codigo_produto: String(item.sku || item.barcode || item.product_id),
        descricao: item.description,
        codigo_ncm: item.ncm,
        cfop: item.cfop_domestic,
        unidade_comercial: item.unit || "UN",
        quantidade_comercial: Number(item.quantity),
        valor_unitario_comercial: Number(item.unit_price),
        valor_bruto: gross,
        valor_desconto: Number(item.discount_amount || 0),
        icms_origem: Number(item.tax_origin),
        pis_situacao_tributaria: item.pis_tax_code,
        cofins_situacao_tributaria: item.cofins_tax_code,
      };
      if (simple) fiscalItem.simples_nacional_situacao_tributaria = item.icms_tax_code;
      else fiscalItem.icms_situacao_tributaria = item.icms_tax_code;
      if (item.cest) fiscalItem.codigo_cest = item.cest;
      if (item.icms_rate != null) fiscalItem.icms_aliquota = Number(item.icms_rate);
      if (item.pis_rate != null) fiscalItem.pis_aliquota_porcentual = Number(item.pis_rate);
      if (item.cofins_rate != null)
        fiscalItem.cofins_aliquota_porcentual = Number(item.cofins_rate);
      return fiscalItem;
    }),
    formas_pagamento: sale.payments.map((payment) => ({
      forma_pagamento: focusPaymentCode(String(payment.method)),
      valor_pagamento: Number(payment.amount),
    })),
  };
  const taxId = String(sale.customer.taxId || "").replace(/\D/g, "");
  if (taxId.length === 11) payload.cpf_destinatario = taxId;
  if (taxId.length === 14) payload.cnpj_destinatario = taxId;
  if (sale.customer.name) payload.nome_destinatario = sale.customer.name;
  if (sale.customer.email) payload.email_destinatario = sale.customer.email;
  if (document.contingency_mode) {
    const column = document.document_type === "nfce" ? "next_nfce_number" : "next_nfe_number";
    const series = document.document_type === "nfce" ? settings.nfce_series : settings.nfe_series;
    const allocated = await client.query<{ number: number }>(
      `UPDATE branch_fiscal_settings SET ${column}=${column}+1,updated_at=now()
       WHERE tenant_id=$1 AND branch_id=$2 RETURNING ${column}-1 AS number`,
      [tenantId, sale.branchId],
    );
    payload.numero = String(allocated.rows[0]!.number);
    payload.serie = String(series);
    payload.codigo_unico = String(randomInt(10_000_000, 99_999_999));
  }
  return payload;
}

function focusPaymentCode(method: string) {
  const normalized = method.toLowerCase();
  if (normalized.includes("pix")) return "17";
  if (normalized.includes("credito") || normalized.includes("crédito")) return "03";
  if (normalized.includes("debito") || normalized.includes("débito")) return "04";
  if (normalized.includes("boleto")) return "15";
  if (normalized.includes("dinheiro")) return "01";
  return "99";
}

function mapSettings(row: FiscalSettingsRow) {
  return {
    provider: row.provider,
    environment: row.environment,
    status: row.status,
    documentMode: row.document_mode,
    taxRegime: row.tax_regime,
    legalName: row.legal_name ?? "",
    tradeName: row.trade_name ?? "",
    taxId: row.tax_id ?? "",
    stateRegistration: row.state_registration ?? "",
    municipalRegistration: row.municipal_registration ?? "",
    state: row.state ?? "",
    cityCode: row.city_code ?? "",
    addressLine: row.address_line ?? "",
    addressNumber: row.address_number ?? "",
    district: row.district ?? "",
    postalCode: row.postal_code ?? "",
    cscIdentifier: row.csc_identifier ?? "",
    nfceSeries: row.nfce_series,
    nextNfceNumber: row.next_nfce_number,
    nfeSeries: row.nfe_series,
    nextNfeNumber: row.next_nfe_number,
    contingencyEnabled: row.contingency_enabled,
    certificateMode: row.certificate_mode,
    certificateExpiresAt: row.certificate_expires_at?.toISOString() ?? "",
    accountantReviewStatus: row.accountant_review_status,
    accountantReviewNote: row.accountant_review_note,
    accountantReviewedAt: row.accountant_reviewed_at?.toISOString() ?? null,
    homologationStatus: row.homologation_status,
    homologationApprovedAt: row.homologation_approved_at?.toISOString() ?? null,
    productionRequestedAt: row.production_requested_at?.toISOString() ?? null,
    productionApprovedAt: row.production_approved_at?.toISOString() ?? null,
    productionRevokedAt: row.production_revoked_at?.toISOString() ?? null,
  };
}

function defaultSettings(branch: Record<string, unknown>) {
  return {
    provider: "focus_nfe",
    environment: "homologation",
    status: "draft",
    documentMode: "nfce",
    taxRegime: "simples_nacional",
    legalName: branch.legal_name ?? "",
    tradeName: branch.name ?? "",
    taxId: branch.tax_id ?? "",
    stateRegistration: "",
    municipalRegistration: "",
    state: branch.state ?? "",
    cityCode: "",
    addressLine: branch.address_line1 ?? "",
    addressNumber: "",
    district: "",
    postalCode: branch.zip_code ?? "",
    cscIdentifier: "",
    nfceSeries: 1,
    nextNfceNumber: 1,
    nfeSeries: 1,
    nextNfeNumber: 1,
    contingencyEnabled: true,
    certificateMode: "provider_managed",
    certificateExpiresAt: "",
    accountantReviewStatus: "pending",
    homologationStatus: "pending",
    homologationApprovedAt: null,
    productionRequestedAt: null,
    productionApprovedAt: null,
    productionRevokedAt: null,
  };
}

function providerMessage(status: string) {
  return (
    {
      authorized: "Documento autorizado pela SEFAZ em homologação.",
      cancelled: "Documento cancelado.",
      contingency: "Documento emitido em contingência.",
      transmitting: "Documento em processamento.",
      queued: "Documento aguardando processamento.",
      rejected: "Documento rejeitado pelo provedor ou pela SEFAZ.",
    } as Record<string, string>
  )[status];
}

function fiscalSettingsMissing(settings: FiscalSettingsRow) {
  const required: Array<[string | null, string]> = [
    [settings.legal_name, "razão social"],
    [settings.trade_name, "nome fantasia"],
    [settings.tax_id, "CNPJ"],
    [settings.state_registration, "inscrição estadual"],
    [settings.state, "UF"],
    [settings.city_code, "código IBGE"],
    [settings.address_line, "logradouro"],
    [settings.address_number, "número"],
    [settings.district, "bairro"],
    [settings.postal_code, "CEP"],
  ];
  return required
    .filter(([value]) => value == null || value.trim().length === 0)
    .map(([, label]) => label);
}

async function assertBranch(client: PoolClient, tenantId: string, branchId: string) {
  const result = await client.query(
    "SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
    [tenantId, branchId],
  );
  ensureFound(result.rows[0], "Loja");
}

async function event(
  client: PoolClient,
  context: TenantContext,
  documentId: string,
  eventType: string,
  from: string | null,
  to: string | null,
  providerCode: string | null,
  message: string | undefined,
) {
  await client.query(
    `INSERT INTO fiscal_document_events(
      tenant_id,fiscal_document_id,actor_user_id,event_type,status_from,status_to,provider_code,message
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      context.tenantId,
      documentId,
      context.userId ?? null,
      eventType,
      from,
      to,
      providerCode,
      message ?? null,
    ],
  );
}

async function insertAudit(
  client: PoolClient,
  context: TenantContext,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  const digest = createHash("sha256").update(JSON.stringify(metadata)).digest("hex");
  await client.query(
    `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      context.tenantId,
      context.userId ?? null,
      action,
      entityType,
      entityId,
      JSON.stringify({ ...metadata, digest }),
    ],
  );
}

export function normalizeFocusWebhook(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("Evento fiscal inválido.");
  }
  const envelope = body as Record<string, unknown>;
  const source = envelope.data && typeof envelope.data === "object" && !Array.isArray(envelope.data)
    ? envelope.data as Record<string, unknown>
    : envelope;
  const reference = firstString(source.reference, source.referencia, source.ref);
  if (!reference || reference.length > 160) {
    throw new BadRequestException("O evento fiscal não possui uma referência válida.");
  }
  const providerPayload: Record<string, unknown> = {
    ref: reference,
    status: firstString(source.status, source.situacao, source.providerStatus),
    chave: firstString(source.chave, source.chave_nfe, source.chave_nfce, source.accessKey),
    protocolo: firstString(source.protocolo, source.numero_protocolo, source.protocol),
    codigo_status_sefaz: firstString(
      source.codigo_status_sefaz,
      source.codigo,
      source.rejectionCode,
    ),
    mensagem_sefaz: firstString(
      source.mensagem_sefaz,
      source.mensagem,
      source.rejectionReason,
    ),
    caminho_xml: firstString(
      source.caminho_xml,
      source.caminho_xml_nota_fiscal,
      source.url_xml,
      source.xmlUrl,
    ),
    caminho_danfe: firstString(
      source.caminho_danfe,
      source.caminho_danfe_nfce,
      source.url_danfe,
      source.pdfUrl,
    ),
  };
  const result = normalizeFocusResponse(providerPayload, reference);
  return {
    reference,
    eventType: firstString(source.event, source.evento, source.tipo_evento) || "document_updated",
    payload: {
      reference,
      eventType: firstString(source.event, source.evento, source.tipo_evento) || null,
      status: result.providerStatus ?? null,
      accessKey: result.accessKey ?? null,
      protocol: result.protocol ?? null,
      rejectionCode: result.rejectionCode ?? null,
      rejectionReason: result.rejectionReason ?? null,
      xmlUrl: result.xmlUrl ?? null,
      pdfUrl: result.pdfUrl ?? null,
    },
    result,
  };
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function validWebhookToken(token: string | undefined, expectedHash: string) {
  if (!token) return false;
  const supplied = Buffer.from(createHash("sha256").update(token).digest("hex"), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function systemContext(tenantId: string, branchId: string): TenantContext {
  return {
    tenantId,
    branchId,
    membershipId: "system",
    roleSlug: "system",
    permissions: [],
  };
}

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "Falha interna durante o processamento fiscal.";
}

function csvCell(value: unknown) {
  const normalized = typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean" || typeof value === "bigint"
      ? String(value)
      : value instanceof Date
        ? value.toISOString()
        : "";
  return `"${normalized.replace(/"/g, '""')}"`;
}

async function queueArtifacts(
  client: PoolClient,
  tenantId: string,
  documentId: string,
  result: FiscalProviderResult,
) {
  const artifacts: Array<["xml" | "danfe" | "cancellation_xml", string | undefined]> =
    result.status === "cancelled"
      ? [["cancellation_xml", result.xmlUrl]]
      : [
          ["xml", result.xmlUrl],
          ["danfe", result.pdfUrl],
        ];
  for (const [kind, sourceUrl] of artifacts) {
    if (!sourceUrl) continue;
    await client.query(
      `INSERT INTO fiscal_artifacts(tenant_id,fiscal_document_id,kind,source_url,status,next_retry_at)
       VALUES($1,$2,$3,$4,'pending',now())
       ON CONFLICT(fiscal_document_id,kind) DO UPDATE SET
         source_url=EXCLUDED.source_url,
         status=CASE WHEN fiscal_artifacts.source_url=EXCLUDED.source_url
           AND fiscal_artifacts.status='ready' THEN 'ready' ELSE 'pending' END,
         next_retry_at=now(),last_error=NULL,updated_at=now()`,
      [tenantId, documentId, kind, sourceUrl],
    );
  }
}

async function queueFiscalAlert(
  client: PoolClient,
  context: TenantContext,
  document: FiscalDocumentRow,
  message: string,
) {
  const title = "Documento fiscal requer atenção";
  const detail = `${document.document_type.toUpperCase()} ${document.reference}: ${message}`.slice(0, 500);
  await client.query(
    `INSERT INTO internal_notifications(
       tenant_id,user_id,branch_id,type,title,message,severity,entity_type,entity_id
     )
     SELECT $1,m.user_id,$2,'fiscal_rejection',$3,$4,'error','fiscal_document',$5
     FROM memberships m JOIN roles r ON r.id=m.role_id
     WHERE m.tenant_id=$1 AND m.status='active' AND m.deleted_at IS NULL
       AND r.slug IN ('owner','admin','manager','accountant')
       AND (m.branch_id IS NULL OR m.branch_id=$2)
       AND NOT EXISTS (
         SELECT 1 FROM internal_notifications n
         WHERE n.tenant_id=$1 AND n.user_id=m.user_id AND n.type='fiscal_rejection'
           AND n.entity_id=$5 AND n.read_at IS NULL
       )`,
    [context.tenantId, document.branch_id, title, detail, document.id],
  );
  await client.query(
    `INSERT INTO fiscal_alert_deliveries(
       tenant_id,fiscal_document_id,kind,recipient,status,next_retry_at
     )
     SELECT DISTINCT $1,$2,'rejection',u.email,'pending',now()
     FROM memberships m JOIN roles r ON r.id=m.role_id JOIN users u ON u.id=m.user_id
     WHERE m.tenant_id=$1 AND m.status='active' AND m.deleted_at IS NULL
       AND u.deleted_at IS NULL AND r.slug IN ('owner','admin','manager','accountant')
       AND (m.branch_id IS NULL OR m.branch_id=$3)
     ON CONFLICT(fiscal_document_id,kind,recipient) DO UPDATE SET
       status=CASE WHEN fiscal_alert_deliveries.status='sent' THEN 'sent' ELSE 'pending' END,
       next_retry_at=now(),last_error=NULL,updated_at=now()`,
    [context.tenantId, document.id, document.branch_id],
  );
}
