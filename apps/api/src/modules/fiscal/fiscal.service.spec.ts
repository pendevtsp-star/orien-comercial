import { ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FiscalService } from "./fiscal.service";

const context = {
  tenantId: "tenant-a",
  userId: "user-a",
  membershipId: "membership-a",
  roleSlug: "manager",
  permissions: ["fiscal.configure", "fiscal.issue"],
  branchId: "branch-a",
};

function createConfig() {
  return {
    NODE_ENV: "test",
    API_PORT: 3001,
    NEXT_PUBLIC_API_URL: "http://localhost:3001/api/v1",
  };
}

function createIntegrations() {
  return {
    hasScopedCredential: vi.fn().mockResolvedValue(false),
    getFiscalConnection: vi.fn().mockResolvedValue(null),
  };
}

describe("FiscalService", () => {
  it("rotates only the selected branch webhook token", async () => {
    const tenantQuery = vi.fn((_tenantId: string, sql: string) => {
      if (sql.includes("FROM branches")) return { rows: [{ id: "branch-a", name: "Matriz" }] };
      return { rows: [] };
    });
    const clientQuery = vi.fn((sql: string, _values?: unknown[]) => {
      if (sql.includes("UPDATE branch_fiscal_settings")) return { rows: [{ id: "settings-a" }] };
      return { rows: [] };
    });
    const database = {
      tenantQuery,
      tenantTransaction: vi.fn((_tenantId: string, callback: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
        callback({ query: clientQuery })),
      pool: { query: vi.fn() },
    };
    const service = new FiscalService(database as never, createIntegrations() as never, createConfig() as never);

    await service.rotateWebhookToken(context, "branch-a");

    const update = clientQuery.mock.calls.find(([sql]) => sql.includes("UPDATE branch_fiscal_settings"));
    expect(update?.[0]).toContain("branch_id");
    expect(update?.[1]).toContain("branch-a");
  });

  it("rejects a webhook event key reused with a different payload", async () => {
    const hash = createHash("sha256").update("e2e-fixture-value").digest("hex");
    const poolQuery = vi.fn().mockResolvedValue({ rows: [{
      id: "document-a",
      tenant_id: "tenant-a",
      branch_id: "branch-a",
      provider: "focus_nfe",
      reference: "orien-nfce-sale-a",
      status: "transmitting",
      webhook_token_hash: hash,
    }] });
    const tenantQuery = vi.fn((_tenantId: string, sql: string) => {
      if (sql.includes("INSERT INTO fiscal_webhook_events")) return { rows: [] };
      if (sql.includes("SELECT payload_digest")) return { rows: [{ payload_digest: "different-digest" }] };
      return { rows: [] };
    });
    const database = {
      pool: { query: poolQuery },
      tenantQuery,
      tenantTransaction: vi.fn(),
    };
    const service = new FiscalService(database as never, createIntegrations() as never, createConfig() as never);

    await expect(service.receiveFocusWebhook("e2e-fixture-value", "focus-event-a", {
      ref: "orien-nfce-sale-a",
      status: "autorizado",
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it("detects a legacy webhook event key before inserting a new event", async () => {
    const hash = createHash("sha256").update("e2e-fixture-value").digest("hex");
    const poolQuery = vi.fn().mockResolvedValue({ rows: [{
      id: "document-a",
      tenant_id: "tenant-a",
      branch_id: "branch-a",
      provider: "focus_nfe",
      reference: "orien-nfce-sale-a",
      status: "transmitting",
      webhook_token_hash: hash,
    }] });
    const tenantQuery = vi.fn((_tenantId: string, sql: string) => {
      if (sql.includes("SELECT id,payload_digest")) return { rows: [{ id: "legacy-event", payload_digest: "different-digest" }] };
      return { rows: [] };
    });
    const database = {
      pool: { query: poolQuery },
      tenantQuery,
      tenantTransaction: vi.fn(),
    };
    const service = new FiscalService(database as never, createIntegrations() as never, createConfig() as never);

    await expect(service.receiveFocusWebhook("e2e-fixture-value", "focus-event-a", {
      ref: "orien-nfce-sale-a",
      status: "autorizado",
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not reapply an already processed webhook event", async () => {
    const tenantQuery = vi.fn().mockResolvedValue({ rows: [{
      fiscal_document_id: "document-a",
      branch_id: "branch-a",
      payload: { ref: "orien-nfce-sale-a", status: "autorizado" },
      status: "processed",
    }] });
    const database = {
      tenantQuery,
      tenantTransaction: vi.fn(),
      pool: { query: vi.fn() },
    };
    const service = new FiscalService(database as never, createIntegrations() as never, createConfig() as never);

    await expect(service.reprocessWebhookEvent("tenant-a", "event-a")).resolves.toEqual({
      accepted: true,
      duplicate: true,
    });
    expect(tenantQuery).toHaveBeenCalledTimes(1);
  });
});
