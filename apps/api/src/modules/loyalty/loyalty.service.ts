import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service";
import type { TenantContext } from "../../shared/request-context";

type CampaignInput = {
  name: string;
  pointsPerReal?: number;
  branchId?: string;
  startsAt?: string;
  endsAt?: string;
  expiresInDays?: number;
  minimumSaleAmount?: number;
  productIds?: string[];
  categoryIds?: string[];
  maxRedemptionPoints?: number;
  approvalThresholdPoints?: number;
  automationType?: "birthday" | "first_purchase" | "inactivity";
  automationPoints?: number;
  inactivityDays?: number;
};
type TierInput = { name: string; minimumPoints: number; multiplier?: number; benefits?: string };
type RewardInput = {
  name: string;
  rewardType: "discount" | "coupon" | "cashback" | "bonus_product";
  pointsRequired: number;
  valueAmount?: number;
  productId?: string;
  couponCode?: string;
  endsAt?: string;
};

@Injectable()
export class LoyaltyService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  onModuleInit() {
    const initial = setTimeout(() => void this.processAutomations(), 20_000);
    initial.unref();
    this.timer = setInterval(() => void this.processAutomations(), 6 * 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async overview(tenant: TenantContext) {
    const [campaigns, tiers, rewards, metrics, expiring, roi] = await Promise.all([
      this.database.tenantQuery(
        tenant.tenantId,
        `SELECT lc.id,lc.name,lc.is_active AS "isActive",lc.branch_id AS "branchId",lc.starts_at AS "startsAt",lc.ends_at AS "endsAt",lc.expires_in_days AS "expiresInDays",lc.minimum_sale_amount AS "minimumSaleAmount",lc.product_ids AS "productIds",lc.category_ids AS "categoryIds",lc.max_redemption_points AS "maxRedemptionPoints",lc.approval_threshold_points AS "approvalThresholdPoints",lc.automation_type AS "automationType",lc.automation_points AS "automationPoints",lc.inactivity_days AS "inactivityDays",COALESCE(lr.rule,'{}'::jsonb) rule FROM loyalty_campaigns lc LEFT JOIN loyalty_rules lr ON lr.campaign_id=lc.id WHERE lc.tenant_id=$1 ORDER BY lc.created_at DESC`,
        [tenant.tenantId],
      ),
      this.database.tenantQuery(
        tenant.tenantId,
        `SELECT id,name,minimum_points AS "minimumPoints",multiplier,benefits,is_active AS "isActive" FROM loyalty_tiers WHERE tenant_id=$1 ORDER BY minimum_points`,
        [tenant.tenantId],
      ),
      this.database.tenantQuery(
        tenant.tenantId,
        `SELECT id,name,reward_type AS "rewardType",points_required AS "pointsRequired",value_amount AS "valueAmount",coupon_code AS "couponCode",is_active AS "isActive",ends_at AS "endsAt" FROM loyalty_rewards WHERE tenant_id=$1 ORDER BY points_required`,
        [tenant.tenantId],
      ),
      this.database.tenantQuery<{ wallets: number; issued: number; redeemed: number }>(
        tenant.tenantId,
        `SELECT (SELECT count(*)::int FROM loyalty_wallets WHERE tenant_id=$1) wallets,(SELECT COALESCE(sum(points),0)::int FROM loyalty_ledger WHERE tenant_id=$1 AND points>0) issued,(SELECT COALESCE(abs(sum(points)),0)::int FROM loyalty_ledger WHERE tenant_id=$1 AND points<0) redeemed`,
        [tenant.tenantId],
      ),
      this.database.tenantQuery<{ points: number }>(
        tenant.tenantId,
        `SELECT COALESCE(sum(remaining_points),0)::int points FROM loyalty_point_lots WHERE tenant_id=$1 AND remaining_points>0 AND expires_at>=now() AND expires_at<now()+interval '30 days'`,
        [tenant.tenantId],
      ),
      this.database.tenantQuery<{ sales: number; customers: number }>(
        tenant.tenantId,
        `SELECT COALESCE(sum(s.total_amount),0)::float sales,count(DISTINCT s.customer_id)::int customers FROM sales s WHERE s.tenant_id=$1 AND s.status='sold' AND s.customer_id IN (SELECT customer_id FROM loyalty_wallets WHERE tenant_id=$1) AND s.created_at>=date_trunc('month',now())`,
        [tenant.tenantId],
      ),
    ]);
    return {
      campaigns: campaigns.rows,
      tiers: tiers.rows,
      rewards: rewards.rows,
      metrics: {
        ...metrics.rows[0],
        expiringPoints: expiring.rows[0]?.points ?? 0,
        loyaltySalesMonth: roi.rows[0]?.sales ?? 0,
        recurringCustomersMonth: roi.rows[0]?.customers ?? 0,
      },
    };
  }

  async wallets(tenant: TenantContext, search?: string) {
    const value = `%${(search ?? "").trim()}%`;
    const result = await this.database.tenantQuery(
      tenant.tenantId,
      `SELECT w.id,w.customer_id AS "customerId",w.points_balance AS "pointsBalance",w.balance,c.name AS "customerName",c.document,COALESCE((SELECT t.name FROM loyalty_tiers t WHERE t.tenant_id=w.tenant_id AND t.is_active=true AND t.minimum_points<=w.points_balance ORDER BY t.minimum_points DESC LIMIT 1),'Sem nível') AS "tierName",COALESCE((SELECT sum(remaining_points) FROM loyalty_point_lots l WHERE l.wallet_id=w.id AND l.remaining_points>0 AND l.expires_at>=now() AND l.expires_at<now()+interval '30 days'),0)::int AS "expiringPoints" FROM loyalty_wallets w JOIN customers c ON c.id=w.customer_id WHERE w.tenant_id=$1 AND ($2='%%' OR c.name ILIKE $2 OR COALESCE(c.document,'') ILIKE $2) ORDER BY w.points_balance DESC,c.name LIMIT 100`,
      [tenant.tenantId, value],
    );
    return { data: result.rows };
  }

  async availableRewards(tenant: TenantContext, customerId: string) {
    if (!customerId) return { data: [] };
    const result = await this.database.tenantQuery(
      tenant.tenantId,
      `SELECT r.id,r.name,r.reward_type AS "rewardType",r.points_required AS "pointsRequired",r.value_amount AS "valueAmount",r.product_id AS "productId",r.coupon_code AS "couponCode"
       FROM loyalty_rewards r
       JOIN loyalty_wallets w ON w.tenant_id=r.tenant_id AND w.customer_id=$2
       WHERE r.tenant_id=$1 AND r.is_active=true AND (r.ends_at IS NULL OR r.ends_at>=now()) AND r.points_required<=w.points_balance
       ORDER BY r.points_required,r.name`,
      [tenant.tenantId, customerId],
    );
    return { data: result.rows };
  }

  async campaignOptions(tenant: TenantContext) {
    const [branches, products, categories] = await Promise.all([
      this.database.tenantQuery(
        tenant.tenantId,
        "SELECT id,name FROM branches WHERE tenant_id=$1 AND is_active=true AND deleted_at IS NULL ORDER BY name",
        [tenant.tenantId],
      ),
      this.database.tenantQuery(
        tenant.tenantId,
        "SELECT id,name FROM products WHERE tenant_id=$1 AND is_active=true AND deleted_at IS NULL ORDER BY name LIMIT 250",
        [tenant.tenantId],
      ),
      this.database.tenantQuery(
        tenant.tenantId,
        "SELECT id,name FROM product_categories WHERE tenant_id=$1 ORDER BY name",
        [tenant.tenantId],
      ),
    ]);
    return { branches: branches.rows, products: products.rows, categories: categories.rows };
  }

  async createCampaign(tenant: TenantContext, actor: string, input: CampaignInput) {
    const name = input.name?.trim();
    const pointsPerReal = numberInRange(input.pointsPerReal, 0.01, 100, 1);
    const expiresInDays = input.expiresInDays
      ? Math.floor(numberInRange(input.expiresInDays, 1, 3650, 365))
      : null;
    if (!name || name.length < 3)
      throw new BadRequestException("Informe um nome de campanha com ao menos três caracteres.");
    const productIds = ids(input.productIds);
    const categoryIds = ids(input.categoryIds);
    const automationType = ["birthday", "first_purchase", "inactivity"].includes(
      input.automationType ?? "",
    )
      ? input.automationType
      : null;
    return this.database.tenantTransaction(tenant.tenantId, async (client) => {
      await ensureScopeIds(client, tenant.tenantId, "products", productIds);
      await ensureScopeIds(client, tenant.tenantId, "product_categories", categoryIds);
      const campaign = await client.query<{ id: string }>(
        `INSERT INTO loyalty_campaigns (tenant_id,name,branch_id,starts_at,ends_at,expires_in_days,minimum_sale_amount,product_ids,category_ids,max_redemption_points,approval_threshold_points,automation_type,automation_points,inactivity_days,is_active) VALUES ($1,$2,$3,COALESCE($4::timestamptz,now()),$5::timestamptz,$6,$7,$8::uuid[],$9::uuid[],$10,$11,$12,$13,$14,true) RETURNING id`,
        [
          tenant.tenantId,
          name,
          input.branchId ?? null,
          input.startsAt ?? null,
          input.endsAt ?? null,
          expiresInDays,
          numberInRange(input.minimumSaleAmount, 0, 999999, 0),
          productIds,
          categoryIds,
          optionalInteger(input.maxRedemptionPoints, 1, 9_999_999),
          optionalInteger(input.approvalThresholdPoints, 1, 9_999_999),
          automationType,
          automationType ? Math.floor(numberInRange(input.automationPoints, 1, 9_999_999, 1)) : 0,
          automationType === "inactivity"
            ? Math.floor(numberInRange(input.inactivityDays, 1, 3650, 30))
            : null,
        ],
      );
      await client.query(
        "INSERT INTO loyalty_rules (tenant_id,campaign_id,rule) VALUES ($1,$2,$3::jsonb)",
        [tenant.tenantId, campaign.rows[0]!.id, JSON.stringify({ pointsPerReal })],
      );
      await this.audit(
        client,
        tenant.tenantId,
        actor,
        "loyalty.campaign.created",
        campaign.rows[0]!.id,
        { name, pointsPerReal, expiresInDays },
      );
      return { ok: true };
    });
  }

  async createTier(tenant: TenantContext, actor: string, input: TierInput) {
    if (!input.name?.trim()) throw new BadRequestException("Informe o nome do nível.");
    const row = await this.database.tenantQuery<{ id: string }>(
      tenant.tenantId,
      `INSERT INTO loyalty_tiers (tenant_id,name,minimum_points,multiplier,benefits) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [
        tenant.tenantId,
        input.name.trim(),
        Math.floor(numberInRange(input.minimumPoints, 0, 9_999_999, 0)),
        numberInRange(input.multiplier, 0.1, 10, 1),
        input.benefits?.trim() || null,
      ],
    );
    await this.audit(
      this.database.pool,
      tenant.tenantId,
      actor,
      "loyalty.tier.created",
      row.rows[0]!.id,
      input,
    );
    return { ok: true };
  }

  async createReward(tenant: TenantContext, actor: string, input: RewardInput) {
    if (!input.name?.trim()) throw new BadRequestException("Informe o nome da recompensa.");
    const row = await this.database.tenantQuery<{ id: string }>(
      tenant.tenantId,
      `INSERT INTO loyalty_rewards (tenant_id,name,reward_type,points_required,value_amount,product_id,coupon_code,ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz) RETURNING id`,
      [
        tenant.tenantId,
        input.name.trim(),
        input.rewardType,
        Math.floor(numberInRange(input.pointsRequired, 1, 9_999_999, 1)),
        numberInRange(input.valueAmount, 0, 999999, 0),
        input.productId ?? null,
        input.couponCode?.trim().toUpperCase() || null,
        input.endsAt ?? null,
      ],
    );
    await this.audit(
      this.database.pool,
      tenant.tenantId,
      actor,
      "loyalty.reward.created",
      row.rows[0]!.id,
      input,
    );
    return { ok: true };
  }

  async award(
    tenant: TenantContext,
    actor: string,
    input: { customerId: string; points: number; reason: string },
  ) {
    return this.move(tenant, actor, input, "credit");
  }
  async redeem(
    tenant: TenantContext,
    actor: string,
    input: { customerId: string; points: number; reason: string },
  ) {
    return this.move(tenant, actor, input, "debit");
  }

  async expirePoints(tenant: TenantContext, actor: string) {
    return this.database.tenantTransaction(tenant.tenantId, async (client) => {
      const lots = await client.query<{ id: string; wallet_id: string; remaining_points: number }>(
        "SELECT id,wallet_id,remaining_points FROM loyalty_point_lots WHERE tenant_id=$1 AND remaining_points>0 AND expires_at<now() FOR UPDATE",
        [tenant.tenantId],
      );
      for (const lot of lots.rows) {
        await client.query("UPDATE loyalty_point_lots SET remaining_points=0 WHERE id=$1", [
          lot.id,
        ]);
        await client.query(
          "UPDATE loyalty_wallets SET points_balance=GREATEST(0,points_balance-$2),updated_at=now() WHERE id=$1",
          [lot.wallet_id, lot.remaining_points],
        );
        await client.query(
          "INSERT INTO loyalty_ledger (tenant_id,wallet_id,movement_type,points,metadata) VALUES ($1,$2,'expiration',$3,$4::jsonb)",
          [
            tenant.tenantId,
            lot.wallet_id,
            -lot.remaining_points,
            JSON.stringify({ sourceLotId: lot.id }),
          ],
        );
      }
      await this.audit(client, tenant.tenantId, actor, "loyalty.points.expired", tenant.tenantId, {
        lots: lots.rows.length,
      });
      return { expiredLots: lots.rows.length };
    });
  }

  async processAutomations() {
    const campaigns = await this.database.pool.query<{
      id: string;
      tenant_id: string;
      automation_type: "birthday" | "inactivity";
      automation_points: number;
      inactivity_days: number | null;
    }>(
      "SELECT id,tenant_id,automation_type,automation_points,inactivity_days FROM loyalty_campaigns WHERE is_active=true AND automation_type IN ('birthday','inactivity') AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now())",
    );
    let processed = 0;
    for (const campaign of campaigns.rows) {
      const customers =
        campaign.automation_type === "birthday"
          ? await this.database.pool.query<{ id: string }>(
              "SELECT id FROM customers WHERE tenant_id=$1 AND is_active=true AND deleted_at IS NULL AND birth_date IS NOT NULL AND EXTRACT(MONTH FROM birth_date)=EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(DAY FROM birth_date)=EXTRACT(DAY FROM CURRENT_DATE)",
              [campaign.tenant_id],
            )
          : await this.database.pool.query<{ id: string }>(
              "SELECT c.id FROM customers c WHERE c.tenant_id=$1 AND c.is_active=true AND c.deleted_at IS NULL AND EXISTS (SELECT 1 FROM sales s WHERE s.tenant_id=c.tenant_id AND s.customer_id=c.id) AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.tenant_id=c.tenant_id AND s.customer_id=c.id AND s.created_at>=now()-($2::text || ' days')::interval)",
              [campaign.tenant_id, campaign.inactivity_days ?? 30],
            );
      for (const customer of customers.rows)
        processed += await this.grantAutomation(campaign, customer.id);
    }
    return { processed };
  }

  private async grantAutomation(
    campaign: { id: string; tenant_id: string; automation_type: string; automation_points: number },
    customerId: string,
  ) {
    const periodKey = new Date().toISOString().slice(0, 10);
    const created = await this.database.pool.query<{ id: string }>(
      "INSERT INTO loyalty_automation_runs (tenant_id,campaign_id,customer_id,automation_type,period_key) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id",
      [campaign.tenant_id, campaign.id, customerId, campaign.automation_type, periodKey],
    );
    if (!created.rowCount) return 0;
    const wallet = await this.database.pool.query<{ id: string }>(
      "INSERT INTO loyalty_wallets (tenant_id,customer_id,points_balance) VALUES ($1,$2,0) ON CONFLICT (tenant_id,customer_id) DO UPDATE SET updated_at=now() RETURNING id",
      [campaign.tenant_id, customerId],
    );
    await this.database.pool.query(
      "UPDATE loyalty_wallets SET points_balance=points_balance+$2,updated_at=now() WHERE id=$1",
      [wallet.rows[0]!.id, campaign.automation_points],
    );
    await this.database.pool.query(
      "INSERT INTO loyalty_ledger (tenant_id,wallet_id,movement_type,points,metadata) VALUES ($1,$2,'automation',$3,$4::jsonb)",
      [
        campaign.tenant_id,
        wallet.rows[0]!.id,
        campaign.automation_points,
        JSON.stringify({ campaignId: campaign.id, automationType: campaign.automation_type }),
      ],
    );
    return 1;
  }

  private async move(
    tenant: TenantContext,
    actor: string,
    input: { customerId: string; points: number; reason: string },
    type: "credit" | "debit",
  ) {
    const points = Math.floor(Number(input.points));
    const reason = input.reason?.trim();
    if (!input.customerId || !Number.isFinite(points) || points < 1 || !reason || reason.length < 3)
      throw new BadRequestException("Informe cliente, pontos positivos e motivo.");
    return this.database.tenantTransaction(tenant.tenantId, async (client) => {
      const customer = await client.query(
        "SELECT id FROM customers WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL",
        [input.customerId, tenant.tenantId],
      );
      if (!customer.rows[0]) throw new BadRequestException("Cliente não encontrado.");
      const wallet = await client.query<{ id: string; points_balance: number }>(
        "INSERT INTO loyalty_wallets (tenant_id,customer_id,points_balance) VALUES ($1,$2,0) ON CONFLICT (tenant_id,customer_id) DO UPDATE SET updated_at=now() RETURNING id,points_balance",
        [tenant.tenantId, input.customerId],
      );
      const current = wallet.rows[0]!;
      if (type === "debit" && current.points_balance < points)
        throw new BadRequestException("Saldo de pontos insuficiente.");
      const ledger = await client.query<{ id: string }>(
        "INSERT INTO loyalty_ledger (tenant_id,wallet_id,movement_type,points,metadata) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id",
        [
          tenant.tenantId,
          current.id,
          type,
          type === "credit" ? points : -points,
          JSON.stringify({ reason, actorUserId: actor }),
        ],
      );
      await client.query(
        "UPDATE loyalty_wallets SET points_balance=points_balance+$2,updated_at=now() WHERE id=$1",
        [current.id, type === "credit" ? points : -points],
      );
      if (type === "credit")
        await client.query(
          "INSERT INTO loyalty_point_lots (tenant_id,wallet_id,source_ledger_id,original_points,remaining_points) VALUES ($1,$2,$3,$4,$4)",
          [tenant.tenantId, current.id, ledger.rows[0]!.id, points],
        );
      if (type === "debit") {
        await consumeLots(client, tenant.tenantId, current.id, points);
        await client.query(
          "INSERT INTO loyalty_redemptions (tenant_id,wallet_id,amount,status) VALUES ($1,$2,0,'confirmed')",
          [tenant.tenantId, current.id],
        );
      }
      await this.audit(client, tenant.tenantId, actor, `loyalty.points.${type}`, current.id, {
        customerId: input.customerId,
        points,
        reason,
      });
      return { ok: true };
    });
  }

  private async audit(
    client: Pick<PoolClient, "query">,
    tenantId: string,
    actor: string,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await client.query(
      "INSERT INTO audit_logs (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,'loyalty_wallet',$4,$5::jsonb)",
      [tenantId, actor, action, entityId, JSON.stringify(metadata)],
    );
  }
}
function numberInRange(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function optionalInteger(value: unknown, min: number, max: number) {
  if (value === undefined || value === null || value === "") return null;
  return Math.floor(numberInRange(value, min, max, min));
}
function ids(value?: string[]) {
  return [
    ...new Set(
      (value ?? []).filter((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
      ),
    ),
  ];
}
async function ensureScopeIds(
  client: Pick<PoolClient, "query">,
  tenantId: string,
  table: "products" | "product_categories",
  values: string[],
) {
  if (!values.length) return;
  const result = await client.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL`,
    [tenantId, values],
  );
  if (result.rowCount !== values.length)
    throw new BadRequestException(
      "O escopo de produtos ou categorias informado não pertence a esta empresa.",
    );
}
async function consumeLots(
  client: Pick<PoolClient, "query">,
  tenantId: string,
  walletId: string,
  points: number,
) {
  const lots = await client.query<{ id: string; remaining_points: number }>(
    "SELECT id,remaining_points FROM loyalty_point_lots WHERE tenant_id=$1 AND wallet_id=$2 AND remaining_points>0 AND (expires_at IS NULL OR expires_at>=now()) ORDER BY expires_at NULLS LAST,created_at,id FOR UPDATE",
    [tenantId, walletId],
  );
  let pending = points;
  for (const lot of lots.rows) {
    if (pending <= 0) break;
    const used = Math.min(pending, lot.remaining_points);
    await client.query(
      "UPDATE loyalty_point_lots SET remaining_points=remaining_points-$2 WHERE id=$1",
      [lot.id, used],
    );
    pending -= used;
  }
  if (pending > 0)
    throw new BadRequestException(
      "O saldo disponível de pontos foi alterado. Atualize e tente novamente.",
    );
}
