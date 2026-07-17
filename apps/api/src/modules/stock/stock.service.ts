import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { renderDocumentHtml } from "@sgc/documents";
import type {
  InventoryCountCreateInput,
  PurchaseEntryCreateInput,
  PurchaseXmlCommitInput,
  PurchaseXmlPreviewInput,
  StockListQuery,
  StockMovementListQuery,
  StockAdjustmentInput,
  StockTransferCreateInput
} from "@sgc/types";
import { XMLParser } from "fast-xml-parser";
import type { PoolClient } from "pg";
import { ensureBranchAccess, ensureFound, pagination, resolveSort } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { loadTenantBranding } from "../../shared/tenant-branding";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class StockService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(context: TenantContext, query: StockListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["p.tenant_id = $1", "p.deleted_at IS NULL"];
    const sort = resolveSort(
      query,
      {
        productName: "p.name",
        quantity: "COALESCE(sb.quantity, 0)",
        minStock: "p.min_stock",
        branchName: "b.name"
      },
      "productName"
    );

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`(sb.branch_id = $${params.length} OR p.branch_id = $${params.length})`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
    }

    if (query.stockStatus === "critical") {
      filters.push(`COALESCE(sb.quantity, 0) <= p.min_stock`);
    }

    if (query.stockStatus === "healthy") {
      filters.push(`COALESCE(sb.quantity, 0) > p.min_stock`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `
      SELECT count(*)::text AS total
      FROM products p
      LEFT JOIN stock_balances sb ON sb.tenant_id = p.tenant_id AND sb.product_id = p.id
      WHERE ${filters.join(" AND ")}
      `,
      params
    );

    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT
        p.id AS "productId",
        p.name AS "productName",
        p.sku,
        COALESCE(sb.branch_id, p.branch_id) AS "branchId",
        b.name AS "branchName",
        COALESCE(sb.quantity, 0)::text AS quantity,
        p.min_stock AS "minStock"
      FROM products p
      LEFT JOIN stock_balances sb ON sb.tenant_id = p.tenant_id AND sb.product_id = p.id
      LEFT JOIN branches b ON b.id = COALESCE(sb.branch_id, p.branch_id)
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sort.field} ${sort.direction}, p.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async adjust(context: TenantContext, input: StockAdjustmentInput) {
    ensureBranchAccess(context, input.branchId);

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      await assertBranchAndProduct(client, context.tenantId, input.branchId, input.productId);

      const movementType = input.quantityDelta > 0 ? "manual_in" : "manual_out";

      await client.query(
        `
        INSERT INTO stock_balances (tenant_id, branch_id, product_id, quantity)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, branch_id, product_id)
        DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = now()
        `,
        [context.tenantId, input.branchId, input.productId, input.quantityDelta]
      );

      const balance = await client.query<{ quantity: string }>(
        `
        SELECT quantity::text
        FROM stock_balances
        WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3
        `,
        [context.tenantId, input.branchId, input.productId]
      );

      if (Number(balance.rows[0]?.quantity ?? 0) < 0) {
        throw new BadRequestException("Ajuste deixaria o estoque negativo.");
      }

      await insertMovement(client, {
        tenantId: context.tenantId,
        branchId: input.branchId,
        productId: input.productId,
        movementType,
        quantity: input.quantityDelta,
        reason: input.reason,
        actorUserId: context.userId
      });

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "stock.adjusted",
        entityType: "stock_movement",
        metadata: { branchId: input.branchId, productId: input.productId, quantityDelta: input.quantityDelta }
      });

      return { ok: true, quantity: Number(balance.rows[0]?.quantity ?? 0) };
    });
  }

  async movements(context: TenantContext, query: StockMovementListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["sm.tenant_id = $1"];
    const sort = resolveSort(
      query,
      { createdAt: "sm.created_at", movementType: "sm.movement_type", productName: "p.name", branchName: "b.name" },
      "createdAt"
    );

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`sm.branch_id = $${params.length}`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(p.name ILIKE $${params.length} OR sm.reason ILIKE $${params.length})`);
    }

    if (query.movementType) {
      params.push(query.movementType);
      filters.push(`sm.movement_type = $${params.length}`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `
      SELECT count(*)::text AS total
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      WHERE ${filters.join(" AND ")}
      `,
      params
    );

    params.push(page.pageSize, page.offset);
    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT
        sm.id,
        sm.movement_type AS "movementType",
        sm.quantity,
        sm.reason,
        sm.created_at AS "createdAt",
        p.name AS "productName",
        b.name AS "branchName"
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      JOIN branches b ON b.id = sm.branch_id
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sort.field} ${sort.direction}, sm.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    return { data: result.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async transfer(context: TenantContext, input: StockTransferCreateInput) {
    ensureBranchAccess(context, input.sourceBranchId);
    ensureBranchAccess(context, input.targetBranchId);

    if (input.sourceBranchId === input.targetBranchId) {
      throw new BadRequestException("Escolha filiais diferentes para a transferencia.");
    }

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      await assertBranch(client, context.tenantId, input.sourceBranchId);
      await assertBranch(client, context.tenantId, input.targetBranchId);

      const transfer = await client.query<{ id: string }>(
        `
        INSERT INTO stock_transfers (tenant_id, source_branch_id, target_branch_id, status)
        VALUES ($1, $2, $3, 'completed')
        RETURNING id
        `,
        [context.tenantId, input.sourceBranchId, input.targetBranchId]
      );
      const transferId = transfer.rows[0]!.id;

      for (const item of input.items) {
        await assertBranchAndProduct(client, context.tenantId, input.sourceBranchId, item.productId);
        await updateStockBalance(client, context.tenantId, input.sourceBranchId, item.productId, -item.quantity);
        await updateStockBalance(client, context.tenantId, input.targetBranchId, item.productId, item.quantity);

        await client.query(
          `
          INSERT INTO stock_transfer_items (tenant_id, stock_transfer_id, product_id, quantity)
          VALUES ($1, $2, $3, $4)
          `,
          [context.tenantId, transferId, item.productId, item.quantity]
        );

        await insertMovement(client, {
          tenantId: context.tenantId,
          branchId: input.sourceBranchId,
          productId: item.productId,
          movementType: "transfer_out",
          quantity: -item.quantity,
          reason: `Transferencia ${transferId}`,
          actorUserId: context.userId
        });
        await insertMovement(client, {
          tenantId: context.tenantId,
          branchId: input.targetBranchId,
          productId: item.productId,
          movementType: "transfer_in",
          quantity: item.quantity,
          reason: `Transferencia ${transferId}`,
          actorUserId: context.userId
        });
      }

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "stock.transfer.created",
        entityType: "stock_transfer",
        entityId: transferId,
        metadata: {
          sourceBranchId: input.sourceBranchId,
          targetBranchId: input.targetBranchId,
          itemCount: input.items.length
        }
      });

      return { id: transferId, ok: true };
    });
  }

  async inventory(context: TenantContext, input: InventoryCountCreateInput) {
    ensureBranchAccess(context, input.branchId);

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      await assertBranch(client, context.tenantId, input.branchId);
      const inventory = await client.query<{ id: string }>(
        `
        INSERT INTO inventory_counts (tenant_id, branch_id, status)
        VALUES ($1, $2, 'completed')
        RETURNING id
        `,
        [context.tenantId, input.branchId]
      );
      const inventoryId = inventory.rows[0]!.id;

      for (const item of input.items) {
        await assertBranchAndProduct(client, context.tenantId, input.branchId, item.productId);
        const systemBalance = await ensureBalance(client, context.tenantId, input.branchId, item.productId);
        const difference = item.countedQuantity - Number(systemBalance);

        await client.query(
          `
          INSERT INTO inventory_count_items (tenant_id, inventory_count_id, product_id, counted_quantity, system_quantity, difference_quantity)
          VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [context.tenantId, inventoryId, item.productId, item.countedQuantity, Number(systemBalance), difference]
        );

        if (difference !== 0) {
          await updateStockBalance(client, context.tenantId, input.branchId, item.productId, difference, true);
          await insertMovement(client, {
            tenantId: context.tenantId,
            branchId: input.branchId,
            productId: item.productId,
            movementType: "inventory_adjustment",
            quantity: difference,
            reason: `Inventario ${inventoryId}${input.notes ? ` - ${input.notes}` : ""}`,
            actorUserId: context.userId
          });
        }
      }

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "stock.inventory.completed",
        entityType: "inventory_count",
        entityId: inventoryId,
        metadata: { branchId: input.branchId, itemCount: input.items.length, notes: input.notes ?? null }
      });

      return { id: inventoryId, ok: true };
    });
  }

  async purchaseEntry(context: TenantContext, input: PurchaseEntryCreateInput) {
    ensureBranchAccess(context, input.branchId);

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      return this.createPurchaseEntry(client, context, input);
    });
  }

  async previewPurchaseXml(context: TenantContext, input: PurchaseXmlPreviewInput) {
    ensureBranchAccess(context, input.branchId);
    const parsed = parseNfeXml(input.xml);
    if (!parsed.items.length) throw new BadRequestException("Não encontramos itens de produto no XML informado.");
    const barcodes = parsed.items.map((item) => item.barcode).filter((value): value is string => Boolean(value));
    const products = barcodes.length
      ? await this.database.tenantQuery<{ id: string; name: string; sku: string | null; barcode: string | null; costPrice: string }>(
          context.tenantId,
          "SELECT id,name,sku,barcode,cost_price::text AS \"costPrice\" FROM products WHERE tenant_id=$1 AND barcode=ANY($2::text[]) AND deleted_at IS NULL",
          [context.tenantId, barcodes],
        )
      : { rows: [] };
    const supplier = parsed.supplier.document
      ? await this.database.tenantQuery<{ id: string; name: string }>(
          context.tenantId,
          "SELECT id,name FROM suppliers WHERE tenant_id=$1 AND document=$2 AND deleted_at IS NULL LIMIT 1",
          [context.tenantId, parsed.supplier.document],
        )
      : { rows: [] as Array<{ id: string; name: string }> };
    const byBarcode = new Map(products.rows.filter((item) => item.barcode).map((item) => [item.barcode!, item]));
    return {
      document: parsed.document,
      supplier: { ...parsed.supplier, match: supplier.rows[0] ?? null },
      items: parsed.items.map((item, index) => {
        const match = item.barcode ? byBarcode.get(item.barcode) : undefined;
        const previousCost = Number(match?.costPrice ?? 0);
        const costDifferencePercent = previousCost > 0 ? ((item.unitCost - previousCost) / previousCost) * 100 : null;
        const divergences = [
          ...(!match ? ["Produto não cadastrado"] : []),
          ...(costDifferencePercent !== null && Math.abs(costDifferencePercent) >= 20
            ? [`Custo ${costDifferencePercent > 0 ? "acima" : "abaixo"} em ${Math.abs(costDifferencePercent).toFixed(0)}%`] : []),
          ...(item.quantity >= 1000 ? ["Quantidade alta: confira antes de receber"] : []),
        ];
        return {
          ...item,
          sourceIndex: index,
          match: match ? { productId: match.id, name: match.name, sku: match.sku, costPrice: previousCost, confidence: "barcode" } : null,
          suggestedAction: match ? "link" : "create",
          divergences,
        };
      }),
    };
  }

  async commitPurchaseXml(context: TenantContext, input: PurchaseXmlCommitInput) {
    ensureBranchAccess(context, input.branchId);
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      if (input.documentKey) {
        const duplicate = await client.query("SELECT id FROM purchase_entries WHERE tenant_id=$1 AND document_key=$2", [context.tenantId, input.documentKey]);
        if (duplicate.rows[0]) throw new BadRequestException("Esta nota já foi recebida nesta empresa. Confira o histórico de compras.");
      }
      const items: PurchaseEntryCreateInput["items"] = [];
      for (const item of input.items) {
        if (item.action === "ignore") continue;
        let productId = item.productId;
        if (item.action === "create") {
          const skuBase = item.sku?.trim() || `NF-${Date.now()}-${item.sourceIndex + 1}`;
          const created = await client.query<{ id: string }>(
            `INSERT INTO products (tenant_id,branch_id,name,sku,barcode,unit,cost_price,sale_price,min_stock,is_active)
             VALUES ($1,$2,$3,$4,$5,'un',$6,$7,0,true) RETURNING id`,
            [context.tenantId, input.branchId, item.name, skuBase, item.barcode ?? null, item.unitCost, item.unitCost],
          );
          productId = created.rows[0]!.id;
        }
        if (!productId) throw new BadRequestException(`Defina o produto para o item ${item.sourceIndex + 1}.`);
        items.push({ productId, quantity: item.quantity, unitCost: item.unitCost });
      }
      if (!items.length) throw new BadRequestException("Selecione ao menos um item para receber no estoque.");
      return this.createPurchaseEntry(client, context, { ...input, items }, { documentKey: input.documentKey, sourceType: "nfe_xml", sourcePayload: { importedItemCount: input.items.length } });
    });
  }

  private async createPurchaseEntry(
    client: PoolClient,
    context: TenantContext,
    input: PurchaseEntryCreateInput,
    source: { documentKey?: string; sourceType?: string; sourcePayload?: Record<string, unknown> } = {},
  ) {
      await assertBranch(client, context.tenantId, input.branchId);
      let supplierName = input.supplierName ?? null;
      if (input.supplierId) {
        const supplier = await client.query<{ name: string }>(
          "SELECT name FROM suppliers WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL AND is_active = true",
          [context.tenantId, input.supplierId]
        );
        supplierName = ensureFound(supplier.rows[0], "Fornecedor").name;
      }
      if (input.documentNumber) {
        const duplicate = await client.query(
          `SELECT id FROM purchase_entries
           WHERE tenant_id=$1 AND document_number=$2 AND COALESCE(supplier_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE($3::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
           LIMIT 1`,
          [context.tenantId, input.documentNumber, input.supplierId ?? null],
        );
        if (duplicate.rows[0]) throw new BadRequestException("Já existe uma entrada com este fornecedor e número de documento.");
      }
      const totalAmount = input.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
      const purchase = await client.query<{ id: string }>(
        `
        INSERT INTO purchase_entries (tenant_id, branch_id, supplier_id, supplier_name, document_number, total_amount, notes, document_key, source_type, source_payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        RETURNING id
        `,
        [context.tenantId, input.branchId, input.supplierId ?? null, supplierName, input.documentNumber ?? null, totalAmount, input.notes ?? null, source.documentKey ?? null, source.sourceType ?? "manual", JSON.stringify(source.sourcePayload ?? {})]
      );
      const purchaseId = purchase.rows[0]!.id;

      for (const item of input.items) {
        await assertBranchAndProduct(client, context.tenantId, input.branchId, item.productId);
        await client.query(
          `
          INSERT INTO purchase_entry_items (tenant_id, purchase_entry_id, product_id, quantity, unit_cost)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [context.tenantId, purchaseId, item.productId, item.quantity, item.unitCost]
        );
        await client.query(
          "UPDATE products SET cost_price=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [context.tenantId, item.productId, item.unitCost],
        );
        await updateStockBalance(client, context.tenantId, input.branchId, item.productId, item.quantity);
        await insertMovement(client, {
          tenantId: context.tenantId,
          branchId: input.branchId,
          productId: item.productId,
          movementType: "purchase_in",
          quantity: item.quantity,
          reason: `Entrada de compra ${input.documentNumber ?? purchaseId}`,
          actorUserId: context.userId
        });
      }

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "stock.purchase.created",
        entityType: "purchase_entry",
        entityId: purchaseId,
        metadata: { branchId: input.branchId, supplierId: input.supplierId ?? null, supplierName, documentNumber: input.documentNumber ?? null, documentKey: source.documentKey ?? null, sourceType: source.sourceType ?? "manual", totalAmount }
      });

      return { id: purchaseId, totalAmount };
  }

  async reports(context: TenantContext) {
    const params: unknown[] = [context.tenantId];
    const branchFilter = context.branchId ? "AND sb.branch_id = $2" : "";
    if (context.branchId) {
      params.push(context.branchId);
    }

    const [lowStock, slowMoving] = await Promise.all([
      this.database.tenantQuery(
        context.tenantId,
        `
        SELECT
          p.id AS "productId",
          p.name AS "productName",
          b.name AS "branchName",
          sb.quantity,
          p.min_stock AS "minStock"
        FROM stock_balances sb
        JOIN products p ON p.id = sb.product_id
        JOIN branches b ON b.id = sb.branch_id
        WHERE sb.tenant_id = $1
          ${branchFilter}
          AND sb.quantity <= p.min_stock
        ORDER BY sb.quantity ASC, p.name ASC
        `,
        params
      ),
      this.database.tenantQuery(
        context.tenantId,
        `
        SELECT
          p.id AS "productId",
          p.name AS "productName",
          b.name AS "branchName",
          sb.quantity,
          MAX(sm.created_at) AS "lastMovementAt"
        FROM stock_balances sb
        JOIN products p ON p.id = sb.product_id
        JOIN branches b ON b.id = sb.branch_id
        LEFT JOIN stock_movements sm
          ON sm.tenant_id = sb.tenant_id
         AND sm.branch_id = sb.branch_id
         AND sm.product_id = sb.product_id
        WHERE sb.tenant_id = $1
          ${branchFilter}
        GROUP BY p.id, b.id, sb.quantity
        HAVING COALESCE(MAX(sm.created_at), now() - interval '10 years') < now() - interval '30 days'
        ORDER BY "lastMovementAt" ASC NULLS FIRST, p.name ASC
        `,
        params
      )
    ]);

    return {
      lowStock: lowStock.rows,
      slowMoving: slowMoving.rows
    };
  }

  async reportsDocument(context: TenantContext, kind: "low-stock" | "slow-moving") {
    const branding = await loadTenantBranding(this.database, context.tenantId);
    const reports = await this.reports(context);
    const rows = kind === "low-stock" ? reports.lowStock : reports.slowMoving;

    return renderDocumentHtml({
      title: kind === "low-stock" ? "Relatorio de estoque baixo" : "Relatorio de estoque parado",
      subtitle: "Saida padronizada para acompanhamento operacional por loja.",
      badge: "Estoque",
      branding,
      meta: [
        { label: "Tenant", value: branding.companyName },
        { label: "Tipo", value: kind === "low-stock" ? "Reposicao" : "Baixa movimentacao" },
        { label: "Itens", value: String(rows.length) },
        { label: "Emitido em", value: new Date().toLocaleString("pt-BR") }
      ],
      sections: [
        {
          title: "Itens monitorados",
          metrics: [
            { label: "Total de itens", value: String(rows.length) },
            { label: "Escopo", value: context.branchId ? "Filial atual" : "Tenant completo" },
            { label: "Acao recomendada", value: kind === "low-stock" ? "Reposicao" : "Revisao comercial" }
          ],
          table: {
            columns:
              kind === "low-stock"
                ? [
                    { key: "productName", label: "Produto" },
                    { key: "branchName", label: "Loja" },
                    { key: "quantity", label: "Saldo" },
                    { key: "minStock", label: "Minimo" }
                  ]
                : [
                    { key: "productName", label: "Produto" },
                    { key: "branchName", label: "Loja" },
                    { key: "quantity", label: "Saldo" },
                    { key: "lastMovementAt", label: "Ultima movimentacao" }
                  ],
            rows: rows.map((row) => ({
              ...row,
              quantity: Number(row.quantity).toLocaleString("pt-BR"),
              minStock: "minStock" in row ? Number(row.minStock ?? 0).toLocaleString("pt-BR") : undefined,
              lastMovementAt: "lastMovementAt" in row && row.lastMovementAt ? new Date(String(row.lastMovementAt)).toLocaleDateString("pt-BR") : "-"
            }))
          }
        }
      ]
    });
  }
}

function parseNfeXml(xml: string) {
  let data: Record<string, unknown>;
  try {
    data = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", trimValues: true }).parse(xml) as Record<string, unknown>;
  } catch {
    throw new BadRequestException("O XML da nota não pôde ser lido.");
  }
  const nfe = objectAt(data, "nfeProc", "NFe", "infNFe") ?? objectAt(data, "NFe", "infNFe");
  if (!nfe) throw new BadRequestException("O arquivo não parece ser um XML de NF-e válido.");
  const ide = objectAt(nfe, "ide") ?? {};
  const emitter = objectAt(nfe, "emit") ?? {};
  const rawDetails = nfe.det;
  const details = Array.isArray(rawDetails) ? rawDetails : rawDetails ? [rawDetails] : [];
  const documentKey = typeof nfe.Id === "string" ? nfe.Id.replace(/^NFe/, "") : undefined;
  return {
    document: {
      key: documentKey && /^\d{44}$/.test(documentKey) ? documentKey : undefined,
      number: stringValue(ide.nNF) || "Sem número",
      issuedAt: stringValue(ide.dhEmi) || stringValue(ide.dEmi) || undefined,
    },
    supplier: {
      name: stringValue(emitter.xNome) || "Fornecedor do XML",
      document: stringValue(emitter.CNPJ) || stringValue(emitter.CPF) || undefined,
    },
    items: details.map((detail) => {
      const product = objectAt(detail, "prod") ?? {};
      const barcodeValue = stringValue(product.cEAN);
      const barcode = barcodeValue && !/^SEM\s*GTIN$/i.test(barcodeValue) ? barcodeValue.replace(/\D/g, "") : undefined;
      return {
        name: stringValue(product.xProd) || "Produto sem descrição",
        supplierCode: stringValue(product.cProd),
        barcode,
        quantity: numericValue(product.qCom),
        unitCost: numericValue(product.vUnCom),
        unit: stringValue(product.uCom) || "un",
      };
    }).filter((item) => item.quantity > 0),
  };
}

function objectAt(value: unknown, ...path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current && typeof current === "object" && !Array.isArray(current) ? current as Record<string, unknown> : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function numericValue(value: unknown) {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "0";
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

async function assertBranchAndProduct(client: PoolClient, tenantId: string, branchId: string, productId: string) {
  const branch = await client.query("SELECT id FROM branches WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL", [
    tenantId,
    branchId
  ]);
  ensureFound(branch.rows[0], "Filial");

  const product = await client.query<{ branch_id: string | null }>(
    "SELECT branch_id FROM products WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
    [tenantId, productId]
  );
  const row = ensureFound(product.rows[0], "Produto");

  if (row.branch_id && row.branch_id !== branchId) {
    throw new ForbiddenException("Produto pertence a outra filial.");
  }
}

async function assertBranch(client: PoolClient, tenantId: string, branchId: string) {
  const branch = await client.query("SELECT id FROM branches WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL", [
    tenantId,
    branchId
  ]);
  ensureFound(branch.rows[0], "Filial");
}

async function ensureBalance(client: PoolClient, tenantId: string, branchId: string, productId: string) {
  await client.query(
    `
    INSERT INTO stock_balances (tenant_id, branch_id, product_id, quantity)
    VALUES ($1, $2, $3, 0)
    ON CONFLICT (tenant_id, branch_id, product_id) DO NOTHING
    `,
    [tenantId, branchId, productId]
  );

  const result = await client.query<{ quantity: string }>(
    "SELECT quantity::text FROM stock_balances WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3",
    [tenantId, branchId, productId]
  );

  return result.rows[0]?.quantity ?? "0";
}

async function updateStockBalance(
  client: PoolClient,
  tenantId: string,
  branchId: string,
  productId: string,
  quantityDelta: number,
  allowNegative = false
) {
  await client.query(
    `
    INSERT INTO stock_balances (tenant_id, branch_id, product_id, quantity)
    VALUES ($1, $2, $3, 0)
    ON CONFLICT (tenant_id, branch_id, product_id) DO NOTHING
    `,
    [tenantId, branchId, productId]
  );

  const result = await client.query<{ quantity: string }>(
    `
    UPDATE stock_balances
    SET quantity = quantity + $4, updated_at = now()
    WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3
    RETURNING quantity::text
    `,
    [tenantId, branchId, productId, quantityDelta]
  );
  const quantity = Number(result.rows[0]?.quantity ?? 0);
  if (!allowNegative && quantity < 0) {
    throw new BadRequestException("Operacao deixaria o estoque negativo.");
  }
  return quantity;
}

async function insertMovement(
  client: PoolClient,
  input: {
    tenantId: string;
    branchId: string;
    productId: string;
    movementType: string;
    quantity: number;
    reason: string;
    actorUserId?: string | null;
  }
) {
  await client.query(
    `
    INSERT INTO stock_movements (tenant_id, branch_id, product_id, movement_type, quantity, reason, actor_user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [input.tenantId, input.branchId, input.productId, input.movementType, input.quantity, input.reason, input.actorUserId ?? null]
  );
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
