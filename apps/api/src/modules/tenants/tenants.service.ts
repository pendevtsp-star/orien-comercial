import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import {
  defaultTenantBranding,
  renderEmailHtml,
  resolveBranding,
  type TenantBranding,
} from "@sgc/documents";
import type {
  AuditLogListQuery,
  InviteListQuery,
  MembershipListQuery,
  MembershipUpdateInput,
  PrintingSettingsInput,
  TenantBrandingInput,
  UserInviteInput,
} from "@sgc/types";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service";
import type { TenantContext } from "../../shared/request-context";
import {
  ensureBranchAccess,
  ensureFound,
  pagination,
  resolveSort,
} from "../../shared/resource-access";
import { APP_CONFIG } from "../config/config.module";

interface MeUserRow {
  id: string;
  email: string;
  name: string;
  isEmailVerified: boolean;
  lastLoginAt: Date | null;
  mustChangePassword: boolean;
  isPlatformAdmin?: boolean;
}

interface MembershipRow {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  membershipId: string;
  branchId: string | null;
  branchName?: string | null;
  userId?: string;
  userName?: string;
  userEmail?: string;
  status?: string;
  roleId?: string;
  roleSlug: string;
  roleName?: string;
  permissions: string[];
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  planSlug: string | null;
  createdAt: Date;
}

@Injectable()
export class TenantsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async getMe(userId: string) {
    const userResult = await this.database.pool.query<MeUserRow>(
      'SELECT id, email, name, is_email_verified AS "isEmailVerified", last_login_at AS "lastLoginAt", must_change_password AS "mustChangePassword" FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId],
    );

    const memberships = await this.database.pool.query<MembershipRow>(
      `
      SELECT
        t.id AS "tenantId",
        t.name AS "tenantName",
        t.slug AS "tenantSlug",
        t.status AS "tenantStatus",
        m.id AS "membershipId",
        m.branch_id AS "branchId",
        b.name AS "branchName",
        r.slug AS "roleSlug",
        COALESCE(array_agg(p.slug) FILTER (WHERE p.slug IS NOT NULL), '{}') AS permissions
      FROM memberships m
      JOIN tenants t ON t.id = m.tenant_id
      JOIN roles r ON r.id = m.role_id
      LEFT JOIN branches b ON b.id = m.branch_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE m.user_id = $1 AND m.status = 'active' AND m.deleted_at IS NULL
      GROUP BY t.id, m.id, r.slug, b.name
      ORDER BY t.name ASC
      `,
      [userId],
    );

