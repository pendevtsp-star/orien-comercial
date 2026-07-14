import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import { randomUUID } from "node:crypto";
import { CacheService } from "../cache/cache.service";
import { APP_CONFIG } from "../config/config.module";
import { DatabaseService } from "../database/database.service";
import { FiscalService } from "./fiscal.service";

type PendingRow = { id: string; tenant_id: string; branch_id: string };

@Injectable()
export class FiscalOperationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FiscalOperationsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(FiscalService) private readonly fiscal: FiscalService,
    @Inject(CacheService) private readonly cache: CacheService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit() {
    if (this.config.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.run(), 60_000);
    this.timer.unref();
    setTimeout(() => void this.run(), 10_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    const token = randomUUID();
    if (!(await this.cache.acquireLock("worker:fiscal-operations", token, 55))) return;
    try {
      await this.processDocuments();
      await this.processWebhooks();
      await this.processArtifacts();
      await this.processAlerts();
      await this.markExhausted();
    } catch (error) {
      this.logger.error(
        JSON.stringify({ type: "fiscal_worker_error", message: safeError(error) }),
      );
    } finally {
      await this.cache.releaseLock("worker:fiscal-operations", token);
    }
  }

  private async processDocuments() {
    const pending = await this.database.pool.query<PendingRow>(
      `SELECT id,tenant_id,branch_id FROM fiscal_documents
       WHERE status='retry_pending' AND next_retry_at<=now() AND attempt_count<6
       ORDER BY next_retry_at LIMIT 20`,
    );
    for (const row of pending.rows) {
      try {
        await this.fiscal.processScheduledDocument(row.tenant_id, row.branch_id, row.id);
      } catch (error) {
        this.logger.warn(
          JSON.stringify({ type: "fiscal_retry_failed", documentId: row.id, message: safeError(error) }),
        );
      }
    }
  }

  private async processWebhooks() {
    const pending = await this.database.pool.query<PendingRow>(
      `SELECT we.id,we.tenant_id,fd.branch_id FROM fiscal_webhook_events we
       JOIN fiscal_documents fd ON fd.id=we.fiscal_document_id
       WHERE we.status='failed' AND we.attempt_count<6
         AND we.updated_at<=now()-((2^LEAST(we.attempt_count,5))||' minutes')::interval
       ORDER BY we.updated_at LIMIT 20`,
    );
    for (const row of pending.rows) {
      try {
        await this.fiscal.reprocessWebhookEvent(row.tenant_id, row.id);
      } catch (error) {
        await this.database.tenantQuery(
          row.tenant_id,
          `UPDATE fiscal_webhook_events SET attempt_count=attempt_count+1,last_error=$3,
            updated_at=now() WHERE tenant_id=$1 AND id=$2`,
          [row.tenant_id, row.id, safeError(error)],
        );
      }
    }
  }

  private async processArtifacts() {
    const pending = await this.database.pool.query<PendingRow>(
      `SELECT fa.id,fa.tenant_id,fd.branch_id FROM fiscal_artifacts fa
       JOIN fiscal_documents fd ON fd.id=fa.fiscal_document_id
       WHERE fa.status IN ('pending','failed') AND fa.next_retry_at<=now() AND fa.attempt_count<6
       ORDER BY fa.next_retry_at LIMIT 20`,
    );
    for (const row of pending.rows) {
      try {
        await this.fiscal.processArtifact(row.tenant_id, row.id);
      } catch (error) {
        this.logger.warn(
          JSON.stringify({ type: "fiscal_artifact_failed", artifactId: row.id, message: safeError(error) }),
        );
      }
    }
  }

  private async processAlerts() {
    const pending = await this.database.pool.query<{
      id: string;
      tenant_id: string;
      recipient: string;
      reference: string;
      document_type: string;
      rejection_reason: string | null;
      branch_name: string;
    }>(
      `SELECT ad.id,ad.tenant_id,ad.recipient,fd.reference,fd.document_type,
         fd.rejection_reason,b.name AS branch_name
       FROM fiscal_alert_deliveries ad JOIN fiscal_documents fd ON fd.id=ad.fiscal_document_id
       JOIN branches b ON b.id=fd.branch_id
       WHERE ad.status IN ('pending','failed') AND ad.next_retry_at<=now() AND ad.attempt_count<6
       ORDER BY ad.next_retry_at LIMIT 30`,
    );
    for (const row of pending.rows) {
      if (!this.config.RESEND_API_KEY) break;
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `Orien Fiscal <${this.config.ALERT_FROM_EMAIL}>`,
            reply_to: this.config.SUPPORT_EMAIL,
            to: [row.recipient],
            subject: `Documento fiscal requer atenção · ${row.branch_name}`,
            html: fiscalAlertHtml(row),
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`Resend respondeu ${response.status}`);
        await this.database.tenantQuery(
          row.tenant_id,
          `UPDATE fiscal_alert_deliveries SET status='sent',attempt_count=attempt_count+1,
            sent_at=now(),last_error=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
          [row.tenant_id, row.id],
        );
      } catch (error) {
        await this.database.tenantQuery(
          row.tenant_id,
          `UPDATE fiscal_alert_deliveries SET status='failed',attempt_count=attempt_count+1,
            last_error=$3,next_retry_at=now()+((2^LEAST(attempt_count+1,5))||' minutes')::interval,
            updated_at=now() WHERE tenant_id=$1 AND id=$2`,
          [row.tenant_id, row.id, safeError(error)],
        );
      }
    }
  }

  private async markExhausted() {
    await this.database.pool.query(
      `UPDATE fiscal_documents SET status='error',next_retry_at=NULL,
         last_error=COALESCE(last_error,'Limite de tentativas automáticas atingido.'),updated_at=now()
       WHERE status='retry_pending' AND attempt_count>=6`,
    );
  }
}

function fiscalAlertHtml(row: {
  branch_name: string;
  document_type: string;
  reference: string;
  rejection_reason: string | null;
}) {
  return `<div style="font-family:Arial,sans-serif;color:#0b1d3d;line-height:1.5">
    <h1 style="font-size:22px">Documento fiscal requer atenção</h1>
    <p><strong>Loja:</strong> ${escapeHtml(row.branch_name)}</p>
    <p><strong>Documento:</strong> ${escapeHtml(row.document_type.toUpperCase())}</p>
    <p><strong>Referência:</strong> ${escapeHtml(row.reference)}</p>
    <p><strong>Motivo:</strong> ${escapeHtml(row.rejection_reason ?? "Consulte a Central Fiscal.")}</p>
    <p>Acesse a Central Fiscal da Orien para revisar os dados e reenviar com segurança.</p>
    <hr><small>Mensagem operacional automática da Orien.</small>
  </div>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

function safeError(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "Falha interna no processamento fiscal.";
}
