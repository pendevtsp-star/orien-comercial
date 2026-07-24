import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { permissions } from "@sgc/auth";
import type { SaleCreateInput } from "@sgc/types";
import type { PoolClient } from "pg";
import { ensureBranchAccess } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";
import {
  LoyaltyService,
  type SaleBenefits,
} from "../loyalty/loyalty.service";
import {
  assertAuthoritativeFallbackPrice,
  evaluateMargin,
} from "../pricing/pricing-policy";
import {
  PricingService,
  type PriceResolution,
} from "../pricing/pricing.service";
import {
  composeSale,
  type SaleAdjustmentType,
  type SaleCompositionInput,
} from "./sale-composition";

type ProductRow = {
  id: string;
  name: string;
  sale_price: string;
  cost_price: string;
};

type ResolvedLine = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
  pricingApprovalId?: string;
  resolution: PriceResolution;
  inputItemIndex: number | null;
  isGift: boolean;
};

type ExplicitAdjustment = SaleCompositionInput["adjustments"][number];

export type SaleCompositionResult = {
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    inputItemIndex: number | null;
    pricingApprovalId?: string;
    isGift: boolean;
    quantityMilliunits: number;
    unitPriceCents: number;
    unitCostCents: number;
    grossCents: number;
    directDiscountCents: number;
    allocatedAdjustmentCents: number;
    totalDiscountCents: number;
    netCents: number;
    costCents: number;
    marginBasisPoints: number | null;
    priceWithinLimits: boolean;
    marginStatus: "ok" | "warn" | "block" | "approval_required";
    policy: { id: string | null; version: number | null };
  }>;
  adjustments: Array<{
    id: string;
    type: SaleAdjustmentType;
    sourceId: string | null;
    amountCents: number;
    allocations: Array<{ itemId: string; amountCents: number }>;
  }>;
  totals: {
    grossCents: number;
    discountCents: number;
    netCents: number;
    costCents: number;
  };
  fingerprint: string;
  approvalsRequired: Array<{
    itemId: string;
    productId: string;
    pricingApprovalId?: string;
    reasons: Array<
      "price_below_minimum" | "price_above_maximum" | "margin_approval_required"
    >;
    allocatedAdjustmentCents: number;
    netCents: number;
    costCents: number;
    marginBasisPoints: number | null;
    basketFingerprint: string;
  }>;
  alerts: Array<{
    itemId: string;
    productId: string;
    code: "margin_warning" | "margin_blocked";
  }>;
  loyaltyBenefits: SaleBenefits;
};

