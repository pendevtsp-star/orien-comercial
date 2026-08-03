import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import {
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  makeWASocket,
  proto,
} from "@whiskeysockets/baileys";
import type {
  AuthenticationCreds,
  SignalDataTypeMap,
  SignalKeyStore,
  WASocket,
  WAMessage,
} from "@whiskeysockets/baileys";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import type { TenantContext } from "../../shared/request-context";
import { APP_CONFIG } from "../config/config.module";
import { DatabaseService } from "../database/database.service";
import { OperationsFoundationService } from "../operations-foundation/operations-foundation.service";

type SessionStatus =
  | "consent_required"
  | "connecting"
  | "qr_ready"
  | "connected"
  | "disconnected"
  | "failed";

type SessionRow = {
  id: string;
  branchId: string;
  status: SessionStatus;
  consentedAt: Date | null;
  phoneNumber: string | null;
  lastError: string | null;
  connectedAt: Date | null;
  updatedAt: Date;
};

type PersistedKeys = Record<string, Record<string, unknown>>;
type PersistedAuthState = { creds: AuthenticationCreds; keys: PersistedKeys };

type RuntimeSession = {
  socket: WASocket;
  qr?: string;
};

const MAX_OUTBOUND_PER_MINUTE = 30;
const DEFAULT_ALLOWED_FROM = "08:00";
const DEFAULT_ALLOWED_UNTIL = "20:00";
const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

