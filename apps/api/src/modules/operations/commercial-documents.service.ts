import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { renderDocumentHtml } from "@sgc/documents";
import { createHash } from "node:crypto";
import type {
  CommercialDocumentCreateInput,
  CommercialDocumentListQuery,
  CommercialDocumentTransitionInput,
  SaleCreateInput,
} from "@sgc/types";
import type { PoolClient } from "pg";
import { ensureBranchAccess, ensureFound } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { loadTenantBranding } from "../../shared/tenant-branding";
import { DatabaseService } from "../database/database.service";
import {
  assertCommercialDocumentTransition,
  decideReservationAction,
  type CommercialDocumentStatus,
  type CommercialDocumentType,
} from "./commercial-document-state";

type SaleCreator = {
  createInTransaction(
    client: PoolClient,
    context: TenantContext,
    input: SaleCreateInput,
    idempotencyKey?: string,
    origin?: { id: string; type: CommercialDocumentType },
  ): Promise<{ id: string }>;
};

export const COMMERCIAL_SALE_CREATOR = Symbol("COMMERCIAL_SALE_CREATOR");

export function deriveCommercialSaleIdempotencyKey(documentId: string, callerKey: string) {
  const digest = createHash("sha256").update(`${documentId}:${callerKey}`, "utf8").digest("hex");
  return `commercial-${digest}`;
}

type DocumentRow = {
  id: string;
  branch_id: string;
  customer_id: string | null;
  commercial_document_type: CommercialDocumentType;
  status: CommercialDocumentStatus;
  converted_sale_id: string | null;
  notes?: string | null;
};

