import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { renderDocumentHtml } from "@sgc/documents";
import type { PoolClient } from "pg";
import { ensureBranchAccess, ensureFound } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { loadTenantBranding } from "../../shared/tenant-branding";
import { DatabaseService } from "../database/database.service";

type ReturnInput = {
  saleId: string;
  reason: string;
  refundMethod: "original" | "cash" | "customer_credit";
  items: Array<{ saleItemId: string; quantity: number }>;
};
type PriceInput = {
  name: string;
  branchId?: string;
  customerGroup?: string;
  startsAt?: string;
  endsAt?: string;
  productId: string;
  minQuantity: number;
  fixedPrice?: number;
  discountPercent?: number;
};
type QuoteInput = {
  branchId: string;
  customerId?: string;
  validUntil: string;
  notes?: string;
  reserveStock: boolean;
  items: Array<{ productId: string; quantity: number; unitPrice: number; discountAmount: number }>;
};
type CreditInput = {
  customerId: string;
  creditLimit: number;
  blocked: boolean;
  blockReason?: string;
};
type RenegotiateInput = {
  customerId: string;
  originalAmount: number;
  negotiatedAmount: number;
  installments: number;
  firstDueDate: string;
};

interface QuoteDocumentRow {
  id: string;
  branch_id: string;
  notes: string | null;
  status: string;
  branch_name: string;
  customer_name: string | null;
  valid_until: Date | string;
  total_amount: string | number;
}

interface QuoteDocumentItem {
  description: string;
  quantity: string | number;
  unit_price: string | number;
  discount_amount: string | number;
}

interface AbcRow {
  id: string;
  name: string;
  sku: string | null;
  quantity: string;
  revenue: string;
  margin: string;
  stock: string;
  class: "A" | "B" | "C";
  suggestion: "Ruptura" | "Parado" | "Comprar" | "Saudavel";
}

