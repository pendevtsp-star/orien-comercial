import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import type { AppConfig } from "@sgc/config";
import { APP_CONFIG } from "../config/config.module";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class PlatformService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async assertOwner(userId: string, sessionId?: string, requireMfa = true) {
    const row = await this.database.pool.query<{
      email: string;
      active: boolean;
      mfa_enabled: boolean;
    }>(
      `SELECT u.email,COALESCE(pa.is_active,false) active,COALESCE(pa.mfa_enabled,false) mfa_enabled FROM users u LEFT JOIN platform_admins pa ON pa.user_id=u.id WHERE u.id=$1 AND u.deleted_at IS NULL`,
      [userId],
    );
    if (
      !row.rows[0] ||
      (row.rows[0].email.toLowerCase() !== this.config.PLATFORM_OWNER_EMAIL.toLowerCase() &&
        !row.rows[0].active)
    )
      throw new ForbiddenException("Acesso restrito ao backoffice Orien.");
    if (requireMfa && row.rows[0].mfa_enabled && sessionId) {
      const session = await this.database.pool.query(
        "SELECT mfa_verified_at FROM sessions WHERE id=$1",
        [sessionId],
      );
      if (!session.rows[0]?.mfa_verified_at)
        throw new ForbiddenException(
          "Confirme o código do autenticador para acessar o backoffice.",
        );
    }
  }
  async mfaSetup(userId: string) {
    await this.assertOwner(userId, undefined, false);
    const existing = await this.database.pool.query<{
      mfa_enabled: boolean;
      mfa_secret_encrypted: string | null;
    }>("SELECT mfa_enabled,mfa_secret_encrypted FROM platform_admins WHERE user_id=$1", [userId]);
    const alreadyConfigured = Boolean(existing.rows[0]?.mfa_secret_encrypted);
    if (existing.rows[0]?.mfa_enabled) {
      throw new BadRequestException(
        "O MFA já está ativo. Use o fluxo de redefinição somente em caso de perda do autenticador.",
      );
    }
    const secret = alreadyConfigured
      ? this.decrypt(existing.rows[0]!.mfa_secret_encrypted!)
      : base32(randomBytes(20));
    const recovery = alreadyConfigured
      ? []
      : Array.from({ length: 8 }, () => randomBytes(5).toString("hex").toUpperCase());
    const user = await this.database.pool.query<{ email: string }>(
      "SELECT email FROM users WHERE id=$1",
      [userId],
    );
    const issuer = "Orien Admin",
      account = user.rows[0]?.email ?? "operator";
    const otpauthUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    if (!alreadyConfigured) {
      await this.database.pool.query(
        `INSERT INTO platform_admins (user_id,role,is_active,mfa_required,mfa_enabled,mfa_secret_encrypted,recovery_code_hashes) VALUES ($1,'superadmin',true,true,false,$2,$3::jsonb) ON CONFLICT (user_id) DO UPDATE SET mfa_secret_encrypted=EXCLUDED.mfa_secret_encrypted,recovery_code_hashes=EXCLUDED.recovery_code_hashes,mfa_enabled=false,updated_at=now()`,
        [
          userId,
          this.encrypt(secret),
          JSON.stringify(recovery.map((code) => hashRecoveryCode(code))),
        ],
      );
      await this.audit(userId, "platform.mfa.enrollment.started", "platform_admin", userId, {});
    }
    return {
      secret,
      recoveryCodes: recovery,
      issuer,
      alreadyConfigured,
      otpauthUri,
      qrCodeDataUrl: await QRCode.toDataURL(otpauthUri, {
        margin: 1,
        width: 220,
        color: { dark: "#081427", light: "#ffffff" },
      }),
    };
  }
  async mfaVerify(userId: string, sessionId: string, code: string) {
    await this.assertOwner(userId, undefined, false);
    const row = await this.database.pool.query<{
      mfa_secret_encrypted: string | null;
      recovery_code_hashes: string[] | null;
    }>("SELECT mfa_secret_encrypted,recovery_code_hashes FROM platform_admins WHERE user_id=$1", [
      userId,
    ]);
    if (!row.rows[0]?.mfa_secret_encrypted)
      throw new BadRequestException("Configure o autenticador primeiro.");
    const secret = this.decrypt(row.rows[0].mfa_secret_encrypted),
      value = code.replace(/[\s-]/g, "").toUpperCase(),
      recoveryCodes = Array.isArray(row.rows[0].recovery_code_hashes)
        ? row.rows[0].recovery_code_hashes
        : [];
    const validTotp = [-1, 0, 1].some((offset) => totp(secret, offset) === value);
    const recoveryHash = hashRecoveryCode(value),
      validRecovery = recoveryCodes.includes(recoveryHash);
    if (!validTotp && !validRecovery) throw new ForbiddenException("Código MFA inválido.");
    if (validRecovery)
      await this.database.pool.query(
        "UPDATE platform_admins SET recovery_code_hashes=$2::jsonb,updated_at=now() WHERE user_id=$1",
        [userId, JSON.stringify(recoveryCodes.filter((item) => item !== recoveryHash))],
      );
    await this.database.pool.query(
      "UPDATE platform_admins SET mfa_enabled=true,updated_at=now() WHERE user_id=$1",
      [userId],
    );
    await this.database.pool.query(
      "UPDATE sessions SET mfa_verified_at=now() WHERE id=$1 AND user_id=$2",
      [sessionId, userId],
    );
    await this.audit(
      userId,
      validRecovery ? "platform.mfa.recovery_code.used" : "platform.mfa.verified",
      "platform_admin",
      userId,
      {},
    );
    return { ok: true, usedRecoveryCode: validRecovery };
  }
  async mfaStatus(userId: string, sessionId?: string) {
    await this.assertOwner(userId, undefined, false);
    const result = await this.database.pool.query<{
      mfa_enabled: boolean;
      mfa_required: boolean;
      recovery_codes: number;
      mfa_configured: boolean;
    }>(
      "SELECT mfa_enabled,mfa_required,mfa_secret_encrypted IS NOT NULL AS mfa_configured,jsonb_array_length(recovery_code_hashes)::int recovery_codes FROM platform_admins WHERE user_id=$1",
      [userId],
    );
    const status = result.rows[0] ?? {
      mfa_enabled: false,
      mfa_required: true,
      mfa_configured: false,
      recovery_codes: 0,
    };
    if (!sessionId) return { ...status, sessionVerified: false };
    const session = await this.database.pool.query<{ verified: boolean }>(
      "SELECT mfa_verified_at IS NOT NULL AS verified FROM sessions WHERE id=$1 AND user_id=$2",
      [sessionId, userId],
    );
    return { ...status, sessionVerified: Boolean(session.rows[0]?.verified) };
  }
  async resetMfa(actor: string, userId: string) {
    await this.database.pool.query(
      "UPDATE platform_admins SET mfa_enabled=false,mfa_secret_encrypted=NULL,recovery_code_hashes='[]'::jsonb,updated_at=now() WHERE user_id=$1",
      [userId],
    );
    await this.database.pool.query("UPDATE sessions SET mfa_verified_at=NULL WHERE user_id=$1", [
      userId,
    ]);
    await this.audit(actor, "platform.mfa.reset", "platform_admin", userId, {});
    return { ok: true };
  }
  async overview() {
    const [tenants, active, users, sessions, mrr, overdue, webhooks] = await Promise.all([
      q(this.database, "SELECT count(*)::int total FROM tenants WHERE deleted_at IS NULL"),
      q(
        this.database,
        "SELECT count(*)::int total FROM tenants WHERE status='active' AND deleted_at IS NULL",
      ),
      q(this.database, "SELECT count(*)::int total FROM users WHERE deleted_at IS NULL"),
      q(
        this.database,
        "SELECT count(*)::int total FROM sessions WHERE revoked_at IS NULL AND expires_at>now()",
      ),
      q(
        this.database,
        "SELECT COALESCE(sum(p.price_cents),0)::int total FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.status IN ('active','trial') AND COALESCE(s.is_complimentary,false)=false",
      ),
      q(
        this.database,
        "SELECT count(*)::int total FROM subscriptions WHERE status IN ('past_due','overdue')",
      ),
      q(
        this.database,
        "SELECT count(*)::int total FROM webhook_events WHERE status<>'processed' OR created_at>now()-interval '24 hours'",
      ),
    ]);
    return {
      tenants: tenants.total,
      activeTenants: active.total,
      users: users.total,
      activeSessions: sessions.total,
      mrrCents: mrr.total,
      overdueSubscriptions: overdue.total,
      recentWebhookEvents: webhooks.total,
    };
  }
  async tenants() {
    const result = await this.database.pool.query(
      `SELECT t.id,t.name,t.slug,t.status,t.plan_slug AS "planSlug",t.created_at AS "createdAt",count(DISTINCT m.id)::int AS "membersCount",count(DISTINCT s.id)::int AS "subscriptionsCount" FROM tenants t LEFT JOIN memberships m ON m.tenant_id=t.id AND m.status='active' AND m.deleted_at IS NULL LEFT JOIN subscriptions s ON s.tenant_id=t.id WHERE t.deleted_at IS NULL GROUP BY t.id ORDER BY t.created_at DESC`,
    );
    return { data: result.rows };
  }
  async tenantDetail(id: string) {
    const [tenant, members, branches, integrations, recentSales] = await Promise.all([
      this.database.pool.query(
        `SELECT id,name,slug,status,plan_slug AS "planSlug",created_at AS "createdAt" FROM tenants WHERE id=$1 AND deleted_at IS NULL`,
        [id],
      ),
      qp(
        this.database,
        "SELECT count(*)::int total FROM memberships WHERE tenant_id=$1 AND status='active' AND deleted_at IS NULL",
        [id],
      ),
      qp(
        this.database,
        "SELECT count(*)::int total FROM branches WHERE tenant_id=$1 AND deleted_at IS NULL",
        [id],
      ),
      this.database.pool.query(
        `SELECT provider,status,updated_at AS "updatedAt" FROM tenant_integrations WHERE tenant_id=$1`,
        [id],
      ),
      qp(
        this.database,
        "SELECT count(*)::int total FROM sales WHERE tenant_id=$1 AND status='sold' AND created_at>now()-interval '30 days'",
        [id],
      ),
    ]);
    if (!tenant.rows[0]) throw new BadRequestException("Tenant não encontrado.");
    return {
      tenant: tenant.rows[0],
      members: members.total,
      branches: branches.total,
      integrations: integrations.rows,
      salesLast30Days: recentSales.total,
    };
  }
  async updateTenant(actor: string, id: string, status: string) {
    if (!["trial", "active", "past_due", "suspended", "cancelled"].includes(status))
      throw new BadRequestException("Status inválido.");
    const updated = await this.database.pool.query(
      "UPDATE tenants SET status=$2,updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id,name,status",
      [id, status],
    );
    if (!updated.rows[0]) throw new BadRequestException("Tenant não encontrado.");
    await this.audit(actor, "tenant.status.updated", "tenant", id, { status });
    return updated.rows[0];
  }
  async billing() {
    const result = await this.database.pool.query(
      `SELECT t.name AS "tenantName",s.status,p.name AS "planName",p.price_cents AS "priceCents",s.current_period_ends_at AS "periodEndsAt",COALESCE(s.is_lifetime,false) AS "isLifetime",COALESCE(s.is_complimentary,false) AS "isComplimentary",s.provider,s.external_customer_id AS "externalCustomerId",s.lifetime_granted_at AS "lifetimeGrantedAt",s.lifetime_note AS "lifetimeNote" FROM subscriptions s JOIN tenants t ON t.id=s.tenant_id LEFT JOIN plans p ON p.id=s.plan_id ORDER BY s.updated_at DESC LIMIT 100`,
    );
    return { data: result.rows };
  }
  async updatePlan(actor: string, tenantId: string, planSlug: string) {
    const plan = await this.database.pool.query<{ id: string }>(
      "SELECT id FROM plans WHERE slug=$1 AND active=true",
      [planSlug],
    );
    if (!plan.rows[0]) throw new BadRequestException("Plano inválido.");
    const result = await this.database.pool.query(
      "UPDATE subscriptions SET plan_id=$2,updated_at=now() WHERE tenant_id=$1 RETURNING id",
      [tenantId, plan.rows[0].id],
    );
    if (!result.rows[0]) throw new BadRequestException("Assinatura não encontrada.");
    await this.database.pool.query("UPDATE tenants SET plan_slug=$2,updated_at=now() WHERE id=$1", [
      tenantId,
      planSlug,
    ]);
    await this.audit(actor, "subscription.plan.updated", "tenant", tenantId, { planSlug });
    return { ok: true };
  }
  async extendTrial(actor: string, tenantId: string, days: number) {
    const safeDays = Math.max(1, Math.min(90, Math.floor(days || 7)));
    const result = await this.database.pool.query(
      "UPDATE subscriptions SET status='trial',current_period_ends_at=GREATEST(COALESCE(current_period_ends_at,now()),now()) + ($2::int * interval '1 day'),updated_at=now() WHERE tenant_id=$1 RETURNING id",
      [tenantId, safeDays],
    );
    if (!result.rows[0]) throw new BadRequestException("Assinatura não encontrada.");
    await this.database.pool.query(
      "UPDATE tenants SET status='trial',updated_at=now() WHERE id=$1",
      [tenantId],
    );
    await this.audit(actor, "subscription.trial.extended", "tenant", tenantId, { days: safeDays });
    return { ok: true };
  }
  async setLifetimeAccess(
    actor: string,
    tenantId: string,
    input: { enabled: boolean; planSlug?: string; note?: string },
  ) {
    const note = (input.note ?? "").trim().slice(0, 500);
    if (input.enabled) {
      const plan = await this.database.pool.query<{ id: string; slug: string }>(
        "SELECT id,slug FROM plans WHERE slug='enterprise' AND is_active=true",
      );
      if (!plan.rows[0]) throw new BadRequestException("Plano Enterprise não está disponível.");
      const result = await this.database.pool.query(
        "UPDATE subscriptions SET plan_id=$2,provider='manual',provider_subscription_id=NULL,external_customer_id=NULL,checkout_url=NULL,status='active',is_lifetime=true,is_complimentary=true,lifetime_granted_at=now(),lifetime_note=$3,current_period_ends_at=NULL,updated_at=now() WHERE tenant_id=$1 RETURNING id",
        [tenantId, plan.rows[0].id, note || null],
      );
      if (!result.rows[0]) throw new BadRequestException("Assinatura não encontrada.");
      await this.database.pool.query(
        "UPDATE tenants SET status='active',plan_slug=$2,updated_at=now() WHERE id=$1",
        [tenantId, plan.rows[0].slug],
      );
      await this.audit(actor, "subscription.lifetime.granted", "tenant", tenantId, {
        planSlug: plan.rows[0].slug,
        provider: "manual",
        note,
      });
      return { ok: true, isLifetime: true, provider: "manual" };
    }
    const result = await this.database.pool.query(
      "UPDATE subscriptions SET is_lifetime=false,is_complimentary=false,lifetime_granted_at=NULL,lifetime_note=NULL,updated_at=now() WHERE tenant_id=$1 RETURNING id",
      [tenantId],
    );
    if (!result.rows[0]) throw new BadRequestException("Assinatura não encontrada.");
    await this.audit(actor, "subscription.lifetime.revoked", "tenant", tenantId, { note });
    return { ok: true, isLifetime: false };
  }
  async supportNotes(tenantId: string) {
    const result = await this.database.pool.query(
      `SELECT n.id,n.body,n.created_at AS "createdAt",u.name AS "authorName" FROM platform_support_notes n LEFT JOIN users u ON u.id=n.author_user_id WHERE n.tenant_id=$1 ORDER BY n.created_at DESC`,
      [tenantId],
    );
    return { data: result.rows };
  }
  async addSupportNote(actor: string, tenantId: string, body: string) {
    if (body.trim().length < 3) throw new BadRequestException("Nota muito curta.");
    const result = await this.database.pool.query(
      'INSERT INTO platform_support_notes (tenant_id,author_user_id,body) VALUES ($1,$2,$3) RETURNING id,body,created_at AS "createdAt"',
      [tenantId, actor, body.trim()],
    );
    await this.audit(actor, "support.note.created", "tenant", tenantId, {});
    return result.rows[0];
  }
  async health() {
    const [failed, integrations, backups, recentErrors] = await Promise.all([
      q(this.database, "SELECT count(*)::int total FROM webhook_events WHERE status<>'processed'"),
      q(
        this.database,
        "SELECT count(*)::int total FROM tenant_integrations WHERE status='disabled'",
      ),
      q(
        this.database,
        "SELECT count(*)::int total FROM sessions WHERE revoked_at IS NULL AND expires_at>now()",
      ),
      q(
        this.database,
        "SELECT count(*)::int total FROM platform_error_events WHERE created_at>now()-interval '24 hours'",
      ),
    ]);
    return {
      api: "operational",
      database: "operational",
      redis: "operational",
      failedWebhooks: failed.total,
      disabledIntegrations: integrations.total,
      activeSessions: backups.total,
      recentApiErrors: recentErrors.total,
    };
  }
  async errors() {
    const result = await this.database.pool.query(
      `SELECT id,request_id AS "requestId",method,path,status_code AS "statusCode",error_code AS "errorCode",message,user_agent AS "userAgent",created_at AS "createdAt"
       FROM platform_error_events
       ORDER BY created_at DESC
       LIMIT 100`,
    );
    return { data: result.rows };
  }
  async retryWebhook(actor: string, id: string) {
    const result = await this.database.pool.query(
      "UPDATE webhook_events SET status='pending',attempts=attempts+1 WHERE id=$1 RETURNING id",
      [id],
    );
    if (!result.rows[0]) throw new BadRequestException("Webhook não encontrado.");
    await this.audit(actor, "webhook.retry.requested", "webhook_event", id, {});
    return { ok: true, message: "Webhook colocado na fila para reprocessamento." };
  }
  async webhooks(status?: string) {
    const result = await this.database.pool.query(
      `SELECT id,provider,event_type AS "eventType",status,attempts,created_at AS "createdAt" FROM webhook_events ${status ? "WHERE status=$1" : ""} ORDER BY created_at DESC LIMIT 100`,
      status ? [status] : [],
    );
    return { data: result.rows };
  }
  async staff() {
    const result = await this.database.pool.query(
      `SELECT pa.id,u.email,u.name,pa.role,pa.is_active AS "isActive",pa.mfa_required AS "mfaRequired",pa.created_at AS "createdAt" FROM platform_admins pa JOIN users u ON u.id=pa.user_id ORDER BY pa.created_at DESC`,
    );
    return { data: result.rows };
  }
  async addStaff(actor: string, email: string, role: string) {
    if (!["superadmin", "support", "finance", "operations"].includes(role))
      throw new BadRequestException("Perfil interno inválido.");
    const user = await this.database.pool.query<{ id: string }>(
      "SELECT id FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL",
      [email],
    );
    if (!user.rows[0])
      throw new BadRequestException(
        "Crie ou convide o usuário antes de torná-lo operador interno.",
      );
    const result = await this.database.pool.query(
      `INSERT INTO platform_admins (user_id,role,is_active,mfa_required) VALUES ($1,$2,true,true) ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role,is_active=true,mfa_required=true,updated_at=now() RETURNING id`,
      [user.rows[0].id, role],
    );
    await this.audit(actor, "platform.staff.granted", "platform_admin", result.rows[0].id, {
      email,
      role,
    });
    return { ok: true };
  }
  async updateStaff(actor: string, id: string, isActive: boolean) {
    const result = await this.database.pool.query(
      "UPDATE platform_admins SET is_active=$2,updated_at=now() WHERE id=$1 RETURNING id,user_id",
      [id, isActive],
    );
    if (!result.rows[0]) throw new BadRequestException("Operador não encontrado.");
    await this.audit(actor, "platform.staff.updated", "platform_admin", id, { isActive });
    return { ok: true };
  }
  async startSupportSession(actor: string, tenantId: string, reason: string) {
    if (reason.trim().length < 8)
      throw new BadRequestException("Informe um motivo com ao menos oito caracteres.");
    const result = await this.database.pool.query(
      'INSERT INTO platform_support_sessions (tenant_id,operator_user_id,reason) VALUES ($1,$2,$3) RETURNING id,expires_at AS "expiresAt"',
      [tenantId, actor, reason.trim()],
    );
    await this.audit(actor, "support.session.started", "tenant", tenantId, {
      supportSessionId: result.rows[0].id,
      reason: reason.trim(),
    });
    return {
      ...result.rows[0],
      message:
        "Sessão assistida registrada. O acesso em nome do cliente continua bloqueado até a aprovação explícita do fluxo de suporte.",
    };
  }
  async endSupportSession(actor: string, id: string) {
    const result = await this.database.pool.query(
      "UPDATE platform_support_sessions SET status='ended',ended_at=now() WHERE id=$1 AND status='active' RETURNING tenant_id",
      [id],
    );
    if (!result.rows[0])
      throw new BadRequestException("Sessão assistida não encontrada ou já encerrada.");
    await this.audit(actor, "support.session.ended", "tenant", result.rows[0].tenant_id, {
      supportSessionId: id,
    });
    return { ok: true };
  }
  async supportSessions(tenantId?: string) {
    const result = await this.database.pool.query(
      `SELECT ps.id,ps.tenant_id AS "tenantId",t.name AS "tenantName",u.name AS "operatorName",ps.reason,ps.status,ps.expires_at AS "expiresAt",ps.created_at AS "createdAt" FROM platform_support_sessions ps JOIN tenants t ON t.id=ps.tenant_id JOIN users u ON u.id=ps.operator_user_id ${tenantId ? "WHERE ps.tenant_id=$1" : ""} ORDER BY ps.created_at DESC LIMIT 100`,
      tenantId ? [tenantId] : [],
    );
    return { data: result.rows };
  }
  async audits() {
    const result = await this.database.pool.query(
      `SELECT a.id,a.action,a.entity_type AS "entityType",a.entity_id AS "entityId",a.metadata,a.created_at AS "createdAt",COALESCE(u.name,u.email,'Sistema') AS "actorName" FROM platform_audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 100`,
    );
    return { data: result.rows };
  }
  async coupons() {
    const result = await this.database.pool.query(
      `SELECT id,code,discount_type AS "discountType",discount_value_cents AS "discountValueCents",max_redemptions AS "maxRedemptions",redemption_count AS "redemptionCount",allowed_plan_slugs AS "allowedPlans",expires_at AS "expiresAt",is_active AS "isActive" FROM saas_coupons ORDER BY created_at DESC`,
    );
    return { data: result.rows };
  }
  async createCoupon(
    actor: string,
    input: {
      code: string;
      discountType: "percent" | "fixed";
      discountValueCents: number;
      maxRedemptions?: number;
      allowedPlans?: string[];
      expiresAt?: string;
    },
  ) {
    const code = input.code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "");
    if (code.length < 3) throw new BadRequestException("Código de cupom inválido.");
    if (
      input.discountType === "percent" &&
      (input.discountValueCents < 1 || input.discountValueCents > 100)
    )
      throw new BadRequestException("Desconto percentual deve ser entre 1 e 100.");
    const result = await this.database.pool.query(
      `INSERT INTO saas_coupons (code,discount_type,discount_value_cents,max_redemptions,allowed_plan_slugs,expires_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING id,code`,
      [
        code,
        input.discountType,
        input.discountValueCents,
        input.maxRedemptions ?? null,
        JSON.stringify(input.allowedPlans ?? []),
        input.expiresAt ?? null,
      ],
    );
    await this.audit(actor, "saas.coupon.created", "saas_coupon", result.rows[0].id, { code });
    return result.rows[0];
  }
  async updateCoupon(actor: string, id: string, isActive: boolean) {
    const result = await this.database.pool.query(
      'UPDATE saas_coupons SET is_active=$2,updated_at=now() WHERE id=$1 RETURNING id,code,is_active AS "isActive"',
      [id, isActive],
    );
    if (!result.rows[0]) throw new BadRequestException("Cupom não encontrado.");
    await this.audit(actor, "saas.coupon.updated", "saas_coupon", id, { isActive });
    return result.rows[0];
  }
  async deleteCoupon(actor: string, id: string) {
    const usage = await this.database.pool.query<{ total: number }>(
      "SELECT count(*)::int total FROM saas_coupon_redemptions WHERE coupon_id=$1",
      [id],
    );
    if ((usage.rows[0]?.total ?? 0) > 0)
      throw new BadRequestException(
        "Este cupom já foi usado e não pode ser excluído. Inative-o para preservar o histórico.",
      );
    const result = await this.database.pool.query(
      "DELETE FROM saas_coupons WHERE id=$1 RETURNING id,code",
      [id],
    );
    if (!result.rows[0]) throw new BadRequestException("Cupom não encontrado.");
    await this.audit(actor, "saas.coupon.deleted", "saas_coupon", id, {
      code: result.rows[0].code,
    });
    return { ok: true };
  }
  async testimonialRequests() {
    const result = await this.database.pool.query(
      `SELECT r.id,r.token,r.tenant_id AS "tenantId",t.name AS "tenantName",r.recipient_email AS "recipientEmail",r.status,
        r.name,r.company,r.role,r.quote,r.image_url AS "imageUrl",r.consent_publication AS "consentPublication",
        r.submitted_at AS "submittedAt",r.approved_at AS "approvedAt",r.expires_at AS "expiresAt",r.created_at AS "createdAt"
       FROM platform_testimonial_requests r
       LEFT JOIN tenants t ON t.id=r.tenant_id
       ORDER BY r.created_at DESC
       LIMIT 100`,
    );
    return {
      data: result.rows.map((row) => ({ ...row, publicUrl: this.testimonialUrl(row.token) })),
    };
  }
  async createTestimonialRequest(
    actor: string,
    input: { tenantId?: string; recipientEmail?: string },
  ) {
    const tenantId = input.tenantId || null;
    const recipientEmail = input.recipientEmail?.trim().toLowerCase() || null;
    if (tenantId) {
      const tenant = await this.database.pool.query<{ id: string }>(
        "SELECT id FROM tenants WHERE id=$1 AND deleted_at IS NULL",
        [tenantId],
      );
      if (!tenant.rows[0]) throw new BadRequestException("Tenant não encontrado.");
    }
    if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail))
      throw new BadRequestException("Informe um e-mail válido ou deixe o campo vazio.");
    const token = randomBytes(24).toString("base64url");
    const result = await this.database.pool.query<{ id: string; token: string; expiresAt: string }>(
      `INSERT INTO platform_testimonial_requests (tenant_id,token,recipient_email)
       VALUES ($1,$2,$3)
       RETURNING id,token,expires_at AS "expiresAt"`,
      [tenantId, token, recipientEmail],
    );
    const request = result.rows[0]!;
    await this.audit(
      actor,
      "platform.testimonial.requested",
      "platform_testimonial_request",
      request.id,
      {
        tenantId,
        recipientEmail,
      },
    );
    return { ...request, publicUrl: this.testimonialUrl(request.token) };
  }
  async testimonialForPublic(token: string) {
    const result = await this.database.pool.query<{
      company: string | null;
      status: string;
      expiresAt: string;
    }>(
      `SELECT COALESCE(t.name,r.company) AS company,r.status,r.expires_at AS "expiresAt"
       FROM platform_testimonial_requests r LEFT JOIN tenants t ON t.id=r.tenant_id
       WHERE r.token=$1`,
      [token],
    );
    const request = result.rows[0];
    if (
      !request ||
      ["rejected", "revoked"].includes(request.status) ||
      new Date(request.expiresAt) < new Date()
    )
      throw new BadRequestException("Este convite não está mais disponível.");
    return {
      company: request.company ?? "",
      submitted: request.status === "submitted" || request.status === "approved",
    };
  }
  async submitPublicTestimonial(
    token: string,
    input: {
      name?: string;
      company?: string;
      role?: string;
      quote?: string;
      imageUrl?: string;
      consentPublication?: boolean;
    },
  ) {
    const name = stringSetting(input.name, "", 120);
    const quote = stringSetting(input.quote, "", 700);
    const company = stringSetting(input.company, "", 160);
    const role = stringSetting(input.role, "", 120);
    const imageUrl = stringSetting(input.imageUrl, "", 500);
    if (name.length < 2) throw new BadRequestException("Informe seu nome.");
    if (quote.length < 20)
      throw new BadRequestException("Escreva um relato com ao menos 20 caracteres.");
    if (imageUrl && !/^https:\/\//i.test(imageUrl))
      throw new BadRequestException("A imagem deve usar uma URL HTTPS.");
    if (!input.consentPublication)
      throw new BadRequestException("Confirme a autorização para publicação do depoimento.");
    const result = await this.database.pool.query<{ id: string }>(
      `UPDATE platform_testimonial_requests
       SET name=$2,company=$3,role=$4,quote=$5,image_url=$6,consent_publication=true,status='submitted',submitted_at=now(),updated_at=now()
       WHERE token=$1 AND status IN ('pending','submitted') AND expires_at>now()
       RETURNING id`,
      [token, name, company || null, role || null, quote, imageUrl || null],
    );
    if (!result.rows[0]) throw new BadRequestException("Este convite não está mais disponível.");
    return { ok: true };
  }
  async decideTestimonial(actor: string, id: string, action: "approve" | "reject" | "revoke") {
    const request = await this.database.pool.query<{
      id: string;
      status: string;
      name: string | null;
      company: string | null;
      role: string | null;
      quote: string | null;
      imageUrl: string | null;
      consent: boolean;
    }>(
      `SELECT id,status,name,company,role,quote,image_url AS "imageUrl",consent_publication AS consent
       FROM platform_testimonial_requests WHERE id=$1`,
      [id],
    );
    const row = request.rows[0];
    if (!row) throw new BadRequestException("Solicitação não encontrada.");
    if (
      action === "approve" &&
      (!row.consent || !row.name || !row.quote || row.status !== "submitted")
    )
      throw new BadRequestException(
        "Aprovação disponível somente para depoimentos enviados com autorização.",
      );
    const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked";
    await this.database.pool.query(
      `UPDATE platform_testimonial_requests SET status=$2,approved_at=CASE WHEN $2='approved' THEN now() ELSE NULL END,
       approved_by_user_id=CASE WHEN $2='approved' THEN $3 ELSE NULL END,updated_at=now() WHERE id=$1`,
      [id, status, actor],
    );
    const landing = await this.landingSettings();
    const current = normalizeTestimonials(landing.testimonials).filter(
      (item) => item.testimonialRequestId !== id,
    );
    if (action === "approve")
      current.unshift({
        testimonialRequestId: id,
        name: row.name!,
        company: row.company ?? "",
        role: row.role ?? "",
        quote: row.quote!,
        imageUrl: row.imageUrl ?? "",
      });
    await this.database.pool.query(
      "UPDATE platform_landing_settings SET value=$1::jsonb,updated_at=now() WHERE id=true",
      [JSON.stringify({ ...landing, testimonials: current.slice(0, 8) })],
    );
    await this.audit(
      actor,
      `platform.testimonial.${status}`,
      "platform_testimonial_request",
      id,
      {},
    );
    return { ok: true, status };
  }
  private testimonialUrl(token: string) {
    return `${this.config.MARKETING_APP_URL}/avaliar/${encodeURIComponent(token)}`;
  }
  async landingSettings() {
    const result = await this.database.pool.query<{ value: Record<string, unknown> }>(
      "SELECT value FROM platform_landing_settings WHERE id=true",
    );
    return result.rows[0]?.value ?? {};
  }
  async publicLandingSettings() {
    const stored = await this.landingSettings();
    const defaults = {
      heroCta: "Começar teste gratuito",
      supportEmail: "suporte@useorien.com.br",
      whatsappNumber: "",
      whatsappMessage: "Olá, quero conhecer a Orien.",
      showCalculator: true,
      showTestimonials: true,
      showFaq: true,
      showPlans: true,
      showSegments: true,
      testimonials: [] as Array<Record<string, string>>,
    };
    const settings = { ...defaults, ...stored } as Record<string, unknown>;
    return {
      heroCta: stringSetting(settings.heroCta, defaults.heroCta, 80),
      supportEmail: stringSetting(settings.supportEmail, defaults.supportEmail, 160),
      whatsappNumber: stringSetting(settings.whatsappNumber, "", 32).replace(/\D/g, ""),
      whatsappMessage: stringSetting(settings.whatsappMessage, defaults.whatsappMessage, 400),
      showCalculator: settings.showCalculator !== false,
      showTestimonials: settings.showTestimonials !== false,
      showFaq: settings.showFaq !== false,
      showPlans: settings.showPlans !== false,
      showSegments: settings.showSegments !== false,
      testimonials: normalizeTestimonials(settings.testimonials),
    };
  }
  async updateLandingSettings(actor: string, value: Record<string, unknown>) {
    await this.database.pool.query(
      "UPDATE platform_landing_settings SET value=$1::jsonb,updated_at=now() WHERE id=true",
      [JSON.stringify(value)],
    );
    await this.audit(
      actor,
      "platform.landing.updated",
      "platform_landing_settings",
      "00000000-0000-0000-0000-000000000000",
      {},
    );
    return this.landingSettings();
  }
  async audit(
    actor: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.database.pool.query(
      "INSERT INTO platform_audit_logs (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [actor, action, entityType, entityId, JSON.stringify(metadata)],
    );
  }
  private encrypt(value: string) {
    const iv = randomBytes(12),
      key = createHash("sha256").update(this.config.INTEGRATIONS_ENCRYPTION_KEY).digest(),
      cipher = createCipheriv("aes-256-gcm", key, iv),
      encrypted = Buffer.concat([cipher.update(value), cipher.final()]),
      tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }
  private decrypt(value: string) {
    const data = Buffer.from(value, "base64"),
      key = createHash("sha256").update(this.config.INTEGRATIONS_ENCRYPTION_KEY).digest(),
      decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString();
  }
}
async function q(db: DatabaseService, sql: string) {
  const r = await db.pool.query<{ total: number }>(sql);
  return r.rows[0] ?? { total: 0 };
}
async function qp(db: DatabaseService, sql: string, params: unknown[]) {
  const r = await db.pool.query<{ total: number }>(sql, params);
  return r.rows[0] ?? { total: 0 };
}
function base32(input: Buffer) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0,
    out = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += chars[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}
