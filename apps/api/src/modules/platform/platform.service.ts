import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import { APP_CONFIG } from "../config/config.module";
import { DatabaseService } from "../database/database.service";
@Injectable()
export class PlatformService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}
  async assertOwner(userId: string) { const result = await this.database.pool.query<{ email:string }>("SELECT email FROM users WHERE id=$1 AND deleted_at IS NULL", [userId]); if (result.rows[0]?.email.toLowerCase() !== this.config.PLATFORM_OWNER_EMAIL.toLowerCase()) throw new ForbiddenException("Acesso restrito à gestão da plataforma."); }
  async overview() { const [tenants, users, active, sessions] = await Promise.all([this.database.pool.query("SELECT count(*)::int AS total FROM tenants WHERE deleted_at IS NULL"), this.database.pool.query("SELECT count(*)::int AS total FROM users WHERE deleted_at IS NULL"), this.database.pool.query("SELECT count(*)::int AS total FROM tenants WHERE status='active' AND deleted_at IS NULL"), this.database.pool.query("SELECT count(*)::int AS total FROM sessions WHERE revoked_at IS NULL AND expires_at>now()")]); return { tenants: tenants.rows[0]?.total ?? 0, activeTenants: active.rows[0]?.total ?? 0, users: users.rows[0]?.total ?? 0, activeSessions: sessions.rows[0]?.total ?? 0 }; }
  async tenants() { const result = await this.database.pool.query(`SELECT t.id,t.name,t.slug,t.status,t.plan_slug AS "planSlug",t.created_at AS "createdAt",count(m.id)::int AS "membersCount" FROM tenants t LEFT JOIN memberships m ON m.tenant_id=t.id AND m.status='active' AND m.deleted_at IS NULL WHERE t.deleted_at IS NULL GROUP BY t.id ORDER BY t.created_at DESC`); return { data: result.rows }; }
}
