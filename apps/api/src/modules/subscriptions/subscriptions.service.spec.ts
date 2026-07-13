import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  buildHostedSubscriptionUrl,
  buildMockCheckoutUrl,
  normalizeInvoiceStatus,
  normalizeSubscriptionStatus,
  SubscriptionsService,
} from "./subscriptions.service";

describe("SubscriptionsService helpers", () => {
  it("normalizes Asaas subscription statuses", () => {
    expect(normalizeSubscriptionStatus("RECEIVED")).toBe("active");
    expect(normalizeSubscriptionStatus("OVERDUE")).toBe("past_due");
    expect(normalizeSubscriptionStatus("PENDING")).toBe("pending_activation");
    expect(normalizeSubscriptionStatus("CANCELLED")).toBe("cancelled");
  });

  it("normalizes Asaas invoice statuses", () => {
    expect(normalizeInvoiceStatus("CONFIRMED")).toBe("paid");
    expect(normalizeInvoiceStatus("OVERDUE")).toBe("overdue");
    expect(normalizeInvoiceStatus("CANCELLED")).toBe("cancelled");
    expect(normalizeInvoiceStatus(undefined)).toBe("pending");
  });

  it("builds checkout urls consistently", () => {
    expect(
      buildMockCheckoutUrl("https://sandbox.asaas.com/api/v3", "tenant-1", "starter"),
    ).toContain("/checkout/mock?tenant=tenant-1&plan=starter");
    expect(buildHostedSubscriptionUrl("https://sandbox.asaas.com/api/v3", "sub-123")).toBe(
      "https://sandbox.asaas.com/subscription/sub-123",
    );
  });
});

describe("SubscriptionsService.handleAsaasWebhook", () => {
  it("rejects invalid webhook tokens before touching the database", async () => {
    const pool = { connect: vi.fn() };
    const service = new SubscriptionsService(
      { pool, tenantQuery: vi.fn(), tenantTransaction: vi.fn() } as never,
      {
        ASAAS_WEBHOOK_TOKEN: "expected-token",
      } as never,
      { hashPassword: vi.fn() } as never,
    );

    await expect(
      service.handleAsaasWebhook({ id: "evt-1", event: "PAYMENT_RECEIVED" }, "wrong-token"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("treats repeated events as idempotent duplicates", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "webhook-1", status: "processed" }] })
      .mockResolvedValueOnce(undefined);
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({ query, release });

    const service = new SubscriptionsService(
      { pool: { connect }, tenantQuery: vi.fn(), tenantTransaction: vi.fn() } as never,
      {
        ASAAS_WEBHOOK_TOKEN: "",
      } as never,
      { hashPassword: vi.fn() } as never,
    );

    const result = await service.handleAsaasWebhook({
      id: "evt-duplicated",
      event: "PAYMENT_RECEIVED",
    });

    expect(result).toEqual({ ok: true, duplicated: true });
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query).toHaveBeenNthCalledWith(
      2,
      "SELECT id, status FROM webhook_events WHERE provider = 'asaas' AND event_id = $1",
      ["evt-duplicated"],
    );
    expect(query).toHaveBeenNthCalledWith(3, "COMMIT");
    expect(release).toHaveBeenCalled();
  });
});
