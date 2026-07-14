import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  AccountingClosureInput,
  InboundFiscalItemResolutionInput,
  InboundFiscalListQuery,
  InboundFiscalManifestInput,
  InboundFiscalReceiveInput,
  PurchaseKeyPreviewInput,
  PurchaseXmlCommitInput,
  PurchaseXmlPreviewInput,
} from "@sgc/types";
import type { AppConfig } from "@sgc/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { PoolClient } from "pg";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { ensureBranchAccess, ensureFound, pagination } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";
import { APP_CONFIG } from "../config/config.module";
import { IntegrationsService } from "../integrations/integrations.service";
import { FocusNfeProvider, type FocusResponse } from "./focus-nfe.provider";

type ParsedItem = {
  name: string;
  supplierCode?: string;
  barcode?: string;
  quantity: number;
  unitCost: number;
  totalAmount: number;
  unit: string;
  ncm?: string;
  cest?: string;
  cfop?: string;
  taxCode?: string;
};

type ParsedInboundNfe = {
  document: {
    key: string;
    number: string;
    series?: string;
    issuedAt?: string;
    totalAmount: number;
    version?: number;
  };
  supplier: { name: string; document?: string };
  items: ParsedItem[];
};

type InboundDocumentRow = {
  id: string;
  branch_id: string;
  purchase_entry_id: string | null;
  purchase_order_id: string | null;
  access_key: string;
  document_number: string;
  series: string | null;
  status: string;
  source: "xml_upload" | "focus_key";
  issuer_name: string;
  issuer_document: string | null;
  issued_at: Date | null;
  total_amount: string;
  manifestation_status: string;
  manifestation_protocol: string | null;
  xml_content: string | null;
  received_at: Date | null;
  created_at: Date;
};

