import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { allCapabilityKeys, type CapabilityKey, type TenantCapabilities } from "@sgc/auth";
import { DatabaseService } from "../database/database.service";
import type { TenantContext } from "../../shared/request-context";

type CapabilityRow = {
  planSlug: string | null;
  resolvedPlanSlug: string | null;
  key: string | null;
  value: Record<string, unknown> | null;
};
type FlagRow = { key: string; enabled: boolean };

@Injectable()
export class CapabilitiesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async resolveForTenant(tenantId: string): Promise<TenantCapabilities> {
    const [planResult, flagsResult] = await Promise.all([
      this.database.tenantQuery<CapabilityRow>(
        tenantId,
        `
         SELECT t.plan_slug AS "planSlug", p.slug AS "resolvedPlanSlug", pf.key, pf.value
        FROM tenants t
        LEFT JOIN plans p ON p.slug = COALESCE(t.plan_slug, 'starter') AND p.is_active = true
        LEFT JOIN plan_features pf ON pf.plan_id = p.id
        WHERE t.id = $1 AND t.deleted_at IS NULL
        `,
        [tenantId],
      ),
      this.database.tenantQuery<FlagRow>(
        tenantId,
        `
        SELECT f.key, COALESCE(o.enabled, f.default_enabled) AS enabled
        FROM platform_feature_flags f
        LEFT JOIN tenant_feature_flag_overrides o
          ON o.feature_flag_id = f.id AND o.tenant_id = $1
        WHERE f.is_active = true
        `,
        [tenantId],
      ),
    ]);

    const plan = planResult.rows[0];
    const featureRows = planResult.rows.filter((row) => row.key);
    const hasPlan = Boolean(plan?.resolvedPlanSlug || plan?.planSlug);
    const legacyFallback = !hasPlan;
    const features = Object.fromEntries(
      allCapabilityKeys.map((key) => {
        const row = featureRows.find((candidate) => candidate.key === key);
        return [key, row ? readEnabled(row.value) : legacyFallback];
      }),
    ) as Record<CapabilityKey, boolean>;
    const limits = Object.fromEntries(
      featureRows.flatMap((row) => {
        const limit = readLimit(row.value);
        return row.key && limit !== undefined ? [[row.key, limit]] : [];
      }),
    ) as Record<string, number | null>;

    return {
      planSlug: plan?.resolvedPlanSlug ?? plan?.planSlug ?? null,
      legacyFallback,
      features,
      limits,
      flags: Object.fromEntries(flagsResult.rows.map((row) => [row.key, row.enabled])),
    };
  }

  async assertCapability(context: TenantContext, capability: CapabilityKey, featureFlag?: string) {
    const capabilities = context.capabilities ?? (await this.resolveForTenant(context.tenantId));
    if (!capabilities.features[capability]) {
      throw new ForbiddenException({
        code: "PLAN_REQUIRED",
        message: "Este recurso nao esta disponivel no plano atual.",
        capability,
        planSlug: capabilities.planSlug,
      });
    }
    if (featureFlag && capabilities.flags[featureFlag] !== true) {
      throw new ForbiddenException({
        code: "FEATURE_NOT_AVAILABLE",
        message: "Este recurso ainda nao esta liberado para esta conta.",
        capability,
      });
    }
    context.capabilities = capabilities;
  }
}

function readEnabled(value: Record<string, unknown> | null | undefined) {
  return value?.enabled !== false;
}

function readLimit(value: Record<string, unknown> | null | undefined) {
  if (!value || !("limit" in value)) return undefined;
  if (value.limit === null) return null;
  return typeof value.limit === "number" && Number.isFinite(value.limit) ? value.limit : undefined;
}
