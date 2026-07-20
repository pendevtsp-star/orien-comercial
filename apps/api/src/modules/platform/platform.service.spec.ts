import { describe, expect, it, vi } from "vitest";
import { PlatformService } from "./platform.service";

describe("PlatformService.health", () => {
  it("preserves existing metrics and includes operational jobs and backups", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({ rows: [{ total: 3 }] })
      .mockResolvedValueOnce({ rows: [{ total: 4 }] })
      .mockResolvedValueOnce({ rows: [{ total: 5 }] });
    const operationalHealth = vi.fn().mockResolvedValue({
      queued: 6,
      dead: 7,
      latestBackupAt: new Date("2026-07-18T00:00:00.000Z"),
      latestBackupStatus: "verified",
    });
    const service = new PlatformService(
      { pool: { query } } as never,
      { PLATFORM_OWNER_EMAIL: "owner@example.com" } as never,
      { operationalHealth } as never,
    );

    await expect(service.health()).resolves.toEqual({
      api: "operational",
      database: "operational",
      redis: "operational",
      failedWebhooks: 2,
      disabledIntegrations: 3,
      activeSessions: 4,
      recentApiErrors: 5,
      operational: {
        queued: 6,
        dead: 7,
        latestBackupAt: new Date("2026-07-18T00:00:00.000Z"),
        latestBackupStatus: "verified",
      },
    });
    expect(operationalHealth).toHaveBeenCalledOnce();
  });
});

describe("PlatformService landing publication", () => {
  it("returns only the latest published landing and restores a prior revision", async () => {
    const revisions: Array<{
      id: string;
      value: Record<string, unknown>;
      restoredFromId: string | null;
    }> = [];
    let draft: Record<string, unknown> = {};
    const statements: string[] = [];
    const query = vi.fn(async (statement: string, values: unknown[] = []) => {
      statements.push(statement);
      if (statement.includes("UPDATE platform_landing_settings")) {
        if (statement.includes("SET value=(SELECT value FROM platform_landing_revisions")) {
          const source = revisions.find((revision) => revision.id === values[0]);
          if (source) draft = source.value;
          return { rows: [] };
        }
        draft = JSON.parse(values[0] as string) as Record<string, unknown>;
        return { rows: [] };
      }
      if (statement.includes("SELECT value FROM platform_landing_settings"))
        return { rows: [{ value: draft }] };
      if (statement.includes("INSERT INTO platform_landing_revisions")) {
        if (statement.includes("SELECT value,$2,id")) {
          const source = revisions.find((revision) => revision.id === values[0]);
          if (!source) return { rows: [] };
          const revision = {
            id: `revision-${revisions.length + 1}`,
            value: source.value,
            restoredFromId: source.id,
          };
          revisions.push(revision);
          return { rows: [revision] };
        }
        const revision = {
          id: `revision-${revisions.length + 1}`,
          value: JSON.parse(values[0] as string) as Record<string, unknown>,
          restoredFromId: (values[2] as string | null | undefined) ?? null,
        };
        revisions.push(revision);
        return { rows: [revision] };
      }
      if (statement.includes("WHERE id=$1") && statement.includes("platform_landing_revisions")) {
        return { rows: revisions.filter((revision) => revision.id === values[0]) };
      }
      if (statement.includes("FROM platform_landing_revisions")) {
        return { rows: revisions.slice(-1).reverse() };
      }
      return { rows: [] };
    });
    const service = new PlatformService(
      {
        pool: {
          query,
          connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
        },
      } as never,
      { PLATFORM_OWNER_EMAIL: "owner@example.com" } as never,
      { operationalHealth: vi.fn() } as never,
    );
    const draftA = {
      hero: { title: "Venda com clareza" },
      whatsappNumber: "+55 (11) 99999-9999",
      admin: { internalNotes: "rascunho A" },
      testimonials: [
        {
          testimonialRequestId: "request-1",
          name: "Bruno",
          quote: "A equipe ganhou visibilidade e ritmo nas vendas.",
          imageUrl: "https://cdn.example.test/bruno.jpg",
        },
      ],
    };
    const draftB = {
      hero: { title: "Venda com ritmo" },
      admin: { internalNotes: "rascunho B" },
    };

    await service.updateLandingSettings("operator-1", draftA);
    const first = await service.publishLandingSettings("operator-1");
    await service.updateLandingSettings("operator-1", draftB);
    const publicBeforeSecondPublish = await service.publicLandingSettings();
    expect(publicBeforeSecondPublish.hero.title).toBe(draftA.hero.title);
    expect(publicBeforeSecondPublish.testimonials).toEqual([
      expect.objectContaining({ testimonialRequestId: "request-1" }),
    ]);
    expect(publicBeforeSecondPublish.whatsappNumber).toBe("5511999999999");
    expect(publicBeforeSecondPublish).not.toHaveProperty("admin");
    await service.publishLandingSettings("operator-1");
    const restoreStart = statements.length;
    await service.restoreLandingRevision("operator-1", first.id);
    const restoreStatements = statements.slice(restoreStart);

    const restoredPublic = await service.publicLandingSettings();
    expect(restoredPublic.hero.title).toBe(draftA.hero.title);
    expect(restoredPublic.testimonials).toEqual([
      expect.objectContaining({ testimonialRequestId: "request-1" }),
    ]);
    expect(
      restoreStatements.findIndex((statement) =>
        statement.includes("SELECT value FROM platform_landing_settings WHERE id=true FOR UPDATE"),
      ),
    ).toBeLessThan(
      restoreStatements.findIndex((statement) =>
        statement.includes("INSERT INTO platform_landing_revisions (value,published_by,restored_from_id)"),
      ),
    );
    expect(restoreStatements).toContainEqual(expect.stringContaining("SELECT value,$2,id"));
  });
});