@Injectable()
export class InboundFiscalService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IntegrationsService) private readonly integrations: IntegrationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async previewXml(context: TenantContext, input: PurchaseXmlPreviewInput) {
    ensureBranchAccess(context, input.branchId);
    return this.persistPreview(context, input.branchId, parseNfeXml(input.xml), {
      source: "xml_upload",
      xml: input.xml,
      providerPayload: {},
    });
  }

  async previewKey(context: TenantContext, input: PurchaseKeyPreviewInput) {
    ensureBranchAccess(context, input.branchId);
    const integration = await this.requiredFocusConnection(context);
    const environment = integration.settings.environment === "production" ? "production" : "homologation";
    const provider = new FocusNfeProvider(integration.secret, environment);
    const payload = await provider.getReceivedNfe(input.accessKey);
    const parsed = parseFocusReceivedNfe(payload, input.accessKey);
    return this.persistPreview(context, input.branchId, parsed, {
      source: "focus_key",
      providerPayload: payload,
    });
  }

  async list(context: TenantContext, query: InboundFiscalListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["d.tenant_id=$1"];
    const branchId = context.branchId ?? query.branchId;
    if (branchId) {
      ensureBranchAccess(context, branchId);
      params.push(branchId);
      filters.push(`d.branch_id=$${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      filters.push(`d.status=$${params.length}`);
    }
    if (query.manifestationStatus) {
      params.push(query.manifestationStatus);
      filters.push(`d.manifestation_status=$${params.length}`);
    }
    if (query.period) {
      params.push(`${query.period}-01`);
      filters.push(`d.issued_at >= $${params.length}::date AND d.issued_at < ($${params.length}::date + interval '1 month')`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(d.document_number ILIKE $${params.length} OR d.access_key ILIKE $${params.length} OR d.issuer_name ILIKE $${params.length})`);
    }
    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `SELECT count(*)::text total FROM purchase_fiscal_documents d WHERE ${filters.join(" AND ")}`,
      params,
    );
    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `SELECT d.id,d.branch_id AS "branchId",b.name AS "branchName",d.purchase_entry_id AS "purchaseEntryId",
        d.purchase_order_id AS "purchaseOrderId",d.access_key AS "accessKey",d.document_number AS "documentNumber",
        d.series,d.status,d.source,d.issuer_name AS "issuerName",d.issuer_document AS "issuerDocument",
        d.issued_at AS "issuedAt",d.total_amount::text AS "totalAmount",
        d.manifestation_status AS "manifestationStatus",d.manifestation_protocol AS "manifestationProtocol",
        d.received_at AS "receivedAt",d.created_at AS "createdAt",
        (SELECT count(*)::int FROM purchase_fiscal_document_items i WHERE i.fiscal_document_id=d.id) AS "itemCount",
        (SELECT count(*)::int FROM purchase_fiscal_document_items i WHERE i.fiscal_document_id=d.id AND jsonb_array_length(i.divergences)>0) AS "divergenceCount"
       FROM purchase_fiscal_documents d JOIN branches b ON b.id=d.branch_id
       WHERE ${filters.join(" AND ")} ORDER BY COALESCE(d.issued_at,d.created_at) DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async detail(context: TenantContext, id: string) {
    const document = await this.database.tenantQuery<InboundDocumentRow & {
      branchName: string;
      purchaseEntryId: string | null;
      purchaseOrderId: string | null;
    }>(
      context.tenantId,
      `SELECT d.*,b.name AS "branchName",d.purchase_entry_id AS "purchaseEntryId",d.purchase_order_id AS "purchaseOrderId"
       FROM purchase_fiscal_documents d JOIN branches b ON b.id=d.branch_id
       WHERE d.tenant_id=$1 AND d.id=$2`,
      [context.tenantId, id],
    );
    const current = ensureFound(document.rows[0], "NF-e recebida");
    ensureBranchAccess(context, current.branch_id);
    const items = await this.database.tenantQuery<{
      id: string;
      lineNumber: number;
      supplierCode: string | null;
      barcode: string | null;
      description: string;
      unit: string | null;
      quantity: string;
      unitCost: string;
      totalAmount: string;
      ncm: string | null;
      cest: string | null;
      cfop: string | null;
      taxCode: string | null;
      matchType: string | null;
      resolution: string;
      divergences: string[];
      suggestedSalePrice: string | null;
      productId: string | null;
      productName: string | null;
      productSku: string | null;
    }>(
      context.tenantId,
      `SELECT i.id,i.line_number AS "lineNumber",i.supplier_code AS "supplierCode",i.barcode,
        i.description,i.unit,i.quantity::text AS quantity,i.unit_cost::text AS "unitCost",
        i.total_amount::text AS "totalAmount",i.ncm,i.cest,i.cfop,i.tax_code AS "taxCode",
        i.match_type AS "matchType",i.resolution,i.divergences,
        i.suggested_sale_price::text AS "suggestedSalePrice",
        p.id AS "productId",p.name AS "productName",p.sku AS "productSku"
       FROM purchase_fiscal_document_items i
       LEFT JOIN products p ON p.id=i.matched_product_id
       WHERE i.tenant_id=$1 AND i.fiscal_document_id=$2
       ORDER BY i.line_number`,
      [context.tenantId, id],
    );
    return {
      document: {
        id: current.id,
        branchId: current.branch_id,
        branchName: current.branchName,
        purchaseEntryId: current.purchaseEntryId,
        purchaseOrderId: current.purchaseOrderId,
        accessKey: current.access_key,
        documentNumber: current.document_number,
        series: current.series,
        status: current.status,
        source: current.source,
        issuerName: current.issuer_name,
        issuerDocument: current.issuer_document,
        issuedAt: current.issued_at,
        totalAmount: Number(current.total_amount),
        manifestationStatus: current.manifestation_status,
        manifestationProtocol: current.manifestation_protocol,
        receivedAt: current.received_at,
        createdAt: current.created_at,
      },
      items: items.rows,
      summary: {
        itemCount: items.rowCount,
        linked: items.rows.filter((item) => item.resolution === "linked").length,
        created: items.rows.filter((item) => item.resolution === "created").length,
        ignored: items.rows.filter((item) => item.resolution === "ignored").length,
        withDivergence: items.rows.filter((item) => item.divergences.length > 0).length,
      },
    };
  }

  async reportCsv(context: TenantContext, id: string) {
    const detail = await this.detail(context, id);
    const rows: Array<Array<string | number>> = [
      ["Relatório de conferência Orien"],
      ["Nota", detail.document.documentNumber],
      ["Fornecedor", detail.document.issuerName],
      ["Loja", detail.document.branchName],
      ["Chave", detail.document.accessKey],
      ["Status", inboundStatusLabel(detail.document.status)],
      ["Total da nota", detail.document.totalAmount],
      [],
      ["Linha", "Produto na NF-e", "Código", "Produto vinculado", "Resolução", "Qtd", "Custo", "Preço sugerido", "Total", "NCM", "CFOP", "Alertas"],
      ...detail.items.map((item) => [
        item.lineNumber,
        item.description,
        item.barcode ?? item.supplierCode ?? "",
        item.productName ?? "",
        resolutionLabel(item.resolution),
        item.quantity,
        item.unitCost,
        item.suggestedSalePrice ?? "",
        item.totalAmount,
        item.ncm ?? "",
        item.cfop ?? "",
        item.divergences.join(" | "),
      ]),
    ];
    return csv(rows);
  }

  async reportHtml(context: TenantContext, id: string) {
    const detail = await this.detail(context, id);
    const totalReceived = detail.items
      .filter((item) => item.resolution !== "ignored")
      .reduce((sum, item) => sum + Number(item.totalAmount), 0);
    const unresolved = detail.items.filter((item) => item.resolution === "pending").length;
    const htmlRows = detail.items
      .map((item) => {
        const alerts = item.divergences.length ? item.divergences.map((value) => `<span class="chip warn">${escapeHtml(value)}</span>`).join("") : '<span class="ok">Sem alerta</span>';
        return `<tr>
          <td>#${item.lineNumber}</td>
          <td><strong>${escapeHtml(item.description)}</strong><small>${escapeHtml(item.barcode ?? item.supplierCode ?? "Sem código")} ${item.ncm ? ` · NCM ${escapeHtml(item.ncm)}` : ""}</small></td>
          <td>${item.productName ? `<strong>${escapeHtml(item.productName)}</strong><small>${escapeHtml(item.productSku ?? "")}</small>` : "-"}</td>
          <td><span class="chip">${escapeHtml(resolutionLabel(item.resolution))}</span></td>
          <td>${formatNumber(Number(item.quantity))}</td>
          <td>${formatMoney(Number(item.unitCost))}</td>
          <td>${formatMoney(Number(item.totalAmount))}</td>
          <td>${alerts}</td>
        </tr>`;
      })
      .join("");
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Conferência NF-e ${escapeHtml(detail.document.documentNumber)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { margin: 0; background: #f3f6fb; color: #071b3a; font-family: Inter, Arial, sans-serif; }
    main { max-width: 1120px; margin: 0 auto; padding: 24px; }
    .hero { border-radius: 18px; background: linear-gradient(135deg, #081d3d, #133a7c 72%, #f5c34a); color: white; padding: 28px; }
    .eyebrow { color: #f5c34a; font-size: 12px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
    h1 { margin: 8px 0 0; font-family: Georgia, serif; font-size: 34px; }
    .muted { color: #5d6e89; }
    .hero .muted { color: rgba(255,255,255,.76); }
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(4, 1fr); margin: 18px 0; }
    .card { background: white; border: 1px solid #d9e2ef; border-radius: 14px; padding: 16px; }
    .label { color: #133a7c; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
    .value { margin-top: 6px; font-size: 20px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ef; border-radius: 14px; overflow: hidden; }
    th { background: #eef3f9; color: #0b1d3d; font-size: 11px; letter-spacing: .14em; text-align: left; text-transform: uppercase; }
    th, td { border-bottom: 1px solid #d9e2ef; padding: 12px; vertical-align: top; }
    small { display: block; margin-top: 3px; color: #5d6e89; }
    .chip { display: inline-flex; margin: 2px 4px 2px 0; border: 1px solid #d9e2ef; border-radius: 999px; padding: 3px 8px; background: #f8fafc; font-size: 12px; }
    .warn { border-color: #f6d98b; background: #fff7df; color: #8a5a00; }
    .ok { color: #047857; font-weight: 700; }
    footer { margin-top: 18px; color: #5d6e89; text-align: center; font-size: 12px; }
    @media print { body { background: white; } main { padding: 0; } .hero, .card, table { break-inside: avoid; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">Conferência de entrada</div>
      <h1>NF-e ${escapeHtml(detail.document.documentNumber)} · ${escapeHtml(detail.document.issuerName)}</h1>
      <p class="muted">Relatório operacional para validar vínculos, alertas fiscais, custos e quantidades antes ou depois do recebimento.</p>
    </section>
    <section class="grid">
      <div class="card"><div class="label">Loja</div><div class="value">${escapeHtml(detail.document.branchName)}</div></div>
      <div class="card"><div class="label">Status</div><div class="value">${escapeHtml(inboundStatusLabel(detail.document.status))}</div></div>
      <div class="card"><div class="label">Total da nota</div><div class="value">${formatMoney(detail.document.totalAmount)}</div></div>
      <div class="card"><div class="label">Total conferido</div><div class="value">${formatMoney(totalReceived)}</div></div>
    </section>
    <section class="grid">
      <div class="card"><div class="label">Itens</div><div class="value">${detail.summary.itemCount}</div></div>
      <div class="card"><div class="label">Vinculados</div><div class="value">${detail.summary.linked}</div></div>
      <div class="card"><div class="label">Com alerta</div><div class="value">${detail.summary.withDivergence}</div></div>
      <div class="card"><div class="label">Pendentes</div><div class="value">${unresolved}</div></div>
    </section>
    <p class="muted">Chave de acesso: ${escapeHtml(detail.document.accessKey)}</p>
    <table>
      <thead><tr><th>Linha</th><th>Produto NF-e</th><th>Vínculo</th><th>Resolução</th><th>Qtd</th><th>Custo</th><th>Total</th><th>Alertas</th></tr></thead>
      <tbody>${htmlRows}</tbody>
    </table>
    <footer>Documento gerado automaticamente pela Orien em ${new Date().toLocaleString("pt-BR")}.</footer>
  </main>
</body>
</html>`;
  }

  async resolveItem(context: TenantContext, id: string, itemId: string, input: InboundFiscalItemResolutionInput) {
    const document = await this.database.tenantQuery<InboundDocumentRow>(
      context.tenantId,
      "SELECT * FROM purchase_fiscal_documents WHERE tenant_id=$1 AND id=$2",
      [context.tenantId, id],
    );
    const current = ensureFound(document.rows[0], "NF-e recebida");
    ensureBranchAccess(context, current.branch_id);
    if (current.status === "received") throw new BadRequestException("Esta NF-e já foi recebida e não pode ser alterada.");

    await this.database.tenantTransaction(context.tenantId, async (client) => {
      const item = ensureFound(
        (await client.query<{
          id: string;
          line_number: number;
          description: string;
          supplier_code: string | null;
          quantity: string;
          unit_cost: string;
          total_amount: string;
        }>(
          "SELECT id,line_number,description,supplier_code,quantity::text,unit_cost::text,total_amount::text FROM purchase_fiscal_document_items WHERE tenant_id=$1 AND fiscal_document_id=$2 AND id=$3 FOR UPDATE",
          [context.tenantId, id, itemId],
        )).rows[0],
        "Item da NF-e",
      );
      let productId: string | null = input.productId ?? null;
      if (input.action === "link") {
        if (!productId) throw new BadRequestException("Selecione o produto para vincular este item.");
        await this.assertProduct(client, context.tenantId, current.branch_id, productId);
      }
      if (input.action !== "link") productId = null;
      const quantity = input.quantity ?? Number(item.quantity);
      const unitCost = input.unitCost ?? Number(item.unit_cost);
      const resolution = input.action === "link" ? "linked" : input.action === "create" ? "created" : "ignored";
      const description = input.action === "create" && input.name ? input.name : item.description;
      const supplierCode = input.action === "create" && input.sku ? input.sku : item.supplier_code;

      await client.query(
        `UPDATE purchase_fiscal_document_items
         SET matched_product_id=$4,description=$5,supplier_code=$6,quantity=$7,unit_cost=$8,total_amount=$9,
          resolution=$10,suggested_sale_price=$11,updated_at=now()
         WHERE tenant_id=$1 AND fiscal_document_id=$2 AND id=$3`,
        [
          context.tenantId,
          id,
          itemId,
          productId,
          description,
          supplierCode,
          quantity,
          unitCost,
          quantity * unitCost,
          resolution,
          input.salePrice ?? (resolution === "created" ? suggestedSalePrice(unitCost) : null),
        ],
      );
      await client.query(
        `UPDATE purchase_fiscal_documents
         SET status=CASE
           WHEN EXISTS (SELECT 1 FROM purchase_fiscal_document_items WHERE tenant_id=$1 AND fiscal_document_id=$2 AND resolution='pending') THEN 'review_pending'
           ELSE 'ready'
         END, updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND status<>'received'`,
        [context.tenantId, id],
      );
      await this.audit(client, context, "purchase.fiscal.item_resolved", id, {
        itemId,
        lineNumber: item.line_number,
        action: input.action,
        productId,
        quantity,
        unitCost,
        salePrice: input.salePrice ?? null,
      });
    });
    return this.detail(context, id);
  }

  async receiveExisting(context: TenantContext, id: string, input: InboundFiscalReceiveInput) {
    const detail = await this.detail(context, id);
    if (detail.document.status === "received") throw new BadRequestException("Esta NF-e já foi recebida.");
    const pending = detail.items.filter((item) => item.resolution === "pending");
    if (pending.length) throw new BadRequestException(`Resolva ${pending.length} item(ns) pendente(s) antes de receber a NF-e.`);
    const actionable = detail.items.filter((item) => item.resolution !== "ignored");
    if (!actionable.length) throw new BadRequestException("A NF-e não possui itens para receber no estoque.");

    return this.commit(context, {
      branchId: detail.document.branchId,
      supplierId: input.supplierId,
      supplierName: input.supplierId ? undefined : input.supplierName || detail.document.issuerName,
      documentKey: detail.document.accessKey,
      documentNumber: detail.document.documentNumber,
      source: detail.document.source,
      purchaseOrderId: input.purchaseOrderId,
      createSupplier: input.createSupplier,
      notes: input.notes,
      items: detail.items.map((item) => ({
        sourceIndex: item.lineNumber - 1,
        action: item.resolution === "ignored" ? "ignore" : item.resolution === "created" ? "create" : "link",
        productId: item.productId ?? undefined,
        name: item.description,
        barcode: item.barcode ?? undefined,
        sku: item.supplierCode ?? undefined,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        salePrice:
          item.resolution === "created"
            ? Number(item.suggestedSalePrice ?? suggestedSalePrice(Number(item.unitCost)))
            : undefined,
      })),
    });
  }

  async commit(context: TenantContext, input: PurchaseXmlCommitInput) {
    ensureBranchAccess(context, input.branchId);
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      let document = await this.lockDocument(client, context, input);
      if (!document && input.xml) {
        const parsed = parseNfeXml(input.xml);
        await this.persistPreview(context, input.branchId, parsed, {
          source: input.source,
          xml: input.xml,
          providerPayload: {},
        });
        document = await this.lockDocument(client, context, { ...input, documentKey: parsed.document.key });
      }
      if (!document) throw new BadRequestException("Faça a leitura da NF-e novamente antes de confirmar a entrada.");
      if (document.status === "received") {
        throw new BadRequestException("Esta nota já foi recebida. Confira o histórico antes de tentar novamente.");
      }
      const storedItems = await client.query<{
        id: string;
        line_number: number;
        supplier_code: string | null;
        barcode: string | null;
        description: string;
        unit: string | null;
        quantity: string;
        unit_cost: string;
        total_amount: string;
        ncm: string | null;
        cest: string | null;
        cfop: string | null;
        tax_code: string | null;
        suggested_sale_price: string | null;
      }>(
        "SELECT * FROM purchase_fiscal_document_items WHERE tenant_id=$1 AND fiscal_document_id=$2 ORDER BY line_number",
        [context.tenantId, document.id],
      );
      const choices = new Map(input.items.map((item) => [item.sourceIndex + 1, item]));
      let supplierId = input.supplierId;
      if (!supplierId && input.createSupplier && document.issuer_document) {
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM suppliers WHERE tenant_id=$1 AND document=$2 AND deleted_at IS NULL LIMIT 1",
          [context.tenantId, document.issuer_document],
        );
        supplierId = existing.rows[0]?.id;
        if (!supplierId) {
          const created = await client.query<{ id: string }>(
            "INSERT INTO suppliers(tenant_id,name,document,is_active) VALUES($1,$2,$3,true) RETURNING id",
            [context.tenantId, document.issuer_name, document.issuer_document],
          );
          supplierId = created.rows[0]!.id;
        }
      }
      if (supplierId) {
        ensureFound(
          (await client.query("SELECT id FROM suppliers WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL", [context.tenantId, supplierId])).rows[0],
          "Fornecedor",
        );
      }
      const resolved: Array<{ itemId: string; productId: string; quantity: number; unitCost: number; salePrice: number | null; resolution: string }> = [];
      for (const item of storedItems.rows) {
        const choice = choices.get(item.line_number) ?? { action: "ignore" as const };
        if (choice.action === "ignore") {
          await client.query(
            "UPDATE purchase_fiscal_document_items SET resolution='ignored',matched_product_id=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2",
            [context.tenantId, item.id],
          );
          continue;
        }
        let productId = choice.productId;
        let resolution = "linked";
        const confirmedQuantity = Number(choice.quantity);
        const confirmedUnitCost = Number(choice.unitCost);
        const confirmedSalePrice = Number(choice.salePrice ?? item.suggested_sale_price ?? suggestedSalePrice(confirmedUnitCost));
        if (choice.action === "create") {
          const sku = await this.uniqueSku(client, context.tenantId, choice.sku || item.supplier_code || `NF-${document.document_number}-${item.line_number}`);
          const created = await client.query<{ id: string }>(
            `INSERT INTO products(tenant_id,branch_id,name,sku,barcode,unit,cost_price,sale_price,min_stock,is_active)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,true) RETURNING id`,
            [context.tenantId, input.branchId, choice.name || item.description, sku, item.barcode, item.unit || "un", confirmedUnitCost, confirmedSalePrice],
          );
          productId = created.rows[0]!.id;
          resolution = "created";
        }
        if (!productId) throw new BadRequestException(`Selecione o produto do item ${item.line_number}.`);
        await this.assertProduct(client, context.tenantId, input.branchId, productId);
        resolved.push({
          itemId: item.id,
          productId,
          quantity: confirmedQuantity,
          unitCost: confirmedUnitCost,
          salePrice: choice.action === "create" ? confirmedSalePrice : null,
          resolution,
        });
      }
      if (!resolved.length) throw new BadRequestException("Selecione ao menos um item para receber no estoque.");
      const order = input.purchaseOrderId
        ? await this.lockPurchaseOrder(client, context, input.purchaseOrderId, input.branchId, supplierId)
        : null;
      const entryTotal = resolved.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
      const entry = await client.query<{ id: string }>(
        `INSERT INTO purchase_entries(tenant_id,branch_id,supplier_id,supplier_name,document_number,purchase_order_id,
          total_amount,notes,status,document_key,source_type,source_payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'received',$9,$10,$11::jsonb) RETURNING id`,
        [
          context.tenantId,
          input.branchId,
          supplierId ?? null,
          input.supplierName || document.issuer_name,
          document.document_number,
          order?.id ?? null,
          entryTotal,
          input.notes ?? null,
          document.access_key,
          document.source === "focus_key" ? "nfe_focus" : "nfe_xml",
          JSON.stringify({ fiscalDocumentId: document.id, importedItemCount: storedItems.rowCount }),
        ],
      );
      for (const item of resolved) {
        await client.query(
          "INSERT INTO purchase_entry_items(tenant_id,purchase_entry_id,product_id,quantity,unit_cost) VALUES($1,$2,$3,$4,$5)",
          [context.tenantId, entry.rows[0]!.id, item.productId, item.quantity, item.unitCost],
        );
        await client.query("UPDATE products SET cost_price=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2", [context.tenantId, item.productId, item.unitCost]);
        await client.query(
          `INSERT INTO stock_balances(tenant_id,branch_id,product_id,quantity) VALUES($1,$2,$3,$4)
           ON CONFLICT(tenant_id,branch_id,product_id) DO UPDATE SET quantity=stock_balances.quantity+EXCLUDED.quantity,updated_at=now()`,
          [context.tenantId, input.branchId, item.productId, item.quantity],
        );
        await client.query(
          "INSERT INTO stock_movements(tenant_id,branch_id,product_id,movement_type,quantity,reason,actor_user_id) VALUES($1,$2,$3,'purchase_in',$4,$5,$6)",
          [context.tenantId, input.branchId, item.productId, item.quantity, `Entrada da NF-e ${document.document_number}`, context.userId ?? null],
        );
        await client.query(
          "UPDATE purchase_fiscal_document_items SET matched_product_id=$3,resolution=$4,suggested_sale_price=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [context.tenantId, item.itemId, item.productId, item.resolution, item.salePrice],
        );
        if (order) await this.receiveOrderItem(client, context.tenantId, order.id, item.productId, item.quantity);
      }
      if (order) await this.refreshOrderStatus(client, context.tenantId, order.id);
      await client.query(
        `UPDATE purchase_fiscal_documents SET purchase_entry_id=$3,purchase_order_id=$4,status='received',
          received_by_user_id=$5,received_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2`,
        [context.tenantId, document.id, entry.rows[0]!.id, order?.id ?? null, context.userId ?? null],
      );
      await this.audit(client, context, "purchase.fiscal.received", document.id, {
        accessKey: document.access_key,
        purchaseEntryId: entry.rows[0]!.id,
        purchaseOrderId: order?.id ?? null,
        itemCount: resolved.length,
        totalAmount: entryTotal,
      });
      return { id: entry.rows[0]!.id, fiscalDocumentId: document.id, itemCount: resolved.length, totalAmount: entryTotal };
    });
  }

  async manifest(context: TenantContext, id: string, input: InboundFiscalManifestInput) {
    const document = await this.database.tenantQuery<InboundDocumentRow>(
      context.tenantId,
      "SELECT * FROM purchase_fiscal_documents WHERE tenant_id=$1 AND id=$2",
      [context.tenantId, id],
    );
    const current = ensureFound(document.rows[0], "NF-e recebida");
    ensureBranchAccess(context, current.branch_id);
    const integration = await this.requiredFocusConnection(context);
    const provider = new FocusNfeProvider(
      integration.secret,
      integration.settings.environment === "production" ? "production" : "homologation",
    );
    try {
      const payload = await provider.manifestReceivedNfe(current.access_key, input.type, input.justification);
      const protocol = textValue(payload.protocolo ?? payload.numero_protocolo ?? payload.id) || null;
      await this.database.tenantTransaction(context.tenantId, async (client) => {
        await client.query(
          `INSERT INTO purchase_fiscal_manifestations(tenant_id,fiscal_document_id,manifestation_type,justification,
            status,protocol,response_payload,requested_by_user_id) VALUES($1,$2,$3,$4,'processed',$5,$6::jsonb,$7)`,
          [context.tenantId, id, input.type, input.justification ?? null, protocol, JSON.stringify(payload), context.userId ?? null],
        );
        await client.query(
          "UPDATE purchase_fiscal_documents SET manifestation_status=$3,manifestation_protocol=$4,manifested_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [context.tenantId, id, input.type, protocol],
        );
        await this.audit(client, context, "purchase.fiscal.manifested", id, { type: input.type, protocol });
      });
      return { ok: true, type: input.type, protocol };
    } catch (error) {
      await this.database.tenantQuery(
        context.tenantId,
        `INSERT INTO purchase_fiscal_manifestations(tenant_id,fiscal_document_id,manifestation_type,justification,
          status,response_payload,requested_by_user_id) VALUES($1,$2,$3,$4,'failed',$5::jsonb,$6)`,
        [context.tenantId, id, input.type, input.justification ?? null, JSON.stringify({ message: error instanceof Error ? error.message : "Falha no provedor" }), context.userId ?? null],
      );
      throw error;
    }
  }

  async closures(context: TenantContext) {
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `SELECT c.id,c.branch_id AS "branchId",b.name AS "branchName",to_char(c.period,'YYYY-MM') AS period,
        c.status,c.document_count AS "documentCount",c.total_amount::text AS "totalAmount",
        c.generated_at AS "generatedAt",c.closed_at AS "closedAt"
       FROM accounting_closures c LEFT JOIN branches b ON b.id=c.branch_id
       WHERE c.tenant_id=$1 ${context.branchId ? "AND c.branch_id=$2" : ""}
       ORDER BY c.period DESC,c.created_at DESC LIMIT 24`,
      context.branchId ? [context.tenantId, context.branchId] : [context.tenantId],
    );
    return { data: rows.rows };
  }

  async accountingPackage(context: TenantContext, input: AccountingClosureInput) {
    const branchId = context.branchId ?? input.branchId;
    if (branchId) ensureBranchAccess(context, branchId);
    const start = `${input.period}-01`;
    const params: unknown[] = [context.tenantId, start];
    const branchFilter = branchId ? `AND d.branch_id=$3` : "";
    if (branchId) params.push(branchId);
    const inbound = await this.database.tenantQuery<InboundDocumentRow>(
      context.tenantId,
      `SELECT d.* FROM purchase_fiscal_documents d WHERE d.tenant_id=$1
       AND COALESCE(d.issued_at,d.created_at) >= $2::date
       AND COALESCE(d.issued_at,d.created_at) < ($2::date + interval '1 month') ${branchFilter}
       ORDER BY COALESCE(d.issued_at,d.created_at),d.document_number`,
      params,
    );
    const outbound = await this.database.tenantQuery<{
      id: string; reference: string; document_type: string; status: string; access_key: string | null; created_at: Date; storage_key: string | null;
    }>(
      context.tenantId,
      `SELECT d.id,d.reference,d.document_type,d.status,d.access_key,d.created_at,a.storage_key
       FROM fiscal_documents d LEFT JOIN fiscal_artifacts a ON a.fiscal_document_id=d.id AND a.kind='xml' AND a.status='ready'
       WHERE d.tenant_id=$1 AND d.created_at >= $2::date AND d.created_at < ($2::date + interval '1 month') ${branchFilter}
       ORDER BY d.created_at,d.reference`,
      params,
    );
    const zip = new JSZip();
    zip.file("LEIA-ME.txt", `Pacote contábil Orien\nCompetência: ${input.period}\nGerado em: ${new Date().toISOString()}\nEntradas: ${inbound.rowCount}\nSaídas: ${outbound.rowCount}\n`);
    zip.file("entradas.csv", csv([
      ["Chave", "Número", "Fornecedor", "Documento", "Emissão", "Total", "Manifestação", "Status"],
      ...inbound.rows.map((row) => [row.access_key, row.document_number, row.issuer_name, row.issuer_document ?? "", row.issued_at?.toISOString() ?? "", row.total_amount, row.manifestation_status, row.status]),
    ]));
    zip.file("saidas.csv", csv([
      ["Referência", "Tipo", "Status", "Chave", "Emissão"],
      ...outbound.rows.map((row) => [row.reference, row.document_type, row.status, row.access_key ?? "", row.created_at.toISOString()]),
    ]));
    for (const document of inbound.rows) {
      if (document.xml_content) zip.file(`xml-entradas/${document.access_key}.xml`, document.xml_content);
    }
    const storageRoot = resolve(this.config.UPLOAD_DIR);
    for (const document of outbound.rows) {
      if (!document.storage_key) continue;
      const target = resolve(storageRoot, document.storage_key);
      const withinStorage = relative(storageRoot, target);
      if (withinStorage.startsWith("..") || isAbsolute(withinStorage)) continue;
      try {
        zip.file(`xml-saidas/${document.access_key || document.reference}.xml`, await readFile(target));
      } catch {
        // O CSV mantém o documento rastreável mesmo se o artefato ainda estiver em processamento.
      }
    }
    const total = inbound.rows.reduce((sum, row) => sum + Number(row.total_amount), 0);
    await this.database.tenantQuery(
      context.tenantId,
      `INSERT INTO accounting_closures(tenant_id,branch_id,period,status,document_count,total_amount,generated_at,generated_by_user_id)
       VALUES($1,$2,$3::date,'exported',$4,$5,now(),$6)
       ON CONFLICT(tenant_id,branch_id,period) DO UPDATE SET status=CASE WHEN accounting_closures.status='closed' THEN 'closed' ELSE 'exported' END,
       document_count=EXCLUDED.document_count,total_amount=EXCLUDED.total_amount,generated_at=now(),generated_by_user_id=EXCLUDED.generated_by_user_id,updated_at=now()`,
      [context.tenantId, branchId ?? null, start, (inbound.rowCount ?? 0) + (outbound.rowCount ?? 0), total, context.userId ?? null],
    );
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  async closePeriod(context: TenantContext, input: AccountingClosureInput) {
    const branchId = context.branchId ?? input.branchId;
    if (branchId) ensureBranchAccess(context, branchId);
    const result = await this.database.tenantQuery(
      context.tenantId,
      `UPDATE accounting_closures SET status='closed',closed_at=now(),closed_by_user_id=$4,updated_at=now()
       WHERE tenant_id=$1 AND branch_id IS NOT DISTINCT FROM $2::uuid AND period=$3::date AND status IN ('exported','closed') RETURNING id,status,closed_at AS "closedAt"`,
      [context.tenantId, branchId ?? null, `${input.period}-01`, context.userId ?? null],
    );
    if (!result.rows[0]) throw new BadRequestException("Gere o pacote da competência antes de fechá-la.");
    return result.rows[0];
  }

  private async persistPreview(
    context: TenantContext,
    branchId: string,
    parsed: ParsedInboundNfe,
    source: { source: "xml_upload" | "focus_key"; xml?: string; providerPayload: FocusResponse },
  ) {
    if (!parsed.items.length && source.source === "xml_upload") {
      throw new BadRequestException("Não encontramos itens de produto na NF-e.");
    }
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const supplierMatch = parsed.supplier.document
        ? (await client.query<{ id: string; name: string }>("SELECT id,name FROM suppliers WHERE tenant_id=$1 AND document=$2 AND deleted_at IS NULL LIMIT 1", [context.tenantId, parsed.supplier.document])).rows[0]
        : undefined;
      const codes = parsed.items.flatMap((item) => [item.barcode, item.supplierCode].filter(Boolean)) as string[];
      const products = codes.length
        ? await client.query<{ id: string; name: string; sku: string | null; barcode: string | null; cost_price: string }>(
            "SELECT id,name,sku,barcode,cost_price::text FROM products WHERE tenant_id=$1 AND deleted_at IS NULL AND (barcode=ANY($2::text[]) OR sku=ANY($2::text[]))",
            [context.tenantId, codes],
          )
        : { rows: [] };
      const byBarcode = new Map(products.rows.filter((row) => row.barcode).map((row) => [row.barcode!, row]));
      const bySku = new Map(products.rows.filter((row) => row.sku).map((row) => [row.sku!, row]));
      const prepared = parsed.items.map((item, index) => {
        const match = (item.barcode ? byBarcode.get(item.barcode) : undefined) ?? (item.supplierCode ? bySku.get(item.supplierCode) : undefined);
        const previousCost = Number(match?.cost_price ?? 0);
        const costDifferencePercent = previousCost > 0 ? ((item.unitCost - previousCost) / previousCost) * 100 : null;
        const divergences = [
          ...(!match ? ["Produto não cadastrado"] : []),
          ...(!item.barcode ? ["Sem GTIN para vínculo automático"] : []),
          ...(costDifferencePercent !== null && Math.abs(costDifferencePercent) >= 20 ? [`Custo ${costDifferencePercent > 0 ? "acima" : "abaixo"} em ${Math.abs(costDifferencePercent).toFixed(0)}%`] : []),
          ...(item.quantity >= 1000 ? ["Quantidade alta: confira antes de receber"] : []),
          ...(!item.ncm || !/^\d{8}$/.test(item.ncm) ? ["NCM ausente ou inválido"] : []),
        ];
        return { item, index, match, previousCost, divergences };
      });
      const status = !prepared.length || prepared.some((row) => row.divergences.length) ? "review_pending" : "ready";
      const document = await client.query<{ id: string }>(
        `INSERT INTO purchase_fiscal_documents(tenant_id,branch_id,access_key,document_number,series,source,status,
          issuer_name,issuer_document,issued_at,total_amount,provider_version,xml_content,xml_sha256,provider_payload,created_by_user_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)
         ON CONFLICT(tenant_id,access_key) DO UPDATE SET branch_id=EXCLUDED.branch_id,document_number=EXCLUDED.document_number,
          series=EXCLUDED.series,source=EXCLUDED.source,status=EXCLUDED.status,issuer_name=EXCLUDED.issuer_name,
          issuer_document=EXCLUDED.issuer_document,issued_at=EXCLUDED.issued_at,total_amount=EXCLUDED.total_amount,
          provider_version=EXCLUDED.provider_version,xml_content=COALESCE(EXCLUDED.xml_content,purchase_fiscal_documents.xml_content),
          xml_sha256=COALESCE(EXCLUDED.xml_sha256,purchase_fiscal_documents.xml_sha256),
          provider_payload=EXCLUDED.provider_payload,updated_at=now()
         WHERE purchase_fiscal_documents.status<>'received' RETURNING id`,
        [context.tenantId, branchId, parsed.document.key, parsed.document.number, parsed.document.series ?? null, source.source, status,
          parsed.supplier.name, parsed.supplier.document ?? null, parsed.document.issuedAt ?? null, parsed.document.totalAmount,
          parsed.document.version ?? null, source.xml ?? null, source.xml ? createHash("sha256").update(source.xml).digest("hex") : null,
          JSON.stringify(source.providerPayload), context.userId ?? null],
      );
      if (!document.rows[0]) throw new BadRequestException("Esta NF-e já foi recebida e não pode ser substituída.");
      const documentId = document.rows[0].id;
      await client.query("DELETE FROM purchase_fiscal_document_items WHERE tenant_id=$1 AND fiscal_document_id=$2", [context.tenantId, documentId]);
      for (const row of prepared) {
        await client.query(
          `INSERT INTO purchase_fiscal_document_items(tenant_id,fiscal_document_id,line_number,supplier_code,barcode,
            description,unit,quantity,unit_cost,total_amount,ncm,cest,cfop,tax_code,matched_product_id,match_type,resolution,divergences,suggested_sale_price)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending',$17::jsonb,$18)`,
          [context.tenantId, documentId, row.index + 1, row.item.supplierCode ?? null, row.item.barcode ?? null,
            row.item.name, row.item.unit, row.item.quantity, row.item.unitCost, row.item.totalAmount,row.item.ncm ?? null,
            row.item.cest ?? null,row.item.cfop ?? null,row.item.taxCode ?? null,row.match?.id ?? null,
            row.match ? (row.item.barcode && row.match.barcode === row.item.barcode ? "barcode" : "sku") : null,
            JSON.stringify(row.divergences), suggestedSalePrice(row.item.unitCost)],
        );
      }
      const orders = supplierMatch
        ? await client.query<{ id: string; status: string; expected_at: Date | null; pending_items: number }>(
            `SELECT po.id,po.status,po.expected_at,count(*) FILTER(WHERE poi.received_quantity<poi.quantity)::int pending_items
             FROM purchase_orders po JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
             WHERE po.tenant_id=$1 AND po.branch_id=$2 AND po.supplier_id=$3 AND po.status IN('approved','partial') AND po.deleted_at IS NULL
             GROUP BY po.id ORDER BY po.expected_at NULLS LAST,po.created_at DESC LIMIT 20`,
            [context.tenantId, branchId, supplierMatch.id],
          )
        : { rows: [] };
      return {
        fiscalDocumentId: documentId,
        document: parsed.document,
        supplier: { ...parsed.supplier, match: supplierMatch ?? null },
        purchaseOrders: orders.rows.map((order) => ({ id: order.id, status: order.status, expectedAt: order.expected_at?.toISOString() ?? null, pendingItems: order.pending_items })),
        requiresManifestation: source.source === "focus_key" && !prepared.length,
        items: prepared.map((row) => ({
          ...row.item,
          sourceIndex: row.index,
          salePrice: suggestedSalePrice(row.item.unitCost),
          match: row.match ? { productId: row.match.id, name: row.match.name, sku: row.match.sku, costPrice: row.previousCost, confidence: row.item.barcode ? "barcode" : "sku" } : null,
          suggestedAction: row.match ? "link" : "create",
          divergences: row.divergences,
        })),
      };
    });
  }

  private async lockDocument(client: PoolClient, context: TenantContext, input: PurchaseXmlCommitInput) {
    if (!input.documentKey) return null;
    const result = await client.query<InboundDocumentRow>(
      "SELECT * FROM purchase_fiscal_documents WHERE tenant_id=$1 AND access_key=$2 AND branch_id=$3 FOR UPDATE",
      [context.tenantId, input.documentKey, input.branchId],
    );
    return result.rows[0] ?? null;
  }

  private async requiredFocusConnection(context: TenantContext) {
    const integration = await this.integrations.getFiscalConnection(context);
    if (!integration) throw new BadRequestException("Configure e teste a Focus NFe em Integrações antes de consultar pela chave.");
    if ((integration.settings.provider || "focus_nfe") !== "focus_nfe") throw new BadRequestException("A consulta de NF-e recebida está disponível com a Focus NFe.");
    return integration;
  }

  private async uniqueSku(client: PoolClient, tenantId: string, requested: string) {
    const base = requested.trim().replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 52) || "NF-PRODUTO";
    for (let suffix = 0; suffix < 100; suffix += 1) {
      const sku = suffix ? `${base}-${suffix}` : base;
      const exists = await client.query("SELECT 1 FROM products WHERE tenant_id=$1 AND sku=$2 AND deleted_at IS NULL", [tenantId, sku]);
      if (!exists.rows[0]) return sku;
    }
    throw new BadRequestException("Não foi possível gerar um SKU único para o produto.");
  }

  private async assertProduct(client: PoolClient, tenantId: string, branchId: string, productId: string) {
    const result = await client.query<{ branch_id: string | null }>("SELECT branch_id FROM products WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL", [tenantId, productId]);
    const product = ensureFound(result.rows[0], "Produto");
    if (product.branch_id && product.branch_id !== branchId) throw new BadRequestException("O produto selecionado pertence a outra loja.");
  }

  private async lockPurchaseOrder(client: PoolClient, context: TenantContext, id: string, branchId: string, supplierId?: string) {
    const result = await client.query<{ id: string; branch_id: string; supplier_id: string; status: string }>(
      "SELECT id,branch_id,supplier_id,status FROM purchase_orders WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE",
      [context.tenantId, id],
    );
    const order = ensureFound(result.rows[0], "Pedido de compra");
    if (order.branch_id !== branchId || !["approved", "partial"].includes(order.status)) throw new BadRequestException("O pedido não está disponível para recebimento nesta loja.");
    if (supplierId && order.supplier_id !== supplierId) throw new BadRequestException("O fornecedor da nota é diferente do pedido selecionado.");
    return order;
  }

  private async receiveOrderItem(client: PoolClient, tenantId: string, orderId: string, productId: string, quantity: number) {
    const line = await client.query<{ quantity: string; received_quantity: string }>(
      "SELECT quantity::text,received_quantity::text FROM purchase_order_items WHERE tenant_id=$1 AND purchase_order_id=$2 AND product_id=$3 FOR UPDATE",
      [tenantId, orderId, productId],
    );
    if (!line.rows[0]) return;
    const pending = Math.max(0, Number(line.rows[0].quantity) - Number(line.rows[0].received_quantity));
    await client.query(
      "UPDATE purchase_order_items SET received_quantity=received_quantity+$4 WHERE tenant_id=$1 AND purchase_order_id=$2 AND product_id=$3",
      [tenantId, orderId, productId, Math.min(quantity, pending)],
    );
  }

  private async refreshOrderStatus(client: PoolClient, tenantId: string, orderId: string) {
    const pending = await client.query<{ total: string }>(
      "SELECT COALESCE(sum(quantity-received_quantity),0)::text total FROM purchase_order_items WHERE tenant_id=$1 AND purchase_order_id=$2",
      [tenantId, orderId],
    );
    await client.query("UPDATE purchase_orders SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2", [tenantId, orderId, Number(pending.rows[0]?.total ?? 0) > 0 ? "partial" : "received"]);
  }

  private async audit(client: PoolClient, context: TenantContext, action: string, entityId: string, metadata: Record<string, unknown>) {
    await client.query(
      "INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'purchase_fiscal_document',$4,$5::jsonb)",
      [context.tenantId, context.userId ?? null, action, entityId, JSON.stringify(metadata)],
    );
  }
}

