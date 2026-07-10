import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { PurchaseOrderCreateInput, PurchaseOrderReceiveInput, ResourceListQuery } from "@sgc/types";
import type { PoolClient } from "pg";
import { ensureBranchAccess, ensureFound, pagination, resolveSort } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class PurchasesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(context: TenantContext, query: ResourceListQuery) {
    const page = pagination(query); const params: unknown[] = [context.tenantId]; const filters = ["po.tenant_id = $1", "po.deleted_at IS NULL"];
    if (context.branchId) { params.push(context.branchId); filters.push(`po.branch_id = $${params.length}`); }
    if (query.search) { params.push(`%${query.search}%`); filters.push(`(s.name ILIKE $${params.length} OR po.id::text ILIKE $${params.length} OR po.status ILIKE $${params.length})`); }
    const sort = resolveSort(query, { createdAt: "po.created_at", name: "s.name" }, "createdAt");
    const count = await this.database.tenantQuery<{ total: string }>(context.tenantId, `SELECT count(*)::text total FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE ${filters.join(" AND ")}`, params);
    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(context.tenantId, `SELECT po.id, po.branch_id AS "branchId", b.name AS "branchName", po.supplier_id AS "supplierId", s.name AS "supplierName", po.status, po.expected_at AS "expectedAt", po.total_amount::text AS "totalAmount", po.notes, po.created_at AS "createdAt", COALESCE(sum(poi.quantity),0)::text AS "orderedQuantity", COALESCE(sum(poi.received_quantity),0)::text AS "receivedQuantity" FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id JOIN branches b ON b.id = po.branch_id LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id WHERE ${filters.join(" AND ")} GROUP BY po.id,b.name,s.name ORDER BY ${sort.field} ${sort.direction} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async create(context: TenantContext, input: PurchaseOrderCreateInput) {
    ensureBranchAccess(context, input.branchId);
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      await assertReferences(client, context.tenantId, input.branchId, input.supplierId, input.items.map((item) => item.productId));
      const total = input.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
      const order = await client.query<{ id: string }>(`INSERT INTO purchase_orders (tenant_id, branch_id, supplier_id, status, expected_at, notes, total_amount, created_by_user_id) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7) RETURNING id`, [context.tenantId, input.branchId, input.supplierId, input.expectedAt ?? null, input.notes ?? null, total, context.userId ?? null]);
      for (const item of input.items) await client.query(`INSERT INTO purchase_order_items (tenant_id, purchase_order_id, product_id, quantity, unit_cost) VALUES ($1,$2,$3,$4,$5)`, [context.tenantId, order.rows[0]!.id, item.productId, item.quantity, item.unitCost]);
      await audit(client, context, "purchase_order.created", order.rows[0]!.id, { branchId: input.branchId, supplierId: input.supplierId, total, itemCount: input.items.length });
      return { id: order.rows[0]!.id, totalAmount: total };
    });
  }

  async approve(context: TenantContext, id: string) {
    const result = await this.database.tenantTransaction(context.tenantId, async (client) => {
      const order = await client.query<{ branch_id: string; status: string }>("SELECT branch_id,status FROM purchase_orders WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE", [context.tenantId, id]);
      const current = ensureFound(order.rows[0], "Pedido"); ensureBranchAccess(context, current.branch_id);
      if (current.status !== "draft") throw new BadRequestException("Apenas pedidos em rascunho podem ser aprovados.");
      const updated = await client.query("UPDATE purchase_orders SET status = 'approved', updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *", [context.tenantId, id]);
      await audit(client, context, "purchase_order.approved", id, {}); return updated.rows[0];
    }); return result;
  }

  async receive(context: TenantContext, id: string, input: PurchaseOrderReceiveInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const orderResult = await client.query<{ branch_id: string; supplier_id: string; status: string; supplier_name: string }>(`SELECT po.branch_id,po.supplier_id,po.status,s.name supplier_name FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id WHERE po.tenant_id=$1 AND po.id=$2 AND po.deleted_at IS NULL FOR UPDATE`, [context.tenantId,id]);
      const order = ensureFound(orderResult.rows[0], "Pedido"); ensureBranchAccess(context, order.branch_id);
      if (!["approved","partial"].includes(order.status)) throw new BadRequestException("Pedido precisa estar aprovado para recebimento.");
      const ordered = await client.query<{ product_id: string; quantity: string; received_quantity: string; unit_cost: string }>("SELECT product_id,quantity::text,received_quantity::text,unit_cost::text FROM purchase_order_items WHERE tenant_id=$1 AND purchase_order_id=$2", [context.tenantId,id]);
      const byProduct = new Map(ordered.rows.map((item) => [item.product_id,item])); let total = 0;
      for (const item of input.items) { const line = byProduct.get(item.productId); if (!line || Number(line.received_quantity)+item.quantity > Number(line.quantity)) throw new BadRequestException("Quantidade recebida supera o saldo do pedido."); total += item.quantity*Number(line.unit_cost); }
      const entry = await client.query<{ id: string }>(`INSERT INTO purchase_entries (tenant_id,branch_id,supplier_id,supplier_name,document_number,purchase_order_id,total_amount,notes,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'received') RETURNING id`, [context.tenantId,order.branch_id,order.supplier_id,order.supplier_name,input.documentNumber??null,id,total,input.notes??null]);
      for (const item of input.items) { const line=byProduct.get(item.productId)!; await client.query("UPDATE purchase_order_items SET received_quantity=received_quantity+$3 WHERE tenant_id=$1 AND purchase_order_id=$2 AND product_id=$4", [context.tenantId,id,item.quantity,item.productId]); await client.query("INSERT INTO purchase_entry_items (tenant_id,purchase_entry_id,product_id,quantity,unit_cost) VALUES ($1,$2,$3,$4,$5)",[context.tenantId,entry.rows[0]!.id,item.productId,item.quantity,Number(line.unit_cost)]); await client.query(`INSERT INTO stock_balances (tenant_id,branch_id,product_id,quantity) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,branch_id,product_id) DO UPDATE SET quantity=stock_balances.quantity+EXCLUDED.quantity,updated_at=now()`,[context.tenantId,order.branch_id,item.productId,item.quantity]); await client.query(`INSERT INTO stock_movements (tenant_id,branch_id,product_id,movement_type,quantity,reason,actor_user_id) VALUES ($1,$2,$3,'purchase_in',$4,$5,$6)`,[context.tenantId,order.branch_id,item.productId,item.quantity,`Recebimento do pedido ${id}`,context.userId??null]); }
      const pending = await client.query<{ total: string }>("SELECT COALESCE(sum(quantity-received_quantity),0)::text total FROM purchase_order_items WHERE tenant_id=$1 AND purchase_order_id=$2",[context.tenantId,id]); const status=Number(pending.rows[0]?.total??0)>0?"partial":"received"; await client.query("UPDATE purchase_orders SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",[context.tenantId,id,status]); await audit(client,context,"purchase_order.received",id,{entryId:entry.rows[0]!.id,total,status,documentNumber:input.documentNumber??null}); return { id: entry.rows[0]!.id,status,totalAmount:total };
    });
  }
}

async function assertReferences(client: PoolClient, tenantId: string, branchId: string, supplierId: string, productIds: string[]) { const [branch,supplier,products]=await Promise.all([client.query("SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",[tenantId,branchId]),client.query("SELECT id FROM suppliers WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL AND is_active=true",[tenantId,supplierId]),client.query("SELECT id FROM products WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL",[tenantId,productIds])]); ensureFound(branch.rows[0],"Loja"); ensureFound(supplier.rows[0],"Fornecedor"); if(products.rowCount!==new Set(productIds).size) throw new BadRequestException("Produto invalido no pedido."); }
async function audit(client: PoolClient,context:TenantContext,action:string,entityId:string,metadata:Record<string,unknown>){await client.query("INSERT INTO audit_logs (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,'purchase_order',$4,$5)",[context.tenantId,context.userId??null,action,entityId,JSON.stringify(metadata)]);}