@Injectable()
export class CommercialDocumentsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(COMMERCIAL_SALE_CREATOR) private readonly sales: SaleCreator,
  ) {}

  async list(context: TenantContext, query: CommercialDocumentListQuery) {
    const params: unknown[] = [context.tenantId];
    const filters = ["q.tenant_id=$1"];
    const branchId = context.branchId ?? query.branchId;
    if (query.branchId) ensureBranchAccess(context, query.branchId);
    if (branchId) {
      params.push(branchId);
      filters.push(`q.branch_id=$${params.length}`);
    }
    const optionalFilters: Array<[unknown, string]> = [
      [query.customerId, "q.customer_id"],
      [query.sellerId, "q.seller_user_id"],
      [query.type, "q.commercial_document_type"],
      [query.status, "q.status"],
    ];
    for (const [value, column] of optionalFilters) {
      if (value === undefined) continue;
      params.push(value);
      filters.push(`${column}=$${params.length}`);
    }
    if (query.startDate) {
      params.push(query.startDate);
      filters.push(`q.created_at >= $${params.length}::date`);
    }
    if (query.endDate) {
      params.push(query.endDate);
      filters.push(`q.created_at < $${params.length}::date + interval '1 day'`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(
        `(cu.name ILIKE $${params.length} OR COALESCE(q.notes,'') ILIKE $${params.length} OR q.document_number::text ILIKE $${params.length})`,
      );
    }
    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `SELECT count(*)::text AS total FROM quotes q
       LEFT JOIN customers cu ON cu.tenant_id=q.tenant_id AND cu.id=q.customer_id
       WHERE ${filters.join(" AND ")}`,
      params,
    );
    const sortColumns = {
      createdAt: "q.created_at",
      validUntil: "q.valid_until",
      totalAmount: "q.total_amount",
      status: "q.status",
      number: "q.document_number",
    } as const;
    const sortColumn = sortColumns[query.sortBy ?? "createdAt"];
    const direction = query.sortDirection === "asc" ? "ASC" : "DESC";
    const offset = (query.page - 1) * query.pageSize;
    params.push(query.pageSize, offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `SELECT q.id,q.commercial_document_type AS type,q.document_number AS number,q.status,
         q.total_amount AS "totalAmount",q.valid_until AS "validUntil",q.created_at AS "createdAt",
         q.converted_sale_id AS "convertedSaleId",b.name AS "branchName",cu.name AS "customerName"
       FROM quotes q
       JOIN branches b ON b.tenant_id=q.tenant_id AND b.id=q.branch_id
       LEFT JOIN customers cu ON cu.tenant_id=q.tenant_id AND cu.id=q.customer_id
       WHERE ${filters.join(" AND ")}
       ORDER BY ${sortColumn} ${direction},q.id ${direction}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      data: rows.rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: Number(count.rows[0]?.total ?? 0),
      },
    };
  }

  async create(context: TenantContext, input: CommercialDocumentCreateInput) {
    ensureBranchAccess(context, input.branchId);
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      await this.assertBranch(client, context.tenantId, input.branchId);
      if (input.customerId) {
        const customer = await client.query(
          `SELECT id FROM customers
           WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL
             AND (branch_id IS NULL OR branch_id=$3)`,
          [context.tenantId, input.customerId, input.branchId],
        );
        ensureFound(customer.rows[0], "Cliente");
      }

      const productIds = [...new Set(input.items.map((item) => item.productId))].sort();
      const products = await client.query<{ id: string; name: string; sale_price: string }>(
        `SELECT id,name,sale_price::text
         FROM products
         WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL AND is_active=true
           AND (branch_id IS NULL OR branch_id=$3)
         ORDER BY id FOR SHARE`,
        [context.tenantId, productIds, input.branchId],
      );
      if (products.rowCount !== productIds.length) {
        throw new BadRequestException("Um ou mais produtos não estão disponíveis nesta filial.");
      }
      const productById = new Map(products.rows.map((product) => [product.id, product]));

      if (input.reserveStock) {
        const availability = await client.query<{ product_id: string; available: string }>(
          `SELECT sb.product_id,
             (sb.quantity-COALESCE((
               SELECT sum(sr.quantity) FROM stock_reservations sr
               WHERE sr.tenant_id=sb.tenant_id AND sr.branch_id=sb.branch_id
                 AND sr.product_id=sb.product_id AND sr.status='active' AND sr.expires_at>now()
             ),0))::text AS available
           FROM stock_balances sb
           WHERE sb.tenant_id=$1 AND sb.branch_id=$2 AND sb.product_id=ANY($3::uuid[])
           ORDER BY sb.product_id FOR UPDATE`,
          [context.tenantId, input.branchId, productIds],
        );
        const availableByProduct = new Map(
          availability.rows.map((row) => [row.product_id, Number(row.available)]),
        );
        for (const item of input.items) {
          if ((availableByProduct.get(item.productId) ?? 0) < item.quantity) {
            throw new BadRequestException(
              `Estoque disponível insuficiente para ${productById.get(item.productId)?.name ?? "o produto"}.`,
            );
          }
        }
      }

      const number = await client.query<{ document_number: string }>(
        `INSERT INTO commercial_document_counters
           (tenant_id,branch_id,commercial_document_type,next_number)
         VALUES($1,$2,$3,2)
         ON CONFLICT(tenant_id,branch_id,commercial_document_type)
         DO UPDATE SET next_number=commercial_document_counters.next_number+1,updated_at=now()
         RETURNING (next_number-1)::text AS document_number`,
        [context.tenantId, input.branchId, input.type],
      );
      const documentNumber = Number(number.rows[0]!.document_number);
      const status: CommercialDocumentStatus = input.reserveStock ? "reserved" : "draft";
      const totalAmount = input.items.reduce(
        (total, item) => total + item.quantity * item.unitPrice - item.discountAmount,
        0,
      );
      if (totalAmount < 0)
        throw new BadRequestException("O total do documento não pode ser negativo.");
      const document = await client.query<{ id: string }>(
        `INSERT INTO quotes(
           tenant_id,branch_id,customer_id,seller_user_id,total_amount,valid_until,notes,
           commercial_document_type,document_number,status,reserved_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::varchar,
           CASE WHEN $10::varchar='reserved' THEN now() ELSE NULL END)
         RETURNING id`,
        [
          context.tenantId,
          input.branchId,
          input.customerId ?? null,
          context.userId ?? null,
          Number(totalAmount.toFixed(2)),
          input.validUntil,
          input.notes ?? null,
          input.type,
          documentNumber,
          status,
        ],
      );
      const documentId = document.rows[0]!.id;
      for (const item of input.items) {
        const product = productById.get(item.productId)!;
        const createdItem = await client.query<{ id: string }>(
          `INSERT INTO quote_items(
             tenant_id,quote_id,product_id,description,quantity,unit_price,discount_amount,reserved_quantity
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [
            context.tenantId,
            documentId,
            item.productId,
            product.name,
            item.quantity,
            item.unitPrice,
            item.discountAmount,
            input.reserveStock ? item.quantity : 0,
          ],
        );
        if (input.reserveStock) {
          await client.query(
            `INSERT INTO stock_reservations(
               tenant_id,branch_id,quote_id,quote_item_id,product_id,quantity,expires_at,created_by_user_id
             ) VALUES($1,$2,$3,$4,$5,$6,$7::date+interval '1 day',$8)`,
            [
              context.tenantId,
              input.branchId,
              documentId,
              createdItem.rows[0]!.id,
              item.productId,
              item.quantity,
              input.validUntil,
              context.userId ?? null,
            ],
          );
        }
      }
      await this.audit(client, context, "commercial_document.created", documentId, {
        type: input.type,
        number: documentNumber,
        status,
        itemCount: input.items.length,
      });
      return { id: documentId, number: documentNumber, type: input.type, status, totalAmount };
    });
  }

  async transition(
    context: TenantContext,
    documentId: string,
    input: CommercialDocumentTransitionInput,
  ) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const document = await this.lockDocument(client, context, documentId);
      const nextStatus = actionStatus(input.action);
      const transition = assertCommercialDocumentTransition({
        type: document.commercial_document_type,
        currentStatus: document.status,
        nextStatus,
        cancellationReason: input.reason,
      });
      const activeReservations = await client.query<{ id: string }>(
        `SELECT id FROM stock_reservations
         WHERE tenant_id=$1 AND quote_id=$2 AND status='active'
         ORDER BY id FOR UPDATE`,
        [context.tenantId, documentId],
      );
      const reservationAction = decideReservationAction({
        currentStatus: document.status,
        nextStatus,
        hasActiveReservation: Boolean(activeReservations.rowCount),
      });
      if (nextStatus === "reserved" && !activeReservations.rowCount) {
        await this.reserveExistingDocument(client, context, document);
      }
      if (reservationAction === "release") {
        await client.query(
          `UPDATE stock_reservations
           SET status=CASE WHEN $4::varchar='expired' THEN 'expired' ELSE 'released' END,
               released_by_user_id=$3,released_at=now(),release_reason=$5,updated_at=now()
           WHERE tenant_id=$1 AND quote_id=$2 AND status='active'`,
          [
            context.tenantId,
            documentId,
            context.userId ?? null,
            nextStatus,
            input.reason ?? nextStatus,
          ],
        );
      }
      await client.query(
        `UPDATE quotes SET status=$3::varchar,
           sent_at=CASE WHEN $3::varchar='sent' THEN now() ELSE sent_at END,
           approved_at=CASE WHEN $3::varchar='approved' THEN now() ELSE approved_at END,
           reserved_at=CASE WHEN $3::varchar='reserved' THEN now() ELSE reserved_at END,
           expired_at=CASE WHEN $3::varchar='expired' THEN now() ELSE expired_at END,
           cancelled_at=CASE WHEN $3::varchar='cancelled' THEN now() ELSE cancelled_at END,
           cancellation_reason=CASE WHEN $3::varchar='cancelled' THEN $4::varchar ELSE cancellation_reason END,
           cancelled_by_user_id=CASE WHEN $3::varchar='cancelled' THEN $5::uuid ELSE cancelled_by_user_id END,
           updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [
          context.tenantId,
          documentId,
          nextStatus,
          transition.cancellationReason ?? null,
          context.userId ?? null,
        ],
      );
      await this.audit(client, context, `commercial_document.${nextStatus}`, documentId, {
        type: document.commercial_document_type,
        previousStatus: document.status,
      });
      return { id: documentId, status: nextStatus };
    });
  }

  async convert(context: TenantContext, documentId: string, idempotencyKey?: string) {
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("Informe uma chave de idempotência válida para converter.");
    }
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const document = await this.lockDocument(client, context, documentId);
      if (document.status === "converted" && document.converted_sale_id) {
        return { id: document.converted_sale_id, reused: true };
      }
      assertCommercialDocumentTransition({
        type: document.commercial_document_type,
        currentStatus: document.status,
        nextStatus: "converted",
      });
      const items = await client.query<{
        product_id: string;
        quantity: string;
        unit_price: string;
        discount_amount: string;
      }>(
        `SELECT product_id,quantity::text,unit_price::text,discount_amount::text
         FROM quote_items WHERE tenant_id=$1 AND quote_id=$2 ORDER BY created_at,id`,
        [context.tenantId, documentId],
      );
      const result = await this.sales.createInTransaction(
        client,
        context,
        {
          branchId: document.branch_id,
          customerId: document.customer_id ?? undefined,
          items: items.rows.map((item) => ({
            productId: item.product_id,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unit_price),
            discountAmount: Number(item.discount_amount),
          })),
          payments: [],
          notes: document.notes ?? undefined,
          loyaltyPointsToRedeem: 0,
          fiscalRequested: false,
        },
        deriveCommercialSaleIdempotencyKey(documentId, idempotencyKey),
        { id: documentId, type: document.commercial_document_type },
      );
      await client.query(
        `UPDATE stock_reservations SET status='consumed',consumed_sale_id=$3,consumed_at=now(),updated_at=now()
         WHERE tenant_id=$1 AND quote_id=$2 AND status='active'`,
        [context.tenantId, documentId, result.id],
      );
      await client.query(
        `UPDATE quotes SET status='converted',converted_sale_id=$3,converted_at=now(),updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [context.tenantId, documentId, result.id],
      );
      await this.audit(client, context, "commercial_document.converted", documentId, {
        saleId: result.id,
        type: document.commercial_document_type,
      });
      return { ...result, reused: false };
    });
  }

  async document(context: TenantContext, documentId: string) {
    const result = await this.database.tenantQuery<{
      id: string;
      branchId: string;
      type: CommercialDocumentType;
      number: string;
      status: string;
      totalAmount: string;
      validUntil: string;
      notes: string | null;
      branchName: string;
      customerName: string | null;
    }>(
      context.tenantId,
      `SELECT q.id,q.branch_id AS "branchId",q.commercial_document_type AS type,
         q.document_number::text AS number,q.status,q.total_amount::text AS "totalAmount",
         q.valid_until::text AS "validUntil",q.notes,b.name AS "branchName",cu.name AS "customerName"
       FROM quotes q
       JOIN branches b ON b.tenant_id=q.tenant_id AND b.id=q.branch_id
       LEFT JOIN customers cu ON cu.tenant_id=q.tenant_id AND cu.id=q.customer_id
       WHERE q.tenant_id=$1 AND q.id=$2`,
      [context.tenantId, documentId],
    );
    const document = ensureFound(result.rows[0], "Documento comercial");
    ensureBranchAccess(context, document.branchId);
    const items = await this.database.tenantQuery<{
      description: string;
      quantity: string;
      unitPrice: string;
      discountAmount: string;
    }>(
      context.tenantId,
      `SELECT description,quantity::text,unit_price::text AS "unitPrice",
         discount_amount::text AS "discountAmount"
       FROM quote_items WHERE tenant_id=$1 AND quote_id=$2 ORDER BY created_at,id`,
      [context.tenantId, documentId],
    );
    const branding = await loadTenantBranding(this.database, context.tenantId);
    const typeName = { quote: "Orçamento", order: "Pedido", dav: "DAV" }[document.type];
    return renderDocumentHtml({
      title: `${typeName} #${document.number}`,
      subtitle: document.notes ?? "Documento comercial com validade e valores registrados.",
      badge: statusLabel(document.status),
      branding,
      meta: [
        { label: "Loja", value: document.branchName },
        { label: "Cliente", value: document.customerName ?? "Consumidor" },
        { label: "Validade", value: formatDate(document.validUntil) },
        { label: "Total", value: formatMoney(document.totalAmount) },
      ],
      sections: [
        {
          title: "Itens",
          table: {
            columns: [
              { key: "description", label: "Produto" },
              { key: "quantity", label: "Quantidade" },
              { key: "unitPrice", label: "Preço" },
              { key: "discount", label: "Desconto" },
              { key: "total", label: "Total" },
            ],
            rows: items.rows.map((item) => ({
              description: item.description,
              quantity: Number(item.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 3 }),
              unitPrice: formatMoney(item.unitPrice),
              discount: formatMoney(item.discountAmount),
              total: formatMoney(
                Number(item.quantity) * Number(item.unitPrice) - Number(item.discountAmount),
              ),
            })),
          },
        },
      ],
    });
  }

  private async assertBranch(client: PoolClient, tenantId: string, branchId: string) {
    const branch = await client.query(
      "SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
      [tenantId, branchId],
    );
    ensureFound(branch.rows[0], "Filial");
  }

  private async lockDocument(client: PoolClient, context: TenantContext, documentId: string) {
    const result = await client.query<DocumentRow>(
      `SELECT id,branch_id,customer_id,commercial_document_type,status,converted_sale_id,notes
       FROM quotes WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [context.tenantId, documentId],
    );
    const document = ensureFound(result.rows[0], "Documento comercial");
    ensureBranchAccess(context, document.branch_id);
    return document;
  }

  private async reserveExistingDocument(
    client: PoolClient,
    context: TenantContext,
    document: DocumentRow,
  ) {
    const items = await client.query<{
      id: string;
      product_id: string;
      quantity: string;
      valid_until: string;
    }>(
      `SELECT qi.id,qi.product_id,qi.quantity::text,q.valid_until::text
       FROM quote_items qi
       JOIN quotes q ON q.tenant_id=qi.tenant_id AND q.id=qi.quote_id
       WHERE qi.tenant_id=$1 AND qi.quote_id=$2 ORDER BY qi.product_id`,
      [context.tenantId, document.id],
    );
    const productIds = [...new Set(items.rows.map((item) => item.product_id))].sort();
    const availability = await client.query<{ product_id: string; available: string }>(
      `SELECT sb.product_id,
         (sb.quantity-COALESCE((
           SELECT sum(sr.quantity) FROM stock_reservations sr
           WHERE sr.tenant_id=sb.tenant_id AND sr.branch_id=sb.branch_id
             AND sr.product_id=sb.product_id AND sr.status='active' AND sr.expires_at>now()
         ),0))::text AS available
       FROM stock_balances sb
       WHERE sb.tenant_id=$1 AND sb.branch_id=$2 AND sb.product_id=ANY($3::uuid[])
       ORDER BY sb.product_id FOR UPDATE`,
      [context.tenantId, document.branch_id, productIds],
    );
    const availableByProduct = new Map(
      availability.rows.map((row) => [row.product_id, Number(row.available)]),
    );
    for (const item of items.rows) {
      if ((availableByProduct.get(item.product_id) ?? 0) < Number(item.quantity)) {
        throw new BadRequestException("Estoque disponível insuficiente para reservar o documento.");
      }
      await client.query(
        `INSERT INTO stock_reservations(
           tenant_id,branch_id,quote_id,quote_item_id,product_id,quantity,expires_at,created_by_user_id
         ) VALUES($1,$2,$3,$4,$5,$6,$7::date+interval '1 day',$8)`,
        [
          context.tenantId,
          document.branch_id,
          document.id,
          item.id,
          item.product_id,
          Number(item.quantity),
          item.valid_until,
          context.userId ?? null,
        ],
      );
    }
  }

  private audit(
    client: PoolClient,
    context: TenantContext,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    return client.query(
      `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,$3,'commercial_document',$4,$5::jsonb)`,
      [context.tenantId, context.userId ?? null, action, entityId, JSON.stringify(metadata)],
    );
  }
}

function actionStatus(
  action: CommercialDocumentTransitionInput["action"],
): CommercialDocumentStatus {
  return {
    send: "sent",
    approve: "approved",
    reserve: "reserved",
    expire: "expired",
    cancel: "cancelled",
  }[action] as CommercialDocumentStatus;
}

function formatMoney(value: string | number) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00.000Z`),
  );
}

function statusLabel(status: string) {
  return (
    {
      draft: "Rascunho",
      sent: "Enviado",
      approved: "Aprovado",
      reserved: "Reservado",
      converted: "Convertido",
      expired: "Vencido",
      cancelled: "Cancelado",
    }[status] ?? status
  );
}
