import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import type { AppConfig } from "@sgc/config";
import { APP_CONFIG } from "../config/config.module";
import { DatabaseService } from "../database/database.service";
import type { TenantContext } from "../../shared/request-context";
import { fiscalProviderCatalog } from "../fiscal/fiscal-provider";

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
    const result = await this.db.tenantQuery<{
      provider: Provider;
      status: string;
      settings: Settings;
      hasCredential: boolean;
      updatedAt: Date;
    }>(
      context.tenantId,
      `SELECT i.provider,i.status,COALESCE(i.settings,'{}') settings,
        EXISTS(SELECT 1 FROM integration_credentials ic WHERE ic.tenant_integration_id=i.id) AS "hasCredential",
        i.updated_at AS "updatedAt"
       FROM tenant_integrations i WHERE i.tenant_id=$1`,
      [context.tenantId],
    );
    return {
      data: providers.map(
        (provider) =>
          result.rows.find((row) => row.provider === provider) ?? {
            provider,
            status: "disabled",
            settings: {},
            hasCredential: false,
          },
      ),
    };
  }

  async save(
    context: TenantContext,
    provider: string,
    input: { status: string; mode: string; settings: Settings },
  ) {
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

  async branchOverrides(context: TenantContext) {
    const result = await this.db.tenantQuery<{
      branchId: string;
      branchName: string;
      provider: Provider;
      enabled: boolean;
      settings: Settings;
      updatedAt: Date;
    }>(
      context.tenantId,
      `SELECT o.branch_id AS "branchId",b.name AS "branchName",o.provider,o.enabled,o.settings,
              o.updated_at AS "updatedAt"
       FROM branch_integration_overrides o
       JOIN branches b ON b.id=o.branch_id AND b.tenant_id=o.tenant_id
       WHERE o.tenant_id=$1 ${context.branchId ? "AND o.branch_id=$2" : ""}
       ORDER BY b.name,o.provider`,
      context.branchId ? [context.tenantId, context.branchId] : [context.tenantId],
    );
    return { data: result.rows };
  }

  async saveBranchOverride(
    context: TenantContext,
    input: { branchId: string; provider: Provider; enabled: boolean; settings: Settings },
  ) {
    this.assert(input.provider);
    if (context.branchId && context.branchId !== input.branchId) {
      throw new BadRequestException("Esta filial não pertence ao seu escopo atual.");
    }
    const branch = await this.db.tenantQuery<{ id: string }>(
      context.tenantId,
      "SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
      [context.tenantId, input.branchId],
    );
    if (!branch.rows[0]) throw new BadRequestException("Loja não encontrada.");
    const result = await this.db.tenantQuery<{
      branchId: string;
      provider: Provider;
      enabled: boolean;
      settings: Settings;
    }>(
      context.tenantId,
      `INSERT INTO branch_integration_overrides(tenant_id,branch_id,provider,enabled,settings)
       VALUES($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT(tenant_id,branch_id,provider) DO UPDATE
       SET enabled=EXCLUDED.enabled,settings=EXCLUDED.settings,updated_at=now()
       RETURNING branch_id AS "branchId",provider,enabled,settings`,
      [context.tenantId, input.branchId, input.provider, input.enabled, JSON.stringify(input.settings)],
    );
    return result.rows[0];
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
        const response = await fetch(
          `${integration.settings.apiUrl ?? this.config.ASAAS_API_URL}/myAccount`,
          { headers: { access_token: integration.secret } },
        );
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
          html: '<main style="font-family:Arial,sans-serif;color:#0b1d3d"><h1>E-mail configurado</h1><p>Esta mensagem confirma que a Orien pode enviar comunicações em nome da sua empresa.</p></main>',
        });
        message = "E-mail de teste enviado. Confira sua caixa de entrada.";
      }
      if (provider === "fiscal") {
        const fiscalProvider = integration.settings.provider || "focus_nfe";
        if (fiscalProvider !== "focus_nfe") {
          const label = fiscalProviderCatalog[fiscalProvider as keyof typeof fiscalProviderCatalog]?.label ?? "Este provedor";
          throw new BadRequestException(
            `${label} está reservado na arquitetura, mas aguarda homologação técnica. Use Focus NFe até a aprovação do conector.`,
          );
        }
        const baseUrl =
          integration.settings.environment === "production"
            ? "https://api.focusnfe.com.br"
            : "https://homologacao.focusnfe.com.br";
        const response = await fetch(`${baseUrl}/v2/empresas`, {
          signal: AbortSignal.timeout(8_000),
          headers: {
            Authorization: `Basic ${Buffer.from(`${integration.secret}:`).toString("base64")}`,
            Accept: "application/json",
          },
        });
        ok = response.ok;
        message = ok
          ? "Credencial Focus NFe validada no ambiente selecionado."
          : "A Focus NFe recusou a credencial. Confirme o token e o ambiente.";
      }
    } catch (error) {
      ok = false;
      message =
        error instanceof BadRequestException
          ? error.message
          : "Não foi possível conectar ao serviço agora. Revise os dados e tente novamente.";
    }
    await this.db.tenantQuery(
      context.tenantId,
      `UPDATE tenant_integrations SET settings=COALESCE(settings,'{}'::jsonb)||$3::jsonb,status=$4,updated_at=now()
       WHERE tenant_id=$1 AND provider=$2`,
      [
        context.tenantId,
        provider,
        JSON.stringify({
          lastTestAt: new Date().toISOString(),
          lastTestOk: ok,
          lastTestMessage: message,
        }),
        ok ? "configured" : "error",
      ],
    );
    return { ok, message };
  }

  async sendTenantEmail(
    context: TenantContext,
    input: { to: string; subject: string; html: string },
  ) {
    const integration = await this.integration(context, "smtp");
    if (!integration) return { sent: false, reason: "not_configured" as const };
    try {
      await this.smtpTransport(
        integration.settings,
        this.parseSmtpCredentials(integration.secret),
      ).sendMail({
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

  async getFiscalConnection(context: TenantContext) {
    const connection = await this.integration(context, "fiscal");
    if (!connection || connection.status !== "configured" || !connection.lastTestOk) {
      return null;
    }
    return connection;
  }

  async effectiveSettings(context: TenantContext, provider: Provider, branchId?: string | null) {
    const base = await this.integration(context, provider);
    const scopedBranchId = branchId ?? context.branchId;
    if (!scopedBranchId) return base;
    const override = await this.db.tenantQuery<{ enabled: boolean; settings: Settings }>(
      context.tenantId,
      `SELECT enabled,settings FROM branch_integration_overrides
       WHERE tenant_id=$1 AND branch_id=$2 AND provider=$3`,
      [context.tenantId, scopedBranchId, provider],
    );
    const item = override.rows[0];
    if (!item) return base;
    if (!item.enabled) return null;
    return base ? { ...base, settings: { ...base.settings, ...item.settings } } : null;
  }

  async putScopedCredential(
    context: TenantContext,
    provider: Provider,
    secretRef: string,
    secret: string,
  ) {
    this.assert(provider);
    if (!secretRef.startsWith(`${provider}:`) || secretRef.length > 220) {
      throw new BadRequestException("Referência de credencial inválida.");
    }
    const integration = await this.db.tenantQuery<{ id: string }>(
      context.tenantId,
      `INSERT INTO tenant_integrations (tenant_id,provider,status) VALUES ($1,$2,'configured')
       ON CONFLICT (tenant_id,provider) DO UPDATE SET updated_at=now() RETURNING id`,
      [context.tenantId, provider],
    );
    await this.db.tenantQuery(
      context.tenantId,
      `INSERT INTO integration_credentials
        (tenant_id,tenant_integration_id,secret_ref,encrypted_payload,rotated_at)
       VALUES ($1,$2,$3,$4,now())`,
      [context.tenantId, integration.rows[0]!.id, secretRef, this.encrypt(secret)],
    );
  }

  async hasScopedCredential(context: TenantContext, provider: Provider, secretRef: string) {
    const result = await this.db.tenantQuery<{ present: boolean }>(
      context.tenantId,
      `SELECT EXISTS(
        SELECT 1 FROM integration_credentials ic
        JOIN tenant_integrations i ON i.id=ic.tenant_integration_id
        WHERE i.tenant_id=$1 AND i.provider=$2 AND ic.secret_ref=$3
       ) AS present`,
      [context.tenantId, provider, secretRef],
    );
    return result.rows[0]?.present ?? false;
  }

  async getScopedCredential(context: TenantContext, provider: Provider, secretRef: string) {
    const result = await this.db.tenantQuery<{ encrypted_payload: string }>(
      context.tenantId,
      `SELECT ic.encrypted_payload FROM integration_credentials ic
       JOIN tenant_integrations i ON i.id=ic.tenant_integration_id
       WHERE i.tenant_id=$1 AND i.provider=$2 AND ic.secret_ref=$3
       ORDER BY ic.rotated_at DESC NULLS LAST,ic.created_at DESC LIMIT 1`,
      [context.tenantId, provider, secretRef],
    );
    const row = result.rows[0];
    return row ? this.decrypt(row.encrypted_payload) : null;
  }

  private async integration(context: TenantContext, provider: Provider) {
    const result = await this.db.tenantQuery<{
      encrypted_payload: string;
      settings: Settings;
      status: string;
      last_test_ok: boolean;
    }>(
      context.tenantId,
      `SELECT ic.encrypted_payload,i.settings,i.status,
        COALESCE((i.settings->>'lastTestOk')::boolean,false) AS last_test_ok
       FROM tenant_integrations i
       JOIN integration_credentials ic ON ic.tenant_integration_id=i.id
       WHERE i.tenant_id=$1 AND i.provider=$2 AND ic.secret_ref=$3
       ORDER BY ic.rotated_at DESC NULLS LAST,ic.created_at DESC LIMIT 1`,
      [context.tenantId, provider, `${provider}:primary`],
    );
    const row = result.rows[0];
    return row
      ? {
          settings: row.settings,
          status: row.status,
          lastTestOk: row.last_test_ok,
          secret: this.decrypt(row.encrypted_payload),
        }
      : null;
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
    const from = settings.from?.trim();
    if (!from || !settings.host?.trim())
      throw new BadRequestException(
        "Informe o e-mail que envia mensagens e o servidor do provedor.",
      );
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
      throw new BadRequestException("Informe um e-mail válido para enviar mensagens.");
    }
    const port = Number(settings.port ?? 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new BadRequestException("Informe uma porta válida.");
    const security = settings.security ?? "starttls";
    const securePort =
      (security === "ssl" && port === 465) ||
      (security === "starttls" && (port === 587 || port === 2525));
    if (!securePort) {
      throw new BadRequestException(
        "Use uma porta SMTP segura compatível com a conexão escolhida.",
      );
    }
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
    if (!providers.includes(provider as Provider))
      throw new BadRequestException("Provedor inválido.");
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
    const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12), {
      authTagLength: 16,
    });
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  }
}
