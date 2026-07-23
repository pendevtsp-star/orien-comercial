import { describe, expect, it } from "vitest";
import { bulkStatusUpdateSchema, membershipBulkStatusUpdateSchema } from "./index";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

describe("bulk action schemas", () => {
  it("normalizes duplicate resource ids and the optional audit reason", () => {
    expect(
      bulkStatusUpdateSchema.parse({
        ids: [firstId, firstId, secondId],
        isActive: false,
        reason: "  Revisão periódica  ",
      }),
    ).toEqual({ ids: [firstId, secondId], isActive: false, reason: "Revisão periódica" });
  });

  it("rejects empty and oversized resource batches", () => {
    expect(bulkStatusUpdateSchema.safeParse({ ids: [], isActive: true }).success).toBe(false);
    expect(
      bulkStatusUpdateSchema.safeParse({ ids: Array.from({ length: 101 }, () => firstId), isActive: true }).success,
    ).toBe(false);
  });

  it("uses membership-specific ids and statuses", () => {
    expect(
      membershipBulkStatusUpdateSchema.parse({ membershipIds: [firstId], status: "disabled" }),
    ).toEqual({ membershipIds: [firstId], status: "disabled" });
  });

  it("blocks unknown fields to prevent mass assignment", () => {
    expect(
      bulkStatusUpdateSchema.safeParse({ ids: [firstId], isActive: true, tenantId: firstId }).success,
    ).toBe(false);
  });
});
