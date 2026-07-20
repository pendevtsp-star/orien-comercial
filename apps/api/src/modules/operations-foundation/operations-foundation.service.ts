import { BadRequestException, ForbiddenException, Inject, Injectable, Optional } from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import type { PoolClient } from "pg";
import { APP_CONFIG } from "../config/config.module";
import { DatabaseService } from "../database/database.service";

const JOB_BACKOFF_SECONDS = 5;
const JOB_MAX_BACKOFF_SECONDS = 3_600;

export interface OperationalJob {
  id: string;
  tenantId: string | null;
  type: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: "queued" | "running" | "completed" | "dead";
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
}

interface PlatformFeatureFlag {
  id: string;
  key: string;
  description: string | null;
  defaultEnabled: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface TenantFeatureFlagOverride {
  id: string;
  tenantId: string;
  enabled: boolean;
}

interface ConfigurationVersion {
  id: string;
  tenantId: string;
  branchId: string | null;
  configurationKey: string;
  version: number;
  value: Record<string, unknown>;
  createdAt: Date;
}

interface OperationalHealth {
  queued: number;
  dead: number;
  latestBackupAt: Date | null;
  latestBackupStatus: string | null;
}

interface OperationalEvent {
  id: string;
  tenantId: string;
  branchId: string | null;
  eventType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export function calculateJobBackoffSeconds(attempts: number): number {
  return Math.min(JOB_BACKOFF_SECONDS * 2 ** Math.max(0, attempts - 1), JOB_MAX_BACKOFF_SECONDS);
}

@Injectable()
export class OperationsFoundationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject(APP_CONFIG) private readonly config?: Pick<AppConfig, "PLATFORM_OWNER_EMAIL">,
  ) {}

