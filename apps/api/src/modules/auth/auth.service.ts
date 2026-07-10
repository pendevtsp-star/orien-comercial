import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import { sessions, users } from "@sgc/db";
import type { InviteAcceptInput, LoginInput } from "@sgc/types";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { APP_CONFIG } from "../config/config.module";
import { DatabaseService } from "../database/database.service";
import { PasswordService } from "./password.service";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(PasswordService)
    private readonly passwordService: PasswordService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  async login(input: LoginInput, metadata: { userAgent?: string; ipAddress?: string }): Promise<AuthTokens> {
    const [user] = await this.database.db.select().from(users).where(eq(users.email, input.email)).limit(1);

    if (!user || user.deletedAt) {
      throw new UnauthorizedException("Credenciais invalidas.");
    }

    const valid = await this.passwordService.verifyPassword(
      user.passwordHash,
      input.password,
      this.config.PASSWORD_PEPPER
    );

    if (!valid) {
      throw new UnauthorizedException("Credenciais invalidas.");
    }

    await this.database.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return this.createSession(user.id, metadata);
  }

  async refresh(refreshToken: string | undefined, metadata: { userAgent?: string; ipAddress?: string }) {
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token ausente.");
    }

    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) {
      throw new UnauthorizedException("Refresh token invalido.");
    }

    const [session] = await this.database.db.select().from(sessions).where(eq(sessions.id, parsed.sessionId)).limit(1);

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException("Sessao expirada.");
    }

    if (!safeEqual(session.refreshTokenHash, hashRefreshSecret(parsed.secret, this.config.JWT_REFRESH_SECRET))) {
      throw new UnauthorizedException("Refresh token invalido.");
    }

    await this.database.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
    return this.createSession(session.userId, metadata);
  }

  async logout(sessionId: string | undefined): Promise<void> {
    if (!sessionId) return;
    await this.database.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  async createPasswordReset(email: string) {
    const [user] = await this.database.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) return { accepted: true };

    const resetToken = randomBytes(32).toString("base64url");
    const tokenHash = hashRefreshSecret(resetToken, this.config.JWT_REFRESH_SECRET);

    await this.database.pool.query(
      `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, now() + interval '30 minutes')
      `,
      [user.id, tokenHash]
    );

    return { accepted: true };
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = hashRefreshSecret(token, this.config.JWT_REFRESH_SECRET);
    const result = await this.database.pool.query<{ id: string; user_id: string }>(
      `
      SELECT id, user_id
      FROM password_reset_tokens
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      LIMIT 1
      `,
      [tokenHash]
    );

    const reset = result.rows[0];
    if (!reset) {
      throw new UnauthorizedException("Token de redefinicao invalido ou expirado.");
    }

    const passwordHash = await this.passwordService.hashPassword(password, this.config.PASSWORD_PEPPER);

    await this.database.pool.query("BEGIN");
    try {
      await this.database.pool.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [
        passwordHash,
        reset.user_id
      ]);
      await this.database.pool.query("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1", [reset.id]);
      await this.database.pool.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
        reset.user_id
      ]);
      await this.database.pool.query("COMMIT");
    } catch (error) {
      await this.database.pool.query("ROLLBACK");
      throw error;
    }

    return { ok: true };
  }

  async acceptInvite(input: InviteAcceptInput) {
    const tokenHash = createHash("sha256").update(input.token).digest("hex");
    const inviteResult = await this.database.pool.query<{
      id: string;
      tenant_id: string;
      email: string;
      role_id: string;
      branch_id: string | null;
    }>(
      `
      SELECT i.id, i.tenant_id, i.email, i.role_id, i.branch_id
      FROM invites i
      WHERE i.token_hash = $1
        AND i.accepted_at IS NULL
        AND i.expires_at > now()
      LIMIT 1
      `,
      [tokenHash]
    );

    const invite = inviteResult.rows[0];
    if (!invite) {
      throw new UnauthorizedException("Convite invalido ou expirado.");
    }

    const existingMembership = await this.database.pool.query(
      "SELECT id FROM memberships WHERE tenant_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2) AND deleted_at IS NULL",
      [invite.tenant_id, invite.email]
    );

    if (existingMembership.rowCount) {
      throw new BadRequestException("Este usuario ja participa do tenant.");
    }

    return this.database.tenantTransaction(invite.tenant_id, async (client) => {
      const userResult = await client.query<{ id: string }>(
        `
        INSERT INTO users (email, name, password_hash, is_email_verified)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, is_email_verified = true, updated_at = now()
        RETURNING id
        `,
        [
          invite.email,
          input.name,
          await this.passwordService.hashPassword(input.password, this.config.PASSWORD_PEPPER)
        ]
      );

      const userId = userResult.rows[0]!.id;

      await client.query(
        `
        INSERT INTO memberships (tenant_id, user_id, role_id, branch_id, status)
        VALUES ($1, $2, $3, $4, 'active')
        ON CONFLICT (tenant_id, user_id) DO UPDATE
        SET role_id = EXCLUDED.role_id, branch_id = EXCLUDED.branch_id, status = 'active', updated_at = now()
        `,
        [invite.tenant_id, userId, invite.role_id, invite.branch_id]
      );

      await client.query("UPDATE invites SET accepted_at = now(), updated_at = now() WHERE id = $1", [invite.id]);
      await insertAuditLog(client, {
        tenantId: invite.tenant_id,
        actorUserId: userId,
        action: "invite.accepted",
        entityType: "invite",
        entityId: invite.id,
        metadata: { email: invite.email }
      });

      return this.createSession(userId, {});
    });
  }

  private async createSession(
    userId: string,
    metadata: { userAgent?: string; ipAddress?: string }
  ): Promise<AuthTokens> {
    const sessionId = randomUUID();
    const refreshSecret = randomBytes(48).toString("base64url");
    const refreshToken = `${sessionId}.${refreshSecret}`;
    const refreshTokenHash = hashRefreshSecret(refreshSecret, this.config.JWT_REFRESH_SECRET);

    await this.database.db.insert(sessions).values({
      id: sessionId,
      userId,
      refreshTokenHash,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
    });

    const accessToken = jwt.sign({ sub: userId, sid: sessionId }, this.config.JWT_ACCESS_SECRET, {
      algorithm: "HS256",
      expiresIn: "15m"
    });

    return { accessToken, refreshToken };
  }
}

async function insertAuditLog(
  client: PoolClient,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await client.query(
    `
    INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      input.tenantId,
      input.actorUserId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

function parseRefreshToken(token: string): { sessionId: string; secret: string } | null {
  const [sessionId, secret] = token.split(".");
  if (!sessionId || !secret) return null;
  return { sessionId, secret };
}

function hashRefreshSecret(secret: string, serverSecret: string): string {
  return createHash("sha256").update(`${secret}.${serverSecret}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}