    const user = userResult.rows[0];
    return {
      user: user
        ? {
            ...user,
            isPlatformAdmin:
              user.email.toLowerCase() === this.config.PLATFORM_OWNER_EMAIL.toLowerCase(),
          }
        : user,
      memberships: memberships.rows,
    };
  }

  async getCurrentTenant(context: TenantContext) {
    const result = await this.database.pool.query<TenantRow>(
      `
      SELECT id, name, slug, status, plan_slug AS "planSlug", created_at AS "createdAt"
      FROM tenants
      WHERE id = $1 AND deleted_at IS NULL
      `,
      [context.tenantId],
    );

    return {
      tenant: result.rows[0],
      membership: context,
      branding: await this.getBranding(context),
    };
  }

  async getBranding(context: TenantContext): Promise<TenantBranding> {
    const result = await this.database.tenantQuery<{
      value: Partial<TenantBranding> | null;
      tenant_name: string;
    }>(
      context.tenantId,
      `
      SELECT ts.value, t.name AS tenant_name
      FROM tenants t
      LEFT JOIN tenant_settings ts
        ON ts.tenant_id = t.id
       AND ts.key = 'branding'
      WHERE t.id = $1
      LIMIT 1
      `,
      [context.tenantId],
    );

    const row = result.rows[0];
    return resolveBranding({
      ...defaultTenantBranding,
      companyName: row?.tenant_name ?? defaultTenantBranding.companyName,
      ...(row?.value ?? {}),
    });
  }

  async updateBranding(context: TenantContext, input: TenantBrandingInput) {
    const result = await this.database.tenantTransaction(context.tenantId, async (client) => {
      const { logoData, ...brandingInput } = input;
      const logoUrl = logoData
        ? await this.persistBrandingLogo(context.tenantId, logoData)
        : brandingInput.logoUrl;
      const branding = resolveBranding({ ...brandingInput, logoUrl });
      await client.query(
        `
        INSERT INTO tenant_settings (tenant_id, key, value)
        VALUES ($1, 'branding', $2::jsonb)
        ON CONFLICT (tenant_id, key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = now()
        `,
        [context.tenantId, JSON.stringify(branding)],
      );

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: currentActor(context),
        action: "tenant.branding.updated",
        entityType: "tenant_settings",
        metadata: {
          companyName: branding.companyName,
          primaryColor: branding.primaryColor,
          accentColor: branding.accentColor,
          hasLogo: Boolean(branding.logoUrl),
        },
      });

      return branding;
    });

    return result;
  }

  async getPrintingSettings(context: TenantContext, branchId?: string) {
    const targetBranchId = branchId ?? context.branchId ?? null;
    if (targetBranchId) {
      assertUuid(targetBranchId, "Filial");
      ensureBranchAccess(context, targetBranchId);
      await this.database.tenantQuery(
        context.tenantId,
        "SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
        [context.tenantId, targetBranchId],
      ).then((result) => ensureFound(result.rows[0], "Filial"));
      const result = await this.database.tenantQuery<{ value: Partial<PrintingSettingsInput> | null }>(
        context.tenantId,
        "SELECT value FROM branch_settings WHERE tenant_id=$1 AND branch_id=$2 AND key='printing' AND deleted_at IS NULL LIMIT 1",
        [context.tenantId, targetBranchId],
      );
      return resolvePrintingSettings({ branchId: targetBranchId, ...(result.rows[0]?.value ?? {}) });
    }

    const result = await this.database.tenantQuery<{ value: Partial<PrintingSettingsInput> | null }>(
      context.tenantId,
      "SELECT value FROM tenant_settings WHERE tenant_id=$1 AND key='printing' AND deleted_at IS NULL LIMIT 1",
      [context.tenantId],
    );
    return resolvePrintingSettings(result.rows[0]?.value ?? {});
  }

  async updatePrintingSettings(context: TenantContext, input: PrintingSettingsInput) {
    const settings = resolvePrintingSettings(input);
    const targetBranchId = input.branchId ?? context.branchId ?? null;
    if (targetBranchId) {
      ensureBranchAccess(context, targetBranchId);
      await this.database.tenantTransaction(context.tenantId, async (client) => {
        await assertBranch(client, context.tenantId, targetBranchId);
        await client.query(
          `
          INSERT INTO branch_settings (tenant_id, branch_id, key, value)
          VALUES ($1, $2, 'printing', $3::jsonb)
          ON CONFLICT (branch_id, key) DO UPDATE
          SET value = EXCLUDED.value, updated_at = now(), deleted_at = NULL
          `,
          [context.tenantId, targetBranchId, JSON.stringify({ ...settings, branchId: targetBranchId })],
        );
        await insertAuditLog(client, {
          tenantId: context.tenantId,
          actorUserId: currentActor(context),
          action: "branch.printing.updated",
          entityType: "branch_settings",
          entityId: targetBranchId,
          metadata: settings,
        });
      });
      return this.getPrintingSettings(context, targetBranchId);
    }

    await this.database.tenantQuery(
      context.tenantId,
      `
      INSERT INTO tenant_settings (tenant_id, key, value)
      VALUES ($1, 'printing', $2::jsonb)
      ON CONFLICT (tenant_id, key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = now(), deleted_at = NULL
      `,
      [context.tenantId, JSON.stringify(settings)],
    );
    return this.getPrintingSettings(context);
  }

  private async persistBrandingLogo(tenantId: string, dataUrl: string) {
    const match = /^data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match)
      throw new BadRequestException("Arquivo de logo inválido. Use PNG, JPEG, WebP ou SVG.");
    const content = Buffer.from(match[2]!, "base64");
    if (!content.length || content.length > 2 * 1024 * 1024)
      throw new BadRequestException("O logo deve ter no máximo 2 MB.");
    const extension = match[1] === "jpeg" ? "jpg" : match[1] === "svg+xml" ? "svg" : match[1]!;
    const folder = resolve(this.config.UPLOAD_DIR, "branding", tenantId);
    await mkdir(folder, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(folder, filename), content);
    return `/uploads/branding/${tenantId}/${filename}`;
  }

  async listMembers(context: TenantContext, query: MembershipListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["m.tenant_id = $1", "m.deleted_at IS NULL"];

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`(m.branch_id = $${params.length} OR m.branch_id IS NULL)`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }

    if (query.status) {
      params.push(query.status);
      filters.push(`m.status = $${params.length}`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `
      SELECT count(*)::text AS total
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE ${filters.join(" AND ")}
      `,
      params,
    );

    params.push(page.pageSize, page.offset);
    const result = await this.database.tenantQuery<MembershipRow>(
      context.tenantId,
      `
      SELECT
        m.id AS "membershipId",
        m.user_id AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        m.branch_id AS "branchId",
        b.name AS "branchName",
        m.status,
        r.id AS "roleId",
        r.slug AS "roleSlug",
        r.name AS "roleName",
        COALESCE(array_agg(p.slug) FILTER (WHERE p.slug IS NOT NULL), '{}') AS permissions
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      JOIN roles r ON r.id = m.role_id
      LEFT JOIN branches b ON b.id = m.branch_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE ${filters.join(" AND ")}
      GROUP BY m.id, u.id, b.id, r.id
      ORDER BY u.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    );

    return { data: result.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async updateMembership(
    context: TenantContext,
    membershipId: string,
    input: MembershipUpdateInput,
  ) {
    ensureBranchAccess(context, input.branchId);

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      await assertRole(client, context.tenantId, input.roleId);
      if (input.branchId) await assertBranch(client, context.tenantId, input.branchId);

      const result = await client.query<MembershipRow>(
        `
        UPDATE memberships
        SET role_id = $3, branch_id = $4, status = $5, updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
        RETURNING id AS "membershipId", user_id AS "userId", branch_id AS "branchId", status
        `,
        [context.tenantId, membershipId, input.roleId, input.branchId ?? null, input.status],
      );

      const membership = ensureFound(result.rows[0], "Membro");
      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: currentActor(context),
        action: "membership.updated",
        entityType: "membership",
        entityId: membershipId,
        metadata: { roleId: input.roleId, branchId: input.branchId ?? null, status: input.status },
      });

      return membership;
    });
  }

  async listInvites(context: TenantContext, query: InviteListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["i.tenant_id = $1", "i.accepted_at IS NULL"];

    if (context.branchId) {
      params.push(context.branchId);
      filters.push(`(i.branch_id = $${params.length} OR i.branch_id IS NULL)`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(
        `(i.email ILIKE $${params.length} OR r.name ILIKE $${params.length} OR COALESCE(b.name, '') ILIKE $${params.length})`,
      );
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `
      SELECT count(*)::text AS total
      FROM invites i
      JOIN roles r ON r.id = i.role_id
      LEFT JOIN branches b ON b.id = i.branch_id
      WHERE ${filters.join(" AND ")}
      `,
      params,
    );

    params.push(page.pageSize, page.offset);

    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT
        i.id,
        i.email,
        i.branch_id AS "branchId",
        b.name AS "branchName",
        i.expires_at AS "expiresAt",
        r.slug AS "roleSlug",
        r.name AS "roleName"
      FROM invites i
      JOIN roles r ON r.id = i.role_id
      LEFT JOIN branches b ON b.id = i.branch_id
      WHERE ${filters.join(" AND ")}
      ORDER BY i.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    );

    return { data: result.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async inviteMember(context: TenantContext, input: UserInviteInput) {
    ensureBranchAccess(context, input.branchId);
    const branding = await this.getBranding(context);

    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const role = await assertRole(client, context.tenantId, input.roleId);
      if (input.branchId) await assertBranch(client, context.tenantId, input.branchId);

      const duplicateMember = await client.query(
        `
        SELECT m.id
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.tenant_id = $1 AND u.email = $2 AND m.deleted_at IS NULL
        `,
        [context.tenantId, input.email],
      );
      if (duplicateMember.rowCount) {
        throw new BadRequestException("Usuario ja participa deste tenant.");
      }

      const token = randomBytes(24).toString("base64url");
      const tokenHash = hashToken(token);

      const result = await client.query<{ id: string }>(
        `
        INSERT INTO invites (tenant_id, email, role_id, branch_id, invited_by_user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, now() + interval '7 days')
        RETURNING id
        `,
        [
          context.tenantId,
          input.email,
          input.roleId,
          input.branchId ?? null,
          currentActor(context),
          tokenHash,
        ],
      );

      await insertAuditLog(client, {
        tenantId: context.tenantId,
        actorUserId: currentActor(context),
        action: "invite.created",
        entityType: "invite",
        entityId: result.rows[0]!.id,
        metadata: { email: input.email, roleSlug: role.slug, branchId: input.branchId ?? null },
      });

      const inviteUrl = `${this.config.WEB_APP_URL}/login?invite=${encodeURIComponent(token)}`;
      return {
        id: result.rows[0]!.id,
        email: input.email,
        inviteToken: token,
        inviteUrl,
        emailPreviewHtml: renderEmailHtml({
          subject: `Convite para acessar ${branding.companyName}`,
          previewText: `Voce foi convidado para acessar ${branding.companyName}.`,
          branding,
          heading: "Convite de acesso",
          intro: `Voce recebeu um convite para entrar no painel de ${branding.companyName}.`,
          bodyHtml: `<p>Use o link abaixo para criar sua senha e concluir seu acesso.</p><p><strong>Perfil:</strong> ${escapeHtml(role.name || role.slug)}</p>`,
          ctaLabel: "Aceitar convite",
          ctaUrl: inviteUrl,
          outro: "Se voce nao esperava este convite, ignore esta mensagem.",
        }),
      };
    });
  }

  async listAuditLogs(context: TenantContext, query: AuditLogListQuery) {
    const page = pagination(query);
    const params: unknown[] = [context.tenantId];
    const filters = ["a.tenant_id = $1"];
    const sort = resolveSort(
      query,
      { createdAt: "a.created_at", action: "a.action", entityType: "a.entity_type" },
      "createdAt",
    );

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(`(a.action ILIKE $${params.length} OR a.entity_type ILIKE $${params.length} OR a.entity_id::text ILIKE $${params.length})`);
    }
    if (query.entityType) {
      params.push(query.entityType);
      filters.push(`a.entity_type = $${params.length}`);
    }
    if (query.entityId) {
      params.push(query.entityId);
      filters.push(`a.entity_id = $${params.length}`);
    }
    if (query.actorUserId) {
      params.push(query.actorUserId);
      filters.push(`a.actor_user_id = $${params.length}`);
    }
    if (query.startDate) {
      params.push(query.startDate);
      filters.push(`a.created_at::date >= $${params.length}::date`);
    }
    if (query.endDate) {
      params.push(query.endDate);
      filters.push(`a.created_at::date <= $${params.length}::date`);
    }

    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `SELECT count(*)::text AS total FROM audit_logs a WHERE ${filters.join(" AND ")}`,
      params,
    );

    params.push(page.pageSize, page.offset);
    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT
        a.id,
        a.action,
        a.entity_type AS "entityType",
        a.entity_id AS "entityId",
        a.metadata,
        a.created_at AS "createdAt",
        u.name AS "actorName"
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sort.field} ${sort.direction}, a.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    );

    return { data: result.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async listRoles(context: TenantContext) {
    const result = await this.database.tenantQuery(
      context.tenantId,
      `
      SELECT
        r.id AS "roleId",
        r.name AS "roleName",
        r.slug AS "roleSlug",
        COALESCE(array_agg(p.slug ORDER BY p.slug) FILTER (WHERE p.slug IS NOT NULL), '{}') AS permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE r.tenant_id = $1
      GROUP BY r.id
      ORDER BY r.name ASC
      `,
      [context.tenantId],
    );
    return { data: result.rows };
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function currentActor(context: TenantContext) {
  return context.userId ?? null;
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`${label} inválida.`);
  }
}

function resolvePrintingSettings(input: Partial<PrintingSettingsInput>): PrintingSettingsInput {
  return {
    branchId: input.branchId,
    labelSize: input.labelSize ?? "50x30",
    dpi: input.dpi ?? "203",
    receiptMode: input.receiptMode ?? "browser",
    receiptCopies: Number(input.receiptCopies ?? 1),
    defaultPrinterName: input.defaultPrinterName ?? "",
    silentPrint: Boolean(input.silentPrint),
  };
}

async function assertRole(client: PoolClient, tenantId: string, roleId: string) {
  const result = await client.query<{ id: string; slug: string; name: string }>(
    "SELECT id, slug, name FROM roles WHERE tenant_id = $1 AND id = $2",
    [tenantId, roleId],
  );
  return ensureFound(result.rows[0], "Perfil");
}

async function assertBranch(client: PoolClient, tenantId: string, branchId: string) {
  const result = await client.query(
    "SELECT id FROM branches WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
    [tenantId, branchId],
  );
  ensureFound(result.rows[0], "Filial");
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
  },
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
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