describe("PlatformService testimonials", () => {
  it("preserves previously moderated testimonials while deciding a new one", async () => {
    const harness = createLandingTransactionHarness({
      initialRevisionValue: {
        testimonials: [
          {
            testimonialRequestId: "request-1",
            name: "Bruno",
            quote: "A equipe ganhou visibilidade e ritmo nas vendas.",
          },
        ],
      },
    });
    const service = new PlatformService(
      harness.database as never,
      { PLATFORM_OWNER_EMAIL: "owner@example.com" } as never,
      { operationalHealth: vi.fn() } as never,
    );

    await service.decideTestimonial("operator-1", "request-2", "approve");

    expect(harness.draft).toMatchObject({
      testimonials: expect.arrayContaining([
        expect.objectContaining({ testimonialRequestId: "request-1" }),
        expect.objectContaining({ testimonialRequestId: "request-2" }),
      ]),
    });
  });
});

describe("PlatformService testimonial publication transactions", () => {
  it("publishes approval and revocation immediately through the transaction client", async () => {
    const harness = createLandingTransactionHarness({
      initialRevisionValue: { hero: { title: "Public A" }, testimonials: [] },
      initialDraftValue: { hero: { title: "Draft B" }, testimonials: [] },
    });
    const service = new PlatformService(
      harness.database as never,
      { PLATFORM_OWNER_EMAIL: "owner@example.com" } as never,
      { operationalHealth: vi.fn() } as never,
    );

    await service.decideTestimonial("operator-1", "request-2", "approve");
    const publicAfterApproval = await service.publicLandingSettings();
    expect(publicAfterApproval.hero.title).toBe("Public A");
    expect(publicAfterApproval.testimonials).toEqual([
      expect.objectContaining({ testimonialRequestId: "request-2" }),
    ]);
    expect(harness.draft).toMatchObject({ hero: { title: "Draft B" } });

    await service.decideTestimonial("operator-1", "request-2", "revoke");
    const publicAfterRevocation = await service.publicLandingSettings();
    expect(publicAfterRevocation.hero.title).toBe("Public A");
    expect(publicAfterRevocation.testimonials).toEqual([]);
    expect(harness.draft).toMatchObject({ hero: { title: "Draft B" } });

    expect(transactionWriteStatements(harness.clientQuery)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("UPDATE platform_testimonial_requests"),
        expect.stringContaining("INSERT INTO platform_landing_revisions"),
        expect.stringContaining("UPDATE platform_landing_settings"),
        expect.stringContaining("INSERT INTO platform_audit_logs"),
      ]),
    );
    expect(transactionWriteStatements(harness.poolQuery)).toEqual([]);
  });

  it("copies the selected stored revision value exactly during restore", async () => {
    const historicalValue = {
      hero: { title: "Historico preservado" },
      testimonials: [],
      futureSnapshotField: { keep: "exactly" },
    };
    const harness = createLandingTransactionHarness({ initialRevisionValue: historicalValue });
    const service = new PlatformService(
      harness.database as never,
      { PLATFORM_OWNER_EMAIL: "owner@example.com" } as never,
      { operationalHealth: vi.fn() } as never,
    );

    await service.restoreLandingRevision("operator-1", "revision-1");

    expect(harness.revisions.at(-1)?.value).toEqual(historicalValue);
    expect(harness.draft).toEqual(historicalValue);
    expect(harness.clientQuery.mock.calls).toContainEqual([
      expect.stringContaining("INSERT INTO platform_landing_revisions (value,published_by,restored_from_id)"),
      ["revision-1", "operator-1"],
    ]);
  });

  it("rolls back a testimonial publication when its audit write fails", async () => {
    const harness = createLandingTransactionHarness({ failAudit: true });
    const service = new PlatformService(
      harness.database as never,
      { PLATFORM_OWNER_EMAIL: "owner@example.com" } as never,
      { operationalHealth: vi.fn() } as never,
    );

    await expect(service.decideTestimonial("operator-1", "request-2", "approve")).rejects.toThrow(
      "audit failure",
    );

    expect(harness.draft.testimonials).toEqual([]);
    expect(harness.revisions).toHaveLength(1);
    expect(transactionWriteStatements(harness.poolQuery)).toEqual([]);
    expect(harness.clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });
});

