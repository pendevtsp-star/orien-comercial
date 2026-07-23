import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

interface ScheduledReport {
  id: string;
  name: string;
  reportType: string;
  frequency: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  hour: number;
  minute: number;
  recipients: string[];
  filters: Record<string, unknown>;
  isActive: boolean;
  lastSentAt?: string;
}

interface CreateScheduledReportInput {
  name: string;
  reportType: string;
  frequency: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  hour?: number;
  minute?: number;
  recipients: string[];
  filters?: Record<string, unknown>;
}

@Injectable()
export class AutomationService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  // Scheduled Reports
  async listScheduledReports(context: TenantContext): Promise<ScheduledReport[]> {
    const result = await this.database.tenantQuery<ScheduledReport>(
      context.tenantId,
      `SELECT id, name, report_type AS "reportType", frequency, day_of_week AS "dayOfWeek",
              day_of_month AS "dayOfMonth", hour, minute, recipients, filters, is_active AS "isActive",
              last_sent_at AS "lastSentAt"
       FROM scheduled_reports
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [context.tenantId],
    );
    return result.rows;
  }

  async createScheduledReport(context: TenantContext, input: CreateScheduledReportInput): Promise<ScheduledReport> {
    if (!context.userId) throw new BadRequestException("Usuário não identificado.");
    
    const result = await this.database.tenantQuery<ScheduledReport>(
      context.tenantId,
      `INSERT INTO scheduled_reports (tenant_id, user_id, name, report_type, frequency, day_of_week, day_of_month, hour, minute, recipients, filters)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, name, report_type AS "reportType", frequency, day_of_week AS "dayOfWeek",
                 day_of_month AS "dayOfMonth", hour, minute, recipients, filters, is_active AS "isActive"`,
      [
        context.tenantId,
        context.userId,
        input.name,
        input.reportType,
        input.frequency,
        input.dayOfWeek ?? null,
        input.dayOfMonth ?? null,
        input.hour ?? 9,
        input.minute ?? 0,
        input.recipients,
        JSON.stringify(input.filters ?? {}),
      ],
    );
    return result.rows[0] as ScheduledReport;
  }

  async updateScheduledReport(context: TenantContext, id: string, input: Partial<CreateScheduledReportInput>): Promise<ScheduledReport> {
    const existing = await this.database.tenantQuery<{ id: string }>(
      context.tenantId,
      "SELECT id FROM scheduled_reports WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
      [id, context.tenantId],
    );
    if (!existing.rows[0]) throw new NotFoundException("Relatório agendado não encontrado.");

    const updates: string[] = [];
    const params: unknown[] = [context.tenantId, id];
    let paramIndex = 3;

    if (input.name) { updates.push(`name = $${paramIndex++}`); params.push(input.name); }
    if (input.frequency) { updates.push(`frequency = $${paramIndex++}`); params.push(input.frequency); }
    if (input.recipients) { updates.push(`recipients = $${paramIndex++}`); params.push(input.recipients); }
    if (input.filters) { updates.push(`filters = $${paramIndex++}`); params.push(JSON.stringify(input.filters)); }

    if (updates.length === 0) throw new BadRequestException("Nenhuma alteração informada.");

    const result = await this.database.tenantQuery<ScheduledReport>(
      context.tenantId,
      `UPDATE scheduled_reports SET ${updates.join(", ")}, updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING id, name, report_type AS "reportType", frequency, recipients, filters, is_active AS "isActive"`,
      params,
    );
    return result.rows[0] as ScheduledReport;
  }

  async deleteScheduledReport(context: TenantContext, id: string): Promise<void> {
    const result = await this.database.tenantQuery(
      context.tenantId,
      "UPDATE scheduled_reports SET deleted_at = now() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
      [id, context.tenantId],
    );
    if (result.rowCount === 0) throw new NotFoundException("Relatório agendado não encontrado.");
  }

  async toggleScheduledReport(context: TenantContext, id: string): Promise<ScheduledReport> {
    const result = await this.database.tenantQuery<ScheduledReport>(
      context.tenantId,
      `UPDATE scheduled_reports SET is_active = NOT is_active, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, name, report_type AS "reportType", frequency, is_active AS "isActive"`,
      [id, context.tenantId],
    );
    if (!result.rows[0]) throw new NotFoundException("Relatório agendado não encontrado.");
    return result.rows[0];
  }
}
