import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import type { AsaasWebhookInput, SubscriptionCheckoutInput } from "@sgc/types";
import type { PoolClient, QueryResult } from "pg";
import { APP_CONFIG } from "../config/config.module";
import { DatabaseService } from "../database/database.service";
import type { TenantContext } from "../../shared/request-context";
import { ensureFound } from "../../shared/resource-access";

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

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
