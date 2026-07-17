import { Inject, Injectable } from "@nestjs/common";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class UpdatesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(context: TenantContext) {
    const userId = context.userId!;
    const result = await this.database.tenantQuery<{
      id: string;
      version: string;
      title: string;
      summary: string;
      changes: string[];
      publishedAt: string;
      readAt: string | null;
    }>(
      context.tenantId,
      `SELECT rn.id,rn.version,rn.title,rn.summary,rn.changes,
        rn.published_at AS "publishedAt",rr.read_at AS "readAt"
       FROM release_notes rn
       LEFT JOIN release_note_reads rr ON rr.release_note_id=rn.id AND rr.tenant_id=$1 AND rr.user_id=$2
       WHERE rn.published_at<=now()
         AND (rn.is_pinned = true OR rn.expires_at IS NULL OR rn.expires_at > now())
         AND (cardinality(rn.audience_roles)=0 OR $3=ANY(rn.audience_roles))
       ORDER BY rn.published_at DESC`,
      [context.tenantId, userId, context.roleSlug],
    );
    return {
      data: result.rows,
      unread: result.rows.filter((note) => !note.readAt).length,
    };
  }

  async markRead(context: TenantContext, id: string) {
    await this.database.tenantQuery(
      context.tenantId,
      `INSERT INTO release_note_reads(tenant_id,user_id,release_note_id)
       SELECT $1,$2,rn.id FROM release_notes rn
       WHERE rn.id=$3 AND rn.published_at<=now()
         AND (rn.is_pinned = true OR rn.expires_at IS NULL OR rn.expires_at > now())
         AND (cardinality(rn.audience_roles)=0 OR $4=ANY(rn.audience_roles))
       ON CONFLICT(tenant_id,user_id,release_note_id) DO UPDATE SET read_at=now()`,
      [context.tenantId, context.userId!, id, context.roleSlug],
    );
    return { ok: true };
  }

  async markAllRead(context: TenantContext) {
    await this.database.tenantQuery(
      context.tenantId,
      `INSERT INTO release_note_reads(tenant_id,user_id,release_note_id)
       SELECT $1,$2,rn.id FROM release_notes rn
       WHERE rn.published_at<=now()
         AND (rn.is_pinned = true OR rn.expires_at IS NULL OR rn.expires_at > now())
         AND (cardinality(rn.audience_roles)=0 OR $3=ANY(rn.audience_roles))
       ON CONFLICT(tenant_id,user_id,release_note_id) DO UPDATE SET read_at=now()`,
      [context.tenantId, context.userId!, context.roleSlug],
    );
    return { ok: true };
  }
}
