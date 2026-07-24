import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { renderDocumentHtml } from "@sgc/documents";
import type { SaleCancelInput, SaleCreateInput, SalesListQuery } from "@sgc/types";
import type { PoolClient, QueryResult } from "pg";
import {
  ensureBranchAccess,
  ensureFound,
  pagination,
  resolveSort,
} from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { loadTenantBranding } from "../../shared/tenant-branding";
import { DatabaseService } from "../database/database.service";
import { FiscalService } from "../fiscal/fiscal.service";
import { FinancialSettlementsService } from "../financial/financial-settlements.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { PricingService } from "../pricing/pricing.service";
import { roundMoney } from "../pricing/pricing-policy";
import { SaleCommissionService } from "./sale-commission.service";
import { SaleCompositionService } from "./sale-composition.service";
import { createSaleRequestHash } from "./sale-request-hash";

export type CommercialSaleOrigin = {
  id: string;
  type: "quote" | "order" | "dav";
};

@Injectable()
export class SalesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(FiscalService) private readonly fiscal: FiscalService,
    @Inject(PricingService) private readonly pricing: PricingService,
    @Inject(SaleCompositionService) private readonly composition: SaleCompositionService,
    @Inject(LoyaltyService) private readonly loyalty: LoyaltyService,
    @Inject(FinancialSettlementsService) private readonly financialSettlements: FinancialSettlementsService,
    @Inject(SaleCommissionService) private readonly commissions: SaleCommissionService,
  ) {}

  async list(context: TenantContext, query: SalesListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["s.tenant_id = $1", "s.deleted_at IS NULL"];
    const sort = resolveSort(
      query,
      { createdAt: "s.created_at", totalAmount: "s.total_amount", status: "s.status" },
      "createdAt",
    );

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`s.branch_id = $${params.length}`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(
        `(c.name ILIKE $${params.length} OR b.name ILIKE $${params.length} OR COALESCE(s.notes, '') ILIKE $${params.length})`,
      );
    }

    if (query.status) {
      params.push(query.status);
      filters.push(`s.status = $${params.length}`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `
      SELECT count(*)::text AS total
      FROM sales s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE ${filters.join(" AND ")}
      `,
      params,
    );

    params.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT
        s.id,
        s.status,
        s.total_amount AS "totalAmount",
        s.notes,
        s.cancelled_at AS "cancelledAt",
        s.cancelled_reason AS "cancelledReason",
        s.created_at AS "createdAt",
        b.name AS "branchName",
        c.name AS "customerName",
        latest_fiscal.status AS "fiscalStatus",
        latest_fiscal.external_id AS "fiscalExternalId",
        COALESCE(items.item_count, 0) AS "itemCount",
        COALESCE(payments.paid_amount, 0)::text AS "paidAmount",
        GREATEST(s.total_amount - COALESCE(payments.paid_amount, 0), 0)::text AS "openAmount"
      FROM sales s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN (
        SELECT sale_id, count(*)::int AS item_count
        FROM sale_items
        WHERE tenant_id = $1
        GROUP BY sale_id
      ) items ON items.sale_id = s.id
      LEFT JOIN (
        SELECT sale_id, sum(amount) FILTER (WHERE status = 'paid') AS paid_amount
        FROM sale_payments
        WHERE tenant_id = $1
        GROUP BY sale_id
      ) payments ON payments.sale_id = s.id
      LEFT JOIN LATERAL (
        SELECT status, external_id
        FROM fiscal_documents fd
        WHERE fd.tenant_id = s.tenant_id AND fd.sale_id = s.id AND fd.document_type = 'nfce'
        ORDER BY fd.created_at DESC
        LIMIT 1
      ) latest_fiscal ON true
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sort.field} ${sort.direction}, s.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    );

    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async get(context: TenantContext, saleId: string) {
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT s.id,s.branch_id AS "branchId",s.status,s.total_amount AS "totalAmount",s.notes,s.cancelled_at AS "cancelledAt",s.cancelled_reason AS "cancelledReason",s.created_at AS "createdAt",b.name AS "branchName",c.name AS "customerName",latest_fiscal.status AS "fiscalStatus",latest_fiscal.external_id AS "fiscalExternalId",COALESCE(items.item_count,0)::int AS "itemCount",COALESCE(payments.paid_amount,0)::text AS "paidAmount",GREATEST(s.total_amount-COALESCE(payments.paid_amount,0),0)::text AS "openAmount" FROM sales s JOIN branches b ON b.id=s.branch_id LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN (SELECT sale_id,count(*)::int item_count FROM sale_items WHERE tenant_id=$1 GROUP BY sale_id) items ON items.sale_id=s.id LEFT JOIN (SELECT sale_id,sum(amount) FILTER(WHERE status='paid') paid_amount FROM sale_payments WHERE tenant_id=$1 GROUP BY sale_id) payments ON payments.sale_id=s.id LEFT JOIN LATERAL(SELECT status,external_id FROM fiscal_documents fd WHERE fd.tenant_id=s.tenant_id AND fd.sale_id=s.id AND fd.document_type='nfce' ORDER BY fd.created_at DESC LIMIT 1) latest_fiscal ON true WHERE s.tenant_id=$1 AND s.id=$2 AND s.deleted_at IS NULL`,
      [context.tenantId, saleId],
    );
    const sale = ensureFound(result.rows[0], "Venda") as { branchId?: string };
    if (sale.branchId) ensureBranchAccess(context, sale.branchId);
    return sale;
  }

  preview(context: TenantContext, input: SaleCreateInput) {
    return this.composition.preview(context, input);
  }

  async create(context: TenantContext, input: SaleCreateInput, idempotencyKey?: string) {
    ensureBranchAccess(context, input.branchId);
    if (idempotencyKey && !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("Chave de idempotência inválida.");
    }
    return this.database.tenantTransaction(context.tenantId, (client) =>
      this.createInTransaction(client, context, input, idempotencyKey, undefined),
    );
  }

  async createInTransaction(
    client: PoolClient,
    context: TenantContext,
    input: SaleCreateInput,
    idempotencyKey?: string,
    commercialOrigin?: CommercialSaleOrigin,
  ) {
    ensureBranchAccess(context, input.branchId);
    if (idempotencyKey && !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("Chave de idempotência inválida.");
    }
    const requestHash = createSaleRequestHash({
      input,
      commercialOrigin: commercialOrigin ?? null,
    });
    if (idempotencyKey) {
      const key = await client.query<{ response: unknown }>(
        `INSERT INTO idempotency_keys(tenant_id,scope,key,request_hash)
         VALUES($1,'sales.create',$2,$3)
         ON CONFLICT(tenant_id,scope,key) DO NOTHING RETURNING response`,
        [context.tenantId, idempotencyKey, requestHash],
      );
      if (!key.rowCount) {
        const existing = await client.query<{ request_hash: string | null; response: unknown }>(
          `SELECT request_hash,response FROM idempotency_keys
           WHERE tenant_id=$1 AND scope='sales.create' AND key=$2 FOR UPDATE`,
          [context.tenantId, idempotencyKey],
        );
        if (existing.rows[0]?.request_hash !== requestHash) {
          throw new ConflictException({
            code: "IDEMPOTENCY_PAYLOAD_MISMATCH",
            message: "A chave de idempotência já foi usada com outra venda.",
          });
        }
        if (existing.rows[0]?.response) {
          return existing.rows[0].response as {
            id: string;
            totalAmount: number;
            paidAmount: number;
            openAmount: number;
          };
        }
        throw new BadRequestException(
          "Venda em processamento. Aguarde alguns segundos e tente novamente.",
        );
      }
    }
    const prepared = await this.composition.prepareForCommit(client, context, input);
    if (input.compositionFingerprint && input.compositionFingerprint !== prepared.fingerprint) {
      throw new ConflictException({
        code: "SALE_COMPOSITION_CHANGED",
        message: "A composição da venda mudou. Revise os valores antes de concluir.",
        fingerprint: prepared.fingerprint,
      });
    }
    if (commercialOrigin) {
      const origin = await client.query<{ id: string }>(
        `SELECT id FROM quotes
         WHERE tenant_id=$1 AND id=$2 AND branch_id=$3 AND commercial_document_type=$4
         FOR UPDATE`,
        [context.tenantId, commercialOrigin.id, input.branchId, commercialOrigin.type],
      );
      ensureFound(origin.rows[0], "Documento comercial");
    }
    if (input.cashRegisterSessionId) {
      const cashSession = await client.query(
        `SELECT id FROM cash_register_sessions
         WHERE tenant_id=$1 AND id=$2 AND branch_id=$3 AND status='open'`,
        [context.tenantId, input.cashRegisterSessionId, input.branchId],
      );
      if (!cashSession.rowCount) {
        throw new BadRequestException("Caixa informado não está aberto para esta loja.");
      }
    }
    const totalAmount = centsToMoney(prepared.totals.netCents);
    const productIds = input.items.map((item) => item.productId);
    const plannedPaidAmount = input.payments
      .filter((payment) => payment.status === "paid")
      .reduce((sum, payment) => sum + payment.amount, 0);
    if (roundMoney(plannedPaidAmount) > totalAmount) {
      throw new BadRequestException({
        code: "SALE_PAYMENT_EXCEEDS_TOTAL",
        message: "O valor pago não pode superar o total da venda.",
      });
    }
    const plannedPaymentAmount = input.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (roundMoney(plannedPaymentAmount) > totalAmount) {
      throw new BadRequestException({
        code: "SALE_PAYMENT_PLAN_EXCEEDS_TOTAL",
        message: "A soma das formas de pagamento não pode superar o total da venda.",
      });
    }
    const plannedCreditAmount = Math.max(0, totalAmount - plannedPaidAmount);
    if (input.customerId && plannedCreditAmount > 0) {
      const policy = await client.query<{ credit_limit: string; blocked: boolean }>(
        `SELECT credit_limit::text,blocked FROM customer_credit_accounts WHERE tenant_id=$1 AND customer_id=$2`,
        [context.tenantId, input.customerId],
      );
      const exposure = await client.query<{ total: string }>(
        `SELECT COALESCE(sum(amount),0)::text total FROM accounts_receivable WHERE tenant_id=$1 AND customer_id=$2 AND status IN('open','overdue')`,
        [context.tenantId, input.customerId],
      );
      if (policy.rows[0]?.blocked)
        throw new ForbiddenException("Crediário bloqueado para este cliente.");
      if (
        policy.rows[0] &&
        Number(exposure.rows[0]?.total ?? 0) + plannedCreditAmount >
          Number(policy.rows[0].credit_limit)
      )
        throw new ForbiddenException("Venda excede o limite de crediário do cliente.");
    }

    const validatedItems = [];
    for (const item of prepared.items) {
      const quantity = item.quantityMilliunits / 1_000;
      const resolution = await this.pricing.resolveForSale(
        context,
        {
          productId: item.productId,
          branchId: input.branchId,
          customerId: input.customerId,
          quantity,
          unitPrice: centsToMoney(item.unitPriceCents),
        },
        client,
      );
      const projectedMarginPercent = Number(((item.marginBasisPoints ?? 0) / 100).toFixed(2));
      const finalResolution = {
        ...resolution,
        policyId: item.policy.id,
        policyVersion: item.policy.version,
        unitPrice: centsToMoney(item.unitPriceCents),
        projectedMarginPercent,
        marginStatus: item.marginStatus,
        priceWithinLimits: item.priceWithinLimits,
      };
      const approval = item.isGift
        ? null
        : await this.pricing.validateApproval(
            client,
            context,
            {
              approvalId: item.pricingApprovalId,
              quantity,
              unitPrice: centsToMoney(item.unitPriceCents),
              discountAmount: centsToMoney(item.directDiscountCents),
              allocatedAdjustmentAmount: centsToMoney(item.allocatedAdjustmentCents),
              netTotal: centsToMoney(item.netCents),
              costTotal: centsToMoney(item.costCents),
              projectedMarginPercent,
              branchId: input.branchId,
              basketFingerprint: prepared.fingerprint,
            },
            finalResolution,
          );
      validatedItems.push({ item, quantity, resolution: finalResolution, approval });
    }

    const sale = await client.query<{ id: string }>(
      `INSERT INTO sales (
         tenant_id,branch_id,customer_id,customer_document,seller_user_id,
         cash_register_session_id,status,total_amount,notes,composition_fingerprint,
         commercial_origin_id,commercial_origin_type
       ) VALUES ($1,$2,$3,$4,$5,$6,'sold',$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        context.tenantId,
        input.branchId,
        input.customerId ?? null,
        normalizeDocument(input.customerDocument),
        context.userId ?? null,
        input.cashRegisterSessionId ?? null,
        totalAmount,
        input.notes ?? null,
        prepared.fingerprint,
        commercialOrigin?.id ?? null,
        commercialOrigin?.type ?? null,
      ],
    );
    const saleId = ensureFound(sale.rows[0], "Venda").id;
    const saleItemIds = new Map<string, string>();
    for (const validated of validatedItems) {
      const { item, quantity, resolution, approval } = validated;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO sale_items (
           tenant_id,sale_id,product_id,description,quantity,unit_price,discount_amount,
           allocated_adjustment_amount,net_amount,final_margin_percent,
           price_policy_id,price_policy_version,price_reference,price_min,price_max,cost_snapshot,
           projected_margin_percent,pricing_exception_reason,pricing_exception_requested_by_user_id,
           pricing_exception_approved_by_user_id,pricing_approval_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING id`,
        [
          context.tenantId,
          saleId,
          item.productId,
          item.isGift ? `Brinde fidelidade: ${item.productName}` : item.productName,
          quantity,
          centsToMoney(item.unitPriceCents),
          centsToMoney(item.directDiscountCents),
          centsToMoney(item.allocatedAdjustmentCents),
          centsToMoney(item.netCents),
          resolution.projectedMarginPercent,
          resolution.policyId,
          resolution.policyVersion,
          resolution.referencePrice,
          resolution.minPrice,
          resolution.maxPrice,
          resolution.costPrice,
          resolution.projectedMarginPercent,
          approval?.approvedReason ?? null,
          approval ? context.userId : null,
          approval?.approvedByUserId ?? null,
          approval?.approvalId ?? null,
        ],
      );
      const saleItemId = ensureFound(inserted.rows[0], "Item da venda").id;
      saleItemIds.set(item.id, saleItemId);
      if (approval) {
        await this.pricing.consumeApproval(
          client,
          context,
          approval.approvalId,
          saleId,
          saleItemId,
          {
            unitPrice: centsToMoney(item.unitPriceCents),
            discountAmount: centsToMoney(item.directDiscountCents),
            allocatedAdjustmentAmount: centsToMoney(item.allocatedAdjustmentCents),
            netTotal: centsToMoney(item.netCents),
            quantity,
            costTotal: centsToMoney(item.costCents),
            projectedMarginPercent: resolution.projectedMarginPercent,
            policyId: resolution.policyId,
            policyVersion: resolution.policyVersion,
            basketFingerprint: prepared.fingerprint,
          },
        );
        await insertAuditLog(client, {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          action: "pricing.exception.applied",
          entityType: "sale",
          entityId: saleId,
          metadata: {
            productId: item.productId,
            policyId: resolution.policyId,
            approvalId: approval.approvalId,
            referencePrice: resolution.referencePrice,
            minPrice: resolution.minPrice,
            maxPrice: resolution.maxPrice,
            requestedUnitPrice: centsToMoney(item.unitPriceCents),
            netAmount: centsToMoney(item.netCents),
            allocatedAdjustmentAmount: centsToMoney(item.allocatedAdjustmentCents),
            projectedMarginPercent: resolution.projectedMarginPercent,
            requesterUserId: context.userId,
            approverUserId: approval.approvedByUserId,
            basketFingerprint: prepared.fingerprint,
          },
        });
      }
    }

    for (const adjustment of prepared.adjustments) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO sale_adjustments (
           tenant_id,sale_id,adjustment_key,adjustment_type,source_type,source_id,
           amount,basket_fingerprint,metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'{}'::jsonb)
         RETURNING id`,
        [
          context.tenantId,
          saleId,
          adjustment.id,
          adjustment.type,
          adjustmentSourceType(adjustment.type),
          adjustment.sourceId,
          centsToMoney(adjustment.amountCents),
          prepared.fingerprint,
        ],
      );
      const adjustmentId = ensureFound(inserted.rows[0], "Ajuste da venda").id;
      for (const allocation of adjustment.allocations) {
        const saleItemId = saleItemIds.get(allocation.itemId);
        if (!saleItemId) throw new BadRequestException("Rateio da venda inválido.");
        await client.query(
          `INSERT INTO sale_item_adjustments
             (tenant_id,sale_id,sale_item_id,adjustment_id,amount)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            context.tenantId,
            saleId,
            saleItemId,
            adjustmentId,
            centsToMoney(allocation.amountCents),
          ],
        );
      }
    }

    for (const item of [...prepared.items].sort(
      (left, right) =>
        left.productId.localeCompare(right.productId) || left.id.localeCompare(right.id),
    )) {
      await decrementStock(
        client,
        context.tenantId,
        input.branchId,
        item.productId,
        item.quantityMilliunits / 1_000,
        saleId,
      );
    }

    const paidAmount = input.payments
      .filter((payment) => payment.status === "paid")
      .reduce((sum, payment) => sum + payment.amount, 0);

    const paymentOccurredAt = new Date().toISOString();
    let representedPendingAmountCents = 0;
    for (const payment of input.payments) {
      const snapshot = await this.financialSettlements.resolvePaymentSnapshotInTransaction(
        client,
        context,
        {
          branchId: input.branchId,
          acquirerId: payment.acquirerId,
          paymentMethod: payment.method,
          brand: payment.brand,
          installments: payment.installments ?? 1,
          grossAmountCents: moneyToCents(payment.amount),
          occurredAt: paymentOccurredAt,
        },
      );
      const settlementStatus = payment.status === "paid" && !snapshot.acquirerId ? "settled" : "pending";
      const insertedPayment = await client.query<{ id: string }>(
        `INSERT INTO sale_payments (
           tenant_id,sale_id,branch_id,method,amount,status,paid_at,acquirer_id,fee_rule_id,
           fee_rule_version,brand,installments,gross_amount,processing_fee_amount,
           anticipation_fee_amount,total_fee_amount,net_amount,expected_settlement_date,
           settlement_status,snapshot_locked_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
         ) RETURNING id`,
        [
          context.tenantId,
          saleId,
          input.branchId,
          payment.method,
          centsToMoney(snapshot.grossAmountCents),
          payment.status,
          payment.status === "paid" ? paymentOccurredAt : null,
          snapshot.acquirerId,
          snapshot.feeRuleId,
          snapshot.feeRuleVersion,
          snapshot.brand,
          snapshot.installments,
          centsToMoney(snapshot.grossAmountCents),
          centsToMoney(snapshot.processingFeeCents),
          centsToMoney(snapshot.anticipationFeeCents),
          centsToMoney(snapshot.totalFeeCents),
          centsToMoney(snapshot.netAmountCents),
          snapshot.expectedSettlementDate,
          settlementStatus,
          paymentOccurredAt,
        ],
      );
      const salePaymentId = ensureFound(insertedPayment.rows[0], "Pagamento da venda").id;
      const createsReceivable = payment.status === "pending" || Boolean(snapshot.acquirerId);
      if (payment.status === "pending") representedPendingAmountCents += snapshot.grossAmountCents;
      if (createsReceivable) {
        await client.query(
          `INSERT INTO accounts_receivable (
             tenant_id,branch_id,customer_id,sale_id,sale_payment_id,source_type,source_document_id,
             payment_method,amount,gross_amount,fee_amount,net_amount,due_date,
             expected_settlement_date,status,description,snapshot_locked_at
           ) VALUES ($1,$2,$3,$4,$5,'sale_payment',$5,$6,$7,$8,$9,$10,$11,$11,'open',$12,$13)`,
          [
            context.tenantId,
            input.branchId,
            payment.status === "pending" ? input.customerId ?? null : null,
            saleId,
            salePaymentId,
            payment.method,
            centsToMoney(snapshot.netAmountCents),
            centsToMoney(snapshot.grossAmountCents),
            centsToMoney(snapshot.totalFeeCents),
            centsToMoney(snapshot.netAmountCents),
            snapshot.expectedSettlementDate,
            `Recebimento ${payment.method} da venda ${saleId}`,
            paymentOccurredAt,
          ],
        );
      }
    }

    const loyaltyApplication = await this.loyalty.applySaleBenefits(client, context, {
      saleId,
      branchId: input.branchId,
      benefits: prepared.loyaltyBenefits,
    });

    const openAmount = roundMoney(totalAmount - paidAmount);
    const residualOpenAmountCents = Math.max(0, moneyToCents(openAmount) - representedPendingAmountCents);
    if (residualOpenAmountCents > 0) {
      const residualOpenAmount = centsToMoney(residualOpenAmountCents);
      await client.query(
        `
          INSERT INTO accounts_receivable (
            tenant_id,branch_id,customer_id,sale_id,source_type,source_document_id,amount,
            gross_amount,fee_amount,net_amount,due_date,expected_settlement_date,status,
            description,snapshot_locked_at
          ) VALUES ($1,$2,$3,$4,'sale_balance',$4,$5,$5,0,$5,$6::timestamptz::date,$6::timestamptz::date,'open',$7,$6)
          `,
        [
          context.tenantId,
          input.branchId,
          input.customerId ?? null,
          saleId,
          residualOpenAmount,
          paymentOccurredAt,
          `Saldo da venda ${saleId}`,
        ],
      );
    }

    if (input.customerId && openAmount <= 0) {
      const categories = await client.query<{ id: string; category_id: string | null }>(
        `SELECT id,category_id FROM products
         WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL
           AND (branch_id IS NULL OR branch_id=$3)`,
        [context.tenantId, [...new Set(productIds)], input.branchId],
      );
      await this.loyalty.awardSalePoints(client, context, {
        saleId,
        branchId: input.branchId,
        customerId: input.customerId,
        paidTotalCents: prepared.totals.netCents,
        productIds: [...new Set(productIds)],
        categoryIds: categories.rows
          .map((product) => product.category_id)
          .filter((value): value is string => Boolean(value)),
      });
    }

    await this.commissions.provisionInTransaction(client, context, {
      saleId,
      branchId: input.branchId,
      baseAmount: totalAmount,
    });

    await insertAuditLog(client, {
      tenantId: context.tenantId,
      actorUserId: context.userId,
      action: "sale.created",
      entityType: "sale",
      entityId: saleId,
      metadata: {
        branchId: input.branchId,
        totalAmount,
        itemCount: prepared.items.length,
        discountAmount: centsToMoney(prepared.totals.discountCents),
        customerDocument: normalizeDocument(input.customerDocument),
        loyaltyPointsRedeemed: prepared.loyaltyBenefits.pointsToRedeem,
        loyaltyDiscountAmount: centsToMoney(loyaltyApplication.immediateDiscountCents),
        compositionFingerprint: prepared.fingerprint,
        commercialOrigin: commercialOrigin ?? null,
      },
    });

    if (input.fiscalRequested) {
      await enqueueFiscalDocument(client, context, {
        saleId,
        branchId: input.branchId,
        customerDocument: normalizeDocument(input.customerDocument),
        source: "sale.create",
      });
    }

    const loyaltyReward = prepared.loyaltyBenefits.reward;
    const response = {
      id: saleId,
      totalAmount,
      paidAmount,
      openAmount,
      compositionFingerprint: prepared.fingerprint,
      loyalty: loyaltyReward
        ? {
            type: loyaltyReward.rewardType,
            rewardName: loyaltyReward.name,
            couponCode: loyaltyApplication.issuedCouponCode ?? undefined,
          }
        : undefined,
      pricingWarnings: prepared.alerts
        .filter((alert) => alert.code === "margin_warning")
        .map((alert) => ({
          productId: alert.productId,
          projectedMarginPercent:
            prepared.items.find((item) => item.id === alert.itemId)?.marginBasisPoints == null
              ? null
              : Number(
                  (
                    (prepared.items.find((item) => item.id === alert.itemId)?.marginBasisPoints ??
                      0) / 100
                  ).toFixed(2),
                ),
        })),
    };
    if (idempotencyKey)
      await client.query(
        `UPDATE idempotency_keys SET response=$3::jsonb,completed_at=now()
         WHERE tenant_id=$1 AND scope='sales.create' AND key=$2 AND request_hash=$4`,
        [context.tenantId, idempotencyKey, JSON.stringify(response), requestHash],
      );
    return response;
  }

  async cancel(context: TenantContext, saleId: string, input: SaleCancelInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const saleResult = await client.query<{
        id: string;
        branch_id: string;
        status: string;
        cancelled_at: Date | null;
      }>(
        `
        SELECT id, branch_id, status, cancelled_at
        FROM sales
        WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
        `,
        [context.tenantId, saleId],
      );
      const sale = ensureFound(saleResult.rows[0], "Venda");
      ensureBranchAccess(context, sale.branch_id);

      if (sale.cancelled_at || sale.status === "cancelled") {
        throw new BadRequestException("Venda ja cancelada.");
      }

      const items = await client.query<{ product_id: string; quantity: string }>(
        "SELECT product_id, quantity::text FROM sale_items WHERE tenant_id = $1 AND sale_id = $2",
        [context.tenantId, saleId],
      );

      for (const item of items.rows) {
        await client.query(
          `
          INSERT INTO stock_balances (tenant_id, branch_id, product_id, quantity)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (tenant_id, branch_id, product_id)
          DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = now()
          `,
          [context.tenantId, sale.branch_id, item.product_id, Number(item.quantity)],
        );

        await client.query(
          `
          INSERT INTO stock_movements (tenant_id, branch_id, product_id, movement_type, quantity, reason, actor_user_id)
          VALUES ($1, $2, $3, 'sale_cancel_in', $4, $5, $6)
          `,
          [
            context.tenantId,
            sale.branch_id,
            item.product_id,
            Number(item.quantity),
            `Cancelamento da venda ${saleId}`,
            context.userId ?? null,
          ],
        );
      }

      await client.query(
        `
        UPDATE sales
        SET status = 'cancelled', cancelled_at = now(), cancelled_reason = $3, updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        `,
        [context.tenantId, saleId, input.reason],
      );

      await client.query(
        "UPDATE accounts_receivable SET status = 'cancelled', updated_at = now() WHERE tenant_id = $1 AND sale_id = $2 AND status <> 'paid'",
        [context.tenantId, saleId],
      );

      await this.commissions.cancelInTransaction(client, context, saleId, input.reason);

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "sale.cancelled",
        entityType: "sale",
        entityId: saleId,
        metadata: { reason: input.reason },
      });

      return { ok: true };
    });
  }

  async history(context: TenantContext, saleId: string) {
    const sale = await this.database.tenantQuery<{ branch_id: string }>(
      context.tenantId,
      "SELECT branch_id FROM sales WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [context.tenantId, saleId],
    );
    const saleRow = ensureFound(sale.rows[0], "Venda");
    ensureBranchAccess(context, saleRow.branch_id);

    const [payments, movements, financial, audit] = await Promise.all([
      this.database.tenantQuery<{
        description: string;
        quantity: string;
        unitPrice: string;
        discountAmount: string;
      }>(
        context.tenantId,
        `
        SELECT id, method, amount, status, paid_at AS "paidAt", created_at AS "createdAt"
        FROM sale_payments
        WHERE tenant_id = $1 AND sale_id = $2
        ORDER BY created_at ASC
        `,
        [context.tenantId, saleId],
      ),
      this.database.tenantQuery<{
        method: string;
        amount: string;
        status: string;
      }>(
        context.tenantId,
        `
        SELECT id, movement_type AS "movementType", quantity, reason, created_at AS "createdAt"
        FROM stock_movements
        WHERE tenant_id = $1 AND reason ILIKE $2
        ORDER BY created_at ASC
        `,
        [context.tenantId, `%${saleId}%`],
      ),
      this.database.tenantQuery(
        context.tenantId,
        `
        SELECT id, amount, due_date AS "dueDate", status, paid_at AS "paidAt"
        FROM accounts_receivable
        WHERE tenant_id = $1 AND sale_id = $2
        ORDER BY created_at ASC
        `,
        [context.tenantId, saleId],
      ),
      this.database.tenantQuery(
        context.tenantId,
        `
        SELECT action, metadata, created_at AS "createdAt"
        FROM audit_logs
        WHERE tenant_id = $1 AND entity_type = 'sale' AND entity_id = $2
        ORDER BY created_at ASC
        `,
        [context.tenantId, saleId],
      ),
    ]);

    return {
      payments: payments.rows,
      movements: movements.rows,
      receivables: financial.rows,
      audit: audit.rows,
    };
  }

  async document(context: TenantContext, saleId: string) {
    const branding = await loadTenantBranding(this.database, context.tenantId);
    const saleResult = await this.database.tenantQuery<{
      id: string;
      status: string;
      total_amount: string;
      notes: string | null;
      created_at: Date;
      branch_name: string;
      customer_name: string | null;
      customer_document: string | null;
    }>(
      context.tenantId,
      `
      SELECT
        s.id,
        s.status,
        s.total_amount::text,
        s.notes,
        s.created_at,
        b.name AS branch_name,
        c.name AS customer_name,
        COALESCE(s.customer_document,c.document) AS customer_document
      FROM sales s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.tenant_id = $1 AND s.id = $2 AND s.deleted_at IS NULL
      LIMIT 1
      `,
      [context.tenantId, saleId],
    );
    const sale = ensureFound(saleResult.rows[0], "Venda");

    const [items, payments]: [
      QueryResult<SaleDocumentItemRow>,
      QueryResult<SaleDocumentPaymentRow>,
    ] = await Promise.all([
      this.database.tenantQuery<SaleDocumentItemRow>(
        context.tenantId,
        `
        SELECT description, quantity::text AS quantity, unit_price::text AS "unitPrice", discount_amount::text AS "discountAmount"
        FROM sale_items
        WHERE tenant_id = $1 AND sale_id = $2
        ORDER BY description ASC
        `,
        [context.tenantId, saleId],
      ),
      this.database.tenantQuery<SaleDocumentPaymentRow>(
        context.tenantId,
        `
        SELECT method, amount::text AS amount, status
        FROM sale_payments
        WHERE tenant_id = $1 AND sale_id = $2
        ORDER BY created_at ASC
        `,
        [context.tenantId, saleId],
      ),
    ]);

    return renderDocumentHtml({
      title: "Comprovante de conferência",
      subtitle:
        sale.notes ??
        "Resumo operacional da venda para conferência do cliente. Este documento não substitui cupom ou nota fiscal.",
      badge: "Sem valor fiscal",
      branding,
      meta: [
        { label: "Venda", value: sale.id.slice(0, 8) },
        { label: "Loja", value: sale.branch_name },
        { label: "Cliente", value: sale.customer_name ?? "Consumidor final" },
        { label: "CPF/CNPJ", value: sale.customer_document ?? "-" },
        { label: "Emitido em", value: sale.created_at.toLocaleString("pt-BR") },
      ],
      sections: [
        {
          title: "Resumo financeiro",
          subtitle:
            "Documento simples para conferência. A emissão fiscal será tratada no módulo fiscal quando configurado.",
          metrics: [
            { label: "Total", value: toMoney(sale.total_amount) },
            {
              label: "Pago",
              value: toMoney(
                payments.rows.reduce((sum, payment) => sum + Number(payment.amount), 0),
              ),
            },
            {
              label: "Itens",
              value: String(items.rows.length),
            },
          ],
        },
        {
          title: "Itens vendidos",
          table: {
            columns: [
              { key: "description", label: "Item" },
              { key: "quantity", label: "Qtd" },
              { key: "unitPrice", label: "Preco unit." },
              { key: "discountAmount", label: "Desconto" },
            ],
            rows: items.rows.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: toMoney(item.unitPrice),
              discountAmount: toMoney(item.discountAmount),
            })),
          },
        },
        {
          title: "Pagamentos",
          table: {
            columns: [
              { key: "method", label: "Metodo" },
              { key: "amount", label: "Valor" },
              { key: "status", label: "Status" },
            ],
            rows: payments.rows.map((payment) => ({
              method: payment.method,
              amount: toMoney(payment.amount),
              status: payment.status,
            })),
          },
        },
      ],
    });
  }

  async thermalReceipt(context: TenantContext, saleId: string) {
    const branding = await loadTenantBranding(this.database, context.tenantId);
    const saleResult = await this.database.tenantQuery<{
      id: string;
      status: string;
      total_amount: string;
      notes: string | null;
      created_at: Date;
      branch_id: string;
      branch_name: string;
      customer_name: string | null;
      customer_document: string | null;
    }>(
      context.tenantId,
      `
      SELECT s.id,s.status,s.total_amount::text,s.notes,s.created_at,s.branch_id,
        b.name AS branch_name,c.name AS customer_name,COALESCE(s.customer_document,c.document) AS customer_document
      FROM sales s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.tenant_id = $1 AND s.id = $2 AND s.deleted_at IS NULL
      LIMIT 1
      `,
      [context.tenantId, saleId],
    );
    const sale = ensureFound(saleResult.rows[0], "Venda");
    const [items, payments, settingsResult] = await Promise.all([
      this.database.tenantQuery<SaleDocumentItemRow>(
        context.tenantId,
        `SELECT description,quantity::text AS quantity,unit_price::text AS "unitPrice",discount_amount::text AS "discountAmount"
         FROM sale_items WHERE tenant_id=$1 AND sale_id=$2 ORDER BY description ASC`,
        [context.tenantId, saleId],
      ),
      this.database.tenantQuery<SaleDocumentPaymentRow>(
        context.tenantId,
        `SELECT method,amount::text AS amount,status FROM sale_payments WHERE tenant_id=$1 AND sale_id=$2 ORDER BY created_at ASC`,
        [context.tenantId, saleId],
      ),
      this.database.tenantQuery<{ value: Record<string, unknown> | null }>(
        context.tenantId,
        "SELECT value FROM branch_settings WHERE tenant_id=$1 AND branch_id=$2 AND key='printing' AND deleted_at IS NULL LIMIT 1",
        [context.tenantId, sale.branch_id],
      ),
    ]);
    const settings = settingsResult.rows[0]?.value ?? {};
    const width = settings.receiptWidth === "58" ? 58 : 80;
    const showLogo = settings.receiptShowLogo !== false;
    const showDocument = settings.receiptShowDocument !== false;
    const copies = Math.max(1, Math.min(5, Number(settings.receiptCopies ?? 1)));
    const footer =
      typeof settings.receiptFooter === "string" ? settings.receiptFooter : branding.footerNote;
    const paid = payments.rows.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const copyHtml = Array.from({ length: copies }, (_, index) =>
      receiptCopyHtml({
        branding,
        sale,
        items: items.rows,
        payments: payments.rows,
        paid,
        width,
        showLogo,
        showDocument,
        footer,
        copyIndex: index + 1,
        copies,
      }),
    ).join("");
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comprovante ${escapeHtml(sale.id.slice(0, 8))}</title><style>
      @page{size:${width}mm auto;margin:0}
      *{box-sizing:border-box}
      body{margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#111827}
      .receipt{width:${width}mm;min-height:120mm;margin:0 auto;padding:4mm;background:#fff;break-after:page}
      .center{text-align:center}.muted{color:#6b7280}.line{border-top:1px dashed #9ca3af;margin:8px 0}
      .logo{max-width:${width === 58 ? 34 : 46}mm;max-height:18mm;object-fit:contain;margin:0 auto 5px;display:block}
      h1{font-size:13px;margin:0 0 4px}p{margin:2px 0;font-size:10px;line-height:1.35}
      table{width:100%;border-collapse:collapse;font-size:10px}td{padding:2px 0;vertical-align:top}.num{text-align:right;white-space:nowrap}
      .total{font-size:13px;font-weight:700}.badge{display:inline-block;border:1px solid #111827;border-radius:999px;padding:2px 6px;font-size:9px}
      @media screen{body{padding:16px}.receipt{box-shadow:0 8px 28px rgba(15,23,42,.14)}}
    </style></head><body>${copyHtml}<script>window.onload=()=>window.print()</script></body></html>`;
  }

  async requestFiscalIssue(context: TenantContext, saleId: string, idempotencyKey?: string) {
    return this.fiscal.issueSale(
      context,
      { saleId, documentType: "nfce", contingency: false },
      idempotencyKey,
    );
  }

  async fiscalStatus(context: TenantContext, saleId: string) {
    return this.fiscal.saleDocuments(context, saleId);
  }
}

function centsToMoney(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new BadRequestException("Valor monetário inválido na composição da venda.");
  }
  return cents / 100;
}