@Injectable()
export class SaleCompositionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PricingService) private readonly pricing: PricingService,
    @Inject(LoyaltyService) private readonly loyalty: LoyaltyService,
  ) {}

  preview(context: TenantContext, input: SaleCreateInput) {
    ensureBranchAccess(context, input.branchId);
    return this.database.tenantTransaction(context.tenantId, (client) =>
      this.compose(client, context, input, false),
    );
  }

  prepareForCommit(
    client: PoolClient,
    context: TenantContext,
    input: SaleCreateInput,
  ) {
    ensureBranchAccess(context, input.branchId);
    return this.compose(client, context, input, true);
  }

  private async compose(
    client: PoolClient,
    context: TenantContext,
    input: SaleCreateInput,
    lockBenefits: boolean,
  ): Promise<SaleCompositionResult> {
    await this.assertScope(client, context, input);
    const products = await this.loadProducts(
      client,
      context.tenantId,
      input.branchId,
      input.items.map((item) => item.productId),
    );
    const lines = await Promise.all(
      input.items.map(async (item, index): Promise<ResolvedLine> => {
        const product = products.get(item.productId);
        if (!product) {
          throw new BadRequestException(
            "Um ou mais produtos não existem, estão inativos ou não pertencem à filial.",
          );
        }
        const quantity = Number(item.quantity);
        const resolution = await this.pricing.resolveForSale(
          context,
          {
            productId: item.productId,
            branchId: input.branchId,
            customerId: input.customerId,
            quantity,
            unitPrice: item.unitPrice,
          },
          client,
        );
        let unitPrice = resolution.unitPrice;
        if (!resolution.policyId) {
          try {
            unitPrice = assertAuthoritativeFallbackPrice(item.unitPrice, resolution.unitPrice);
          } catch (error) {
            throw new BadRequestException(
              error instanceof Error ? error.message : "Preço inválido.",
            );
          }
        }
        return {
          id: `line-${index}`,
          productId: item.productId,
          productName: product.name,
          quantity,
          unitPriceCents: moneyToCents(unitPrice),
          unitCostCents: moneyToCents(resolution.costPrice),
          pricingApprovalId: item.pricingApprovalId,
          resolution,
          inputItemIndex: index,
          isGift: false,
        };
      }),
    );
    const directAdjustments = this.directAdjustments(input, lines);
    const directComposition = this.runEngine(context, input, lines, directAdjustments);
    this.assertLegacyDiscountAuthority(context, directComposition.items);

    const benefitInput = {
      branchId: input.branchId,
      customerId: input.customerId,
      grossAmountCents: directComposition.totals.netCents,
      loyaltyPointsToRedeem: input.loyaltyPointsToRedeem,
      loyaltyCouponCode: input.loyaltyCouponCode,
      loyaltyRewardId: input.loyaltyRewardId,
    };
    const loyaltyBenefits = lockBenefits
      ? await this.loyalty.lockSaleBenefits(client, context, benefitInput)
      : await this.loyalty.inspectSaleBenefits(client, context, benefitInput);

    const allLines = [...lines];
    const adjustments: ExplicitAdjustment[] = [
      ...directAdjustments,
      ...loyaltyBenefits.adjustments.map((adjustment) => ({
        id: adjustment.id,
        type: adjustment.type,
        sourceId: adjustment.sourceId,
        amountCents: adjustment.amountCents,
        eligibleItemIds: lines.map((line) => line.id),
      })),
    ];
    if (loyaltyBenefits.gift) {
      const giftLine = await this.resolveGiftLine(
        client,
        context,
        input,
        loyaltyBenefits.gift,
      );
      allLines.push(giftLine);
      adjustments.push({
        id: `bonus-product:${loyaltyBenefits.gift.rewardId}`,
        type: "bonus_product",
        sourceId: loyaltyBenefits.gift.rewardId,
        amountCents: giftLine.unitPriceCents,
        eligibleItemIds: [giftLine.id],
      });
    }

    const composition = this.runEngine(context, input, allLines, adjustments);
    const lineById = new Map(allLines.map((line) => [line.id, line]));
    const approvalsRequired: SaleCompositionResult["approvalsRequired"] = [];
    const alerts: SaleCompositionResult["alerts"] = [];
    const resultItems = composition.items.map((item) => {
      const line = lineById.get(item.id)!;
      const policyOutcome = this.evaluateFinalPolicy(line, item);
      if (!line.isGift && policyOutcome.approvalReasons.length > 0) {
        approvalsRequired.push({
          itemId: item.id,
          productId: item.productId,
          pricingApprovalId: line.pricingApprovalId,
          reasons: policyOutcome.approvalReasons,
          allocatedAdjustmentCents: item.allocatedAdjustmentCents,
          netCents: item.netCents,
          costCents: item.costCents,
          marginBasisPoints: item.marginBasisPoints,
          basketFingerprint: composition.fingerprint,
        });
      }
      if (!line.isGift && policyOutcome.marginStatus === "warn") {
        alerts.push({ itemId: item.id, productId: item.productId, code: "margin_warning" });
      }
      if (!line.isGift && policyOutcome.marginStatus === "block") {
        alerts.push({ itemId: item.id, productId: item.productId, code: "margin_blocked" });
      }
      return {
        ...item,
        productName: line.productName,
        inputItemIndex: line.inputItemIndex,
        pricingApprovalId: line.pricingApprovalId,
        isGift: line.isGift,
        priceWithinLimits: policyOutcome.priceWithinLimits,
        marginStatus: policyOutcome.marginStatus,
      };
    });
    const adjustmentById = new Map(adjustments.map((adjustment) => [adjustment.id, adjustment]));

    return {
      items: resultItems,
      adjustments: composition.adjustments.map((adjustment) => ({
        ...adjustment,
        sourceId: adjustmentById.get(adjustment.id)?.sourceId ?? null,
      })),
      totals: composition.totals,
      fingerprint: composition.fingerprint,
      approvalsRequired,
      alerts,
      loyaltyBenefits,
    };
  }

  private async assertScope(
    client: PoolClient,
    context: TenantContext,
    input: SaleCreateInput,
  ) {
    const branch = await client.query(
      `SELECT id FROM branches
       WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL`,
      [context.tenantId, input.branchId],
    );
    if (!branch.rowCount) throw new BadRequestException("Filial não encontrada.");
    if (!input.customerId) return;
    const customer = await client.query(
      `SELECT id FROM customers
       WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL
         AND (branch_id IS NULL OR branch_id=$3)`,
      [context.tenantId, input.customerId, input.branchId],
    );
    if (!customer.rowCount) {
      throw new BadRequestException("Cliente não encontrado para a filial selecionada.");
    }
  }

  private async loadProducts(
    client: PoolClient,
    tenantId: string,
    branchId: string,
    productIds: string[],
  ) {
    const uniqueIds = [...new Set(productIds)];
    const result = await client.query<ProductRow>(
      `SELECT id,name,sale_price,cost_price
       FROM products
       WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL AND is_active=true
         AND (branch_id IS NULL OR branch_id=$3)`,
      [tenantId, uniqueIds, branchId],
    );
    const products = new Map(result.rows.map((product) => [product.id, product]));
    if (uniqueIds.some((productId) => !products.has(productId))) {
      throw new BadRequestException(
        "Um ou mais produtos não existem, estão inativos ou não pertencem à filial.",
      );
    }
    return products;
  }

  private directAdjustments(input: SaleCreateInput, lines: ResolvedLine[]) {
    return input.items.flatMap((item, index): ExplicitAdjustment[] => {
      const amountCents = moneyToCents(item.discountAmount);
      if (amountCents === 0) return [];
      return [
        {
          id: `item-discount:${lines[index]!.id}`,
          type: "item_discount",
          sourceId: null,
          amountCents,
          eligibleItemIds: [lines[index]!.id],
        },
      ];
    });
  }

  private runEngine(
    context: TenantContext,
    input: SaleCreateInput,
    lines: ResolvedLine[],
    adjustments: ExplicitAdjustment[],
  ) {
    try {
      return composeSale({
        tenantId: context.tenantId,
        branchId: input.branchId,
        customerId: input.customerId ?? null,
        items: lines.map((line) => ({
          id: line.id,
          productId: line.productId,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          unitCostCents: line.unitCostCents,
          policy: {
            id: line.resolution.policyId,
            version: line.resolution.policyVersion,
          },
        })),
        adjustments,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Composição da venda inválida.",
      );
    }
  }

  private assertLegacyDiscountAuthority(
    context: TenantContext,
    items: Array<{ grossCents: number; directDiscountCents: number }>,
  ) {
    const requiresManager = items.some(
      (item) =>
        item.grossCents > 0 && item.directDiscountCents / item.grossCents > 0.1,
    );
    if (requiresManager && !context.permissions.includes(permissions.sales.cancel)) {
      throw new BadRequestException(
        "Descontos acima de 10% exigem autorização de gerente ou administrador.",
      );
    }
  }

  private async resolveGiftLine(
    client: PoolClient,
    context: TenantContext,
    input: SaleCreateInput,
    gift: NonNullable<SaleBenefits["gift"]>,
  ): Promise<ResolvedLine> {
    const products = await this.loadProducts(client, context.tenantId, input.branchId, [gift.productId]);
    const product = products.get(gift.productId)!;
    const resolution = await this.pricing.resolveForSale(
      context,
      {
        productId: gift.productId,
        branchId: input.branchId,
        customerId: input.customerId,
        quantity: 1,
      },
      client,
    );
    return {
      id: `gift:${gift.rewardId}`,
      productId: gift.productId,
      productName: product.name,
      quantity: 1,
      unitPriceCents: moneyToCents(resolution.unitPrice),
      unitCostCents: moneyToCents(resolution.costPrice),
      resolution,
      inputItemIndex: null,
      isGift: true,
    };
  }

  private evaluateFinalPolicy(
    line: ResolvedLine,
    item: {
      quantityMilliunits: number;
      netCents: number;
      marginBasisPoints: number | null;
    },
  ) {
    if (!line.resolution.policyId) {
      return {
        priceWithinLimits: true,
        marginStatus: "ok" as const,
        approvalReasons: [] as SaleCompositionResult["approvalsRequired"][number]["reasons"],
      };
    }
    const minCents = totalForQuantity(line.resolution.minPrice, item.quantityMilliunits);
    const maxCents = totalForQuantity(line.resolution.maxPrice, item.quantityMilliunits);
    const priceWithinLimits =
      (minCents === null || item.netCents >= minCents) &&
      (maxCents === null || item.netCents <= maxCents);
    const marginPercent = (item.marginBasisPoints ?? 0) / 100;
    const marginStatus = line.resolution.marginMode
      ? evaluateMargin(
          {
            minMarginPercent: line.resolution.minMarginPercent,
            marginMode: line.resolution.marginMode,
          },
          marginPercent,
        ).status
      : ("ok" as const);
    const approvalReasons: SaleCompositionResult["approvalsRequired"][number]["reasons"] = [];
    if (minCents !== null && item.netCents < minCents) approvalReasons.push("price_below_minimum");
    if (maxCents !== null && item.netCents > maxCents) approvalReasons.push("price_above_maximum");
    if (marginStatus === "approval_required") approvalReasons.push("margin_approval_required");
    return { priceWithinLimits, marginStatus, approvalReasons };
  }
}

function moneyToCents(value: number) {
  const cents = Math.round(value * 100);
  if (!Number.isFinite(value) || !Number.isSafeInteger(cents) || cents < 0) {
    throw new BadRequestException("Valor monetário inválido na composição da venda.");
  }
  return cents;
}

function totalForQuantity(unitPrice: number | null, quantityMilliunits: number) {
  if (unitPrice === null) return null;
  const unitCents = BigInt(moneyToCents(unitPrice));
  return Number((unitCents * BigInt(quantityMilliunits) + 500n) / 1_000n);
}