@Injectable()
export class WhatsAppExperimentalService {
  private readonly logger = new Logger(WhatsAppExperimentalService.name);
  private readonly runtimes = new Map<string, RuntimeSession>();
  private readonly starts = new Map<string, Promise<void>>();

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, "INTEGRATIONS_ENCRYPTION_KEY">,
    @Optional() @Inject(OperationsFoundationService) private readonly operations?: OperationsFoundationService,
  ) {}

  async list(context: TenantContext) {
    const result = await this.database.tenantQuery<SessionRow>(
      context.tenantId,
      `SELECT id,branch_id AS "branchId",status,consented_at AS "consentedAt",
        phone_number AS "phoneNumber",last_error AS "lastError",connected_at AS "connectedAt",
        updated_at AS "updatedAt"
       FROM whatsapp_experimental_sessions
       WHERE tenant_id=$1 ${context.branchId ? "AND branch_id=$2" : ""}
       ORDER BY updated_at DESC`,
      context.branchId ? [context.tenantId, context.branchId] : [context.tenantId],
    );
    return { data: result.rows.map((row) => this.publicSession(context.tenantId, row)) };
  }

  async connect(context: TenantContext, input: { consent: boolean }) {
    if (!input.consent) {
      throw new BadRequestException("Confirme o consentimento antes de conectar o WhatsApp.");
    }
    const session = await this.prepareSession(context, input.consent);
    return this.startSession(context.tenantId, session);
  }

  async reconnect(context: TenantContext) {
    const session = await this.session(context);
    if (!session.consentedAt) {
      throw new BadRequestException("Confirme o consentimento antes de reconectar o WhatsApp.");
    }
    await this.updateStatus(context, session.id, "connecting", null);
    return this.startSession(context.tenantId, session);
  }

  async disconnect(context: TenantContext) {
    const session = await this.session(context);
    const runtime = this.runtimes.get(this.runtimeKey(context.tenantId, session.branchId));
    if (runtime) {
      try {
        runtime.socket.end(undefined);
      } catch {
        // Continue cleanup if the socket has already closed.
      }
      this.runtimes.delete(this.runtimeKey(context.tenantId, session.branchId));
    }
    await this.updateStatus(context, session.id, "disconnected", null);
    await this.audit(context, "whatsapp.session.disconnected", session.id, {});
    return this.list(context);
  }

  async deleteSession(context: TenantContext) {
    const session = await this.session(context);
    const runtime = this.runtimes.get(this.runtimeKey(context.tenantId, session.branchId));
    if (runtime) {
      void runtime.socket.logout("Sessão removida pelo tenant.").catch(() => undefined);
    }
    this.runtimes.delete(this.runtimeKey(context.tenantId, session.branchId));
    await this.database.tenantTransaction(context.tenantId, async (client) => {
      await client.query(
        `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'whatsapp.session.deleted','whatsapp_session',$3,'{}'::jsonb)`,
        [context.tenantId, context.userId ?? null, session.id],
      );
      await client.query(
        "DELETE FROM whatsapp_experimental_sessions WHERE tenant_id=$1 AND id=$2",
        [context.tenantId, session.id],
      );
    });
    return { ok: true };
  }

  async sendText(
    context: TenantContext,
    input: { to: string; text: string; idempotencyKey: string },
  ) {
    const session = await this.session(context);
    const phone = normalizeWhatsAppPhone(input.to);
    if (!phone) throw new BadRequestException("Informe um número de WhatsApp válido.");
    const runtime = this.runtimes.get(this.runtimeKey(context.tenantId, session.branchId));
    if (!runtime || session.status !== "connected") {
      throw new BadRequestException("Conecte o WhatsApp antes de enviar mensagens.");
    }
    await this.assertMessagingWindow(context, session.id, phone);

    const existing = await this.database.tenantQuery<{ messageId: string; text: string }>(
      context.tenantId,
      `SELECT message_id AS "messageId",text FROM whatsapp_experimental_messages
       WHERE tenant_id=$1 AND session_id=$2 AND idempotency_key=$3`,
      [context.tenantId, session.id, input.idempotencyKey],
    );
    if (existing.rows[0]) return { messageId: existing.rows[0].messageId, idempotent: true };

    const sent = await runtime.socket.sendMessage(`${phone}@s.whatsapp.net`, { text: input.text });
    const messageId = sent?.key.id;
    if (!messageId) throw new Error("O WhatsApp não confirmou a mensagem.");

    await this.database.tenantTransaction(context.tenantId, async (client) => {
      await client.query(
        `INSERT INTO whatsapp_experimental_messages(
          tenant_id,branch_id,session_id,message_id,idempotency_key,direction,remote_jid,remote_phone,text
        ) VALUES($1,$2,$3,$4,$5,'outbound',$6,$7,$8)
        ON CONFLICT(session_id,idempotency_key) DO NOTHING`,
        [
          context.tenantId,
          session.branchId,
          session.id,
          messageId,
          input.idempotencyKey,
          `${phone}@s.whatsapp.net`,
          phone,
          input.text,
        ],
      );
      await client.query(
        `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'whatsapp.message.sent','whatsapp_message',NULL,$3::jsonb)`,
        [context.tenantId, context.userId ?? null, JSON.stringify({ phoneLast4: phone.slice(-4), length: input.text.length })],
      );
    });
    await this.recordOperationalEvent(context, session, "sent", messageId, phone);
    return { messageId, idempotent: false };
  }

  private startSession(tenantId: string, session: SessionRow) {
    const key = this.runtimeKey(tenantId, session.branchId);
    if (this.runtimes.has(key)) return this.publicSession(tenantId, session);
    if (!this.starts.has(key)) {
      const start = this.startSocket(tenantId, session).finally(() => this.starts.delete(key));
      this.starts.set(key, start);
    }
    return this.publicSession(tenantId, session);
  }

  private async startSocket(tenantId: string, session: SessionRow) {
    const { state, persist } = await this.authState(tenantId, session.id);
    const runtimeKey = this.runtimeKey(tenantId, session.branchId);
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
      browser: ["Orien", "Chrome", "1.0.0"],
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    const runtime: RuntimeSession = { socket };
    this.runtimes.set(runtimeKey, runtime);

    socket.ev.on("creds.update", (update) => {
      Object.assign(state.creds, update);
      void persist();
    });
    socket.ev.on("connection.update", (update) => {
      void this.handleConnectionUpdate(tenantId, session, runtime, update);
    });
    socket.ev.on("messages.upsert", (event) => {
      if (event.type !== "notify") return;
      void Promise.all(event.messages.map((message) => this.handleInbound(tenantId, session, message)));
    });
  }

  private async handleConnectionUpdate(
    tenantId: string,
    session: SessionRow,
    runtime: RuntimeSession,
    update: { connection?: "open" | "connecting" | "close"; qr?: string; lastDisconnect?: { error?: Error } },
  ) {
    if (update.qr) {
      runtime.qr = await QRCode.toDataURL(update.qr, { margin: 1, width: 280 });
      await this.updateStatus({ tenantId, branchId: session.branchId } as TenantContext, session.id, "qr_ready", null);
      return;
    }
    if (update.connection === "connecting") {
      await this.updateStatus({ tenantId, branchId: session.branchId } as TenantContext, session.id, "connecting", null);
      return;
    }
    if (update.connection === "open") {
      runtime.qr = undefined;
      const phone = runtime.socket.user?.id?.split(":")[0] ?? null;
      await this.database.tenantQuery(
        tenantId,
        `UPDATE whatsapp_experimental_sessions
         SET status='connected',phone_number=$3,last_error=NULL,connected_at=now(),updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [tenantId, session.id, phone],
      );
      return;
    }
    if (update.connection === "close") {
      const code = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
        ?.statusCode;
      const status: SessionStatus = code === DisconnectReason.loggedOut ? "disconnected" : "disconnected";
      await this.updateStatus(
        { tenantId, branchId: session.branchId } as TenantContext,
        session.id,
        status,
        code === DisconnectReason.loggedOut ? "Sessão encerrada no telefone." : "Conexão encerrada.",
      );
      this.runtimes.delete(this.runtimeKey(tenantId, session.branchId));
    }
  }

  private async handleInbound(tenantId: string, session: SessionRow, message: WAMessage) {
    if (message.key.fromMe) return;
    const remoteJid = message.key.remoteJid;
    const text = extractText(message);
    if (!remoteJid || !text || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") return;
    const phone = normalizeWhatsAppPhone(remoteJid.split("@")[0] ?? "");
    const messageId = message.key.id;
    if (!phone || !messageId) return;

    let leadId: string | null = null;
    let createdLead = false;
    await this.database.tenantTransaction(tenantId, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO whatsapp_experimental_messages(
          tenant_id,branch_id,session_id,message_id,idempotency_key,direction,remote_jid,remote_phone,text
        ) VALUES($1,$2,$3,$4,$4,'inbound',$5,$6,$7)
        ON CONFLICT(session_id,message_id) DO NOTHING RETURNING id`,
        [tenantId, session.branchId, session.id, messageId, remoteJid, phone, text.slice(0, 4000)],
      );
      if (!inserted.rows[0]) return;
      const lead = await client.query<{ id: string }>(
        `SELECT id FROM leads WHERE tenant_id=$1 AND branch_id=$2 AND deleted_at IS NULL
         AND regexp_replace(COALESCE(whatsapp,''),'\\D','','g')=$3
         ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`,
        [tenantId, session.branchId, phone],
      );
      leadId = lead.rows[0]?.id ?? null;
      if (!leadId) {
        const created = await client.query<{ id: string }>(
          `INSERT INTO leads(tenant_id,branch_id,name,whatsapp,status)
           VALUES($1,$2,$3,$4,'open') RETURNING id`,
          [tenantId, session.branchId, message.pushName?.trim().slice(0, 180) || `Contato ${phone.slice(-4)}`, phone],
        );
        leadId = created.rows[0]!.id;
        createdLead = true;
      }
      await client.query(
        `UPDATE whatsapp_experimental_messages SET lead_id=$4
         WHERE tenant_id=$1 AND session_id=$2 AND message_id=$3`,
        [tenantId, session.id, messageId, leadId],
      );
      await client.query(
        `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,NULL,'whatsapp.message.received','whatsapp_message',NULL,$2::jsonb)`,
        [tenantId, JSON.stringify({ phoneLast4: phone.slice(-4), textLength: text.length })],
      );
    });
    if (createdLead) await this.auditSystem(tenantId, "lead.created_from_whatsapp", leadId, phone);
    await this.recordOperationalEvent({ tenantId, branchId: session.branchId }, session, "received", messageId, phone);
  }

  private async authState(tenantId: string, sessionId: string) {
    const result = await this.database.tenantQuery<{ encryptedState: string | null }>(
      tenantId,
      `SELECT encrypted_state AS "encryptedState" FROM whatsapp_experimental_sessions
       WHERE tenant_id=$1 AND id=$2`,
      [tenantId, sessionId],
    );
    const stored = result.rows[0]?.encryptedState
      ? this.decrypt(result.rows[0].encryptedState)
      : undefined;
    const parsed = stored ? (JSON.parse(stored, BufferJSON.reviver) as Partial<PersistedAuthState>) : undefined;
    const keyData: PersistedKeys = parsed?.keys ?? {};
    const creds = parsed?.creds ?? initAuthCreds();
    const rawKeys: SignalKeyStore = {
      get: <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const values: Record<string, unknown> = {};
        for (const id of ids) {
          let value = keyData[type]?.[id];
          if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
          if (value) values[id] = value;
        }
        return values as { [id: string]: SignalDataTypeMap[T] };
      },
      set: async (data) => {
        for (const [type, values] of Object.entries(data)) {
          const bucket = (keyData[type] ??= {});
          for (const [id, value] of Object.entries(values ?? {})) {
            if (value === null) delete bucket[id];
            else bucket[id] = value;
          }
        }
        await persist();
      },
      clear: async () => {
        for (const type of Object.keys(keyData)) delete keyData[type];
        await persist();
      },
    };
    let pending = Promise.resolve();
    const persist = async () => {
      const snapshot = JSON.stringify({ creds, keys: keyData }, BufferJSON.replacer);
      pending = pending.then(() =>
        this.database.tenantQuery(
          tenantId,
          "UPDATE whatsapp_experimental_sessions SET encrypted_state=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [tenantId, sessionId, this.encrypt(snapshot)],
        ).then(() => undefined),
      );
      return pending;
    };
    return { state: { creds, keys: rawKeys }, persist };
  }

  private async prepareSession(context: TenantContext, consent: boolean) {
    const branchId = context.branchId;
    if (!branchId) throw new BadRequestException("Selecione uma filial antes de conectar o WhatsApp.");
    const override = await this.database.tenantQuery<{ enabled: boolean }>(
      context.tenantId,
      `SELECT enabled FROM branch_integration_overrides
       WHERE tenant_id=$1 AND branch_id=$2 AND provider='whatsapp_meta'`,
      [context.tenantId, branchId],
    );
    if (override.rows[0] && !override.rows[0].enabled) {
      throw new BadRequestException("O WhatsApp está bloqueado para esta filial.");
    }
    const result = await this.database.tenantQuery<SessionRow>(
      context.tenantId,
      `INSERT INTO whatsapp_experimental_sessions(tenant_id,branch_id,status,consented_at)
       VALUES($1,$2,'connecting',CASE WHEN $3 THEN now() ELSE NULL END)
       ON CONFLICT(tenant_id,branch_id) DO UPDATE SET
         consented_at=COALESCE(whatsapp_experimental_sessions.consented_at,EXCLUDED.consented_at),
         status=CASE WHEN EXCLUDED.consented_at IS NOT NULL THEN 'connecting' ELSE whatsapp_experimental_sessions.status END,
         last_error=NULL,updated_at=now()
       RETURNING id,branch_id AS "branchId",status,consented_at AS "consentedAt",
         phone_number AS "phoneNumber",last_error AS "lastError",connected_at AS "connectedAt",
         updated_at AS "updatedAt"`,
      [context.tenantId, branchId, consent],
    );
    const session = result.rows[0];
    if (!session) throw new BadRequestException("Não foi possível preparar a sessão do WhatsApp.");
    await this.audit(context, "whatsapp.session.consent_granted", session.id, {});
    return session;
  }

  private async session(context: TenantContext) {
    if (!context.branchId) throw new BadRequestException("Selecione uma filial para operar o WhatsApp.");
    const result = await this.database.tenantQuery<SessionRow>(
      context.tenantId,
      `SELECT id,branch_id AS "branchId",status,consented_at AS "consentedAt",
        phone_number AS "phoneNumber",last_error AS "lastError",connected_at AS "connectedAt",
        updated_at AS "updatedAt"
       FROM whatsapp_experimental_sessions WHERE tenant_id=$1 AND branch_id=$2`,
      [context.tenantId, context.branchId],
    );
    const session = result.rows[0];
    if (!session) throw new BadRequestException("Nenhuma sessão experimental foi criada para esta filial.");
    return session;
  }

  private async updateStatus(
    context: Pick<TenantContext, "tenantId">,
    sessionId: string,
    status: SessionStatus,
    error: string | null,
  ) {
    await this.database.tenantQuery(
      context.tenantId,
      `UPDATE whatsapp_experimental_sessions SET status=$3,last_error=$4,updated_at=now()
       WHERE tenant_id=$1 AND id=$2`,
      [context.tenantId, sessionId, status, error],
    );
  }

  private async assertMessagingWindow(context: TenantContext, sessionId: string, phone: string) {
    const settings = await this.database.tenantQuery<{
      settings: Record<string, string>;
      optedIn: boolean;
      inbound: boolean;
      outboundCount: number;
    }>(
      context.tenantId,
      `SELECT COALESCE(i.settings,'{}'::jsonb) settings,
        EXISTS(
          SELECT 1 FROM customers c WHERE c.tenant_id=$1 AND c.communication_opt_in=true
            AND regexp_replace(COALESCE(c.whatsapp,c.phone,''),'\\D','','g')=$2
        ) AS "optedIn",
        EXISTS(
          SELECT 1 FROM whatsapp_experimental_messages m WHERE m.tenant_id=$1 AND m.session_id=$3
            AND m.remote_phone=$2 AND m.direction='inbound'
        ) AS inbound,
        (SELECT count(*)::int FROM whatsapp_experimental_messages m WHERE m.tenant_id=$1
          AND m.session_id=$3 AND m.direction='outbound' AND m.created_at>now()-interval '1 minute') AS "outboundCount"
       FROM whatsapp_experimental_sessions s
       LEFT JOIN tenant_integrations i ON i.tenant_id=s.tenant_id AND i.provider='whatsapp_meta'
       WHERE s.tenant_id=$1 AND s.id=$3`,
      [context.tenantId, phone, sessionId],
    );
    const row = settings.rows[0];
    if (!row) throw new BadRequestException("Sessão de WhatsApp não encontrada.");
    if (!row.optedIn && !row.inbound) {
      throw new BadRequestException("O contato não possui opt-in ou conversa iniciada.");
    }
    if (row.outboundCount >= MAX_OUTBOUND_PER_MINUTE) {
      throw new BadRequestException("Limite temporário de mensagens atingido. Tente novamente em um minuto.");
    }
    if (!isWithinWhatsAppWindow(row.settings)) {
      throw new BadRequestException("O envio está fora do horário permitido para esta integração.");
    }
  }

  private publicSession(tenantId: string, row: SessionRow) {
    return {
      id: row.id,
      branchId: row.branchId,
      status: row.status,
      consented: Boolean(row.consentedAt),
      phoneNumber: row.phoneNumber,
      lastError: row.lastError,
      connectedAt: row.connectedAt,
      updatedAt: row.updatedAt,
      qr: this.runtimes.get(this.runtimeKey(tenantId, row.branchId))?.qr ?? null,
    };
  }

  private runtimeKey(tenantId: string, branchId: string) {
    return `${tenantId}:${branchId}`;
  }

  private async audit(context: TenantContext, action: string, entityId: string, metadata: Record<string, unknown>) {
    await this.database.tenantQuery(
      context.tenantId,
      `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,$3,'whatsapp_session',$4,$5::jsonb)`,
      [context.tenantId, context.userId ?? null, action, entityId, JSON.stringify(metadata)],
    );
  }

  private async auditSystem(tenantId: string, action: string, entityId: string | null, phone: string) {
    await this.database.tenantQuery(
      tenantId,
      `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
       VALUES($1,NULL,$2,'lead',$3,$4::jsonb)`,
      [tenantId, action, entityId, JSON.stringify({ phoneLast4: phone.slice(-4) })],
    );
  }

  private async recordOperationalEvent(
    context: Pick<TenantContext, "tenantId" | "branchId">,
    session: SessionRow,
    direction: "received" | "sent",
    messageId: string,
    phone: string,
  ) {
    if (!this.operations) return;
    try {
      await this.operations.recordEventAndEnqueueJob({
        tenantId: context.tenantId,
        branchId: session.branchId,
        eventType: `whatsapp.message.${direction}`,
        eventIdempotencyKey: `whatsapp:${session.id}:${messageId}`,
        eventPayload: { sessionId: session.id, messageId, phoneLast4: phone.slice(-4), direction },
        aggregateType: "whatsapp_session",
        aggregateId: session.id,
        jobType: "whatsapp.message.recorded",
        jobIdempotencyKey: `whatsapp-job:${session.id}:${messageId}`,
        jobPayload: { sessionId: session.id, messageId },
      });
    } catch (error) {
      this.logger.warn(`Falha ao registrar evento operacional do WhatsApp: ${error instanceof Error ? error.message : "erro"}`);
    }
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
    const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12), { authTagLength: 16 });
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  }
}

export function normalizeWhatsAppPhone(value: string) {
  const phone = value.replace(/\D/g, "");
  return /^\d{8,15}$/.test(phone) ? phone : null;
}

export function isWithinWhatsAppWindow(
  settings: Record<string, string> = {},
  now = new Date(),
) {
  const from = parseClock(settings.allowedFrom ?? DEFAULT_ALLOWED_FROM);
  const until = parseClock(settings.allowedUntil ?? DEFAULT_ALLOWED_UNTIL);
  if (from === null || until === null) return false;
  let current: number;
  try {
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: settings.timezone ?? DEFAULT_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    const [hour = 0, minute = 0] = time.split(":").map(Number);
    current = hour * 60 + minute;
  } catch {
    return false;
  }
  return from <= until ? current >= from && current <= until : current >= from || current <= until;
}

function parseClock(value: string) {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) return null;
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function extractText(message: WAMessage) {
  return message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? null;
}
