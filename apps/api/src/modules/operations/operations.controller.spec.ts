import { describe, expect, it, vi } from "vitest";
import { OperationsController } from "./operations.controller";

const context = {
  tenantId: "tenant-a",
  userId: "user-a",
  membershipId: "membership-a",
  roleSlug: "owner",
  branchId: null,
  permissions: [],
};

describe("OperationsController commercial documents", () => {
  it("keeps the legacy quotes list as an array", async () => {
    const documents = {
      list: vi.fn().mockResolvedValue({ data: [{ id: "doc-a" }], pagination: { total: 1 } }),
    };
    const controller = new OperationsController({} as never, documents as never);
    await expect(controller.quotes(context, {} as never)).resolves.toEqual([{ id: "doc-a" }]);
  });

  it("forwards the idempotency key during conversion", async () => {
    const documents = { convert: vi.fn().mockResolvedValue({ id: "sale-a" }) };
    const controller = new OperationsController({} as never, documents as never);
    await controller.convert(context, "doc-a", "1234567890abcdef");
    expect(documents.convert).toHaveBeenCalledWith(context, "doc-a", "1234567890abcdef");
  });
});
