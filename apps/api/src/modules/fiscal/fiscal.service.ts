import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  BranchFiscalSettingsInput,
  FiscalCancelInput,
  FiscalCredentialInput,
  FiscalDocumentListQuery,
  FiscalIssueInput,
  FiscalReviewInput,
} from "@sgc/types";
import { createHash, randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { ensureBranchAccess, ensureFound, pagination } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";
import { IntegrationsService } from "../integrations/integrations.service";
import { FocusNfeProvider } from "./focus-nfe.provider";
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
};

@Injectable()
export class FiscalService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IntegrationsService) private readonly integrations: IntegrationsService,
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
          accountant_reviewed_by_user_id=NULL,updated_at=now()`,
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
      canIssueHomologation:
        overview.credentials.hasProviderToken && !missingSettings.length && !pendingProducts.length,
      canActivateProduction:
        overview.credentials.hasProviderToken &&
        !missingSettings.length &&
        !pendingProducts.length &&
        !pendingReviews.length &&
        settings.accountantReviewStatus === "approved",
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
        fd.issued_at AS "issuedAt",fd.cancelled_at AS "cancelledAt",fd.created_at AS "createdAt"
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
    return { document, events: events.rows };
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
      `SELECT id,provider,environment,status,external_id AS "externalId",reference,
        access_key AS "accessKey",protocol,attempt_count AS "attemptCount",
        rejection_code AS "rejectionCode",rejection_reason AS "rejectionReason",
        metadata,requested_at AS "requestedAt",issued_at AS "issuedAt",created_at AS "createdAt"
       FROM fiscal_documents WHERE tenant_id=$1 AND sale_id=$2 ORDER BY created_at DESC`,
      [context.tenantId, saleId],
    );
    return { data: documents.rows };
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
      if (settings.environment === "production") {
        throw new BadRequestException("A emissão em produção ainda não foi liberada.");
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
    const integration = await this.integrations.getFiscalConnection(context);
    if (!integration)
      throw new BadRequestException("Configure e teste o token da Focus NFe em Integrações.");
    if ((integration.settings.provider || "focus_nfe") !== "focus_nfe") {
      throw new BadRequestException("O adaptador Spedy ainda não foi homologado.");
    }
    return new FocusNfeProvider(integration.secret, document.environment);
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
