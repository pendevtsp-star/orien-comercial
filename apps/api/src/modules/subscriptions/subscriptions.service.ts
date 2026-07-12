import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import type { AsaasWebhookInput, PublicSubscriptionCheckoutInput, SubscriptionCheckoutInput } from "@sgc/types";
import type { PoolClient, QueryResult } from "pg";
import { randomUUID } from "node:crypto";
import { APP_CONFIG } from "../config/config.module";
import { DatabaseService } from "../database/database.service";
import { PasswordService } from "../auth/password.service";
import type { TenantContext } from "../../shared/request-context";
import { ensureFound } from "../../shared/resource-access";

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PasswordService) private readonly passwordService: PasswordService
  ) {}

  async publicCheckout(input: PublicSubscriptionCheckoutInput) {
    const document = input.document.replace(/\D/g, "");
    if (![11, 14].includes(document.length)) throw new BadRequestException("Informe um CPF ou CNPJ válido.");
    const existingEmail = await this.database.pool.query("SELECT id FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL", [input.email]);
    if (existingEmail.rowCount) throw new BadRequestException("Este e-mail já possui uma conta. Entre no painel para contratar outro plano.");
    const plan = await this.database.pool.query<{ id: string; name: string; price_cents: number }>("SELECT id,name,price_cents FROM plans WHERE slug=$1 AND is_active=true", [input.planSlug]);
    if (!plan.rows[0]) throw new BadRequestException("Plano indisponível.");
    const selectedPlan = plan.rows[0];
    const coupon = await this.resolveCoupon(input.couponCode, input.planSlug, selectedPlan.price_cents);

    const client = await this.database.pool.connect();
    let context: TenantContext;
    try {
      await client.query("BEGIN");
      const slug = `${slugify(input.companyName).slice(0, 60) || "empresa"}-${randomUUID().slice(0, 8)}`;
      const tenant = await client.query<{ id: string }>("INSERT INTO tenants (name,slug,status,plan_slug) VALUES ($1,$2,'trial',$3) RETURNING id", [input.companyName, slug, input.planSlug]);
      const tenantId = tenant.rows[0]!.id;
      await client.query("INSERT INTO legal_entities (tenant_id,name,document,document_type) VALUES ($1,$2,$3,$4)", [tenantId, input.companyName, document, document.length === 11 ? "cpf" : "cnpj"]);
      await client.query("INSERT INTO branches (tenant_id,name,code,is_active) VALUES ($1,'Matriz','MATRIZ',true)", [tenantId]);
      const role = await client.query<{ id: string }>("INSERT INTO roles (tenant_id,slug,name,is_system) VALUES ($1,'owner','Proprietário',true) RETURNING id", [tenantId]);
      await client.query("INSERT INTO role_permissions (role_id,permission_id) SELECT $1,id FROM permissions ON CONFLICT DO NOTHING", [role.rows[0]!.id]);
      const user = await client.query<{ id: string }>("INSERT INTO users (email,name,password_hash,is_email_verified) VALUES ($1,$2,$3,false) RETURNING id", [input.email, input.ownerName, await this.passwordService.hashPassword(input.password, this.config.PASSWORD_PEPPER)]);
      const membership = await client.query<{ id: string }>("INSERT INTO memberships (tenant_id,user_id,role_id,status) VALUES ($1,$2,$3,'active') RETURNING id", [tenantId, user.rows[0]!.id, role.rows[0]!.id]);
      await client.query("INSERT INTO tenant_settings (tenant_id,key,value) VALUES ($1,'branding',$2::jsonb)", [tenantId, JSON.stringify({ companyName: input.companyName, primaryColor: "#0B1D3D", accentColor: "#F5C34A" })]);
      await client.query("COMMIT");
      context = { tenantId, userId: user.rows[0]!.id, membershipId: membership.rows[0]!.id, roleSlug: "owner", branchId: null, permissions: [] };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const amountCents = selectedPlan.price_cents - coupon.discountCents;
    if (amountCents < 100) throw new BadRequestException("O cupom deixa o valor da assinatura abaixo do mínimo permitido.");
    let checkoutUrl = buildMockCheckoutUrl(this.config.ASAAS_API_URL, context.tenantId, input.planSlug);
    let providerCheckoutId: string | null = null;
    if (this.config.ASAAS_API_KEY) {
      const nextDueDate = new Date(Date.now() + 86400000).toISOString();
      const response = await fetch(`${this.config.ASAAS_API_URL}/checkouts`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", access_token: this.config.ASAAS_API_KEY }, body: JSON.stringify({ billingTypes: ["PIX", "CREDIT_CARD"], chargeTypes: ["RECURRENT"], minutesToExpire: 1440, externalReference: context.tenantId, callback: { successUrl: "https://useorien.com.br/checkout?status=success", cancelUrl: "https://useorien.com.br/checkout?status=cancelled", expiredUrl: "https://useorien.com.br/checkout?status=expired" }, items: [{ externalReference: selectedPlan.id, name: `Orien ${selectedPlan.name}`, description: "Assinatura mensal Orien", quantity: 1, value: amountCents / 100 }], customerData: { name: input.ownerName, cpfCnpj: document, email: input.email }, subscription: { cycle: "MONTHLY", nextDueDate } }) });
      if (!response.ok) throw new BadRequestException("Não foi possível gerar o checkout de pagamento. Revise os dados informados.");
      const payload = await response.json() as { id?: string; link?: string };
      providerCheckoutId = payload.id ?? null;
      checkoutUrl = payload.link ?? checkoutUrl;
    }
    await this.database.pool.query("INSERT INTO subscriptions (tenant_id,plan_id,provider,status,checkout_url) VALUES ($1,$2,'asaas','pending_activation',$3)", [context.tenantId, selectedPlan.id, checkoutUrl]);
    if (coupon.id) await this.redeemCoupon(coupon.id, context.tenantId, coupon.discountCents);
    return { provider: "asaas", status: "pending_activation", checkoutUrl, providerCheckoutId, tenantId: context.tenantId, discountCents: coupon.discountCents, loginUrl: `${this.config.WEB_APP_URL}/login?email=${encodeURIComponent(input.email)}` };
  }

  async current(context: TenantContext) {
    const [subscription, plans, invoices] = await Promise.all([
      this.database.tenantQuery(
        context.tenantId,
        `
        SELECT
          s.id,
          s.status,
          s.provider,
          s.provider_subscription_id AS "providerSubscriptionId",
          s.checkout_url AS "checkoutUrl",
          s.external_customer_id AS "externalCustomerId",
          s.current_period_ends_at AS "currentPeriodEndsAt",
          p.slug AS "planSlug",
          p.name AS "planName",
          p.price_cents AS "priceCents"
        FROM subscriptions s
        LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.tenant_id = $1
        ORDER BY s.created_at DESC
        LIMIT 1
        `,
        [context.tenantId]
      ),
      this.database.tenantQuery(
        context.tenantId,
        "SELECT id, slug, name, price_cents AS \"priceCents\" FROM plans WHERE is_active = true ORDER BY price_cents ASC"
      ),
      this.database.tenantQuery(
        context.tenantId,
        `
        SELECT id, amount, due_date AS "dueDate", status, invoice_url AS "invoiceUrl", external_reference AS "externalReference"
        FROM subscription_invoices
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 20
        `,
        [context.tenantId]
      )
    ]);

    return {
      subscription: subscription.rows[0] ?? null,
      plans: plans.rows,
      invoices: invoices.rows,
      provider: { env: this.config.ASAAS_ENV }
    };
  }

  private async resolveCoupon(code: string | undefined, planSlug: string, priceCents: number) {
    if (!code) return { id: null as string | null, discountCents: 0 };
    const result = await this.database.pool.query<{ id: string; discount_type: "percent" | "fixed"; discount_value_cents: number; allowed_plan_slugs: string[]; max_redemptions: number | null; redemption_count: number }>("SELECT id,discount_type,discount_value_cents,allowed_plan_slugs,max_redemptions,redemption_count FROM saas_coupons WHERE upper(code)=upper($1) AND is_active=true AND (starts_at IS NULL OR starts_at<=now()) AND (expires_at IS NULL OR expires_at>now())", [code]);
    const coupon = result.rows[0];
    if (!coupon || (coupon.max_redemptions !== null && coupon.redemption_count >= coupon.max_redemptions)) throw new BadRequestException("Cupom inválido, expirado ou indisponível.");
    const allowedPlans = Array.isArray(coupon.allowed_plan_slugs) ? coupon.allowed_plan_slugs : [];
    if (allowedPlans.length && !allowedPlans.includes(planSlug)) throw new BadRequestException("Este cupom não é válido para o plano selecionado.");
    return { id: coupon.id, discountCents: Math.min(priceCents, coupon.discount_type === "percent" ? Math.round(priceCents * coupon.discount_value_cents / 100) : coupon.discount_value_cents) };
  }

  private async redeemCoupon(couponId: string, tenantId: string, discountCents: number) {
    const result = await this.database.pool.query("UPDATE saas_coupons SET redemption_count=redemption_count+1,updated_at=now() WHERE id=$1 AND is_active=true AND (max_redemptions IS NULL OR redemption_count<max_redemptions) RETURNING id", [couponId]);
    if (!result.rowCount) throw new BadRequestException("Este cupom não está mais disponível.");
    await this.database.pool.query("INSERT INTO saas_coupon_redemptions (coupon_id,tenant_id,discount_cents) VALUES ($1,$2,$3)", [couponId, tenantId, discountCents]);
  }

  async checkout(context: TenantContext, input: SubscriptionCheckoutInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const plan = await client.query<{ id: string; slug: string; name: string; price_cents: number }>(
        "SELECT id, slug, name, price_cents FROM plans WHERE slug = $1 AND is_active = true LIMIT 1",
        [input.planSlug]
      );
      const selectedPlan = ensureFound(plan.rows[0], "Plano");

      const tenant = await client.query<{ name: string; id: string; document: string | null }>(
        "SELECT id, name FROM tenants WHERE id = $1 AND deleted_at IS NULL",
        [context.tenantId]
      );
      const tenantRow = ensureFound(tenant.rows[0], "Tenant");
      const legalEntity = await client.query<{ document: string }>(
        "SELECT document FROM legal_entities WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1",
        [context.tenantId]
      );
      const document = legalEntity.rows[0]?.document.replace(/\D/g, "");
      if (!document || ![11, 14].includes(document.length)) {
        throw new BadRequestException("Cadastre o CPF ou CNPJ da empresa antes de iniciar a assinatura.");
      }

      let providerSubscriptionId: string | null = null;
      let checkoutUrl = buildMockCheckoutUrl(this.config.ASAAS_API_URL, context.tenantId, selectedPlan.slug);
      let externalCustomerId: string | null = null;

      if (this.config.ASAAS_API_KEY) {
        const customerPayload = {
          name: tenantRow.name,
          cpfCnpj: document,
          externalReference: context.tenantId
        };
        const customerResponse = await fetch(`${this.config.ASAAS_API_URL}/customers`, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            access_token: this.config.ASAAS_API_KEY
          },
          body: JSON.stringify(customerPayload)
        });

        if (customerResponse.ok) {
          const customerData = (await customerResponse.json()) as { id?: string };
          externalCustomerId = customerData.id ?? null;
        }

        if (!externalCustomerId) throw new Error("Não foi possível criar o cliente no Asaas.");
        const subscriptionResponse = await fetch(`${this.config.ASAAS_API_URL}/subscriptions`, {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json", access_token: this.config.ASAAS_API_KEY },
          body: JSON.stringify({ customer: externalCustomerId, billingType: input.billingType, value: selectedPlan.price_cents / 100, cycle: "MONTHLY", nextDueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), externalReference: context.tenantId, description: `Orien ${selectedPlan.name}` })
        });
        if (!subscriptionResponse.ok) throw new Error("O Asaas recusou o checkout. Revise as credenciais e o cadastro.");
        const subscriptionData = (await subscriptionResponse.json()) as { id?: string; invoiceUrl?: string };
        providerSubscriptionId = subscriptionData.id ?? null;
        if (!providerSubscriptionId) throw new Error("O Asaas não retornou o identificador da assinatura.");
        checkoutUrl = subscriptionData.invoiceUrl ?? buildHostedSubscriptionUrl(this.config.ASAAS_API_URL, providerSubscriptionId);
      }

      const existing = await client.query<{ id: string }>(
        "SELECT id FROM subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1",
        [context.tenantId]
      );

      const subscription: { id: string; status: string; checkoutUrl: string | null } | undefined = existing.rows[0]
        ? (
            await client.query<{ id: string; status: string; checkoutUrl: string | null }>(
              `
              UPDATE subscriptions
              SET plan_id = $2, provider_subscription_id = $3, status = 'pending_activation', checkout_url = $4, external_customer_id = $5, updated_at = now()
              WHERE id = $1
              RETURNING id, status, checkout_url AS "checkoutUrl"
              `,
              [existing.rows[0].id, selectedPlan.id, providerSubscriptionId, checkoutUrl, externalCustomerId]
            )
          ).rows[0]
        : (
            await client.query<{ id: string; status: string; checkoutUrl: string | null }>(
              `
              INSERT INTO subscriptions (tenant_id, plan_id, provider, provider_subscription_id, status, checkout_url, external_customer_id)
              VALUES ($1, $2, 'asaas', $3, 'pending_activation', $4, $5)
              RETURNING id, status, checkout_url AS "checkoutUrl"
              `,
              [context.tenantId, selectedPlan.id, providerSubscriptionId, checkoutUrl, externalCustomerId]
            )
          ).rows[0];

      const ensuredSubscription = ensureFound(subscription, "Assinatura");

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: "subscription.checkout.started",
        entityType: "subscription",
        entityId: ensuredSubscription.id,
        metadata: { planSlug: selectedPlan.slug, billingType: input.billingType }
      });

      return {
        ...ensuredSubscription,
        provider: "asaas",
        plan: { slug: selectedPlan.slug, name: selectedPlan.name, priceCents: selectedPlan.price_cents }
      };
    });
  }

  async handleAsaasWebhook(payload: AsaasWebhookInput, token?: string) {
    if (this.config.ASAAS_WEBHOOK_TOKEN && token !== this.config.ASAAS_WEBHOOK_TOKEN) {
      throw new ForbiddenException("Webhook token invalido.");
    }

    const eventId = payload.id;
    const client = await this.database.pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query("SELECT id, status FROM webhook_events WHERE provider = 'asaas' AND event_id = $1", [eventId]);
      if (existing.rowCount) {
        await client.query("COMMIT");
        return { ok: true, duplicated: true };
      }

      const tenantId = payload.payment?.externalReference || payload.payment?.customer || payload.payment?.subscription || null;
      const tenantLookup: QueryResult<{ tenant_id: string }> | null = tenantId
        ? await client.query<{ tenant_id: string }>(
            `
            SELECT tenant_id
            FROM subscriptions
            WHERE external_customer_id = $1 OR provider_subscription_id = $1
            UNION ALL
            SELECT id AS tenant_id FROM tenants WHERE id::text = $1 AND deleted_at IS NULL
            LIMIT 1
            `,
            [tenantId]
          )
        : null;
      const resolvedTenantId = tenantLookup?.rows[0]?.tenant_id ?? null;

      await client.query(
        `
        INSERT INTO webhook_events (tenant_id, provider, event_id, event_type, payload, status, attempts)
        VALUES ($1, 'asaas', $2, $3, $4::jsonb, 'processed', 1)
        `,
        [resolvedTenantId, eventId, payload.event, JSON.stringify(payload)]
      );

      if (resolvedTenantId && payload.payment?.subscription) {
        await client.query(
          `
          UPDATE subscriptions
          SET status = $2, last_webhook_event_id = $3, updated_at = now()
          WHERE tenant_id = $1 AND provider_subscription_id = $4
          `,
          [resolvedTenantId, normalizeSubscriptionStatus(payload.payment.status), eventId, payload.payment.subscription]
        );
      }

      if (resolvedTenantId && payload.payment?.id) {
        await client.query(
          `
          INSERT INTO subscription_invoices (tenant_id, subscription_id, provider_invoice_id, amount, status, invoice_url, external_reference)
          SELECT $1, s.id, $2, $3, $4, $5, $6
          FROM subscriptions s
          WHERE s.tenant_id = $1
          ORDER BY s.created_at DESC
          LIMIT 1
          ON CONFLICT (provider_invoice_id) WHERE provider_invoice_id IS NOT NULL DO UPDATE
          SET status = EXCLUDED.status, amount = EXCLUDED.amount, invoice_url = EXCLUDED.invoice_url, updated_at = now()
          `,
          [
            resolvedTenantId,
            payload.payment.id,
            payload.payment.value ?? 0,
            normalizeInvoiceStatus(payload.payment.status),
            payload.payment.invoiceUrl ?? null,
            payload.payment.externalReference ?? payload.payment.subscription ?? payload.payment.customer ?? payload.payment.id
          ]
        );
      }

      await client.query("COMMIT");
      return { ok: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export function normalizeSubscriptionStatus(status?: string) {
  if (!status) return "active";
  const normalized = status.toLowerCase();
  if (normalized.includes("overdue")) return "past_due";
  if (normalized.includes("pending")) return "pending_activation";
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("received") || normalized.includes("confirmed")) return "active";
  return normalized;
}

export function normalizeInvoiceStatus(status?: string) {
  if (!status) return "pending";
  const normalized = status.toLowerCase();
  if (normalized.includes("received") || normalized.includes("confirmed")) return "paid";
  if (normalized.includes("overdue")) return "overdue";
  if (normalized.includes("cancel")) return "cancelled";
  return "pending";
}

export function buildMockCheckoutUrl(apiUrl: string, tenantId: string, planSlug: string) {
  return `${apiUrl.replace("/api/v3", "")}/checkout/mock?tenant=${tenantId}&plan=${planSlug}`;
}

export function buildHostedSubscriptionUrl(apiUrl: string, providerSubscriptionId: string) {
  return `${apiUrl.replace("/api/v3", "")}/subscription/${providerSubscriptionId}`;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
