import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import type { AppConfig } from "@sgc/config";
import { APP_CONFIG } from "../config/config.module";
import { DatabaseService } from "../database/database.service";
import type { TenantContext } from "../../shared/request-context";

const providers = ["asaas_business", "smtp", "whatsapp_meta", "fiscal"] as const;
type Provider = (typeof providers)[number];
type Settings = Record<string, string>;
type SmtpCredentials = { username: string; password: string };

@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async list(context: TenantContext) {
    const result = await this.db.tenantQuery(
      context.tenantId,
      `SELECT i.provider,i.status,COALESCE(i.settings,'{}') settings,
        EXISTS(SELECT 1 FROM integration_credentials ic WHERE ic.tenant_integration_id=i.id) AS "hasCredential",
        i.updated_at AS "updatedAt"
       FROM tenant_integrations i WHERE i.tenant_id=$1`,
      [context.tenantId],
    );
    return { data: providers.map((provider) => result.rows.find((row: any) => row.provider === provider) ?? { provider, status: "disabled", settings: {}, hasCredential: false }) };
  }

  async save(context: TenantContext, provider: string, input: { status: string; mode: string; settings: Settings }) {
    this.assert(provider);
    if (provider === "smtp") this.validateSmtpSettings(input.settings);
    const row = await this.db.tenantQuery(
      context.tenantId,
      `INSERT INTO tenant_integrations (tenant_id,provider,status,settings) VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (tenant_id,provider) DO UPDATE SET status=EXCLUDED.status,settings=EXCLUDED.settings,updated_at=now()
       RETURNING provider,status,settings`,
      [context.tenantId, provider, input.status, { ...input.settings, mode: input.mode }],
    );
    return row.rows[0];
  }

  async credential(context: TenantContext, provider: string, secret: string) {
    this.assert(provider);
    if (provider === "smtp") this.parseSmtpCredentials(secret);
    const integration = await this.db.tenantQuery<{ id: string }>(
      context.tenantId,
      `INSERT INTO tenant_integrations (tenant_id,provider,status) VALUES ($1,$2,'configured')
       ON CONFLICT (tenant_id,provider) DO UPDATE SET updated_at=now() RETURNING id`,
      [context.tenantId, provider],
    );
    await this.db.tenantQuery(
      context.tenantId,
      `INSERT INTO integration_credentials (tenant_id,tenant_integration_id,secret_ref,encrypted_payload,rotated_at)
       VALUES ($1,$2,$3,$4,now())`,
      [context.tenantId, integration.rows[0]!.id, `${provider}:primary`, this.encrypt(secret)],
    );
    return { ok: true, hasCredential: true };
  }

  async test(context: TenantContext, provider: string) {
    this.assert(provider);
    const integration = await this.integration(context, provider);
    if (!integration) throw new BadRequestException("Cadastre a credencial antes de testar.");
    let ok = true;
    let message = "Configuração protegida e pronta para uso.";
    try {
      if (provider === "asaas_business") {
        const response = await fetch(`${integration.settings.apiUrl ?? this.config.ASAAS_API_URL}/myAccount`, { headers: { access_token: integration.secret } });
        ok = response.ok;
        message = ok ? "Conta Asaas validada." : "Não foi possível validar a conta Asaas.";
      }
      if (provider === "smtp") {
        const credentials = this.parseSmtpCredentials(integration.secret);
        const recipient = integration.settings.testRecipient?.trim();
        if (!recipient) throw new BadRequestException("Informe um e-mail para receber o teste.");
        const transporter = this.smtpTransport(integration.settings, credentials);
        await transporter.verify();
        await transporter.sendMail({
          from: integration.settings.from,
          to: recipient,
          subject: "Orien · teste de e-mail da empresa",
          html: "<main style=\"font-family:Arial,sans-serif;color:#0b1d3d\"><h1>E-mail configurado</h1><p>Esta mensagem confirma que a Orien pode enviar comunicações em nome da sua empresa.</p></main>",
        });
        message = "E-mail de teste enviado. Confira sua caixa de entrada.";
      }
    } catch (error) {
      ok = false;
      message = error instanceof BadRequestException ? error.message : "Não foi possível conectar ao serviço agora. Revise os dados e tente novamente.";
    }
    await this.db.tenantQuery(
      context.tenantId,
      `UPDATE tenant_integrations SET settings=COALESCE(settings,'{}'::jsonb)||$3::jsonb,status=$4,updated_at=now()
       WHERE tenant_id=$1 AND provider=$2`,
      [context.tenantId, provider, JSON.stringify({ lastTestAt: new Date().toISOString(), lastTestOk: ok, lastTestMessage: message }), ok ? "configured" : "error"],
    );
    return { ok, message };
  }

  async sendTenantEmail(context: TenantContext, input: { to: string; subject: string; html: string }) {
    const integration = await this.integration(context, "smtp");
    if (!integration) return { sent: false, reason: "not_configured" as const };
    try {
      await this.smtpTransport(integration.settings, this.parseSmtpCredentials(integration.secret)).sendMail({
        from: integration.settings.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
      return { sent: true as const };
    } catch {
      return { sent: false, reason: "delivery_failed" as const };
    }
  }

  private async integration(context: TenantContext, provider: Provider) {
    const result = await this.db.tenantQuery<{ encrypted_payload: string; settings: Settings }>(
      context.tenantId,
      `SELECT ic.encrypted_payload,i.settings FROM tenant_integrations i
       JOIN integration_credentials ic ON ic.tenant_integration_id=i.id
       WHERE i.tenant_id=$1 AND i.provider=$2
       ORDER BY ic.rotated_at DESC NULLS LAST,ic.created_at DESC LIMIT 1`,
      [context.tenantId, provider],
    );
    const row = result.rows[0];
    return row ? { settings: row.settings, secret: this.decrypt(row.encrypted_payload) } : null;
  }

  private smtpTransport(settings: Settings, credentials: SmtpCredentials) {
    return nodemailer.createTransport({
      host: settings.host,
      port: Number(settings.port ?? 587),
      secure: settings.security === "ssl",
      requireTLS: settings.security === "starttls",
      auth: { user: credentials.username, pass: credentials.password },
    });
  }

  private validateSmtpSettings(settings: Settings) {
    if (!settings.from?.trim() || !settings.host?.trim()) throw new BadRequestException("Informe o e-mail que envia mensagens e o servidor do provedor.");
    const port = Number(settings.port ?? 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new BadRequestException("Informe uma porta válida.");
  }

  private parseSmtpCredentials(secret: string): SmtpCredentials {
    try {
      const parsed = JSON.parse(secret) as SmtpCredentials;
      if (!parsed.username?.trim() || !parsed.password) throw new Error();
      return parsed;
    } catch {
      throw new BadRequestException("Informe o usuário e a senha do e-mail.");
    }
  }

  private assert(provider: string): asserts provider is Provider {
    if (!providers.includes(provider as Provider)) throw new BadRequestException("Provedor inválido.");
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const key = createHash("sha256").update(this.config.INTEGRATIONS_ENCRYPTION_KEY).digest();
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const content = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), content]).toString("base64");
  }

  private decrypt(input: string) {
    const data = Buffer.from(input, "base64");
    const key = createHash("sha256").update(this.config.INTEGRATIONS_ENCRYPTION_KEY).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  }
}
