import "reflect-metadata";
import { permissions } from "@sgc/auth";
import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS_KEY } from "../../shared/require-permissions.decorator";
import { FinancialSettlementsController } from "./financial-settlements.controller";

const context = {
  tenantId: "tenant-a", userId: "user-a", membershipId: "membership-a", roleSlug: "manager",
  permissions: [permissions.financial.reconcile], branchId: "branch-a",
};

describe("FinancialSettlementsController", () => {
  it("delegates mixed payment snapshot resolution to the financial domain service", async () => {
    const resolvePaymentSnapshots = vi.fn().mockResolvedValue([{ netAmountCents: 9_700 }]);
    const controller = new FinancialSettlementsController({ resolvePaymentSnapshots } as never);
    const payments = [{ branchId: "branch-a" }] as never;
    const body = { payments } as never;

    await expect(controller.resolveSnapshots(context, body)).resolves.toEqual([{ netAmountCents: 9_700 }]);
    expect(resolvePaymentSnapshots).toHaveBeenCalledWith(context, payments);
  });

  it("protects configuration and settlement commands with financial reconciliation permission", () => {
    // Decorator metadata is attached to the unbound prototype method itself.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(Reflect.getMetadata(PERMISSIONS_KEY, FinancialSettlementsController.prototype.createFeeRule)).toEqual([
      permissions.financial.reconcile,
    ]);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(Reflect.getMetadata(PERMISSIONS_KEY, FinancialSettlementsController.prototype.createSettlementBatch)).toEqual([
      permissions.financial.reconcile,
    ]);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(Reflect.getMetadata(PERMISSIONS_KEY, FinancialSettlementsController.prototype.createReconciliationBatch)).toEqual([
      permissions.financial.reconcile,
    ]);
  });

  it("protects forecasts with read-only financial permission", () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(Reflect.getMetadata(PERMISSIONS_KEY, FinancialSettlementsController.prototype.forecasts)).toEqual([
      permissions.financial.read,
    ]);
  });
});
