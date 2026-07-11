import { Inject, Injectable } from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class SessionStateService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CacheService) private readonly cache: CacheService,
  ) {}

  async isActive(sessionId: string, userId: string): Promise<boolean> {
    const key = this.key(sessionId);
    const cached = await this.cache.get(key);
    if (cached) return cached === userId;

    const result = await this.database.pool.query(
      "SELECT 1 FROM sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()",
      [sessionId, userId],
    );
    const active = Boolean(result.rowCount);
    await this.cache.set(key, active ? userId : "revoked", active ? 60 : 15);
    return active;
  }

  async markActive(sessionId: string, userId: string) {
    await this.cache.set(this.key(sessionId), userId, 60);
  }

  async revoke(...sessionIds: string[]) {
    await this.cache.delete(...sessionIds.map((id) => this.key(id)));
  }

  private key(sessionId: string) {
    return `orien:session:${sessionId}`;
  }
}
