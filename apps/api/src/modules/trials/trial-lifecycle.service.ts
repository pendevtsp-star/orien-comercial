import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import { APP_CONFIG } from "../config/config.module";
import { DatabaseService } from "../database/database.service";

type TrialEmail = {
  id: string;
  eventType: "welcome" | "ending_soon" | "expired";
  recipient: string;
  ownerName: string | null;
  tenantName: string;
  trialEndsAt: Date | null;
};

@Injectable()
export class TrialLifecycleService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit() {
    const initial = setTimeout(() => void this.processDue(), 10_000);
    initial.unref();
    this.timer = setInterval(() => void this.processDue(), 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processDue() {
    await this.queueDueEvents();
    if (!this.config.RESEND_API_KEY) return { queued: true, sent: 0, providerConfigured: false };

    const pending = await this.database.pool.query<TrialEmail>(
      `SELECT e.id,e.event_type AS "eventType",e.recipient,u.name AS "ownerName",t.name AS "tenantName",s.trial_ends_at AS "trialEndsAt"
       FROM trial_lifecycle_events e
       JOIN subscriptions s ON s.id=e.subscription_id
       JOIN tenants t ON t.id=e.tenant_id
       JOIN memberships m ON m.tenant_id=t.id AND m.status='active' AND m.deleted_at IS NULL
       JOIN roles r ON r.id=m.role_id AND r.slug='owner'
       JOIN users u ON u.id=m.user_id AND u.deleted_at IS NULL
       WHERE e.status IN ('pending','failed')
       ORDER BY e.created_at ASC
       LIMIT 100`,
    );

    let sent = 0;
    for (const event of pending.rows) {
      const result = await this.send(event);
      await this.database.pool.query(
        "UPDATE trial_lifecycle_events SET status=$2,failure_reason=$3,sent_at=CASE WHEN $2='sent' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1",
        [event.id, result.ok ? "sent" : "failed", result.reason ?? null],
      );
      if (result.ok) sent++;
    }
    return { queued: true, sent, providerConfigured: true };
  }

  private async queueDueEvents() {
    await this.database.pool.query(
      `INSERT INTO trial_lifecycle_events (subscription_id,tenant_id,event_type,recipient)
       SELECT s.id,s.tenant_id,'welcome',u.email
       FROM subscriptions s
       JOIN memberships m ON m.tenant_id=s.tenant_id AND m.status='active' AND m.deleted_at IS NULL
       JOIN roles r ON r.id=m.role_id AND r.slug='owner'
       JOIN users u ON u.id=m.user_id AND u.deleted_at IS NULL
       WHERE s.status='trial'
       ON CONFLICT (subscription_id,event_type) DO NOTHING`,
    );
    await this.database.pool.query(
      `INSERT INTO trial_lifecycle_events (subscription_id,tenant_id,event_type,recipient)
       SELECT s.id,s.tenant_id,'ending_soon',u.email
       FROM subscriptions s
       JOIN memberships m ON m.tenant_id=s.tenant_id AND m.status='active' AND m.deleted_at IS NULL
       JOIN roles r ON r.id=m.role_id AND r.slug='owner'
       JOIN users u ON u.id=m.user_id AND u.deleted_at IS NULL
       WHERE s.status='trial' AND s.trial_ends_at>now() AND s.trial_ends_at<=now()+interval '3 days'
       ON CONFLICT (subscription_id,event_type) DO NOTHING`,
    );
    const expired = await this.database.pool.query<{ id: string; tenant_id: string }>(
      "UPDATE subscriptions SET status='expired',updated_at=now() WHERE status='trial' AND trial_ends_at<=now() RETURNING id,tenant_id",
    );
    for (const subscription of expired.rows) {
      await this.database.pool.query("UPDATE tenants SET status='suspended',updated_at=now() WHERE id=$1 AND status='trial'", [subscription.tenant_id]);
    }
    await this.database.pool.query(
      `INSERT INTO trial_lifecycle_events (subscription_id,tenant_id,event_type,recipient)
       SELECT s.id,s.tenant_id,'expired',u.email
       FROM subscriptions s
       JOIN memberships m ON m.tenant_id=s.tenant_id AND m.status='active' AND m.deleted_at IS NULL
       JOIN roles r ON r.id=m.role_id AND r.slug='owner'
       JOIN users u ON u.id=m.user_id AND u.deleted_at IS NULL
       WHERE s.status='expired'
       ON CONFLICT (subscription_id,event_type) DO NOTHING`,
    );
  }

  private async send(event: TrialEmail) {
    const owner = escapeHtml(event.ownerName || "Olá");
    const tenant = escapeHtml(event.tenantName);
    const end = event.trialEndsAt ? new Date(event.trialEndsAt).toLocaleDateString("pt-BR") : "em breve";
    const content = event.eventType === "welcome"
      ? { subject: "Seu teste gratuito Orien começou", title: `Bem-vindo(a) à Orien, ${owner}`, text: `O teste gratuito de ${tenant} está ativo por 7 dias. Configure sua operação e explore a plataforma sem cobrança inicial.` }
      : event.eventType === "ending_soon"
        ? { subject: "Seu teste Orien termina em breve", title: "Seu período de teste está quase no fim", text: `O acesso de ${tenant} fica disponível até ${end}. Escolha um plano para manter a operação sem interrupção.` }
        : { subject: "Seu teste Orien foi encerrado", title: "Seu período de teste foi encerrado", text: `O acesso de ${tenant} foi pausado. Entre na plataforma para escolher um plano e reativar a operação.` };
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `Orien <${this.config.EMAIL_FROM}>`,
          reply_to: this.config.SUPPORT_EMAIL,
          to: [event.recipient],
          subject: `Orien · ${content.subject}`,
          html: `<main style="font-family:Arial,sans-serif;color:#0b1d3d;max-width:620px;margin:auto"><p style="color:#d6a100;font-weight:700;letter-spacing:.12em">ORIEN</p><h1>${content.title}</h1><p style="font-size:16px;line-height:1.6">${content.text}</p><p><a href="${this.config.WEB_APP_URL}/subscription" style="display:inline-block;background:#0b1d3d;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Acessar minha assinatura</a></p><hr style="border:0;border-top:1px solid #d9e1ee"><small>Gestão inteligente para negócios em crescimento.</small></main>`,
        }),
      });
      return response.ok ? { ok: true } : { ok: false, reason: `Resend respondeu ${response.status}` };
    } catch {
      return { ok: false, reason: "Não foi possível conectar ao serviço de e-mail." };
    }
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}
