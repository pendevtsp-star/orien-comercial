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
        COALESCE(array_agg(p.slug) FILTER (WHERE p.slug IS NOT NULL), '{}') AS permissions
      FROM memberships m
      JOIN roles r ON r.id = m.role_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE m.user_id = $1
        AND m.tenant_id = $2
        AND m.status = 'active'
        AND m.deleted_at IS NULL
      GROUP BY m.id, r.slug
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
      const branch = await this.database.pool.query<{ id: string }>(
        "SELECT id FROM branches WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
        [requestedBranchId, tenantId],
      );
      if (!branch.rows[0]) {
        throw new ForbiddenException("Filial informada nao pertence ao tenant ativo.");
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
