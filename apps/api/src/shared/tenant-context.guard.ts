import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { DatabaseService } from "../modules/database/database.service";
import type { AuthenticatedRequest, TenantContext } from "./request-context";

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("Usuario nao autenticado.");
    }

    const tenantId = readTenantId(request);
    if (!tenantId) {
      throw new ForbiddenException("Header x-tenant-id e obrigatorio para rotas de negocio.");
    }

    const result = await this.database.pool.query<TenantContext>(
      `
      SELECT
        m.tenant_id AS "tenantId",
        m.id AS "membershipId",
        r.slug AS "roleSlug",
        m.branch_id AS "branchId",
        t.status AS "tenantStatus",
        t.plan_slug AS "planSlug",
        COALESCE(array_agg(p.slug) FILTER (WHERE p.slug IS NOT NULL), '{}') AS permissions
      FROM memberships m
      JOIN tenants t ON t.id = m.tenant_id
      JOIN roles r ON r.id = m.role_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE m.user_id = $1
        AND m.tenant_id = $2
        AND m.status = 'active'
        AND m.deleted_at IS NULL
        AND t.deleted_at IS NULL
        AND t.status NOT IN ('suspended', 'cancelled')
       GROUP BY m.id, r.slug, t.status, t.plan_slug
      LIMIT 1
      `,
      [user.userId, tenantId],
    );

    const membership = result.rows[0];
    if (!membership) {
      throw new ForbiddenException("Usuario nao pertence ao tenant informado.");
    }

    const requestedBranchId = readBranchId(request);
    if (requestedBranchId && membership.branchId && requestedBranchId !== membership.branchId) {
      throw new ForbiddenException("Usuario nao possui acesso a filial informada.");
    }

    if (requestedBranchId && !membership.branchId) {
      const branchResult = await this.database.pool.query<{ id: string }>(
        "SELECT id FROM branches WHERE tenant_id = $1 AND id = $2 AND is_active = true AND deleted_at IS NULL",
        [tenantId, requestedBranchId],
      );
      if (!branchResult.rows[0]) {
        throw new ForbiddenException("Filial inexistente ou inativa para o tenant informado.");
      }
    }

    request.tenant = {
      ...membership,
      branchId: membership.branchId ?? requestedBranchId ?? null,
      userId: user.userId,
    };
    return true;
  }
}

function readTenantId(request: AuthenticatedRequest): string | undefined {
  const header = request.headers["x-tenant-id"];
  return Array.isArray(header) ? header[0] : header;
}

function readBranchId(request: AuthenticatedRequest): string | undefined {
  const header = request.headers["x-branch-id"];
  return Array.isArray(header) ? header[0] : header;
}