export function parseNfeXml(xml: string): ParsedInboundNfe {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new BadRequestException("O XML contém uma declaração externa não permitida.");
  let data: Record<string, unknown>;
  try {
    data = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      trimValues: true,
      processEntities: false,
      parseTagValue: false,
    }).parse(xml) as Record<string, unknown>;
  } catch {
    throw new BadRequestException("O XML da nota não pôde ser lido.");
  }
  const nfe = objectAt(data, "nfeProc", "NFe", "infNFe") ?? objectAt(data, "NFe", "infNFe");
  if (!nfe) throw new BadRequestException("O arquivo não parece ser um XML de NF-e válido.");
  const ide = objectAt(nfe, "ide") ?? {};
  const emitter = objectAt(nfe, "emit") ?? {};
  const totals = objectAt(nfe, "total", "ICMSTot") ?? {};
  const details = Array.isArray(nfe.det) ? nfe.det : nfe.det ? [nfe.det] : [];
  const key = typeof nfe.Id === "string" ? nfe.Id.replace(/^NFe/, "") : "";
  if (!/^\d{44}$/.test(key)) throw new BadRequestException("A NF-e não contém uma chave de acesso válida com 44 dígitos.");
  const items = details.map((detail) => parseXmlItem(detail)).filter((item): item is ParsedItem => Boolean(item));
  return {
    document: {
      key,
      number: textValue(ide.nNF) || "Sem número",
      series: textValue(ide.serie) || undefined,
      issuedAt: textValue(ide.dhEmi) || textValue(ide.dEmi) || undefined,
      totalAmount: numberValue(totals.vNF) || items.reduce((sum, item) => sum + item.totalAmount, 0),
    },
    supplier: { name: textValue(emitter.xNome) || "Fornecedor do XML", document: textValue(emitter.CNPJ) || textValue(emitter.CPF) || undefined },
    items,
  };
}