function createLandingTransactionHarness(options: {
  failAudit?: boolean;
  initialRevisionValue?: Record<string, unknown>;
  initialDraftValue?: Record<string, unknown>;
} = {}) {
  const initialValue = options.initialRevisionValue ?? {
    hero: { title: "Publicacao inicial" },
    testimonials: [],
  };
  const initialDraft = options.initialDraftValue ?? initialValue;
  let committed = {
    draft: clone(initialDraft),
    revisions: [
      {
        id: "revision-1",
        value: clone(initialValue),
        restoredFromId: null as string | null,
      },
    ],
    request: {
      id: "request-2",
      status: "submitted",
      name: "Ana",
      company: "Acme",
      role: "Diretora",
      quote: "A Orien organizou nossa rotina comercial em poucos dias.",
      imageUrl: null,
      consent: true,
    },
  };
  let transaction: typeof committed | undefined;
  const state = () => transaction ?? committed;
  const poolQuery = vi.fn(async (statement: string) => {
    if (statement.includes("FROM platform_testimonial_requests")) return { rows: [committed.request] };
    if (statement.includes("FROM platform_landing_revisions"))
      return { rows: [committed.revisions.at(-1)] };
    if (statement.includes("SELECT value FROM platform_landing_settings"))
      return { rows: [{ value: committed.draft }] };
    return { rows: [] };
  });
  const clientQuery = vi.fn(async (statement: string, values: unknown[] = []) => {
    if (statement === "BEGIN") {
      transaction = clone(committed);
      return { rows: [] };
    }
    if (statement === "COMMIT") {
      committed = transaction!;
      transaction = undefined;
      return { rows: [] };
    }
    if (statement === "ROLLBACK") {
      transaction = undefined;
      return { rows: [] };
    }
    if (statement.includes("SELECT value FROM platform_landing_settings"))
      return { rows: [{ value: state().draft }] };
    if (statement.includes("FROM platform_testimonial_requests")) return { rows: [state().request] };
    if (statement.includes("UPDATE platform_testimonial_requests")) {
      state().request.status = values[1] as string;
      return { rows: [] };
    }
    if (statement.includes("INSERT INTO platform_landing_revisions")) {
      if (statement.includes("SELECT value,$2,id")) {
        const source = state().revisions.find((revision) => revision.id === values[0]);
        if (!source) return { rows: [] };
        const revision = {
          id: `revision-${state().revisions.length + 1}`,
          value: clone(source.value),
          restoredFromId: source.id,
        };
        state().revisions.push(revision);
        return { rows: [revision] };
      }
      const revision = {
        id: `revision-${state().revisions.length + 1}`,
        value: JSON.parse(values[0] as string) as Record<string, unknown>,
        restoredFromId: (values[2] as string | null | undefined) ?? null,
      };
      state().revisions.push(revision);
      return { rows: [revision] };
    }
    if (statement.includes("UPDATE platform_landing_settings")) {
      if (statement.includes("SET value=(SELECT value FROM platform_landing_revisions")) {
        const source = state().revisions.find((revision) => revision.id === values[0]);
        if (source) state().draft = clone(source.value);
        return { rows: [] };
      }
      state().draft = JSON.parse(values[0] as string) as Record<string, unknown>;
      return { rows: [] };
    }
    if (statement.includes("FROM platform_landing_revisions"))
      return { rows: [state().revisions.at(-1)] };
    if (statement.includes("INSERT INTO platform_audit_logs")) {
      if (options.failAudit) throw new Error("audit failure");
      return { rows: [] };
    }
    return { rows: [] };
  });
  const database = {
    pool: {
      query: poolQuery,
      connect: vi.fn().mockResolvedValue({ query: clientQuery, release: vi.fn() }),
    },
  };

  return {
    database,
    poolQuery,
    clientQuery,
    get draft() {
      return committed.draft;
    },
    get revisions() {
      return committed.revisions;
    },
  };
}

function transactionWriteStatements(query: ReturnType<typeof vi.fn>) {
  return query.mock.calls
    .map(([statement]) => statement as string)
    .filter((statement) =>
      /UPDATE platform_testimonial_requests|INSERT INTO platform_landing_revisions|UPDATE platform_landing_settings|INSERT INTO platform_audit_logs/.test(
        statement,
      ),
    );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
