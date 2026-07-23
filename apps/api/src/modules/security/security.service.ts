import { Inject, Injectable } from "@nestjs/common";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

interface SecurityEvent {
  id: string;
  eventType: string;
  ipAddress: string;
  userAgent: string;
  details: Record<string, unknown>;
  createdAt: string;
}

interface SessionInfo {
  id: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
}

@Injectable()
export class SecurityService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  // Log security event
  async logSecurityEvent(
    tenantId: string,
    eventType: string,
    ipAddress: string,
    userAgent: string,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.database.tenantQuery(
      tenantId,
      `INSERT INTO security_events (tenant_id, event_type, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, eventType, ipAddress, userAgent, JSON.stringify(details)],
    );
  }

  // Get security events
  async getSecurityEvents(
    context: TenantContext,
    limit = 100,
  ): Promise<SecurityEvent[]> {
    const result = await this.database.tenantQuery<SecurityEvent>(
      context.tenantId,
      `SELECT id, event_type AS "eventType", ip_address AS "ipAddress",
              user_agent AS "userAgent", details, created_at AS "createdAt"
       FROM security_events
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [context.tenantId, limit],
    );
    return result.rows;
  }

  // Check for suspicious activity
  async checkSuspiciousActivity(
    tenantId: string,
    ipAddress: string,
    windowMinutes = 15,
    maxAttempts = 10,
  ): Promise<boolean> {
    const result = await this.database.tenantQuery<{ count: number }>(
      tenantId,
      `SELECT count(*)::int AS count
       FROM security_events
       WHERE tenant_id = $1
         AND ip_address = $2
         AND event_type IN ('login_failed', 'unauthorized_access')
         AND created_at > now() - interval '${windowMinutes} minutes'`,
      [tenantId, ipAddress],
    );
    return (result.rows[0]?.count ?? 0) >= maxAttempts;
  }

  // Get active sessions
  async getActiveSessions(
    context: TenantContext,
  ): Promise<SessionInfo[]> {
    const result = await this.database.tenantQuery<SessionInfo>(
      context.tenantId,
      `SELECT id, user_id AS "userId", ip_address AS "ipAddress",
              user_agent AS "userAgent", created_at AS "createdAt",
              last_activity_at AS "lastActivityAt", expires_at AS "expiresAt"
       FROM sessions
       WHERE tenant_id = $1
         AND revoked_at IS NULL
         AND expires_at > now()
       ORDER BY last_activity_at DESC`,
      [context.tenantId],
    );
    return result.rows;
  }

  // Revoke session
  async revokeSession(
    context: TenantContext,
    sessionId: string,
  ): Promise<void> {
    await this.database.tenantQuery(
      context.tenantId,
      `UPDATE sessions SET revoked_at = now()
       WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
      [sessionId, context.tenantId],
    );
  }

  // Revoke all sessions except current
  async revokeAllSessions(
    context: TenantContext,
    currentSessionId: string,
  ): Promise<number> {
    const result = await this.database.tenantQuery(
      context.tenantId,
      `UPDATE sessions SET revoked_at = now()
       WHERE tenant_id = $1
         AND user_id = $2
         AND id != $3
         AND revoked_at IS NULL`,
      [context.tenantId, context.userId, currentSessionId],
    );
    return result.rowCount ?? 0;
  }

  // Get security summary
  async getSecuritySummary(
    context: TenantContext,
  ): Promise<{
    activeSessions: number;
    recentFailedLogins: number;
    recentSecurityEvents: number;
    lastLogin: string | null;
  }> {
    const sessionsResult = await this.database.tenantQuery<{ count: number }>(
      context.tenantId,
      `SELECT count(*)::int AS count
       FROM sessions
       WHERE tenant_id = $1
         AND revoked_at IS NULL
         AND expires_at > now()`,
      [context.tenantId],
    );

    const failedLoginsResult = await this.database.tenantQuery<{ count: number }>(
      context.tenantId,
      `SELECT count(*)::int AS count
       FROM security_events
       WHERE tenant_id = $1
         AND event_type = 'login_failed'
         AND created_at > now() - interval '24 hours'`,
      [context.tenantId],
    );

    const eventsResult = await this.database.tenantQuery<{ count: number }>(
      context.tenantId,
      `SELECT count(*)::int AS count
       FROM security_events
       WHERE tenant_id = $1
         AND created_at > now() - interval '7 days'`,
      [context.tenantId],
    );

    const lastLoginResult = await this.database.tenantQuery<{ lastLogin: string | null }>(
      context.tenantId,
      `SELECT MAX(last_login_at)::text AS "lastLogin"
       FROM users
       WHERE id = $1`,
      [context.userId],
    );

    return {
      activeSessions: sessionsResult.rows[0]?.count ?? 0,
      recentFailedLogins: failedLoginsResult.rows[0]?.count ?? 0,
      recentSecurityEvents: eventsResult.rows[0]?.count ?? 0,
      lastLogin: lastLoginResult.rows[0]?.lastLogin ?? null,
    };
  }
}