function moneyToCents(amount: number) {
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || Math.abs(cents / 100 - amount) > 1e-8) {
    throw new BadRequestException("Valor monetário inválido no pagamento da venda.");
  }
  return cents;
}

function adjustmentSourceType(type: string) {
  if (type === "item_discount") return "sale_item";
  if (type.startsWith("loyalty_") || type === "bonus_product") return "loyalty";
  return type;
}

function receiptCopyHtml(input: {
  branding: Awaited<ReturnType<typeof loadTenantBranding>>;
  sale: {
    id: string;
    total_amount: string;
    created_at: Date;
    branch_name: string;
    customer_name: string | null;
    customer_document: string | null;
  };
  items: SaleDocumentItemRow[];
  payments: SaleDocumentPaymentRow[];
  paid: number;
  width: number;
  showLogo: boolean;
  showDocument: boolean;
  footer?: string;
  copyIndex: number;
  copies: number;
}) {
  const openAmount = Math.max(0, Number(input.sale.total_amount) - input.paid);
  return `<main class="receipt">
    <div class="center">
      ${input.showLogo && input.branding.logoUrl ? `<img class="logo" src="${escapeHtml(input.branding.logoUrl)}" alt="Logo">` : ""}
      <h1>${escapeHtml(input.branding.tradingName || input.branding.companyName)}</h1>
      ${input.showDocument && input.branding.documentId ? `<p>${escapeHtml(input.branding.documentId)}</p>` : ""}
      ${input.branding.website ? `<p class="muted">${escapeHtml(input.branding.website)}</p>` : ""}
      <p><span class="badge">COMPROVANTE SEM VALOR FISCAL</span></p>
    </div>
    <div class="line"></div>
    <p><strong>Venda:</strong> ${escapeHtml(input.sale.id.slice(0, 8))}</p>
    <p><strong>Loja:</strong> ${escapeHtml(input.sale.branch_name)}</p>
      <p><strong>Cliente:</strong> ${escapeHtml(input.sale.customer_name ?? "Consumidor final")}</p>
    ${input.showDocument && input.sale.customer_document ? `<p><strong>CPF/CNPJ:</strong> ${escapeHtml(input.sale.customer_document)}</p>` : ""}
    <p><strong>Emissão:</strong> ${escapeHtml(input.sale.created_at.toLocaleString("pt-BR"))}</p>
    <div class="line"></div>
    <table><tbody>
      ${input.items.map((item) => `<tr><td>${escapeHtml(item.description)}<br><span class="muted">${escapeHtml(item.quantity)} x ${escapeHtml(toMoney(item.unitPrice))}${Number(item.discountAmount) ? ` desc. ${escapeHtml(toMoney(item.discountAmount))}` : ""}</span></td><td class="num">${escapeHtml(toMoney(Number(item.quantity) * Number(item.unitPrice) - Number(item.discountAmount)))}</td></tr>`).join("")}
    </tbody></table>
    <div class="line"></div>
    <table><tbody>
      ${input.payments.map((payment) => `<tr><td>${escapeHtml(payment.method)} · ${escapeHtml(payment.status)}</td><td class="num">${escapeHtml(toMoney(payment.amount))}</td></tr>`).join("")}
    </tbody></table>
    <p class="total">Total <span style="float:right">${escapeHtml(toMoney(input.sale.total_amount))}</span></p>
    <p>Pago <span style="float:right">${escapeHtml(toMoney(input.paid))}</span></p>
    <p>Em aberto <span style="float:right">${escapeHtml(toMoney(openAmount))}</span></p>
    <div class="line"></div>
    <p class="center muted">${escapeHtml(input.footer || "Obrigado pela preferência.")}</p>
    <p class="center muted">Via ${input.copyIndex}/${input.copies} · Orien</p>
  </main>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeDocument(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 11 ? digits.slice(0, 20) : null;
}

async function enqueueFiscalDocument(
  client: PoolClient,
  context: TenantContext,
  input: {
    saleId: string;
    branchId: string;
    customerDocument?: string | null;
    source: string;
  },
) {
  const settings = await client.query<{ provider: string; environment: string }>(
    "SELECT provider,environment FROM branch_fiscal_settings WHERE tenant_id=$1 AND branch_id=$2 LIMIT 1",
    [context.tenantId, input.branchId],
  );
  const provider = settings.rows[0]?.provider ?? "focus_nfe";
  const environment = settings.rows[0]?.environment ?? "homologation";
  const reference = `orien-nfce-${input.saleId}`;
  const idempotencyKey = `fiscal-nfce-${input.saleId}`;
  const created = await client.query<{ id: string; status: string }>(
    `INSERT INTO fiscal_documents(
      tenant_id,branch_id,sale_id,provider,document_type,status,environment,reference,
      idempotency_key,requested_at,next_retry_at,metadata
     ) VALUES($1,$2,$3,$4,'nfce','retry_pending',$5,$6,$7,now(),now(),$8::jsonb)
     ON CONFLICT(tenant_id,idempotency_key) WHERE idempotency_key IS NOT NULL
     DO UPDATE SET updated_at=now() RETURNING id,status`,
    [
      context.tenantId,
      input.branchId,
      input.saleId,
      provider,
      environment,
      reference,
      idempotencyKey,
      JSON.stringify({
        source: input.source,
        customerDocumentPresent: Boolean(input.customerDocument),
      }),
    ],
  );
  await insertAuditLog(client, {
    tenantId: context.tenantId,
    actorUserId: context.userId,
    action: "fiscal.nfce.queued",
    entityType: "sale",
    entityId: input.saleId,
    metadata: { fiscalDocumentId: created.rows[0]!.id, provider, environment },
  });
  return created.rows[0]!;
}

async function decrementStock(
  client: PoolClient,
  tenantId: string,
  branchId: string,
  productId: string,
  quantity: number,
  saleId: string,
) {
  await client.query(
    `
    INSERT INTO stock_balances (tenant_id, branch_id, product_id, quantity)
    VALUES ($1, $2, $3, 0)
    ON CONFLICT (tenant_id, branch_id, product_id) DO NOTHING
    `,
    [tenantId, branchId, productId],
  );

  const balance = await client.query<{ quantity: string }>(
    `
    UPDATE stock_balances
    SET quantity = quantity - $4, updated_at = now()
    WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3
    RETURNING quantity::text
    `,
    [tenantId, branchId, productId, quantity],
  );

  if (Number(balance.rows[0]?.quantity ?? 0) < 0) {
    throw new BadRequestException("Estoque insuficiente para concluir a venda.");
  }

  await client.query(
    `
    INSERT INTO stock_movements (tenant_id, branch_id, product_id, movement_type, quantity, reason)
    VALUES ($1, $2, $3, 'sale_out', $4, $5)
    `,
    [tenantId, branchId, productId, -quantity, `Venda ${saleId}`],
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
  },
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
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

function toMoney(value: string | number) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface SaleDocumentItemRow {
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
}

interface SaleDocumentPaymentRow {
  method: string;
  amount: string;
  status: string;
}