function fromBase32(value: string) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    current = 0,
    out: number[] = [];
  for (const char of value.toUpperCase()) {
    const index = chars.indexOf(char);
    if (index < 0) continue;
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totp(secret: string, offset = 0) {
  const step = Math.floor(Date.now() / 30000) + offset,
    buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(0, 4);
  buffer.writeUInt32BE(step, 4);
  const digest = createHmac("sha1", fromBase32(secret)).update(buffer).digest(),
    start = digest[digest.length - 1]! & 15;
  return String((digest.readUInt32BE(start) & 0x7fffffff) % 1000000).padStart(6, "0");
}
function hashRecoveryCode(value: string) {
  return createHash("sha256").update(value.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
}

function stringSetting(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeTestimonials(value: unknown): Array<Record<string, string>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const quote = stringSetting(record.quote, "", 700);
    const name = stringSetting(record.name, "", 100);
    if (!quote || !name) return [];
    return [
      {
        ...(stringSetting(record.testimonialRequestId, "", 80)
          ? { testimonialRequestId: stringSetting(record.testimonialRequestId, "", 80) }
          : {}),
        quote,
        name,
        company: stringSetting(record.company, "", 120),
        role: stringSetting(record.role, "", 100),
        imageUrl: stringSetting(record.imageUrl, "", 500),
      },
    ];
  });
}
