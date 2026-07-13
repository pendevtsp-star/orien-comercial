import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { permissions } from "@sgc/auth";
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

@Injectable()
export class SalesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(FiscalService) private readonly fiscal: FiscalService,
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

  async create(context: TenantContext, input: SaleCreateInput, idempotencyKey?: string) {
    ensureBranchAccess(context, input.branchId);

    if (idempotencyKey && !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("Chave de idempotência inválida.");
    }

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      if (idempotencyKey) {
        const key = await client.query<{ response: unknown }>(
          `INSERT INTO idempotency_keys(tenant_id,scope,key) VALUES($1,'sales.create',$2)
           ON CONFLICT(tenant_id,scope,key) DO NOTHING RETURNING response`,
          [context.tenantId, idempotencyKey],
        );
        if (!key.rowCount) {
          const existing = await client.query<{ response: unknown }>(
            "SELECT response FROM idempotency_keys WHERE tenant_id=$1 AND scope='sales.create' AND key=$2 FOR UPDATE",
            [context.tenantId, idempotencyKey],
          );
          if (existing.rows[0]?.response)
            return existing.rows[0].response as {
              id: string;
              totalAmount: number;
              paidAmount: number;
              openAmount: number;
            };
          throw new BadRequestException(
            "Venda em processamento. Aguarde alguns segundos e tente novamente.",
          );
        }
      }
      await assertBranch(client, context.tenantId, input.branchId);
      if (input.customerId) await assertCustomer(client, context.tenantId, input.customerId);
      if (input.cashRegisterSessionId) {
        const cashSession = await client.query(
          "SELECT id FROM cash_register_sessions WHERE tenant_id = $1 AND id = $2 AND branch_id = $3 AND status = 'open'",
          [context.tenantId, input.cashRegisterSessionId, input.branchId],
        );
        if (!cashSession.rowCount)
          throw new BadRequestException("Caixa informado nao esta aberto para esta loja.");
      }

      const productIds = input.items.map((item) => item.productId);
      const products = await client.query<{
        id: string;
        name: string;
        sale_price: string;
        category_id: string | null;
      }>(
        `
        SELECT id, name, sale_price, category_id
        FROM products
        WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL AND is_active = true
        `,
        [context.tenantId, productIds],
      );

      if (products.rowCount !== productIds.length) {
        throw new BadRequestException("Um ou mais produtos nao existem ou estao inativos.");
      }

      const productById = new Map(products.rows.map((product) => [product.id, product]));
      for (const item of input.items) {
        const product = productById.get(item.productId);
        const unitPrice = item.unitPrice ?? Number(product?.sale_price ?? 0);
        const grossAmount = item.quantity * unitPrice;
        if (item.discountAmount > grossAmount)
          throw new BadRequestException("Desconto nao pode superar o valor do item.");
        if (
          grossAmount > 0 &&
          item.discountAmount / grossAmount > 0.1 &&
          !context.permissions.includes(permissions.sales.cancel)
        ) {
          throw new ForbiddenException(
            "Descontos acima de 10% exigem autorizacao de gerente ou administrador.",
          );
        }
      }
      const grossSaleAmount = input.items.reduce((total, item) => {
        const product = productById.get(item.productId);
        const unitPrice = item.unitPrice ?? Number(product?.sale_price ?? 0);
        return total + item.quantity * unitPrice - item.discountAmount;
      }, 0);
      let loyaltyDiscountAmount = 0;
      let loyaltyWalletId: string | null = null;
      let redeemedCouponId: string | null = null;
      type LoyaltyRewardRow = {
        id: string;
        name: string;
        reward_type: "discount" | "coupon" | "cashback" | "bonus_product";
        points_required: number;
        value_amount: string | null;
        product_id: string | null;
        coupon_code: string | null;
      };
      let loyaltyReward: LoyaltyRewardRow | null = null;
      let loyaltyPointsToRedeem = Math.floor(Number(input.loyaltyPointsToRedeem ?? 0));
      if (input.loyaltyCouponCode) {
        if (!input.customerId)
          throw new BadRequestException("Informe o cliente para utilizar um cupom de fidelidade.");
        const coupon = await client.query<{ id: string; value_amount: string }>(
          "SELECT id,value_amount::text FROM loyalty_customer_coupons WHERE tenant_id=$1 AND customer_id=$2 AND code=$3 AND status='available' AND (expires_at IS NULL OR expires_at>=now()) FOR UPDATE",
          [context.tenantId, input.customerId, input.loyaltyCouponCode.trim().toUpperCase()],
        );
        if (!coupon.rows[0])
          throw new BadRequestException("Cupom inválido, expirado ou já utilizado.");
        redeemedCouponId = coupon.rows[0].id;
        loyaltyDiscountAmount = Math.min(grossSaleAmount, Number(coupon.rows[0].value_amount));
      }
      if (input.loyaltyRewardId) {
        if (!input.customerId)
          throw new BadRequestException("Informe um cliente para resgatar uma recompensa.");
        const reward = await client.query<LoyaltyRewardRow>(
          "SELECT id,name,reward_type,points_required,value_amount::text,product_id,coupon_code FROM loyalty_rewards WHERE tenant_id=$1 AND id=$2 AND is_active=true AND (ends_at IS NULL OR ends_at>=now()) FOR UPDATE",
          [context.tenantId, input.loyaltyRewardId],
        );
        loyaltyReward = reward.rows[0] ?? null;
        if (!loyaltyReward)
          throw new BadRequestException("A recompensa selecionada não está disponível.");
        if (redeemedCouponId)
          throw new BadRequestException(
            "Use um cupom ou uma recompensa por venda, não os dois juntos.",
          );
        loyaltyPointsToRedeem = loyaltyReward.points_required;
        if (loyaltyReward.reward_type === "discount")
          loyaltyDiscountAmount = Math.min(
            grossSaleAmount,
            Number(loyaltyReward.value_amount ?? loyaltyPointsToRedeem * 0.01),
          );
        if (loyaltyReward.reward_type === "cashback" && Number(loyaltyReward.value_amount) <= 0)
          throw new BadRequestException("Configure o valor do crédito para esta recompensa.");
        if (loyaltyReward.reward_type === "bonus_product" && !loyaltyReward.product_id)
          throw new BadRequestException("Configure o produto brinde para esta recompensa.");
      }
      if (loyaltyPointsToRedeem > 0) {
        if (!input.customerId)
          throw new BadRequestException("Informe um cliente para resgatar pontos.");
        const policy = await client.query<{
          max_redemption_points: number | null;
          approval_threshold_points: number | null;
        }>(
          `SELECT max_redemption_points,approval_threshold_points
           FROM loyalty_campaigns
           WHERE tenant_id=$1 AND is_active=true AND (branch_id IS NULL OR branch_id=$2)
             AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now())
           ORDER BY created_at DESC LIMIT 1`,
          [context.tenantId, input.branchId],
        );
        const maxPoints = policy.rows[0]?.max_redemption_points;
        if (maxPoints && loyaltyPointsToRedeem > maxPoints)
          throw new BadRequestException(`O limite desta campanha é ${maxPoints} pontos por venda.`);
        const approvalThreshold = policy.rows[0]?.approval_threshold_points;
        if (
          approvalThreshold &&
          loyaltyPointsToRedeem >= approvalThreshold &&
          !context.permissions.includes(permissions.sales.cancel)
        )
          throw new ForbiddenException("Este resgate exige aprovação de gerente ou administrador.");
        const wallet = await client.query<{ id: string; points_balance: number }>(
          "SELECT id, points_balance FROM loyalty_wallets WHERE tenant_id=$1 AND customer_id=$2 FOR UPDATE",
          [context.tenantId, input.customerId],
        );
        if (!wallet.rows[0] || wallet.rows[0].points_balance < loyaltyPointsToRedeem)
          throw new BadRequestException("Saldo de pontos insuficiente para o desconto.");
        loyaltyWalletId = wallet.rows[0].id;
        loyaltyDiscountAmount ||= Math.min(grossSaleAmount, loyaltyPointsToRedeem * 0.01);
      }
      const totalAmount = Math.max(0, grossSaleAmount - loyaltyDiscountAmount);

      if (totalAmount < 0) {
        throw new BadRequestException("Total da venda nao pode ser negativo.");
      }

      const plannedPaidAmount = input.payments
        .filter((payment) => payment.status === "paid")
        .reduce((sum, payment) => sum + payment.amount, 0);
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
          throw new ForbiddenException("Crediario bloqueado para este cliente.");
        if (
          policy.rows[0] &&
          Number(exposure.rows[0]?.total ?? 0) + plannedCreditAmount >
            Number(policy.rows[0].credit_limit)
        )
          throw new ForbiddenException("Venda excede o limite de crediario do cliente.");
      }

      const sale = await client.query<{ id: string }>(
        `
        INSERT INTO sales (tenant_id, branch_id, customer_id, customer_document, seller_user_id, cash_register_session_id, status, total_amount, notes)
        VALUES ($1, $2, $3, $4, $5, $6, 'sold', $7, $8)
        RETURNING id
        `,
        [
          context.tenantId,
          input.branchId,
          input.customerId ?? null,
          normalizeDocument(input.customerDocument),
          context.userId ?? null,
          input.cashRegisterSessionId ?? null,
          totalAmount,
          input.notes ?? null,
        ],
      );
      const saleId = sale.rows[0]!.id;

      for (const item of input.items) {
        const product = productById.get(item.productId)!;
        const unitPrice = item.unitPrice ?? Number(product.sale_price);

        await client.query(
          `
          INSERT INTO sale_items (tenant_id, sale_id, product_id, description, quantity, unit_price, discount_amount)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            context.tenantId,
            saleId,
            item.productId,
            product.name,
            item.quantity,
            unitPrice,
            item.discountAmount,
          ],
        );

        await decrementStock(
          client,
          context.tenantId,
          input.branchId,
          item.productId,
          item.quantity,
          saleId,
        );
      }

      if (loyaltyReward?.reward_type === "bonus_product") {
        const gift = await client.query<{ id: string; name: string }>(
          "SELECT id,name FROM products WHERE tenant_id=$1 AND id=$2 AND is_active=true AND deleted_at IS NULL",
          [context.tenantId, loyaltyReward.product_id],
        );
        if (!gift.rows[0]) throw new BadRequestException("O produto brinde não está disponível.");
        await client.query(
          "INSERT INTO sale_items (tenant_id,sale_id,product_id,description,quantity,unit_price,discount_amount) VALUES ($1,$2,$3,$4,1,0,0)",
          [context.tenantId, saleId, gift.rows[0].id, `Brinde fidelidade: ${gift.rows[0].name}`],
        );
        await decrementStock(client, context.tenantId, input.branchId, gift.rows[0].id, 1, saleId);
      }

      const paidAmount = input.payments
        .filter((payment) => payment.status === "paid")
        .reduce((sum, payment) => sum + payment.amount, 0);

      for (const payment of input.payments) {
        await client.query(
          `
          INSERT INTO sale_payments (tenant_id, sale_id, method, amount, status, paid_at)
          VALUES ($1, $2, $3, $4, $5::varchar, CASE WHEN $5::varchar = 'paid' THEN now() ELSE NULL END)
          `,
          [context.tenantId, saleId, payment.method, payment.amount, payment.status],
        );
      }

      if (loyaltyWalletId && loyaltyPointsToRedeem > 0) {
        await consumeLoyaltyLots(client, context.tenantId, loyaltyWalletId, loyaltyPointsToRedeem);
        await client.query(
          "UPDATE loyalty_wallets SET points_balance=points_balance-$2,updated_at=now() WHERE id=$1",
          [loyaltyWalletId, loyaltyPointsToRedeem],
        );
        await client.query(
          "INSERT INTO loyalty_ledger (tenant_id,wallet_id,movement_type,points,metadata) VALUES ($1,$2,'sale_discount',$3,$4::jsonb)",
          [
            context.tenantId,
            loyaltyWalletId,
            -loyaltyPointsToRedeem,
            JSON.stringify({
              saleId,
              discountAmount: loyaltyDiscountAmount,
              rewardId: loyaltyReward?.id ?? null,
            }),
          ],
        );
        await client.query(
          "INSERT INTO loyalty_redemptions (tenant_id,wallet_id,sale_id,reward_id,amount,status,metadata) VALUES ($1,$2,$3,$4,$5,'confirmed',$6::jsonb)",
          [
            context.tenantId,
            loyaltyWalletId,
            saleId,
            loyaltyReward?.id ?? null,
            loyaltyDiscountAmount,
            JSON.stringify({ rewardName: loyaltyReward?.name ?? null }),
          ],
        );
        if (loyaltyReward?.reward_type === "cashback") {
          const amount = Number(loyaltyReward.value_amount ?? 0);
          await client.query(
            "INSERT INTO customer_credits (tenant_id,customer_id,branch_id,amount,balance) VALUES ($1,$2,$3,$4,$4)",
            [context.tenantId, input.customerId, input.branchId, amount],
          );
        }
        if (loyaltyReward?.reward_type === "coupon") {
          const code = `${loyaltyReward.coupon_code?.trim().toUpperCase() || "LOY"}-${saleId.slice(0, 8).toUpperCase()}`;
          await client.query(
            "INSERT INTO loyalty_customer_coupons (tenant_id,customer_id,reward_id,code,value_amount,expires_at,issued_sale_id) VALUES ($1,$2,$3,$4,$5,(SELECT ends_at FROM loyalty_rewards WHERE id=$3),$6)",
            [
              context.tenantId,
              input.customerId,
              loyaltyReward.id,
              code,
              Number(loyaltyReward.value_amount ?? 0),
              saleId,
            ],
          );
        }
      }

      if (redeemedCouponId) {
        await client.query(
          "UPDATE loyalty_customer_coupons SET status='redeemed',redeemed_sale_id=$2,redeemed_at=now() WHERE id=$1",
          [redeemedCouponId, saleId],
        );
      }

      const openAmount = totalAmount - paidAmount;
      if (openAmount > 0) {
        await client.query(
          `
          INSERT INTO accounts_receivable (tenant_id, branch_id, customer_id, sale_id, amount, due_date, status, description)
          VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'open', $6)
          `,
          [
            context.tenantId,
            input.branchId,
            input.customerId ?? null,
            saleId,
            openAmount,
            `Saldo da venda ${saleId}`,
          ],
        );
      }

      if (input.customerId && openAmount <= 0) {
        const campaign = await client.query<{
          id: string;
          rule: { pointsPerReal?: number };
          expires_in_days: number | null;
          minimum_sale_amount: string;
        }>(
          `SELECT lc.id,lr.rule,lc.expires_in_days,lc.minimum_sale_amount::text FROM loyalty_campaigns lc JOIN loyalty_rules lr ON lr.campaign_id=lc.id WHERE lc.tenant_id=$1 AND lc.is_active=true AND lc.automation_type IS NULL AND (lc.branch_id IS NULL OR lc.branch_id=$2) AND (lc.starts_at IS NULL OR lc.starts_at<=now()) AND (lc.ends_at IS NULL OR lc.ends_at>=now()) AND (cardinality(lc.product_ids)=0 OR lc.product_ids && $3::uuid[]) AND (cardinality(lc.category_ids)=0 OR lc.category_ids && $4::uuid[]) ORDER BY lc.created_at DESC LIMIT 1`,
          [
            context.tenantId,
            input.branchId,
            productIds,
            products.rows
              .map((product) => product.category_id)
              .filter((value): value is string => Boolean(value)),
          ],
        );
        const pointsPerReal = Number(campaign.rows[0]?.rule?.pointsPerReal ?? 0);
        const points =
          totalAmount >= Number(campaign.rows[0]?.minimum_sale_amount ?? 0)
            ? Math.floor(totalAmount * pointsPerReal)
            : 0;
        if (points > 0) {
          const wallet = await client.query<{ id: string }>(
            `INSERT INTO loyalty_wallets (tenant_id,customer_id,points_balance) VALUES ($1,$2,0) ON CONFLICT (tenant_id,customer_id) DO UPDATE SET updated_at=now() RETURNING id`,
            [context.tenantId, input.customerId],
          );
          await client.query(
            "UPDATE loyalty_wallets SET points_balance=points_balance+$2,updated_at=now() WHERE id=$1",
            [wallet.rows[0]!.id, points],
          );
          const ledger = await client.query<{ id: string }>(
            "INSERT INTO loyalty_ledger (tenant_id,wallet_id,movement_type,points,expires_at,metadata) VALUES ($1,$2,'sale_paid',$3,CASE WHEN $4::int IS NULL THEN NULL ELSE now() + ($4::text || ' days')::interval END,$5::jsonb) RETURNING id",
            [
              context.tenantId,
              wallet.rows[0]!.id,
              points,
              campaign.rows[0]?.expires_in_days ?? null,
              JSON.stringify({ saleId, totalAmount }),
            ],
          );
          await client.query(
            "INSERT INTO loyalty_point_lots (tenant_id,wallet_id,source_ledger_id,original_points,remaining_points,expires_at) VALUES ($1,$2,$3,$4,$4,CASE WHEN $5::int IS NULL THEN NULL ELSE now() + ($5::text || ' days')::interval END)",
            [
              context.tenantId,
              wallet.rows[0]!.id,
              ledger.rows[0]!.id,
              points,
              campaign.rows[0]?.expires_in_days ?? null,
            ],
          );
        }
        const firstPurchase = await client.query<{ id: string; automation_points: number }>(
          `SELECT id,automation_points FROM loyalty_campaigns WHERE tenant_id=$1 AND is_active=true AND automation_type='first_purchase' AND (branch_id IS NULL OR branch_id=$2) AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now()) AND (cardinality(product_ids)=0 OR product_ids && $3::uuid[]) AND (cardinality(category_ids)=0 OR category_ids && $4::uuid[]) ORDER BY created_at DESC LIMIT 1`,
          [
            context.tenantId,
            input.branchId,
            productIds,
            products.rows
              .map((product) => product.category_id)
              .filter((value): value is string => Boolean(value)),
          ],
        );
        const priorSales = await client.query<{ count: string }>(
          "SELECT count(*)::text FROM sales WHERE tenant_id=$1 AND customer_id=$2 AND status='sold'",
          [context.tenantId, input.customerId],
        );
        if (firstPurchase.rows[0] && Number(priorSales.rows[0]?.count) === 1) {
          const run = await client.query<{ id: string }>(
            "INSERT INTO loyalty_automation_runs (tenant_id,campaign_id,customer_id,automation_type,period_key) VALUES ($1,$2,$3,'first_purchase',$4) ON CONFLICT DO NOTHING RETURNING id",
            [context.tenantId, firstPurchase.rows[0].id, input.customerId, saleId],
          );
          if (run.rowCount) {
            const wallet = await client.query<{ id: string }>(
              "INSERT INTO loyalty_wallets (tenant_id,customer_id,points_balance) VALUES ($1,$2,0) ON CONFLICT (tenant_id,customer_id) DO UPDATE SET updated_at=now() RETURNING id",
              [context.tenantId, input.customerId],
            );
            await client.query(
              "UPDATE loyalty_wallets SET points_balance=points_balance+$2,updated_at=now() WHERE id=$1",
              [wallet.rows[0]!.id, firstPurchase.rows[0].automation_points],
            );
            await client.query(
              "INSERT INTO loyalty_ledger (tenant_id,wallet_id,movement_type,points,metadata) VALUES ($1,$2,'automation',$3,$4::jsonb)",
              [
                context.tenantId,
                wallet.rows[0]!.id,
                firstPurchase.rows[0].automation_points,
                JSON.stringify({
                  saleId,
                  campaignId: firstPurchase.rows[0].id,
                  automationType: "first_purchase",
                }),
              ],
            );
          }
        }
      }

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "sale.created",
        entityType: "sale",
        entityId: saleId,
        metadata: {
          branchId: input.branchId,
          totalAmount,
          itemCount: input.items.length,
          discountAmount: input.items.reduce((sum, item) => sum + item.discountAmount, 0),
          customerDocument: normalizeDocument(input.customerDocument),
          loyaltyPointsRedeemed: loyaltyPointsToRedeem,
          loyaltyDiscountAmount,
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

      const response = {
        id: saleId,
        totalAmount,
        paidAmount,
        openAmount,
        loyalty: loyaltyReward
          ? {
              type: loyaltyReward.reward_type,
              rewardName: loyaltyReward.name,
              couponCode:
                loyaltyReward.reward_type === "coupon"
                  ? `${loyaltyReward.coupon_code?.trim().toUpperCase() || "LOY"}-${saleId.slice(0, 8).toUpperCase()}`
                  : undefined,
            }
          : undefined,
      };
      if (idempotencyKey)
        await client.query(
          "UPDATE idempotency_keys SET response=$3::jsonb,completed_at=now() WHERE tenant_id=$1 AND scope='sales.create' AND key=$2",
          [context.tenantId, idempotencyKey, JSON.stringify(response)],
        );
      return response;
    });
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

async function consumeLoyaltyLots(
  client: Pick<PoolClient, "query">,
  tenantId: string,
  walletId: string,
  points: number,
) {
  const lots = await client.query<{ id: string; remaining_points: number }>(
    `SELECT id, remaining_points
     FROM loyalty_point_lots
     WHERE tenant_id=$1 AND wallet_id=$2 AND remaining_points>0 AND (expires_at IS NULL OR expires_at>=now())
     ORDER BY expires_at NULLS LAST, created_at, id
     FOR UPDATE`,
    [tenantId, walletId],
  );
  let remaining = points;
  for (const lot of lots.rows) {
    if (remaining <= 0) break;
    const consumed = Math.min(remaining, lot.remaining_points);
    await client.query(
      "UPDATE loyalty_point_lots SET remaining_points=remaining_points-$2 WHERE id=$1",
      [lot.id, consumed],
    );
    remaining -= consumed;
  }
  if (remaining > 0)
    throw new BadRequestException(
      "O saldo disponível de pontos foi alterado. Atualize e tente novamente.",
    );
}

async function assertBranch(client: PoolClient, tenantId: string, branchId: string) {
  const branch = await client.query(
    "SELECT id FROM branches WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
    [tenantId, branchId],
  );
  ensureFound(branch.rows[0], "Filial");
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

async function assertCustomer(client: PoolClient, tenantId: string, customerId: string) {
  const customer = await client.query(
    "SELECT id FROM customers WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
    [tenantId, customerId],
  );
  ensureFound(customer.rows[0], "Cliente");
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
