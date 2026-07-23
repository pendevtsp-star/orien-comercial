import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

interface IntegrationHealth {
  provider: string;
  status: "healthy" | "degraded" | "down";
  lastCheck: string;
  responseTimeMs: number;
  errorMessage?: string;
}

interface BankStatement {
  id: string;
  fileName: string;
  importDate: string;
  transactionCount: number;
  totalAmount: string;
  status: "pending" | "processed" | "error";
}

interface IntegrationLog {
  id: string;
  provider: string;
  action: string;
  status: "success" | "error";
  details: Record<string, unknown>;
  createdAt: string;
}

@Injectable()
export class IntegrationHubService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  // Integration Health Check
  async checkIntegrationHealth(
    context: TenantContext,
  ): Promise<IntegrationHealth[]> {
    const providers = ["asaas_business", "smtp", "whatsapp_meta", "fiscal"];
    const healthChecks: IntegrationHealth[] = [];

    for (const provider of providers) {
      const startTime = Date.now();
      try {
        const result = await this.database.tenantQuery<{ status: string }>(
          context.tenantId,
          `SELECT status FROM tenant_integrations
           WHERE tenant_id = $1 AND provider = $2`,
          [context.tenantId, provider],
        );

        const responseTime = Date.now() - startTime;
        const integration = result.rows[0];

        healthChecks.push({
          provider,
          status: integration?.status === "configured" ? "healthy" : "degraded",
          lastCheck: new Date().toISOString(),
          responseTimeMs: responseTime,
        });
      } catch (error) {
        healthChecks.push({
          provider,
          status: "down",
          lastCheck: new Date().toISOString(),
          responseTimeMs: Date.now() - startTime,
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return healthChecks;
  }

  // Bank Statement Import (OFX)
  async importBankStatement(
    context: TenantContext,
    fileName: string,
    fileContent: string,
    branchId?: string,
  ): Promise<BankStatement> {
    // Parse OFX content (simplified)
    const transactions = this.parseOfxContent(fileContent);
    
    const result = await this.database.tenantQuery<{ id: string }>(
      context.tenantId,
      `INSERT INTO bank_statements (tenant_id, branch_id, file_name, transaction_count, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [
        context.tenantId,
        branchId ?? null,
        fileName,
        transactions.length,
        transactions.reduce((sum, t) => sum + t.amount, 0).toFixed(2),
      ],
    );

    return {
      id: result.rows[0]?.id ?? "",
      fileName,
      importDate: new Date().toISOString(),
      transactionCount: transactions.length,
      totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0).toFixed(2),
      status: "pending",
    };
  }

  private parseOfxContent(content: string): Array<{ date: string; description: string; amount: number }> {
    const transactions: Array<{ date: string; description: string; amount: number }> = [];

    // Simple OFX parser (in production, use a proper OFX library)
    const stmttrnMatches = content.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g);

    for (const match of stmttrnMatches) {
      const stmttrn = match[1] ?? "";
      const dateMatch = stmttrn.match(/<DTPOSTED>(\d{8})/);
      const amountMatch = stmttrn.match(/<TRNAMT>([-\d.]+)/);
      const nameMatch = stmttrn.match(/<NAME>([^<]+)/);

      if (dateMatch?.[1] && amountMatch?.[1]) {
        const dateStr = dateMatch[1];
        transactions.push({
          date: `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
          description: nameMatch?.[1] ?? "Transaction",
          amount: parseFloat(amountMatch[1]),
        });
      }
    }

    return transactions;
  }

  // Get integration logs
  async getIntegrationLogs(
    context: TenantContext,
    provider?: string,
    limit = 50,
  ): Promise<IntegrationLog[]> {
    const params: unknown[] = [context.tenantId, limit];
    let whereClause = "WHERE tenant_id = $1";

    if (provider) {
      params.push(provider);
      whereClause += ` AND provider = $${params.length}`;
    }

    const result = await this.database.tenantQuery<IntegrationLog>(
      context.tenantId,
      `SELECT id, provider, action, status, details, created_at AS "createdAt"
       FROM integration_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );

    return result.rows;
  }

  // Log integration event
  async logIntegrationEvent(
    tenantId: string,
    provider: string,
    action: string,
    status: "success" | "error",
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.database.tenantQuery(
      tenantId,
      `INSERT INTO integration_logs (tenant_id, provider, action, status, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, provider, action, status, JSON.stringify(details)],
    );
  }

  // Get integration statistics
  async getIntegrationStats(
    context: TenantContext,
  ): Promise<{
    totalIntegrations: number;
    activeIntegrations: number;
    failedToday: number;
    successRate: number;
  }> {
    const totalResult = await this.database.tenantQuery<{ count: number }>(
      context.tenantId,
      `SELECT count(*)::int AS count
       FROM tenant_integrations
       WHERE tenant_id = $1`,
      [context.tenantId],
    );

    const activeResult = await this.database.tenantQuery<{ count: number }>(
      context.tenantId,
      `SELECT count(*)::int AS count
       FROM tenant_integrations
       WHERE tenant_id = $1 AND status = 'configured'`,
      [context.tenantId],
    );

    const failedResult = await this.database.tenantQuery<{ count: number }>(
      context.tenantId,
      `SELECT count(*)::int AS count
       FROM integration_logs
       WHERE tenant_id = $1
         AND status = 'error'
         AND created_at > CURRENT_DATE`,
      [context.tenantId],
    );

    const successResult = await this.database.tenantQuery<{ count: number }>(
      context.tenantId,
      `SELECT count(*)::int AS count
       FROM integration_logs
       WHERE tenant_id = $1
         AND created_at > CURRENT_DATE - interval '7 days'`,
      [context.tenantId],
    );

    const errorResult = await this.database.tenantQuery<{ count: number }>(
      context.tenantId,
      `SELECT count(*)::int AS count
       FROM integration_logs
       WHERE tenant_id = $1
         AND status = 'error'
         AND created_at > CURRENT_DATE - interval '7 days'`,
      [context.tenantId],
    );

    const total = (successResult.rows[0]?.count ?? 0) + (errorResult.rows[0]?.count ?? 0);
    const success = successResult.rows[0]?.count ?? 0;

    return {
      totalIntegrations: totalResult.rows[0]?.count ?? 0,
      activeIntegrations: activeResult.rows[0]?.count ?? 0,
      failedToday: failedResult.rows[0]?.count ?? 0,
      successRate: total > 0 ? Math.round((success / total) * 100) : 100,
    };
  }
}