@Injectable()
export class OperationsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async overview(c: TenantContext) {
    const r = await this.db.tenantQuery(
      c.tenantId,
      `SELECT
    (SELECT count(*)::int FROM sale_returns WHERE tenant_id=$1) returns,
    (SELECT count(*)::int FROM quotes WHERE tenant_id=$1 AND status IN ('draft','sent')) quotes,
    (SELECT count(*)::int FROM customer_credit_accounts WHERE tenant_id=$1 AND blocked=true) "blockedCredits",
    (SELECT count(*)::int FROM internal_notifications WHERE tenant_id=$1 AND read_at IS NULL AND (user_id IS NULL OR user_id=$2)) notifications`,
      [c.tenantId, c.userId ?? null],
    );
    return r.rows[0];
  }
  async returns(c: TenantContext) {
    const r = await this.db.tenantQuery(
      c.tenantId,
      `SELECT r.id,r.sale_id "saleId",r.status,r.reason,r.refund_method "refundMethod",r.total_amount "totalAmount",r.created_at "createdAt",b.name "branchName",cu.name "customerName" FROM sale_returns r JOIN branches b ON b.id=r.branch_id LEFT JOIN customers cu ON cu.id=r.customer_id WHERE r.tenant_id=$1 ${c.branchId ? "AND r.branch_id=$2" : ""} ORDER BY r.created_at DESC LIMIT 100`,
      c.branchId ? [c.tenantId, c.branchId] : [c.tenantId],
    );
    return { data: r.rows };
  }
  async saleItems(c: TenantContext, id: string) {
    const r = await this.db.tenantQuery(
      c.tenantId,
      `SELECT si.id,si.product_id "productId",si.description,si.quantity,si.unit_price "unitPrice",COALESCE((SELECT sum(ri.quantity) FROM sale_return_items ri JOIN sale_returns sr ON sr.id=ri.return_id WHERE ri.sale_item_id=si.id AND sr.status='completed'),0) "returnedQuantity" FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE si.tenant_id=$1 AND si.sale_id=$2 ${c.branchId ? "AND s.branch_id=$3" : ""}`,
      c.branchId ? [c.tenantId, id, c.branchId] : [c.tenantId, id],
    );
    return { data: r.rows };
  }
  async createReturn(c: TenantContext, input: ReturnInput) {
    return this.db.tenantTransaction(c.tenantId, async (client) => {
      const saleQ = await client.query<{
        branch_id: string;
        customer_id: string | null;
        cash_register_session_id: string | null;
      }>(
        "SELECT branch_id,customer_id,cash_register_session_id FROM sales WHERE tenant_id=$1 AND id=$2 AND status='sold' FOR UPDATE",
        [c.tenantId, input.saleId],
      );
      const sale = ensureFound(saleQ.rows[0], "Venda");
      ensureBranchAccess(c, sale.branch_id);
      let total = 0;
      const rows: Array<{ id: string; product_id: string; quantity: string; unit_price: string }> =
        [];
      for (const requested of input.items) {
        const q = await client.query<{
          id: string;
          product_id: string;
          quantity: string;
          unit_price: string;
        }>(
          `SELECT si.id,si.product_id,si.quantity::text,si.unit_price::text FROM sale_items si WHERE si.tenant_id=$1 AND si.sale_id=$2 AND si.id=$3`,
          [c.tenantId, input.saleId, requested.saleItemId],
        );
        const item = ensureFound(q.rows[0], "Item da venda");
        const prior = await client.query<{ quantity: string }>(
          `SELECT COALESCE(sum(ri.quantity),0)::text quantity FROM sale_return_items ri JOIN sale_returns r ON r.id=ri.return_id WHERE ri.tenant_id=$1 AND ri.sale_item_id=$2 AND r.status='completed'`,
          [c.tenantId, item.id],
        );
        if (requested.quantity + Number(prior.rows[0]?.quantity ?? 0) > Number(item.quantity))
          throw new BadRequestException("Quantidade devolvida supera a quantidade vendida.");
        total += requested.quantity * Number(item.unit_price);
        rows.push({ ...item, quantity: String(requested.quantity) });
      }
      if (input.refundMethod === "customer_credit" && !sale.customer_id)
        throw new BadRequestException("Credito exige cliente identificado.");
      const created = await client.query<{ id: string }>(
        `INSERT INTO sale_returns(tenant_id,branch_id,sale_id,customer_id,reason,refund_method,total_amount,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          c.tenantId,
          sale.branch_id,
          input.saleId,
          sale.customer_id,
          input.reason,
          input.refundMethod,
          total,
          c.userId ?? null,
        ],
      );
      for (const item of rows) {
        await client.query(
          `INSERT INTO sale_return_items(tenant_id,return_id,sale_item_id,product_id,quantity,unit_amount) VALUES($1,$2,$3,$4,$5,$6)`,
          [
            c.tenantId,
            created.rows[0]!.id,
            item.id,
            item.product_id,
            Number(item.quantity),
            Number(item.unit_price),
          ],
        );
        await client.query(
          `INSERT INTO stock_balances(tenant_id,branch_id,product_id,quantity)VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,branch_id,product_id)DO UPDATE SET quantity=stock_balances.quantity+EXCLUDED.quantity,updated_at=now()`,
          [c.tenantId, sale.branch_id, item.product_id, Number(item.quantity)],
        );
        await client.query(
          `INSERT INTO stock_movements(tenant_id,branch_id,product_id,movement_type,quantity,reason,actor_user_id)VALUES($1,$2,$3,'return_in',$4,$5,$6)`,
          [
            c.tenantId,
            sale.branch_id,
            item.product_id,
            Number(item.quantity),
            `Devolucao ${created.rows[0]!.id}`,
            c.userId ?? null,
          ],
        );
      }
      if (input.refundMethod === "customer_credit")
        await client.query(
          `INSERT INTO customer_credits(tenant_id,customer_id,branch_id,source_return_id,amount,balance)VALUES($1,$2,$3,$4,$5,$5)`,
          [c.tenantId, sale.customer_id, sale.branch_id, created.rows[0]!.id, total],
        );
      else {
        await client.query(
          `INSERT INTO sale_payments(tenant_id,sale_id,method,amount,status,paid_at)VALUES($1,$2,$3,$4,'refunded',now())`,
          [c.tenantId, input.saleId, `refund_${input.refundMethod}`, total],
        );
        if (sale.cash_register_session_id)
          await client.query(
            `INSERT INTO cash_register_movements(tenant_id,cash_register_session_id,branch_id,type,amount,reason,actor_user_id)VALUES($1,$2,$3,'withdrawal',$4,$5,$6)`,
            [
              c.tenantId,
              sale.cash_register_session_id,
              sale.branch_id,
              total,
              `Estorno devolucao ${created.rows[0]!.id}`,
              c.userId ?? null,
            ],
          );
      }
      await client.query(
        `UPDATE accounts_receivable SET amount=GREATEST(amount-$3,0),status=CASE WHEN amount-$3<=0 THEN 'cancelled' ELSE status END,updated_at=now() WHERE tenant_id=$1 AND sale_id=$2 AND status IN('open','overdue')`,
        [c.tenantId, input.saleId, total],
      );
      await audit(client, c, "sale.returned", "sale_return", created.rows[0]!.id, {
        saleId: input.saleId,
        total,
        refundMethod: input.refundMethod,
        reason: input.reason,
      });
      return { id: created.rows[0]!.id, totalAmount: total };
    });
  }
  async prices(c: TenantContext) {
    const r = await this.db.tenantQuery(
      c.tenantId,
      `SELECT t.id,t.name,t.customer_group "customerGroup",t.starts_at "startsAt",t.ends_at "endsAt",t.is_active "isActive",b.name "branchName",p.name "productName",r.min_quantity "minQuantity",r.fixed_price "fixedPrice",r.discount_percent "discountPercent" FROM price_tables t JOIN price_rules r ON r.price_table_id=t.id JOIN products p ON p.id=r.product_id LEFT JOIN branches b ON b.id=t.branch_id WHERE t.tenant_id=$1 ORDER BY t.created_at DESC`,
      [c.tenantId],
    );
    return { data: r.rows };
  }
  async createPrice(c: TenantContext, i: PriceInput) {
    ensureBranchAccess(c, i.branchId);
    if (i.fixedPrice == null && i.discountPercent == null)
      throw new BadRequestException("Informe preco fixo ou desconto.");
    return this.db.tenantTransaction(c.tenantId, async (x) => {
      const t = await x.query<{ id: string }>(
        `INSERT INTO price_tables(tenant_id,branch_id,name,customer_group,starts_at,ends_at)VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,name)DO UPDATE SET branch_id=EXCLUDED.branch_id,customer_group=EXCLUDED.customer_group,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,is_active=true,updated_at=now() RETURNING id`,
        [
          c.tenantId,
          i.branchId ?? null,
          i.name,
          i.customerGroup ?? null,
          i.startsAt ?? null,
          i.endsAt ?? null,
        ],
      );
      await x.query(
        `INSERT INTO price_rules(tenant_id,price_table_id,product_id,min_quantity,fixed_price,discount_percent)VALUES($1,$2,$3,$4,$5,$6)`,
        [
          c.tenantId,
          t.rows[0]!.id,
          i.productId,
          i.minQuantity,
          i.fixedPrice ?? null,
          i.discountPercent ?? null,
        ],
      );
      await audit(x, c, "price.rule.created", "price_table", t.rows[0]!.id, {
        productId: i.productId,
      });
      return { id: t.rows[0]!.id };
    });
  }
  async resolvePrice(
    c: TenantContext,
    productId: string,
    branchId: string,
    quantity: number,
    group?: string,
  ) {
    ensureBranchAccess(c, branchId);
    const r = await this.db.tenantQuery<{
      basePrice: string;
      fixedPrice: string | null;
      discountPercent: string | null;
      tableName: string | null;
    }>(
      c.tenantId,
      `SELECT p.sale_price::text "basePrice",r.fixed_price::text "fixedPrice",r.discount_percent::text "discountPercent",r.name "tableName" FROM products p LEFT JOIN LATERAL(SELECT pr.fixed_price,pr.discount_percent,pt.name FROM price_rules pr JOIN price_tables pt ON pt.id=pr.price_table_id WHERE pr.tenant_id=p.tenant_id AND pr.product_id=p.id AND pt.is_active=true AND (pt.branch_id IS NULL OR pt.branch_id=$3) AND (pt.customer_group IS NULL OR pt.customer_group=$5) AND (pt.starts_at IS NULL OR pt.starts_at<=now()) AND (pt.ends_at IS NULL OR pt.ends_at>=now()) AND pr.min_quantity<=$4 ORDER BY pr.min_quantity DESC,pt.branch_id NULLS LAST LIMIT 1)r ON true WHERE p.tenant_id=$1 AND p.id=$2`,
      [c.tenantId, productId, branchId, quantity, group ?? null],
    );
    const row = ensureFound(r.rows[0], "Produto");
    const base = Number(row.basePrice);
    return {
      basePrice: base,
      price:
        row.fixedPrice != null
          ? Number(row.fixedPrice)
          : base * (1 - Number(row.discountPercent ?? 0) / 100),
      tableName: row.tableName,
    };
  }
  async quotes(c: TenantContext) {
    const r = await this.db.tenantQuery(
      c.tenantId,
      `SELECT q.id,q.status,q.total_amount "totalAmount",q.valid_until "validUntil",q.created_at "createdAt",b.name "branchName",cu.name "customerName",count(i.id)::int "itemCount" FROM quotes q JOIN branches b ON b.id=q.branch_id LEFT JOIN customers cu ON cu.id=q.customer_id LEFT JOIN quote_items i ON i.quote_id=q.id WHERE q.tenant_id=$1 ${c.branchId ? "AND q.branch_id=$2" : ""} GROUP BY q.id,b.name,cu.name ORDER BY q.created_at DESC LIMIT 100`,
      c.branchId ? [c.tenantId, c.branchId] : [c.tenantId],
    );
    return { data: r.rows };
  }
  async createQuote(c: TenantContext, i: QuoteInput) {
    ensureBranchAccess(c, i.branchId);
    return this.db.tenantTransaction(c.tenantId, async (x) => {
      let total = 0;
      const products = new Map<string, { name: string; available: number }>();
      for (const item of i.items) {
        const p = await x.query<{ name: string; available: string }>(
          `SELECT p.name,(COALESCE(sb.quantity,0)-COALESCE((SELECT sum(qi.reserved_quantity) FROM quote_items qi JOIN quotes q ON q.id=qi.quote_id WHERE qi.product_id=p.id AND q.branch_id=$3 AND q.status IN('draft','sent') AND q.valid_until>=CURRENT_DATE),0))::text available FROM products p LEFT JOIN stock_balances sb ON sb.product_id=p.id AND sb.branch_id=$3 WHERE p.tenant_id=$1 AND p.id=$2`,
          [c.tenantId, item.productId, i.branchId],
        );
        const row = ensureFound(p.rows[0], "Produto");
        if (i.reserveStock && Number(row.available) < item.quantity)
          throw new BadRequestException(`Estoque insuficiente para reservar ${row.name}.`);
        products.set(item.productId, { name: row.name, available: Number(row.available) });
        total += item.quantity * item.unitPrice - item.discountAmount;
      }
      const q = await x.query<{ id: string }>(
        `INSERT INTO quotes(tenant_id,branch_id,customer_id,seller_user_id,total_amount,valid_until,notes)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id`,
        [
          c.tenantId,
          i.branchId,
          i.customerId ?? null,
          c.userId ?? null,
          total,
          i.validUntil,
          i.notes ?? null,
        ],
      );
      for (const item of i.items)
        await x.query(
          `INSERT INTO quote_items(tenant_id,quote_id,product_id,description,quantity,unit_price,discount_amount,reserved_quantity)VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            c.tenantId,
            q.rows[0]!.id,
            item.productId,
            products.get(item.productId)!.name,
            item.quantity,
            item.unitPrice,
            item.discountAmount,
            i.reserveStock ? item.quantity : 0,
          ],
        );
      await audit(x, c, "quote.created", "quote", q.rows[0]!.id, {
        total,
        reserveStock: i.reserveStock,
      });
      return { id: q.rows[0]!.id, totalAmount: total };
    });
  }
  async convertQuote(c: TenantContext, id: string) {
    return this.db.tenantTransaction(c.tenantId, async (x) => {
      const q = await x.query<{
        branch_id: string;
        customer_id: string | null;
        total_amount: string;
        status: string;
      }>(
        `SELECT branch_id,customer_id,total_amount::text,status FROM quotes WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [c.tenantId, id],
      );
      const quote = ensureFound(q.rows[0], "Orcamento");
      ensureBranchAccess(c, quote.branch_id);
      if (quote.status === "converted") throw new BadRequestException("Orcamento ja convertido.");
      const items = await x.query<{
        product_id: string;
        description: string;
        quantity: string;
        unit_price: string;
        discount_amount: string;
      }>(
        `SELECT product_id,description,quantity::text,unit_price::text,discount_amount::text FROM quote_items WHERE tenant_id=$1 AND quote_id=$2`,
        [c.tenantId, id],
      );
      const sale = await x.query<{ id: string }>(
        `INSERT INTO sales(tenant_id,branch_id,customer_id,seller_user_id,status,total_amount,notes)VALUES($1,$2,$3,$4,'sold',$5,$6)RETURNING id`,
        [
          c.tenantId,
          quote.branch_id,
          quote.customer_id,
          c.userId ?? null,
          Number(quote.total_amount),
          `Convertido do orcamento ${id}`,
        ],
      );
      for (const item of items.rows) {
        await x.query(
          `INSERT INTO sale_items(tenant_id,sale_id,product_id,description,quantity,unit_price,discount_amount)VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            c.tenantId,
            sale.rows[0]!.id,
            item.product_id,
            item.description,
            Number(item.quantity),
            Number(item.unit_price),
            Number(item.discount_amount),
          ],
        );
        const b = await x.query<{ quantity: string }>(
          `UPDATE stock_balances SET quantity=quantity-$4,updated_at=now() WHERE tenant_id=$1 AND branch_id=$2 AND product_id=$3 RETURNING quantity::text`,
          [c.tenantId, quote.branch_id, item.product_id, Number(item.quantity)],
        );
        if (Number(b.rows[0]?.quantity ?? -1) < 0)
          throw new BadRequestException(`Estoque insuficiente para ${item.description}.`);
        await x.query(
          `INSERT INTO stock_movements(tenant_id,branch_id,product_id,movement_type,quantity,reason,actor_user_id)VALUES($1,$2,$3,'sale_out',$4,$5,$6)`,
          [
            c.tenantId,
            quote.branch_id,
            item.product_id,
            -Number(item.quantity),
            `Venda ${sale.rows[0]!.id}`,
            c.userId ?? null,
          ],
        );
      }
      await x.query(
        `INSERT INTO accounts_receivable(tenant_id,branch_id,customer_id,sale_id,amount,due_date,status,description)VALUES($1,$2,$3,$4,$5,CURRENT_DATE,'open',$6)`,
        [
          c.tenantId,
          quote.branch_id,
          quote.customer_id,
          sale.rows[0]!.id,
          Number(quote.total_amount),
          `Venda do orcamento ${id}`,
        ],
      );
      await x.query(
        `UPDATE quotes SET status='converted',converted_sale_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
        [c.tenantId, id, sale.rows[0]!.id],
      );
      await audit(x, c, "quote.converted", "quote", id, { saleId: sale.rows[0]!.id });
      return { saleId: sale.rows[0]!.id };
    });
  }
  async quoteDocument(c: TenantContext, id: string) {
    const branding = await loadTenantBranding(this.db, c.tenantId);
    const q = await this.db.tenantQuery<QuoteDocumentRow>(
      c.tenantId,
      `SELECT q.*,b.name branch_name,cu.name customer_name FROM quotes q JOIN branches b ON b.id=q.branch_id LEFT JOIN customers cu ON cu.id=q.customer_id WHERE q.tenant_id=$1 AND q.id=$2`,
      [c.tenantId, id],
    );
    const quote = ensureFound(q.rows[0], "Orcamento");
    ensureBranchAccess(c, quote.branch_id);
    const items = await this.db.tenantQuery<QuoteDocumentItem>(
      c.tenantId,
      `SELECT description,quantity,unit_price,discount_amount FROM quote_items WHERE tenant_id=$1 AND quote_id=$2`,
      [c.tenantId, id],
    );
    return renderDocumentHtml({
      title: "Orcamento comercial",
      subtitle: quote.notes ?? "Proposta valida ate a data indicada.",
      badge: quote.status,
      branding,
      meta: [
        { label: "Orcamento", value: id.slice(0, 8) },
        { label: "Loja", value: quote.branch_name },
        { label: "Cliente", value: quote.customer_name ?? "Consumidor" },
        { label: "Validade", value: new Date(quote.valid_until).toLocaleDateString("pt-BR") },
      ],
      sections: [
        {
          title: "Itens",
          table: {
            columns: [
              { key: "description", label: "Item" },
              { key: "quantity", label: "Qtd" },
              { key: "price", label: "Preco" },
            ],
            rows: items.rows.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              price: money(
                Number(item.unit_price) * Number(item.quantity) - Number(item.discount_amount),
              ),
            })),
          },
        },
        { title: "Total", metrics: [{ label: "Valor", value: money(quote.total_amount) }] },
      ],
    });
  }
  async credit(c: TenantContext, id?: string) {
    const params: unknown[] = [c.tenantId];
    const filter = id ? (params.push(id), "AND cu.id=$2") : "";
    const r = await this.db.tenantQuery(
      c.tenantId,
      `SELECT cu.id,cu.id "customerId",cu.name,COALESCE(a.credit_limit,0)::text "creditLimit",COALESCE(a.blocked,false) blocked,a.block_reason "blockReason",COALESCE((SELECT sum(ar.amount) FROM accounts_receivable ar WHERE ar.customer_id=cu.id AND ar.status IN('open','overdue')),0)::text exposure,COALESCE((SELECT sum(cr.balance) FROM customer_credits cr WHERE cr.customer_id=cu.id AND cr.status='available'),0)::text "storeCredit" FROM customers cu LEFT JOIN customer_credit_accounts a ON a.customer_id=cu.id WHERE cu.tenant_id=$1 AND cu.deleted_at IS NULL ${filter} ORDER BY cu.name LIMIT 200`,
      params,
    );
    return { data: r.rows };
  }
  async setCredit(c: TenantContext, i: CreditInput) {
    const r = await this.db.tenantQuery(
      c.tenantId,
      `INSERT INTO customer_credit_accounts(customer_id,tenant_id,credit_limit,blocked,block_reason,updated_by_user_id) SELECT id,$1,$3,$4,$5,$6 FROM customers WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL ON CONFLICT(customer_id)DO UPDATE SET credit_limit=EXCLUDED.credit_limit,blocked=EXCLUDED.blocked,block_reason=EXCLUDED.block_reason,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now() RETURNING *`,
      [c.tenantId, i.customerId, i.creditLimit, i.blocked, i.blockReason ?? null, c.userId ?? null],
    );
    return r.rows[0];
  }
  async renegotiate(c: TenantContext, i: RenegotiateInput) {
    return this.db.tenantTransaction(c.tenantId, async (x) => {
      const row = await x.query<{ id: string }>(
        `INSERT INTO credit_renegotiations(tenant_id,customer_id,original_amount,negotiated_amount,installments,first_due_date,actor_user_id)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id`,
        [
          c.tenantId,
          i.customerId,
          i.originalAmount,
          i.negotiatedAmount,
          i.installments,
          i.firstDueDate,
          c.userId ?? null,
        ],
      );
      await x.query(
        `UPDATE accounts_receivable SET status='renegotiated',updated_at=now() WHERE tenant_id=$1 AND customer_id=$2 AND status IN('open','overdue')`,
        [c.tenantId, i.customerId],
      );
      const value = i.negotiatedAmount / i.installments;
      for (let n = 0; n < i.installments; n++)
        await x.query(
          `INSERT INTO accounts_receivable(tenant_id,customer_id,amount,due_date,status,description,installment_number,installment_count)VALUES($1,$2,$3,($4::date+($5||' month')::interval)::date,'open',$6,$7,$8)`,
          [
            c.tenantId,
            i.customerId,
            value,
            i.firstDueDate,
            n,
            `Renegociacao ${row.rows[0]!.id}`,
            n + 1,
            i.installments,
          ],
        );
      await audit(x, c, "credit.renegotiated", "customer", i.customerId, { ...i });
      return { id: row.rows[0]!.id };
    });
  }
  async abc(c: TenantContext, start?: string, end?: string) {
    const r = await this.db.tenantQuery<AbcRow>(
      c.tenantId,
      `WITH data AS(SELECT p.id,p.name,p.sku,p.cost_price,p.sale_price,COALESCE(sum(si.quantity) FILTER(WHERE s.id IS NOT NULL),0) qty,COALESCE(sum(si.quantity*si.unit_price-si.discount_amount) FILTER(WHERE s.id IS NOT NULL),0) revenue,COALESCE(sum(si.quantity*(si.unit_price-p.cost_price)-si.discount_amount) FILTER(WHERE s.id IS NOT NULL),0) margin,COALESCE(sb.quantity,0) stock FROM products p LEFT JOIN sale_items si ON si.product_id=p.id LEFT JOIN sales s ON s.id=si.sale_id AND s.status='sold' AND s.created_at::date BETWEEN COALESCE($2::date,CURRENT_DATE-INTERVAL '90 days') AND COALESCE($3::date,CURRENT_DATE) LEFT JOIN stock_balances sb ON sb.product_id=p.id AND ($4::uuid IS NULL OR sb.branch_id=$4) WHERE p.tenant_id=$1 AND p.deleted_at IS NULL GROUP BY p.id,sb.quantity),ranked AS(SELECT *,sum(revenue)OVER(ORDER BY revenue DESC)/NULLIF(sum(revenue)OVER(),0) cumulative FROM data)SELECT id,name,sku,qty::text quantity,revenue::text,margin::text,stock::text,CASE WHEN cumulative<=.8 THEN 'A' WHEN cumulative<=.95 THEN 'B' ELSE 'C' END class,CASE WHEN stock<=0 THEN 'Ruptura' WHEN qty=0 THEN 'Parado' WHEN stock<qty/3 THEN 'Comprar' ELSE 'Saudavel' END suggestion FROM ranked ORDER BY revenue DESC`,
      [c.tenantId, start ?? null, end ?? null, c.branchId ?? null],
    );
    return { data: r.rows };
  }
  async notifications(c: TenantContext) {
    const r = await this.db.tenantQuery(
      c.tenantId,
      `SELECT id,type,title,message,severity,read_at "readAt",created_at "createdAt" FROM internal_notifications WHERE tenant_id=$1 AND (user_id IS NULL OR user_id=$2) ${c.branchId ? "AND (branch_id IS NULL OR branch_id=$3)" : ""} ORDER BY read_at NULLS FIRST,created_at DESC LIMIT 100`,
      c.branchId ? [c.tenantId, c.userId ?? null, c.branchId] : [c.tenantId, c.userId ?? null],
    );
    return { data: r.rows };
  }
  async refreshNotifications(c: TenantContext) {
    await this.db.tenantTransaction(c.tenantId, async (x) => {
      await x.query(
        `DELETE FROM internal_notifications WHERE tenant_id=$1 AND user_id=$2 AND read_at IS NULL`,
        [c.tenantId, c.userId ?? null],
      );
      await x.query(
        `INSERT INTO internal_notifications(tenant_id,user_id,branch_id,type,title,message,severity,entity_type,entity_id) SELECT $1,$2,sb.branch_id,'low_stock','Estoque abaixo do minimo',p.name||' possui '||sb.quantity||' unidade(s).','warning','product',p.id FROM stock_balances sb JOIN products p ON p.id=sb.product_id WHERE sb.tenant_id=$1 AND sb.quantity<=p.min_stock ${c.branchId ? "AND sb.branch_id=$3" : ""}`,
        c.branchId ? [c.tenantId, c.userId ?? null, c.branchId] : [c.tenantId, c.userId ?? null],
      );
      await x.query(
        `INSERT INTO internal_notifications(tenant_id,user_id,branch_id,type,title,message,severity,entity_type,entity_id) SELECT $1,$2,ar.branch_id,'overdue','Conta vencida','Recebivel de R$ '||ar.amount||' esta vencido.','danger','receivable',ar.id FROM accounts_receivable ar WHERE ar.tenant_id=$1 AND ar.status='open' AND ar.due_date<CURRENT_DATE ${c.branchId ? "AND ar.branch_id=$3" : ""}`,
        c.branchId ? [c.tenantId, c.userId ?? null, c.branchId] : [c.tenantId, c.userId ?? null],
      );
      await x.query(
        `INSERT INTO internal_notifications(tenant_id,user_id,branch_id,type,title,message,severity,entity_type,entity_id)
         SELECT $1,$2,po.branch_id,'purchase_pending','Compra pendente','Pedido para '||s.name||' aguarda aprovação ou recebimento.','info','purchase_order',po.id
         FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id
         WHERE po.tenant_id=$1 AND po.status IN ('draft','approved','partial') ${c.branchId ? "AND po.branch_id=$3" : ""}`,
        c.branchId ? [c.tenantId, c.userId ?? null, c.branchId] : [c.tenantId, c.userId ?? null],
      );
      await x.query(
        `INSERT INTO operational_tasks(tenant_id,branch_id,title,description,type,priority,created_by_user_id,due_at)
         SELECT $1,sb.branch_id,'Repor estoque: '||p.name,'Saldo abaixo do estoque mínimo.','stock_replenishment','high',$2,now()+interval '1 day'
         FROM stock_balances sb JOIN products p ON p.id=sb.product_id
         WHERE sb.tenant_id=$1 AND sb.quantity<=p.min_stock ${c.branchId ? "AND sb.branch_id=$3" : ""}
         AND NOT EXISTS(SELECT 1 FROM operational_tasks t WHERE t.tenant_id=$1 AND t.type='stock_replenishment' AND t.title='Repor estoque: '||p.name AND t.status IN('open','in_progress'))`,
        c.branchId ? [c.tenantId, c.userId ?? null, c.branchId] : [c.tenantId, c.userId ?? null],
      );
      await x.query(
        `INSERT INTO operational_tasks(tenant_id,branch_id,title,description,type,priority,created_by_user_id,due_at)
         SELECT $1,ar.branch_id,'Cobrar recebível vencido','Recebível vencido de R$ '||ar.amount||'.','overdue_receivable','high',$2,now()+interval '1 day'
         FROM accounts_receivable ar WHERE ar.tenant_id=$1 AND ar.status='open' AND ar.due_date<CURRENT_DATE ${c.branchId ? "AND ar.branch_id=$3" : ""}
         AND NOT EXISTS(SELECT 1 FROM operational_tasks t WHERE t.tenant_id=$1 AND t.type='overdue_receivable' AND t.title='Cobrar recebível vencido' AND t.status IN('open','in_progress'))`,
        c.branchId ? [c.tenantId, c.userId ?? null, c.branchId] : [c.tenantId, c.userId ?? null],
      );
      await x.query(
        `INSERT INTO internal_notifications(tenant_id,user_id,branch_id,type,title,message,severity,entity_type,entity_id)
         SELECT $1,$2,cr.branch_id,'cash_divergence','Divergência de caixa','Um fechamento de caixa aguarda aprovação gerencial.','warning','cash_register',cr.id
         FROM cash_register_sessions cr WHERE cr.tenant_id=$1 AND cr.status='closed' AND cr.approval_status='pending' ${c.branchId ? "AND cr.branch_id=$3" : ""}`,
        c.branchId ? [c.tenantId, c.userId ?? null, c.branchId] : [c.tenantId, c.userId ?? null],
      );
    });
    return this.notifications(c);
  }
  async readNotification(c: TenantContext, id: string) {
    await this.db.tenantQuery(
      c.tenantId,
      `UPDATE internal_notifications SET read_at=now() WHERE tenant_id=$1 AND id=$2 AND (user_id IS NULL OR user_id=$3)`,
      [c.tenantId, id, c.userId ?? null],
    );
    return { ok: true };
  }
}
async function audit(
  x: PoolClient,
  c: TenantContext,
  action: string,
  type: string,
  id: string,
  metadata: unknown,
) {
  await x.query(
    `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)VALUES($1,$2,$3,$4,$5,$6)`,
    [c.tenantId, c.userId ?? null, action, type, id, JSON.stringify(metadata)],
  );
}
function money(v: string | number) {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