  async assertPlatformOperator(userId: string) {
    const result = await this.database.pool.query<{ email: string; active: boolean }>(
      `SELECT u.email, COALESCE(pa.is_active, false) active
       FROM users u
       LEFT JOIN platform_admins pa ON pa.user_id = u.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    );
    const operator = result.rows[0];
    if (
      !operator ||
      (operator.email.toLowerCase() !== this.config?.PLATFORM_OWNER_EMAIL.toLowerCase() &&
        !operator.active)
    ) {
      throw new ForbiddenException("Acesso restrito a operacoes da plataforma.");
    }
  }

  async resolveFeatureFlag(tenantId: string, key: string) {
    const result = await this.database.tenantQuery<{
      key: string;
      enabled: boolean;
      source: "tenant_override" | "platform_default";
    }>(
      tenantId,
      `SELECT f.key, COALESCE(o.enabled, f.default_enabled) enabled,
        CASE WHEN o.id IS NULL THEN 'platform_default' ELSE 'tenant_override' END source
       FROM platform_feature_flags f
       LEFT JOIN tenant_feature_flag_overrides o
         ON o.feature_flag_id = f.id AND o.tenant_id = $1
       WHERE f.key = $2 AND f.is_active = true`,
      [tenantId, key],
    );
    const flag = result.rows[0];
    if (!flag) throw new BadRequestException("Feature flag inexistente ou inativa.");
    return flag;
  }

  async listFeatureFlags() {
    const result = await this.systemTransaction((client) =>
      client.query<PlatformFeatureFlag>(
        `SELECT id,key,description,default_enabled AS "defaultEnabled",is_active AS "isActive",
          created_at AS "createdAt",updated_at AS "updatedAt"
         FROM platform_feature_flags ORDER BY key`,
      ),
    );
    return result.rows;
  }

  async upsertFeatureFlag(input: { key: string; description?: string; defaultEnabled: boolean }) {
    const result = await this.systemTransaction((client) =>
      client.query<PlatformFeatureFlag>(
        `INSERT INTO platform_feature_flags(key,description,default_enabled)
         VALUES($1,$2,$3)
         ON CONFLICT(key) DO UPDATE SET description=EXCLUDED.description,
           default_enabled=EXCLUDED.default_enabled,updated_at=now()
         RETURNING id,key,description,default_enabled AS "defaultEnabled",is_active AS "isActive"`,
        [input.key, input.description ?? null, input.defaultEnabled],
      ),
    );
    return result.rows[0];
  }

  async setTenantFeatureFlag(
    tenantId: string,
    actorUserId: string,
    input: { key: string; enabled: boolean },
  ) {
    const result = await this.database.tenantTransaction(tenantId, (client) =>
      client.query<TenantFeatureFlagOverride>(
        `INSERT INTO tenant_feature_flag_overrides(tenant_id,feature_flag_id,enabled,actor_user_id)
         SELECT $1,id,$3,$4 FROM platform_feature_flags WHERE key=$2 AND is_active=true
         ON CONFLICT(tenant_id,feature_flag_id) DO UPDATE SET enabled=EXCLUDED.enabled,
           actor_user_id=EXCLUDED.actor_user_id,updated_at=now()
         RETURNING id,tenant_id AS "tenantId",enabled`,
        [tenantId, input.key, input.enabled, actorUserId],
      ),
    );
    if (!result.rows[0]) throw new BadRequestException("Feature flag inexistente ou inativa.");
    return result.rows[0];
  }

  async recordConfigurationVersion(input: {
    tenantId: string;
    branchId?: string | null;
    configurationKey: string;
    value: Record<string, unknown>;
    actorUserId: string;
  }) {
    return this.database.tenantTransaction(input.tenantId, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `configuration-version:${input.tenantId}:${input.branchId ?? "global"}:${input.configurationKey}`,
      ]);
      const result = await client.query<ConfigurationVersion>(
        `INSERT INTO configuration_versions(tenant_id,branch_id,configuration_key,version,value,actor_user_id)
         VALUES($1,$2,$3,
           COALESCE((SELECT max(version) + 1 FROM configuration_versions
             WHERE tenant_id=$1 AND branch_id IS NOT DISTINCT FROM $2 AND configuration_key=$3), 1),
           $4::jsonb,$5)
         RETURNING id,tenant_id AS "tenantId",branch_id AS "branchId",configuration_key AS "configurationKey",
           version,value,created_at AS "createdAt"`,
        [
          input.tenantId,
          input.branchId ?? null,
          input.configurationKey,
          JSON.stringify(input.value),
          input.actorUserId,
        ],
      );
      return result.rows[0];
    });
  }

  async enqueueJob(input: {
    tenantId?: string | null;
    type: string;
    payload?: Record<string, unknown>;
    idempotencyKey: string;
    availableAt?: Date;
    maxAttempts?: number;
  }) {
    const query = (client: PoolClient) =>
      client.query<OperationalJob>(
        `INSERT INTO operational_jobs(tenant_id,type,payload,idempotency_key,available_at,max_attempts)
         VALUES($1,$2,$3::jsonb,$4,$5,$6)
         ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), idempotency_key)
         DO UPDATE SET updated_at=operational_jobs.updated_at
         RETURNING id,tenant_id AS "tenantId",type,payload,idempotency_key AS "idempotencyKey",status,
           attempts,max_attempts AS "maxAttempts",available_at AS "availableAt",locked_at AS "lockedAt",locked_by AS "lockedBy"`,
        [
          input.tenantId ?? null,
          input.type,
          JSON.stringify(input.payload ?? {}),
          input.idempotencyKey,
          input.availableAt ?? new Date(),
          input.maxAttempts ?? 5,
        ],
      );
    const result = input.tenantId
      ? await this.database.tenantTransaction(input.tenantId, query)
      : await this.systemTransaction(query);
    return result.rows[0];
  }

  async recordEventAndEnqueueJob(input: {
    tenantId: string;
    branchId?: string | null;
    eventType: string;
    eventIdempotencyKey: string;
    eventPayload?: Record<string, unknown>;
    aggregateType?: string;
    aggregateId?: string;
    jobType: string;
    jobIdempotencyKey: string;
    jobPayload?: Record<string, unknown>;
    availableAt?: Date;
    maxAttempts?: number;
  }) {
    return this.database.tenantTransaction(input.tenantId, async (client) => {
      const event = await client.query<OperationalEvent>(
        `INSERT INTO operational_events(
          tenant_id,branch_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload
        ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
        ON CONFLICT(tenant_id,idempotency_key)
        DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
        RETURNING id,tenant_id AS "tenantId",branch_id AS "branchId",event_type AS "eventType",
          idempotency_key AS "idempotencyKey",payload`,
        [
          input.tenantId,
          input.branchId ?? null,
          input.eventType,
          input.aggregateType ?? null,
          input.aggregateId ?? null,
          input.eventIdempotencyKey,
          JSON.stringify(input.eventPayload ?? {}),
        ],
      );
      const job = await client.query<OperationalJob>(
        `INSERT INTO operational_jobs(tenant_id,type,payload,idempotency_key,available_at,max_attempts)
         VALUES($1,$2,$3::jsonb,$4,$5,$6)
         ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), idempotency_key)
         DO UPDATE SET updated_at=operational_jobs.updated_at
         RETURNING id,tenant_id AS "tenantId",type,payload,idempotency_key AS "idempotencyKey",status,
           attempts,max_attempts AS "maxAttempts",available_at AS "availableAt",locked_at AS "lockedAt",locked_by AS "lockedBy"`,
        [
          input.tenantId,
          input.jobType,
          JSON.stringify(input.jobPayload ?? {}),
          input.jobIdempotencyKey,
          input.availableAt ?? new Date(),
          input.maxAttempts ?? 5,
        ],
      );
      return { event: event.rows[0]!, job: job.rows[0]! };
    });
  }

  async listJobs(limit = 100) {
    const result = await this.systemTransaction((client) =>
      client.query<OperationalJob>(
        `SELECT id,tenant_id AS "tenantId",type,payload,idempotency_key AS "idempotencyKey",status,
          attempts,max_attempts AS "maxAttempts",available_at AS "availableAt",locked_at AS "lockedAt",locked_by AS "lockedBy"
         FROM operational_jobs ORDER BY created_at DESC LIMIT $1`,
        [Math.min(Math.max(limit, 1), 200)],
      ),
    );
    return result.rows;
  }

  async claimDueJobs(workerId: string, limit: number): Promise<OperationalJob[]> {
    const result = await this.systemTransaction((client) =>
      client.query<OperationalJob>(
        `WITH candidates AS (
          SELECT id FROM operational_jobs
          WHERE status='queued' AND available_at<=now()
          ORDER BY available_at,created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE operational_jobs
        SET status='running',locked_at=now(),locked_by=$2,
          attempts = operational_jobs.attempts + 1,updated_at=now()
        FROM candidates
        WHERE operational_jobs.id=candidates.id
        RETURNING operational_jobs.id,operational_jobs.tenant_id AS "tenantId",operational_jobs.type,
          operational_jobs.payload,operational_jobs.idempotency_key AS "idempotencyKey",operational_jobs.status,
          operational_jobs.attempts,operational_jobs.max_attempts AS "maxAttempts",
          operational_jobs.available_at AS "availableAt",operational_jobs.locked_at AS "lockedAt",
          operational_jobs.locked_by AS "lockedBy"`,
        [Math.min(Math.max(limit, 1), 50), workerId],
      ),
    );
    return result.rows;
  }

  async completeJob(job: OperationalJob, workerId: string) {
    await this.systemTransaction((client) =>
      client.query(
        `UPDATE operational_jobs
         SET status='completed',completed_at=now(),locked_at=NULL,locked_by=NULL,updated_at=now()
         WHERE id=$1 AND status='running' AND locked_by=$2`,
        [job.id, workerId],
      ),
    );
  }

  async failJob(job: OperationalJob, workerId: string, error: unknown) {
    const dead = job.attempts >= job.maxAttempts;
    const availableAt = new Date(Date.now() + calculateJobBackoffSeconds(job.attempts) * 1_000);
    const result = await this.systemTransaction((client) =>
      client.query<{ id: string; status: "queued" | "dead"; attempts: number }>(
        `UPDATE operational_jobs
         SET status = $2,available_at = $3,locked_at = NULL,locked_by = NULL,
           last_error = $4,updated_at = now()
         WHERE id=$1 AND status='running' AND locked_by=$5
         RETURNING id,status,attempts`,
        [
          job.id,
          dead ? "dead" : "queued",
          availableAt,
          error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000),
          workerId,
        ],
      ),
    );
    return result.rows[0];
  }

  async executeInternalJob(job: OperationalJob) {
    if (job.type === "release_notes.expire") {
      await this.systemTransaction((client) =>
        client.query("UPDATE release_notes SET is_pinned=false WHERE expires_at<=now() AND is_pinned=true"),
      );
      return;
    }
    if (job.type === "backup_runs.verify") {
      const backupRunId = job.payload.backupRunId;
      if (typeof backupRunId !== "string") throw new Error("backupRunId is required for backup verification");
      const result = await this.systemTransaction((client) =>
        client.query<{ status: string }>(
          `UPDATE backup_runs
           SET status=CASE WHEN artifact_uri IS NOT NULL AND checksum IS NOT NULL AND byte_count>0
             THEN 'verified' ELSE 'failed' END,
             verified_at=now(),verification_error=CASE WHEN artifact_uri IS NOT NULL AND checksum IS NOT NULL AND byte_count>0
             THEN NULL ELSE 'Backup evidence is incomplete' END,updated_at=now()
           WHERE id=$1 AND status IN ('started','completed','failed')
           RETURNING status`,
          [backupRunId],
        ),
      );
      if (result.rows[0]?.status !== "verified") throw new Error("backup evidence is incomplete");
      return;
    }
    throw new Error(`Unsupported operational job type: ${job.type}`);
  }

  async operationalHealth() {
    const result = await this.systemTransaction((client) =>
      client.query<OperationalHealth>(
        `SELECT
          (SELECT count(*)::int FROM operational_jobs WHERE status='queued') queued,
          (SELECT count(*)::int FROM operational_jobs WHERE status='dead') dead,
          (SELECT started_at FROM backup_runs ORDER BY started_at DESC LIMIT 1) AS "latestBackupAt",
          (SELECT status FROM backup_runs ORDER BY started_at DESC LIMIT 1) AS "latestBackupStatus"`,
      ),
    );
    return result.rows[0];
  }

  private async systemTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.operational_system', 'true', true)");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
