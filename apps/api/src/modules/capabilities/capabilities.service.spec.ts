import { describe, expect, it, vi } from "vitest";
import { CapabilitiesService } from "./capabilities.service";

describe("CapabilitiesService", () => {
  it("resolves enabled plan features and rollout flags", async () => {
    const tenantQuery = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { planSlug: "pro", resolvedPlanSlug: "pro", key: "cash", value: { enabled: true } },
          {
            planSlug: "pro",
            resolvedPlanSlug: "pro",
            key: "pipeline",
            value: { enabled: false, limit: 25 },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ key: "new-shell", enabled: true }] });
    const service = new CapabilitiesService({ tenantQuery } as never);

    await expect(service.resolveForTenant("tenant-1")).resolves.toMatchObject({
      planSlug: "pro",
      legacyFallback: false,
      features: { cash: true, pipeline: false },
      limits: { pipeline: 25 },
      flags: { "new-shell": true },
    });
  });

  it("keeps legacy tenants available when no plan feature rows exist", async () => {
    const tenantQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ planSlug: null, key: null, value: null }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new CapabilitiesService({ tenantQuery } as never);

    const result = await service.resolveForTenant("tenant-legacy");

    expect(result.legacyFallback).toBe(true);
    expect(Object.values(result.features).every(Boolean)).toBe(true);
  });

  it("denies capabilities missing from a known plan", async () => {
    const tenantQuery = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            planSlug: "starter",
            resolvedPlanSlug: "starter",
            key: "cash",
            value: { enabled: true },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const service = new CapabilitiesService({ tenantQuery } as never);

    const result = await service.resolveForTenant("tenant-starter");

    expect(result.legacyFallback).toBe(false);
    expect(result.features.cash).toBe(true);
    expect(result.features.pipeline).toBe(false);
  });
});
