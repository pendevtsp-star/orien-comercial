import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  ProductCreateInput,
  ProductFiscalInput,
  ProductUpdateInput,
  BulkStatusUpdateInput,
  ResourceListQuery,
} from "@sgc/types";
import {
  ensureBranchAccess,
  ensureFound,
  pagination,
  resolveSort,
} from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";
import { APP_CONFIG } from "../config/config.module";
import bwipjs from "bwip-js";
import { fiscalReadiness, type FiscalReadinessInput } from "./product-fiscal-readiness";

@Injectable()
export class ProductsService {
  private readonly catalogCache = new Map<
    string,
    { expiresAt: number; value: Record<string, unknown> }
  >();
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async list(context: TenantContext, query: ResourceListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["p.tenant_id = $1", "p.deleted_at IS NULL"];
    const sort = resolveSort(
      query,
      {
        name: "p.name",
        sku: "p.sku",
        salePrice: "p.sale_price",
        minStock: "p.min_stock",
        createdAt: "p.created_at",
      },
      "name",
    );

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`(p.branch_id = $${params.length} OR p.branch_id IS NULL)`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(
        `(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`,
      );
    }

    if (typeof query.isActive === "boolean") {
      params.push(query.isActive);
      filters.push(`p.is_active = $${params.length}`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `SELECT count(*)::text AS total FROM products p WHERE ${filters.join(" AND ")}`,
      params,
    );

    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT
        p.id, p.name, p.sku, p.barcode, p.unit,
        p.sale_price AS "salePrice",
        p.cost_price AS "costPrice",
        p.promotional_price AS "promotionalPrice",
        p.min_stock AS "minStock",
        pf.ncm AS "fiscalNcm",
        pf.cest AS "fiscalCest",
        pf.tax_origin AS "fiscalTaxOrigin",
        pf.cfop_domestic AS "fiscalCfopDomestic",
        pf.cfop_interstate AS "fiscalCfopInterstate",
        pf.icms_tax_code AS "fiscalIcmsTaxCode",
        pf.pis_tax_code AS "fiscalPisTaxCode",
        pf.cofins_tax_code AS "fiscalCofinsTaxCode",
        pf.ipi_tax_code AS "fiscalIpiTaxCode",
        pf.subject_to_icms_st AS "fiscalSubjectToIcmsSt",
        pf.icms_rate AS "fiscalIcmsRate",
        pf.icms_st_rate AS "fiscalIcmsStRate",
        pf.icms_st_mva_rate AS "fiscalIcmsStMvaRate",
        pf.fcp_rate AS "fiscalFcpRate",
        pf.pis_rate AS "fiscalPisRate",
        pf.cofins_rate AS "fiscalCofinsRate",
        pf.ipi_rate AS "fiscalIpiRate",
        pf.tax_benefit_code AS "fiscalTaxBenefitCode",
        pf.fiscal_notes AS "fiscalNotes",
        pf.accountant_approved_at AS "fiscalAccountantApprovedAt",
        image.object_key AS "imageUrl",
        p.is_active AS "isActive",
        p.branch_id AS "branchId",
        b.name AS "branchName",
        p.created_at AS "createdAt"
      FROM products p
      LEFT JOIN product_fiscal_profiles pf ON pf.product_id = p.id AND pf.tenant_id = p.tenant_id
      LEFT JOIN branches b ON b.id = p.branch_id AND b.tenant_id = p.tenant_id
      LEFT JOIN LATERAL (
        SELECT ma.object_key
        FROM product_images pi
        JOIN media_assets ma ON ma.id = pi.media_asset_id
        WHERE pi.tenant_id = p.tenant_id AND pi.product_id = p.id
        ORDER BY pi.sort_order ASC, pi.created_at ASC
        LIMIT 1
      ) image ON true
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sort.field} ${sort.direction}, p.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    );

    return {
      data: rows.rows.map((row) => ({
        ...(row as Record<string, unknown>),
        fiscalReadiness: fiscalReadiness(
          this.toFiscalReadinessInput(row as Record<string, unknown>),
        ),
      })),
      pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) },
    };
  }

  async get(context: TenantContext, id: string) {
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT p.*,
        p.sale_price AS "salePrice", p.cost_price AS "costPrice", p.promotional_price AS "promotionalPrice",
        p.min_stock AS "minStock", p.is_active AS "isActive", p.branch_id AS "branchId",
        pf.ncm AS "fiscalNcm", pf.cest AS "fiscalCest", pf.tax_origin AS "fiscalTaxOrigin",
        pf.cfop_domestic AS "fiscalCfopDomestic", pf.cfop_interstate AS "fiscalCfopInterstate",
        pf.icms_tax_code AS "fiscalIcmsTaxCode", pf.pis_tax_code AS "fiscalPisTaxCode",
        pf.cofins_tax_code AS "fiscalCofinsTaxCode", pf.ipi_tax_code AS "fiscalIpiTaxCode",
        pf.subject_to_icms_st AS "fiscalSubjectToIcmsSt", pf.icms_rate AS "fiscalIcmsRate",
        pf.icms_st_rate AS "fiscalIcmsStRate", pf.icms_st_mva_rate AS "fiscalIcmsStMvaRate",
        pf.fcp_rate AS "fiscalFcpRate", pf.pis_rate AS "fiscalPisRate",
        pf.cofins_rate AS "fiscalCofinsRate", pf.ipi_rate AS "fiscalIpiRate",
        pf.tax_benefit_code AS "fiscalTaxBenefitCode", pf.fiscal_notes AS "fiscalNotes",
        pf.accountant_approved_at AS "fiscalAccountantApprovedAt"
       FROM products p
       LEFT JOIN product_fiscal_profiles pf ON pf.product_id=p.id AND pf.tenant_id=p.tenant_id
       WHERE p.tenant_id = $1 AND p.id = $2 AND p.deleted_at IS NULL`,
      [context.tenantId, id],
    );
    const product = ensureFound(result.rows[0], "Produto") as Record<string, unknown>;
    ensureBranchAccess(context, product.branch_id as string | null);
    const images = await this.database.tenantQuery(
      context.tenantId,
      `SELECT pi.id, ma.object_key AS "imageUrl", ma.original_name AS "originalName"
       FROM product_images pi JOIN media_assets ma ON ma.id=pi.media_asset_id
       WHERE pi.tenant_id=$1 AND pi.product_id=$2 ORDER BY pi.sort_order, pi.created_at`,
      [context.tenantId, id],
    );
    return {
      ...product,
      images: images.rows,
      fiscalReadiness: fiscalReadiness(this.toFiscalReadinessInput(product)),
    };
  }

  async create(context: TenantContext, input: ProductCreateInput) {
    ensureBranchAccess(context, input.branchId);
    ensureBranchAccess(context, input.initialStockBranchId);
    const created = await this.database.tenantTransaction(context.tenantId, async (client) => {
      const sku = input.sku?.trim() || (await this.nextSku(client, context.tenantId));
      const result = await client.query(
        `
        INSERT INTO products (
          tenant_id, branch_id, category_id, name, sku, barcode, description, unit,
          cost_price, sale_price, promotional_price, min_stock, is_active
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
        `,
        [
          context.tenantId,
          context.branchId ?? input.branchId ?? null,
          input.categoryId ?? null,
          input.name,
          sku,
          input.barcode ?? null,
          input.description ?? null,
          input.unit,
          input.costPrice,
          input.salePrice,
          input.promotionalPrice ?? null,
          input.minStock,
          input.isActive,
        ],
      );
      const product = result.rows[0] as Record<string, unknown>;
      if (input.fiscal) {
        await this.upsertFiscalProfile(
          client,
          context.tenantId,
          product.id as string,
          input.fiscal,
        );
      }
      const initialStock = Number(input.initialStock ?? 0);
      const stockBranchId = input.initialStockBranchId ?? input.branchId ?? context.branchId;
      if (initialStock > 0 && stockBranchId) {
        await client.query(
          `INSERT INTO stock_balances (tenant_id,branch_id,product_id,quantity)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (tenant_id,branch_id,product_id)
           DO UPDATE SET quantity=stock_balances.quantity + EXCLUDED.quantity, updated_at=now()`,
          [context.tenantId, stockBranchId, product.id, initialStock],
        );
        await client.query(
          `INSERT INTO stock_movements (tenant_id,branch_id,product_id,movement_type,quantity,reason,actor_user_id)
           VALUES ($1,$2,$3,'initial_stock',$4,'Estoque inicial no cadastro',$5)`,
          [context.tenantId, stockBranchId, product.id, initialStock, context.userId ?? null],
        );
      }
      return product;
    });
    if (created && (input.imageData || input.imageUrl))
      await this.setPrimaryImage(context, created.id as string, input.imageData ?? input.imageUrl!);
    if (created)
      await this.database.tenantQuery(
        context.tenantId,
        `INSERT INTO audit_logs (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'product.created','product',$3,$4)`,
        [
          context.tenantId,
          context.userId ?? null,
          created.id,
          JSON.stringify({
            name: input.name,
            sku: created.sku,
            barcode: input.barcode ?? null,
            costPrice: input.costPrice,
            salePrice: input.salePrice,
            minStock: input.minStock,
            initialStock: input.initialStock ?? 0,
            initialStockBranchId:
              input.initialStockBranchId ?? input.branchId ?? context.branchId ?? null,
          }),
        ],
      );
    return this.get(context, created.id as string);
  }

  async update(context: TenantContext, id: string, input: ProductUpdateInput) {
    const existing = (await this.get(context, id)) as Record<string, unknown>;
    ensureBranchAccess(context, input.branchId ?? (existing.branch_id as string | null));

    const updated = await this.database.tenantTransaction(context.tenantId, async (client) => {
      const result = await client.query(
        `
        UPDATE products
        SET
          branch_id = COALESCE($3, branch_id),
          category_id = COALESCE($4, category_id),
          name = COALESCE($5, name),
          sku = COALESCE($6, sku),
          barcode = COALESCE($7, barcode),
          description = COALESCE($8, description),
          unit = COALESCE($9, unit),
          cost_price = COALESCE($10, cost_price),
          sale_price = COALESCE($11, sale_price),
          promotional_price = COALESCE($12, promotional_price),
          min_stock = COALESCE($13, min_stock),
          is_active = COALESCE($14, is_active),
          updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
        RETURNING *
        `,
        [
          context.tenantId,
          id,
          input.branchId ?? null,
          input.categoryId ?? null,
          input.name ?? null,
          input.sku ?? null,
          input.barcode ?? null,
          input.description ?? null,
          input.unit ?? null,
          input.costPrice ?? null,
          input.salePrice ?? null,
          input.promotionalPrice ?? null,
          input.minStock ?? null,
          input.isActive ?? null,
        ],
      );
      const product = ensureFound(result.rows[0], "Produto") as Record<string, unknown>;
      if (input.fiscal) {
        await this.upsertFiscalProfile(client, context.tenantId, id, input.fiscal);
      }
      return product;
    });
    if (input.imageData !== undefined || input.imageUrl !== undefined)
      await this.setPrimaryImage(context, id, input.imageData ?? input.imageUrl!);
    await this.database.tenantQuery(
      context.tenantId,
      `INSERT INTO audit_logs (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'product.updated','product',$3,$4)`,
      [
        context.tenantId,
        context.userId ?? null,
        id,
        JSON.stringify({
          before: {
            name: existing.name,
            sku: existing.sku,
            barcode: existing.barcode,
            costPrice: existing.cost_price,
            salePrice: existing.sale_price,
            minStock: existing.min_stock,
            isActive: existing.is_active,
            fiscal: {
              ncm: existing.fiscalNcm,
              cest: existing.fiscalCest,
              taxOrigin: existing.fiscalTaxOrigin,
              cfopDomestic: existing.fiscalCfopDomestic,
              cfopInterstate: existing.fiscalCfopInterstate,
              icmsTaxCode: existing.fiscalIcmsTaxCode,
              pisTaxCode: existing.fiscalPisTaxCode,
              cofinsTaxCode: existing.fiscalCofinsTaxCode,
              subjectToIcmsSt: existing.fiscalSubjectToIcmsSt,
            },
          },
          after: {
            name: updated.name,
            sku: updated.sku,
            barcode: updated.barcode,
            costPrice: updated.cost_price,
            salePrice: updated.sale_price,
            minStock: updated.min_stock,
            isActive: updated.is_active,
            fiscal: input.fiscal ?? undefined,
          },
        }),
      ],
    );
    return this.get(context, id);
  }

  async fiscalSummary(context: TenantContext) {
    const result = await this.database.tenantQuery<Record<string, unknown>>(
      context.tenantId,
      `SELECT pf.ncm AS "fiscalNcm",pf.cest AS "fiscalCest",pf.tax_origin AS "fiscalTaxOrigin",
        pf.cfop_domestic AS "fiscalCfopDomestic",pf.cfop_interstate AS "fiscalCfopInterstate",
        pf.icms_tax_code AS "fiscalIcmsTaxCode",pf.pis_tax_code AS "fiscalPisTaxCode",
        pf.cofins_tax_code AS "fiscalCofinsTaxCode",pf.subject_to_icms_st AS "fiscalSubjectToIcmsSt",
        pf.accountant_approved_at AS "fiscalAccountantApprovedAt"
       FROM products p LEFT JOIN product_fiscal_profiles pf ON pf.product_id=p.id AND pf.tenant_id=p.tenant_id
       WHERE p.tenant_id=$1 AND p.deleted_at IS NULL AND p.is_active=true
       ${context.branchId ? "AND (p.branch_id=$2 OR p.branch_id IS NULL)" : ""}`,
      context.branchId ? [context.tenantId, context.branchId] : [context.tenantId],
    );
    const summary = { total: result.rows.length, ready: 0, pending: 0, blocked: 0, reviewed: 0 };
    for (const row of result.rows) {
      const readiness = fiscalReadiness(this.toFiscalReadinessInput(row));
      summary[readiness.status] += 1;
      if (readiness.reviewedByAccountant) summary.reviewed += 1;
    }
    return summary;
  }

  private toFiscalReadinessInput(row: Record<string, unknown>): FiscalReadinessInput {
    return {
      ncm: row.fiscalNcm as string | null,
      cest: row.fiscalCest as string | null,
      taxOrigin: row.fiscalTaxOrigin as string | null,
      cfopDomestic: row.fiscalCfopDomestic as string | null,
      cfopInterstate: row.fiscalCfopInterstate as string | null,
      icmsTaxCode: row.fiscalIcmsTaxCode as string | null,
      pisTaxCode: row.fiscalPisTaxCode as string | null,
      cofinsTaxCode: row.fiscalCofinsTaxCode as string | null,
      subjectToIcmsSt: row.fiscalSubjectToIcmsSt as boolean | null,
      accountantApprovedAt: row.fiscalAccountantApprovedAt as string | null,
    };
  }

  private async upsertFiscalProfile(
    executor: { query: (query: string, values?: unknown[]) => Promise<unknown> },
    tenantId: string,
    productId: string,
    fiscal: ProductFiscalInput,
  ) {
    await executor.query(
      `INSERT INTO product_fiscal_profiles(
        tenant_id,product_id,ncm,cest,tax_origin,cfop_domestic,cfop_interstate,icms_tax_code,
        pis_tax_code,cofins_tax_code,ipi_tax_code,subject_to_icms_st,icms_rate,icms_st_rate,
        icms_st_mva_rate,fcp_rate,pis_rate,cofins_rate,ipi_rate,tax_benefit_code,fiscal_notes
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::boolean,false),$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT(product_id) DO UPDATE SET
        ncm=COALESCE(EXCLUDED.ncm,product_fiscal_profiles.ncm),
        cest=COALESCE(EXCLUDED.cest,product_fiscal_profiles.cest),
        tax_origin=COALESCE(EXCLUDED.tax_origin,product_fiscal_profiles.tax_origin),
        cfop_domestic=COALESCE(EXCLUDED.cfop_domestic,product_fiscal_profiles.cfop_domestic),
        cfop_interstate=COALESCE(EXCLUDED.cfop_interstate,product_fiscal_profiles.cfop_interstate),
        icms_tax_code=COALESCE(EXCLUDED.icms_tax_code,product_fiscal_profiles.icms_tax_code),
        pis_tax_code=COALESCE(EXCLUDED.pis_tax_code,product_fiscal_profiles.pis_tax_code),
        cofins_tax_code=COALESCE(EXCLUDED.cofins_tax_code,product_fiscal_profiles.cofins_tax_code),
        ipi_tax_code=COALESCE(EXCLUDED.ipi_tax_code,product_fiscal_profiles.ipi_tax_code),
        subject_to_icms_st=CASE WHEN $12::boolean IS NULL THEN product_fiscal_profiles.subject_to_icms_st ELSE EXCLUDED.subject_to_icms_st END,
        icms_rate=COALESCE(EXCLUDED.icms_rate,product_fiscal_profiles.icms_rate),
        icms_st_rate=COALESCE(EXCLUDED.icms_st_rate,product_fiscal_profiles.icms_st_rate),
        icms_st_mva_rate=COALESCE(EXCLUDED.icms_st_mva_rate,product_fiscal_profiles.icms_st_mva_rate),
        fcp_rate=COALESCE(EXCLUDED.fcp_rate,product_fiscal_profiles.fcp_rate),
        pis_rate=COALESCE(EXCLUDED.pis_rate,product_fiscal_profiles.pis_rate),
        cofins_rate=COALESCE(EXCLUDED.cofins_rate,product_fiscal_profiles.cofins_rate),
        ipi_rate=COALESCE(EXCLUDED.ipi_rate,product_fiscal_profiles.ipi_rate),
        tax_benefit_code=COALESCE(EXCLUDED.tax_benefit_code,product_fiscal_profiles.tax_benefit_code),
        fiscal_notes=COALESCE(EXCLUDED.fiscal_notes,product_fiscal_profiles.fiscal_notes),
        accountant_approved_at=NULL,accountant_approved_by_user_id=NULL,updated_at=now()`,
      [
        tenantId,
        productId,
        fiscal.ncm ?? null,
        fiscal.cest ?? null,
        fiscal.taxOrigin ?? null,
        fiscal.cfopDomestic ?? null,
        fiscal.cfopInterstate ?? null,
        fiscal.icmsTaxCode ?? null,
        fiscal.pisTaxCode ?? null,
        fiscal.cofinsTaxCode ?? null,
        fiscal.ipiTaxCode ?? null,
        fiscal.subjectToIcmsSt ?? null,
        fiscal.icmsRate ?? null,
        fiscal.icmsStRate ?? null,
        fiscal.icmsStMvaRate ?? null,
        fiscal.fcpRate ?? null,
        fiscal.pisRate ?? null,
        fiscal.cofinsRate ?? null,
        fiscal.ipiRate ?? null,
        fiscal.taxBenefitCode ?? null,
        fiscal.fiscalNotes ?? null,
      ],
    );
  }

  private async setPrimaryImage(context: TenantContext, productId: string, source: string) {
    const imageUrl = source.startsWith("data:image/")
      ? await this.persistUpload(context.tenantId, source)
      : source;
    await this.database.tenantTransaction(context.tenantId, async (client) => {
      await client.query("DELETE FROM product_images WHERE tenant_id=$1 AND product_id=$2", [
        context.tenantId,
        productId,
      ]);
      const asset = await client.query<{ id: string }>(
        `INSERT INTO media_assets (tenant_id,storage_provider,bucket,object_key,original_name,mime_type,size_bytes)
         VALUES ($1,'external-url','product-images',$2,'Imagem do produto','image/*',0) RETURNING id`,
        [context.tenantId, imageUrl],
      );
      await client.query(
        "INSERT INTO product_images (tenant_id,product_id,media_asset_id,sort_order) VALUES ($1,$2,$3,0)",
        [context.tenantId, productId, asset.rows[0]!.id],
      );
    });
  }

  async removePrimaryImage(context: TenantContext, productId: string) {
    await this.get(context, productId);
    await this.database.tenantQuery(
      context.tenantId,
      "DELETE FROM product_images WHERE tenant_id=$1 AND product_id=$2",
      [context.tenantId, productId],
    );
    await this.database.tenantQuery(
      context.tenantId,
      "INSERT INTO audit_logs (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'product.image.removed','product',$3,'{}')",
      [context.tenantId, context.userId ?? null, productId],
    );
    return { ok: true };
  }

  async suggestSku(context: TenantContext, prefix?: string) {
    return { sku: await this.nextSku(undefined, context.tenantId, prefix) };
  }

  async lookupBarcode(context: TenantContext, barcodeInput: string) {
    const barcode = barcodeInput.replace(/\D/g, "");
    const local = await this.database.tenantQuery<Record<string, unknown>>(
      context.tenantId,
      `SELECT id,name,sku,barcode,unit,sale_price::text AS "salePrice",cost_price::text AS "costPrice"
       FROM products WHERE tenant_id=$1 AND barcode=$2 AND deleted_at IS NULL LIMIT 1`,
      [context.tenantId, barcode],
    );
    if (local.rows[0]) return { source: "tenant", found: true, product: local.rows[0] };

    const cached = this.catalogCache.get(barcode);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    let result: Record<string, unknown> = { source: "manual", found: false, barcode };
    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
        {
          signal: AbortSignal.timeout(3500),
          headers: { "User-Agent": "OrienCatalog/1.0" },
        },
      );
      if (response.ok) {
        const payload = (await response.json()) as {
          status?: number;
          product?: Record<string, unknown>;
        };
        const product = payload.product;
        const name =
          typeof product?.product_name_pt === "string"
            ? product.product_name_pt
            : product?.product_name;
        if (payload.status === 1 && typeof name === "string" && name.trim()) {
          result = {
            source: "catalog",
            found: true,
            product: {
              name: name.trim(),
              barcode,
              brand: typeof product?.brands === "string" ? product.brands : undefined,
              category:
                typeof product?.categories_tags === "string"
                  ? product.categories_tags.split(",")[0]
                  : undefined,
              imageUrl:
                typeof product?.image_front_small_url === "string"
                  ? product.image_front_small_url
                  : undefined,
              unit: "un",
            },
          };
        }
      }
    } catch {
      // Catálogo externo é opcional: o cadastro manual continua sempre disponível.
    }
    this.catalogCache.set(barcode, { value: result, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return result;
  }

  private async nextSku(
    client:
      | {
          query: (query: string, values?: unknown[]) => Promise<{ rows: Array<{ next?: string }> }>;
        }
      | undefined,
    tenantId: string,
    requestedPrefix?: string,
  ) {
    const prefix =
      (requestedPrefix || "ORI")
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase()
        .slice(0, 12) || "ORI";
    const run = async (executor: {
      query: (query: string, values?: unknown[]) => Promise<{ rows: Array<{ next?: string }> }>;
    }) => {
      await executor.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `product-sku:${tenantId}:${prefix}`,
      ]);
      const sequence = await executor.query(
        `SELECT COALESCE(MAX(NULLIF(regexp_replace(sku, '^.*-', ''), sku)::int), 0) + 1 AS next
         FROM products WHERE tenant_id=$1 AND sku ~ $2`,
        [tenantId, `^${prefix}-[0-9]+$`],
      );
      return `${prefix}-${String(Number(sequence.rows[0]?.next ?? 1)).padStart(6, "0")}`;
    };
    if (client) return run(client);
    return this.database.tenantTransaction(tenantId, async (transaction) => run(transaction));
  }

  private async persistUpload(tenantId: string, dataUrl: string) {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) throw new Error("Arquivo de imagem inválido. Use PNG, JPEG ou WebP.");
    const content = Buffer.from(match[2]!, "base64");
    if (!content.length || content.length > 5 * 1024 * 1024)
      throw new Error("A imagem deve ter no máximo 5 MB.");
    const extension = match[1] === "jpeg" ? "jpg" : match[1]!;
    const folder = resolve(this.config.UPLOAD_DIR, "products", tenantId);
    await mkdir(folder, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(folder, filename), content);
    return `/uploads/products/${tenantId}/${filename}`;
  }

  async bulkUpdateStatus(context: TenantContext, input: BulkStatusUpdateInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const current = await client.query<{
        id: string;
        branch_id: string | null;
        is_active: boolean;
      }>(
        `SELECT id, branch_id, is_active
         FROM products
         WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL
         ORDER BY id FOR UPDATE`,
        [context.tenantId, input.ids],
      );
      if (current.rows.length !== input.ids.length) {
        throw new BadRequestException("Um ou mais produtos não estão disponíveis no seu escopo.");
      }
      current.rows.forEach((row) => ensureBranchAccess(context, row.branch_id));

      const updated = await client.query<{ id: string }>(
        `UPDATE products SET is_active=$3, updated_at=now()
         WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL
         RETURNING id`,
        [context.tenantId, input.ids, input.isActive],
      );
      const batchId = randomUUID();
      for (const row of current.rows) {
        await client.query(
          `INSERT INTO audit_logs (tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
           VALUES ($1,$2,'product.bulk_status_updated','product',$3,$4::jsonb)`,
          [
            context.tenantId,
            context.userId ?? null,
            row.id,
            JSON.stringify({
              batchId,
              previousIsActive: row.is_active,
              isActive: input.isActive,
              reason: input.reason ?? null,
              batchSize: input.ids.length,
            }),
          ],
        );
      }
      return { ok: true, updatedCount: updated.rows.length, ids: input.ids, isActive: input.isActive };
    });
  }

  async remove(context: TenantContext, id: string) {
    await this.get(context, id);
    const result = await this.database.tenantQuery(
      context.tenantId,
      "UPDATE products SET deleted_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id",
      [context.tenantId, id],
    );
    ensureFound(result.rows[0], "Produto");
    await this.database.tenantQuery(
      context.tenantId,
      `INSERT INTO audit_logs (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'product.deleted','product',$3,'{}')`,
      [context.tenantId, context.userId ?? null, id],
    );
    return { ok: true };
  }

  async labels(context: TenantContext, itemsInput = "", size = "50x30", autoprint = true) {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const requested = itemsInput
      .split(",")
      .map((item) => {
        const [id, quantityInput] = item.trim().split(":");
        return { id: id ?? "", quantity: Math.min(100, Math.max(1, Number(quantityInput) || 1)) };
      })
      .filter((item) => uuidPattern.test(item.id))
      .slice(0, 100);
    const ids = requested.map((item) => item.id);
    if (!ids.length) throw new Error("Selecione ao menos um produto.");
    const products = await this.database.tenantQuery<{
      id: string;
      name: string;
      sku: string | null;
      barcode: string | null;
      salePrice: string;
    }>(
      context.tenantId,
      `SELECT id,name,sku,barcode,sale_price::text AS "salePrice" FROM products WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL AND is_active=true ORDER BY name`,
      [context.tenantId, ids],
    );
    const [width, height] = size === "40x25" ? [40, 25] : size === "60x40" ? [60, 40] : [50, 30];
    const labels = products.rows
      .flatMap((product) => {
        const code = product.barcode ?? product.sku;
        const barcode = code
          ? bwipjs.toSVG({
              bcid: "code128",
              text: code,
              scale: 2,
              height: 8,
              includetext: true,
              textxalign: "center",
            })
          : "<div class='missing'>SEM CÓDIGO</div>";
        const label = `<article><strong>${escapeHtml(product.name)}</strong><div class="barcode">${barcode}</div><div class="price">${Number(product.salePrice).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div></article>`;
        const quantity = requested.find((item) => item.id === product.id)?.quantity ?? 1;
        return Array.from({ length: quantity }, () => label);
      })
      .join("");
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas Orien</title><style>@page{size:${width}mm ${height}mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#0b1d3d}article{width:${width}mm;height:${height}mm;padding:2.5mm;display:grid;grid-template-rows:auto 1fr auto;place-items:center;text-align:center;break-after:page;overflow:hidden}strong{font-size:10pt;line-height:1.1;max-width:100%;overflow:hidden}.barcode{width:100%;display:grid;place-items:center}.barcode svg{max-width:100%;max-height:${Math.max(10, height - 14)}mm}.price{font-size:12pt;font-weight:700}.missing{font-size:9pt;border:1px solid #999;padding:2mm}@media screen{body{display:flex;flex-wrap:wrap;gap:8px;padding:16px;background:#eef2f7}article{background:white;box-shadow:0 1px 5px #94a3b8}}</style></head><body>${labels}${autoprint ? "<script>window.onload=()=>window.print()</script>" : ""}</body></html>`;
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!,
  );
}
