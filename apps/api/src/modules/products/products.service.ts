import { Inject, Injectable } from "@nestjs/common";
import type { ProductCreateInput, ProductUpdateInput, ResourceListQuery } from "@sgc/types";
import {
  ensureBranchAccess,
  ensureFound,
  pagination,
  resolveSort,
} from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";
import bwipjs from "bwip-js";

@Injectable()
export class ProductsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

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
        p.is_active AS "isActive",
        p.branch_id AS "branchId",
        b.name AS "branchName",
        p.created_at AS "createdAt"
      FROM products p
      LEFT JOIN branches b ON b.id = p.branch_id AND b.tenant_id = p.tenant_id
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sort.field} ${sort.direction}, p.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    );

    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async get(context: TenantContext, id: string) {
    const result = await this.database.tenantQuery(
      context.tenantId,
      "SELECT * FROM products WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [context.tenantId, id],
    );
    const product = ensureFound(result.rows[0], "Produto");
    ensureBranchAccess(context, product.branch_id as string | null);
    return product;
  }

  async create(context: TenantContext, input: ProductCreateInput) {
    ensureBranchAccess(context, input.branchId);

    const result = await this.database.tenantQuery(
      context.tenantId,
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
        input.sku ?? null,
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

    const created = result.rows[0];
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
            sku: input.sku ?? null,
            barcode: input.barcode ?? null,
            costPrice: input.costPrice,
            salePrice: input.salePrice,
            minStock: input.minStock,
          }),
        ],
      );
    return created;
  }

  async update(context: TenantContext, id: string, input: ProductUpdateInput) {
    const existing = await this.get(context, id);
    ensureBranchAccess(context, input.branchId ?? (existing.branch_id as string | null));

    const result = await this.database.tenantQuery(
      context.tenantId,
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

    const updated = ensureFound(result.rows[0], "Produto");
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
          },
          after: {
            name: updated.name,
            sku: updated.sku,
            barcode: updated.barcode,
            costPrice: updated.cost_price,
            salePrice: updated.sale_price,
            minStock: updated.min_stock,
            isActive: updated.is_active,
          },
        }),
      ],
    );
    return updated;
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
          : "<div class='missing'>SEM CODIGO</div>";
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