function parseXmlItem(detail: unknown): ParsedItem | null {
  const product = objectAt(detail, "prod");
  if (!product) return null;
  const tax = objectAt(detail, "imposto", "ICMS") ?? {};
  const taxGroup = Object.values(tax).find((value) => value && typeof value === "object") as Record<string, unknown> | undefined;
  const barcodeValue = textValue(product.cEAN);
  const barcode = barcodeValue && !/^SEM\s*GTIN$/i.test(barcodeValue) ? barcodeValue.replace(/\D/g, "") : undefined;
  const quantity = numberValue(product.qCom);
  const unitCost = numberValue(product.vUnCom);
  return {
    name: textValue(product.xProd) || "Produto sem descrição",
    supplierCode: textValue(product.cProd) || undefined,
    barcode,
    quantity,
    unitCost,
    totalAmount: numberValue(product.vProd) || quantity * unitCost,
    unit: textValue(product.uCom) || "un",
    ncm: digits(product.NCM, 8),
    cest: digits(product.CEST, 7),
    cfop: digits(product.CFOP, 4),
    taxCode: textValue(taxGroup?.CST) || textValue(taxGroup?.CSOSN) || undefined,
  };
}

export function parseFocusReceivedNfe(payload: FocusResponse, accessKey: string): ParsedInboundNfe {
  const emitter = recordValue(payload.emitente) ?? recordValue(payload.emit) ?? {};
  const rawItems = arrayValue(payload.itens ?? payload.items ?? payload.produtos);
  const items = rawItems.map((raw) => {
    const item = recordValue(raw) ?? {};
    const product = recordValue(item.produto) ?? recordValue(item.prod) ?? item;
    const quantity = numberValue(product.quantidade_comercial ?? product.quantidade ?? product.qCom);
    const unitCost = numberValue(product.valor_unitario_comercial ?? product.valor_unitario ?? product.vUnCom);
    const barcodeValue = textValue(product.codigo_gtin ?? product.gtin ?? product.codigo_barras ?? product.cEAN).replace(/\D/g, "");
    return {
      name: textValue(product.descricao ?? product.nome ?? product.xProd) || "Produto sem descrição",
      supplierCode: textValue(product.codigo ?? product.codigo_produto ?? product.cProd) || undefined,
      barcode: barcodeValue || undefined,
      quantity,
      unitCost,
      totalAmount: numberValue(product.valor_total ?? product.vProd) || quantity * unitCost,
      unit: textValue(product.unidade_comercial ?? product.unidade ?? product.uCom) || "un",
      ncm: digits(product.ncm ?? product.NCM, 8),
      cest: digits(product.cest ?? product.CEST, 7),
      cfop: digits(product.cfop ?? product.CFOP, 4),
      taxCode: textValue(product.cst ?? product.csosn ?? product.CST ?? product.CSOSN) || undefined,
    } satisfies ParsedItem;
  }).filter((item) => item.quantity > 0);
  const issuerDocument = textValue(payload.cnpj_emitente ?? emitter.cnpj ?? emitter.CNPJ ?? payload.cpf_emitente ?? emitter.cpf ?? emitter.CPF);
  return {
    document: {
      key: accessKey,
      number: textValue(payload.numero ?? payload.numero_nfe ?? payload.nNF) || accessKey.slice(25, 34),
      series: textValue(payload.serie ?? payload.serie_nfe) || undefined,
      issuedAt: textValue(payload.data_emissao ?? payload.data_emissao_nfe ?? payload.dhEmi) || undefined,
      totalAmount: numberValue(payload.valor_total ?? payload.valor_nota ?? payload.vNF) || items.reduce((sum, item) => sum + item.totalAmount, 0),
      version: numberValue(payload.versao) || undefined,
    },
    supplier: { name: textValue(payload.nome_emitente ?? payload.razao_social_emitente ?? emitter.nome ?? emitter.xNome) || "Fornecedor da NF-e", document: issuerDocument || undefined },
    items,
  };
}

