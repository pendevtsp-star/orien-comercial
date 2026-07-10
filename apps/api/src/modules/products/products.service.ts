import { Inject, Injectable } from "@nestjs/common";
import type { ProductCreateInput, ProductUpdateInput, ResourceListQuery } from "@sgc/types";
import { ensureBranchAccess, ensureFound, pagination, resolveSort } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class ProductsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(context: TenantContext, query: ResourceListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["p.tenant_id = $1", "p.deleted_at IS NULL"];
    const sort = resolveSort(
      query,
      { name: "p.name", sku: "p.sku", salePrice: "p.sale_price", minStock: "p.min_stock", createdAt: "p.created_at" },
      "name"
    );

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`(p.branch_id = $${params.length} OR p.branch_id IS NULL)`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`);
    }

    if (typeof query.isActive === "boolean") {
      params.push(query.isActive);
      filters.push(`p.is_active = $${params.length}`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `SELECT count(*)::text AS total FROM products p WHERE ${filters.join(" AND ")}`,
      params
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
      params
    );

    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async get(context: TenantContext, id: string) {
    const result = await this.database.tenantQuery(
      context.tenantId,
      "SELECT * FROM products WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [context.tenantId, id]
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
        input.isActive
      ]
    );

    return result.rows[0];
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
        input.isActive ?? null
      ]
    );

    return ensureFound(result.rows[0], "Produto");
  }

  async remove(context: TenantContext, id: string) {
    await this.get(context, id);
    const result = await this.database.tenantQuery(
      context.tenantId,
      "UPDATE products SET deleted_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id",
      [context.tenantId, id]
    );
    ensureFound(result.rows[0], "Produto");
    return { ok: true };
  }
}
