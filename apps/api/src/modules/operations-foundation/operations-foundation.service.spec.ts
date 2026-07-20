import { describe, expect, it, vi } from "vitest";
import {
  OperationsFoundationService,
  calculateJobBackoffSeconds,
  type OperationalJob,
} from "./operations-foundation.service";

describe("OperationsFoundationService", () => {
  it("resolves a tenant override without querying another tenant", async () => {
    const tenantQuery = vi.fn().mockResolvedValue({
      rows: [{ key: "fiscal.beta", enabled: false, source: "tenant_override" }],
    });
    const service = new OperationsFoundationService({ tenantQuery } as never);

    await expect(service.resolveFeatureFlag("tenant-a", "fiscal.beta")).resolves.toEqual({
      key: "fiscal.beta",
      enabled: false,
      source: "tenant_override",
    });
    expect(tenantQuery).toHaveBeenCalledWith(
      "tenant-a",
      expect.stringContaining("tenant_feature_flag_overrides"),
      ["tenant-a", "fiscal.beta"],
    );
  });

  it("reserves due jobs in one transaction using skip locked", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: "job-1", type: "release_notes.expire" }] })
      .mockResolvedValueOnce(undefined);
    const release = vi.fn();
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) };
    const service = new OperationsFoundationService({ pool } as never);

    await expect(service.claimDueJobs("worker-a", 4)).resolves.toEqual([
      { id: "job-1", type: "release_notes.expire" },
    ]);
    expect(query).toHaveBeenCalledWith("BEGIN");
    const reservationQuery = query.mock.calls.find(([statement]) =>
      typeof statement === "string" && statement.includes("FOR UPDATE SKIP LOCKED"),
    )?.[0] as string;
    expect(reservationQuery).toContain("FOR UPDATE SKIP LOCKED");
    expect(reservationQuery).toContain("attempts = operational_jobs.attempts + 1");
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("uses capped exponential backoff between retries", () => {
    expect(calculateJobBackoffSeconds(1)).toBe(5);
    expect(calculateJobBackoffSeconds(4)).toBe(40);
    expect(calculateJobBackoffSeconds(99)).toBe(3_600);
  });

  it("serializes configuration version allocation for the same tenant branch and key", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: "version-1", version: 2 }] });
    const tenantTransaction = vi.fn(async (_tenantId: string, callback: (client: unknown) => Promise<unknown>) =>
      callback({ query }),
    );
    const service = new OperationsFoundationService({ tenantTransaction } as never);

    await expect(
      service.recordConfigurationVersion({
        tenantId: "tenant-a",
        branchId: "branch-a",
        configurationKey: "printing",
        value: { paper: "a4" },
        actorUserId: "user-a",
      }),
    ).resolves.toEqual({ id: "version-1", version: 2 });

    expect(tenantTransaction).toHaveBeenCalledWith("tenant-a", expect.any(Function));
    expect(query).toHaveBeenNthCalledWith(
      1,
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["configuration-version:tenant-a:branch-a:printing"],
    );
    expect(query.mock.calls[1]?.[0]).toContain("INSERT INTO configuration_versions");
  });

  it("records an idempotent outbox event and its job in the same tenant transaction", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "event-1", idempotencyKey: "sale-1:outbox" }] })
      .mockResolvedValueOnce({ rows: [{ id: "job-1", idempotencyKey: "sale-1:dispatch" }] });
    const tenantTransaction = vi.fn(async (_tenantId: string, callback: (client: unknown) => Promise<unknown>) =>
      callback({ query }),
    );
    const service = new OperationsFoundationService({ tenantTransaction } as never);

    await expect(
      service.recordEventAndEnqueueJob({
        tenantId: "tenant-a",
        eventType: "sale.completed",
        eventIdempotencyKey: "sale-1:outbox",
        eventPayload: { saleId: "sale-1" },
        jobType: "sales.dispatch",
        jobIdempotencyKey: "sale-1:dispatch",
        jobPayload: { saleId: "sale-1" },
      }),
    ).resolves.toEqual({
      event: { id: "event-1", idempotencyKey: "sale-1:outbox" },
      job: { id: "job-1", idempotencyKey: "sale-1:dispatch" },
    });

    expect(tenantTransaction).toHaveBeenCalledTimes(1);
    expect(tenantTransaction).toHaveBeenCalledWith("tenant-a", expect.any(Function));
    expect(query.mock.calls[0]?.[0]).toContain("INSERT INTO operational_events");
    expect(query.mock.calls[0]?.[0]).toContain("ON CONFLICT(tenant_id,idempotency_key)");
    expect(query.mock.calls[1]?.[0]).toContain("INSERT INTO operational_jobs");
    expect(query.mock.calls[1]?.[0]).toContain("ON CONFLICT (COALESCE(tenant_id");
  });

  it("promotes a job to dead after its attempt limit", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "job-1", status: "dead", attempts: 3 }],
    });
    const release = vi.fn();
    const service = new OperationsFoundationService({
      pool: { connect: vi.fn().mockResolvedValue({ query, release }) },
    } as never);
    const job: OperationalJob = {
      id: "job-1",
      tenantId: null,
      type: "release_notes.expire",
      payload: {},
      idempotencyKey: "release-notes-expire-2026-07-18",
      status: "running",
      attempts: 3,
      maxAttempts: 3,
      availableAt: new Date("2026-07-18T00:00:00.000Z"),
      lockedAt: new Date("2026-07-18T00:00:00.000Z"),
      lockedBy: "worker-a",
    };

    await expect(service.failJob(job, "worker-a", new Error("backup metadata missing"))).resolves.toEqual({
      id: "job-1",
      status: "dead",
      attempts: 3,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = $2"),
      expect.arrayContaining(["job-1", "dead", "worker-a"]),
    );
    expect(release).toHaveBeenCalledOnce();
  });
});