function objectAt(value: unknown, ...path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return recordValue(current);
}
function recordValue(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function arrayValue(value: unknown): unknown[] { return Array.isArray(value) ? Array.from(value as unknown[]) : value ? [value] : []; }
function textValue(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function numberValue(value: unknown) { const normalized = typeof value === "string" || typeof value === "number" ? String(value) : "0"; const parsed = Number(normalized.replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; }
function digits(value: unknown, length: number) { const normalized = textValue(value).replace(/\D/g, ""); return normalized.length === length ? normalized : undefined; }
function csv(rows: Array<Array<string | number>>) { return `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\r\n")}\r\n`; }
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatNumber(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
function suggestedSalePrice(unitCost: number) {
  if (!Number.isFinite(unitCost) || unitCost <= 0) return 0;
  return Math.round(unitCost * 1.35 * 100) / 100;
}
function resolutionLabel(value: string) {
  return (
    {
      pending: "Pendente",
      linked: "Vinculado",
      created: "Produto criado",
      ignored: "Ignorado",
    } as Record<string, string>
  )[value] ?? value;
}
function inboundStatusLabel(value: string) {
  return (
    {
      ready: "Pronta",
      review_pending: "Revisar",
      received: "Recebida",
      rejected: "Rejeitada",
      cancelled: "Cancelada",
    } as Record<string, string>
  )[value] ?? value;
}
