import { UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AccountantPortalService } from "./accountant-portal.service";

const tenantId = "tenant-1";
const accessId = "access-1";
const sessionToken = "s".repeat(48);
const linkToken = "l".repeat(48);

describe("AccountantPortalService", () => {
  it("exige uma sessão confirmada antes de expor dados pelo link do contador", async () => {
    const { service } = createHarness();

    await expect(service.portalOverview({ token: linkToken }, "2026-07")).rejects.toThrow(
      "Confirme o código enviado ao e-mail antes de acessar o portal do contador.",
    );
  });

  it("recusa competência fora do período liberado ao contador", async () => {
    const { service } = createHarness({ allowedPeriodEnd: new Date("2026-07-01T00:00:00.000Z") });

    await expect(service.portalOverview({ sessionToken }, "2026-08")).rejects.toThrow(
      "Competência posterior ao fim liberado (2026-07).",
    );
  });

  it("audita a exportação CSV da competência liberada", async () => {
    const { events, service } = createHarness();

    const output = await service.portalCsv({ sessionToken }, "2026-07", { ipAddress: "203.0.113.7" });

    expect(output.toString("utf8")).toContain("Portal do contador Orien");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "overview_viewed", period: "2026-07" }),
        expect.objectContaining({ eventType: "export_downloaded", period: "2026-07", exportFormat: "csv", ipAddress: "203.0.113.7" }),
      ]),
    );
  });

  it("revoga imediatamente a sessão emitida para o contador", async () => {
    const { events, service } = createHarness();

    await service.revoke({ tenantId, userId: "owner-1", membershipId: "membership-1", roleSlug: "owner", permissions: [], branchId: null }, accessId);

    await expect(service.portalOverview({ sessionToken }, "2026-07")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ eventType: "access_revoked" })]));
  });
});

function createHarness(overrides: { allowedPeriodEnd?: Date | null } = {}) {
  const events: Array<{ eventType: string; period?: string | null; exportFormat?: string | null; ipAddress?: string | null }> = [];
  let revoked = false;
  const access = {
    id: accessId,
    tenant_id: tenantId,
    branch_id: null,
    name: "Contabilidade Modelo",
    email: "contador@example.com",
    expires_at: new Date("2026-12-31T23:59:59.000Z"),
    allowed_period_start: new Date("2026-07-01T00:00:00.000Z"),
    allowed_period_end: overrides.allowedPeriodEnd ?? new Date("2026-07-01T00:00:00.000Z"),
    last_used_at: null,
    revoked_at: null,
    created_at: new Date("2026-07-01T00:00:00.000Z"),
    tenant_name: "Empresa piloto",
    branch_name: null,
    session_expires_at: new Date("2026-08-01T00:00:00.000Z"),
  };

  const pool = {
    query: (query: string, values: unknown[] = []) => {
      if (query.includes("FROM accountant_portal_accesses") && query.includes("session_token_hash")) {
        return Promise.resolve({ rows: !revoked && values[0] === hash(sessionToken) ? [access] : [] });
      }
      if (query.includes("FROM accountant_portal_accesses") && query.includes("token_hash")) {
        return Promise.resolve({ rows: values[0] === hash(linkToken) ? [access] : [] });
      }
      if (query.includes("INSERT INTO accountant_portal_events")) {
        events.push({
          eventType: String(values[2]),
          period: values[3] as string | null,
          exportFormat: values[4] as string | null,
          ipAddress: values[5] as string | null,
        });
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    },
  };
  const database = {
    pool,
    tenantQuery: (_tenant: string, query: string, values: unknown[] = []) => {
      if (query.includes("SET revoked_at=now()")) {
        revoked = true;
        return Promise.resolve({ rows: [{ id: values[1] }] });
      }
      return Promise.resolve({ rows: [] });
    },
  };
  const config = {
    WEB_APP_URL: "https://app.useorien.com.br",
    UPLOAD_DIR: "uploads",
    RESEND_API_KEY: "",
    EMAIL_FROM: "no-reply@useorien.com.br",
    SUPPORT_EMAIL: "suporte@useorien.com.br",
  };

  return {
    events,
    service: new AccountantPortalService(database as never, config as never),
  };
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
