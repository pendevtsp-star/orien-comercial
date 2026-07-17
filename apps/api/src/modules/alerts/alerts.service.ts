import { Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import { APP_CONFIG } from "../config/config.module";
import { DatabaseService } from "../database/database.service";
import { IntegrationsService } from "../integrations/integrations.service";
import type { TenantContext } from "../../shared/request-context";

type AlertType =
  | "low_stock"
  | "overdue_receivables"
  | "cancelled_sales"
  | "open_cash"
  | "pending_purchase"
  | "integration_error";
type Channel = "email" | "in_app";
type RuleInput = {
  type: AlertType;
  channel: Channel;
  recipient: string;
  isActive: boolean;
  branchId?: string | null;
  escalationHours: number;
};
type RuleRow = RuleInput & { id: string };
type Signal = {
  count: number;
  title: string;
  detail: string;
  severity: "info" | "warning" | "critical";
  href: string;
  total?: number;
};

@Injectable()
export class AlertsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IntegrationsService) private readonly integrations: IntegrationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async rules(context: TenantContext) {
    const result = await this.database.tenantQuery<RuleRow>(
      context.tenantId,
      `SELECT id,type,channel,recipient,is_active AS "isActive",branch_id AS "branchId",
              escalation_hours AS "escalationHours"
       FROM alert_rules WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [context.tenantId],
    );
    return { data: result.rows };
  }

  async createRule(context: TenantContext, input: RuleInput) {
    const result = await this.database.tenantQuery<RuleRow>(
      context.tenantId,
      `INSERT INTO alert_rules (tenant_id,type,channel,recipient,is_active,branch_id,escalation_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,type,channel,recipient,is_active AS "isActive",branch_id AS "branchId",
                 escalation_hours AS "escalationHours"`,
      [
        context.tenantId,
        input.type,
        input.channel,
        input.recipient,
        input.isActive,
        input.branchId ?? null,
        input.escalationHours,
      ],
    );
    return result.rows[0];
  }

  async events(context: TenantContext) {
    const result = await this.database.tenantQuery<{
      id: string;
      type: AlertType;
      channel: Channel;
      recipient: string | null;
      status: string;
      severity: Signal["severity"];
      payload: Signal;
      branchId: string | null;
      taskId: string | null;
      sentAt: Date | null;
      resolvedAt: Date | null;
      escalatedAt: Date | null;
      failureReason: string | null;
      createdAt: Date;
    }>(
      context.tenantId,
      `SELECT id,type,channel,recipient,status,severity,payload,branch_id AS "branchId",
              task_id AS "taskId",sent_at AS "sentAt",resolved_at AS "resolvedAt",
              escalated_at AS "escalatedAt",failure_reason AS "failureReason",created_at AS "createdAt"
       FROM alert_events WHERE tenant_id=$1
       ORDER BY resolved_at NULLS FIRST, created_at DESC LIMIT 100`,
      [context.tenantId],
    );
    return { data: result.rows };
  }

  async run(context: TenantContext) {
    const rules = await this.database.tenantQuery<RuleRow>(
      context.tenantId,
      `SELECT id,type,channel,recipient,is_active AS "isActive",branch_id AS "branchId",
              escalation_hours AS "escalationHours"
       FROM alert_rules WHERE tenant_id=$1 AND is_active=true`,
      [context.tenantId],
    );
    const signals = await this.signals(context);
    let created = 0;
    let sent = 0;
    let escalated = 0;

    for (const rule of rules.rows) {
      const signal = signals[rule.type];
      const branchId = rule.branchId ?? context.branchId ?? null;
      const fingerprint = `${rule.id}:${branchId ?? "tenant"}:${new Date().toISOString().slice(0, 10)}`;
      if (!signal.count) {
        await this.database.tenantQuery(
          context.tenantId,
          `UPDATE alert_events SET resolved_at=now(),updated_at=now()
           WHERE tenant_id=$1 AND fingerprint=$2 AND resolved_at IS NULL`,
          [context.tenantId, fingerprint],
        );
        continue;
      }

      const event = await this.database.tenantQuery<{ id: string; taskId: string | null }>(
        context.tenantId,
        `INSERT INTO alert_events
          (tenant_id,rule_id,type,channel,recipient,status,payload,fingerprint,branch_id,severity)
         VALUES ($1,$2,$3,$4,$5,'pending',$6::jsonb,$7,$8,$9)
         ON CONFLICT (tenant_id,fingerprint) WHERE fingerprint IS NOT NULL
         DO UPDATE SET payload=EXCLUDED.payload,severity=EXCLUDED.severity,updated_at=now(),resolved_at=NULL
         RETURNING id,task_id AS "taskId"`,
        [
          context.tenantId,
          rule.id,
          rule.type,
          rule.channel,
          rule.recipient,
          JSON.stringify(signal),
          fingerprint,
          branchId,
          signal.severity,
        ],
      );
      const current = event.rows[0];
      if (!current) continue;
      created += current.taskId ? 0 : 1;

      const taskId = current.taskId ?? (await this.createTask(context, branchId, signal));
      if (taskId) {
        await this.database.tenantQuery(
          context.tenantId,
          "UPDATE alert_events SET task_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [context.tenantId, current.id, taskId],
        );
      }

      const delivery = rule.channel === "in_app" || (await this.sendEmail(context, rule, signal));
      if (delivery) {
        await this.database.tenantQuery(
          context.tenantId,
          "UPDATE alert_events SET status='sent',sent_at=COALESCE(sent_at,now()),updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [context.tenantId, current.id],
        );
        sent += 1;
      }
      const hours = await this.ageInHours(context, current.id);
      if (hours >= rule.escalationHours) {
        await this.database.tenantQuery(
          context.tenantId,
          "UPDATE alert_events SET escalated_at=COALESCE(escalated_at,now()),severity='critical',updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [context.tenantId, current.id],
        );
        escalated += 1;
      }
    }
    return { created, sent, escalated, providerConfigured: Boolean(this.config.RESEND_API_KEY) };
  }

  private async createTask(context: TenantContext, branchId: string | null, signal: Signal) {
    const result = await this.database.tenantQuery<{ id: string }>(
      context.tenantId,
      `INSERT INTO operational_tasks
       (tenant_id,branch_id,title,description,type,priority,created_by_user_id,due_at)
       VALUES ($1,$2,$3,$4,'alert',$5,$6,now()+interval '1 day') RETURNING id`,
      [
        context.tenantId,
        branchId,
        signal.title,
        signal.detail,
        signal.severity === "critical" ? "critical" : "high",
        context.userId ?? null,
      ],
    );
    return result.rows[0]?.id ?? null;
  }

  private async ageInHours(context: TenantContext, eventId: string) {
    const result = await this.database.tenantQuery<{ age: string }>(
      context.tenantId,
      "SELECT extract(epoch FROM (now()-created_at))/3600 AS age FROM alert_events WHERE tenant_id=$1 AND id=$2",
      [context.tenantId, eventId],
    );
    return Number(result.rows[0]?.age ?? 0);
  }

  private async signals(context: TenantContext): Promise<Record<AlertType, Signal>> {
    const params = context.branchId ? [context.tenantId, context.branchId] : [context.tenantId];
    const branchFilter = context.branchId ? "AND branch_id=$2" : "";
    const [low, overdue, cancelled, cash, purchases, integrations] = await Promise.all([
      this.database.tenantQuery<{ count: string }>(context.tenantId, `SELECT count(*)::text count FROM stock_balances sb JOIN products p ON p.id=sb.product_id WHERE sb.tenant_id=$1 AND sb.quantity<=p.min_stock ${context.branchId ? "AND sb.branch_id=$2" : ""}`, params),
      this.database.tenantQuery<{ count: string; total: string }>(context.tenantId, `SELECT count(*)::text count,COALESCE(sum(amount),0)::text total FROM accounts_receivable WHERE tenant_id=$1 AND status IN ('open','overdue') AND due_date<=CURRENT_DATE ${branchFilter}`, params),
      this.database.tenantQuery<{ count: string; total: string }>(context.tenantId, `SELECT count(*)::text count,COALESCE(sum(total_amount),0)::text total FROM sales WHERE tenant_id=$1 AND status='cancelled' AND cancelled_at>=now()-interval '24 hours' ${branchFilter}`, params),
      this.database.tenantQuery<{ count: string }>(context.tenantId, `SELECT count(*)::text count FROM cash_register_sessions WHERE tenant_id=$1 AND status='open' AND opened_at<now()-interval '9 hours' ${branchFilter}`, params),
      this.database.tenantQuery<{ count: string }>(context.tenantId, `SELECT count(*)::text count FROM purchase_orders WHERE tenant_id=$1 AND status IN ('approved','partial') ${branchFilter}`, params),
      this.database.tenantQuery<{ count: string }>(context.tenantId, "SELECT count(*)::text count FROM tenant_integrations WHERE tenant_id=$1 AND status='error'", [context.tenantId]),
    ]);
    return {
      low_stock: { count: Number(low.rows[0]?.count ?? 0), title: "Estoque abaixo do mínimo", detail: "Revise a reposição indicada antes de perder vendas.", severity: "warning", href: "/stock" },
      overdue_receivables: { count: Number(overdue.rows[0]?.count ?? 0), total: Number(overdue.rows[0]?.total ?? 0), title: "Contas vencendo ou vencidas", detail: "Acompanhe as cobranças e priorize a baixa financeira.", severity: "warning", href: "/financial" },
      cancelled_sales: { count: Number(cancelled.rows[0]?.count ?? 0), total: Number(cancelled.rows[0]?.total ?? 0), title: "Cancelamentos recentes", detail: "Revise os motivos, descontos e devoluções registrados no período.", severity: "warning", href: "/sales" },
      open_cash: { count: Number(cash.rows[0]?.count ?? 0), title: "Caixa aberto por mais de 9 horas", detail: "Confira o turno e planeje a conferência de fechamento.", severity: "warning", href: "/pos" },
      pending_purchase: { count: Number(purchases.rows[0]?.count ?? 0), title: "Compras aguardando recebimento", detail: "Confirme entradas para atualizar custos e estoque.", severity: "info", href: "/purchases" },
      integration_error: { count: Number(integrations.rows[0]?.count ?? 0), title: "Integrações exigem revisão", detail: "Teste a conexão antes de depender da operação automatizada.", severity: "critical", href: "/integrations" },
    };
  }

  private async sendEmail(context: TenantContext, rule: RuleRow, signal: Signal) {
    const subject = `Orien: ${signal.title}`;
    const result = await this.integrations.sendTenantEmail(context, {
      to: rule.recipient,
      subject,
      html: `<main style="font-family:Arial,sans-serif;color:#0b1d3d"><h1>${signal.title}</h1><p>${signal.detail}</p><p><strong>Ocorrências:</strong> ${signal.count}</p><p><a href="${this.config.WEB_APP_URL}${signal.href}">Abrir Orien</a></p></main>`,
    });
    return result.sent;
  }
}
