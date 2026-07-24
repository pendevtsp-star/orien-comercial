import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { permissions } from "@sgc/auth";
import { normalizeQuantity } from "@sgc/types";
import type {
  CustomerSegmentCreateInput,
  PricePolicyCreateInput,
  PricePolicyListQuery,
  PricePolicyResolveQuery,
  PricingApprovalDecisionInput,
  PricingApprovalRequestInput,
} from "@sgc/types";
import type { PoolClient, QueryResultRow } from "pg";
import { ensureBranchAccess, ensureFound, pagination } from "../../shared/resource-access";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";
import { calculateSaleItemPricing, evaluateMargin, roundMoney, type MarginMode } from "./pricing-policy";

type ResolutionRow = QueryResultRow & {
  productId: string;
  productName: string;
  productBranchId: string | null;
  salePrice: string;
  costPrice: string;
  customerSegmentId: string | null;
  customerSegmentCode: string | null;
  legacyFixedPrice: string | null;
  legacyDiscountPercent: string | null;
  policyId: string | null;
  policyVersion: number | null;
  referencePrice: string | null;
  minPrice: string | null;
  maxPrice: string | null;
  minMarginPercent: string | null;
  marginMode: MarginMode | null;
  policyPriority: number | null;
  policyAmbiguous: boolean | null;
};

export type PriceResolution = {
  productId: string;
  productName: string;
  customerSegmentId: string | null;
  customerSegmentCode: string | null;
  policyId: string | null;
  policyVersion: number | null;
  referencePrice: number;
  minPrice: number | null;
  maxPrice: number | null;
  costPrice: number;
  unitPrice: number;
  projectedMarginPercent: number;
  marginStatus: "ok" | "warn" | "block" | "approval_required";
  minMarginPercent: number | null;
  marginMode: MarginMode | null;
  priority: number | null;
  priceWithinLimits: boolean;
};

@Injectable()
export class PricingService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listSegments(context: TenantContext) {
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT id,name,code,is_active AS "isActive",created_at AS "createdAt"
       FROM customer_segments WHERE tenant_id=$1 ORDER BY is_active DESC,name`,
      [context.tenantId],
    );
    return { data: result.rows };
  }

  async createSegment(context: TenantContext, input: CustomerSegmentCreateInput) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<{ id: string; name: string; code: string; isActive: boolean }>(
        `INSERT INTO customer_segments(tenant_id,name,code,is_active,created_by_user_id)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(tenant_id,code) DO UPDATE SET name=EXCLUDED.name,is_active=EXCLUDED.is_active,updated_at=now()
         RETURNING id,name,code,is_active AS "isActive"`,
        [context.tenantId, input.name, input.code, input.isActive, context.userId],
      );
      const segment = ensureFound(result.rows[0], "Segmento de cliente");
      await this.insertAuditInTransaction(client, context, "pricing.segment.saved", "customer_segment", segment.id);
      return segment;
    });
  }

  async listPendingApprovals(context: TenantContext) {
    const values: unknown[] = [context.tenantId];
    const branchFilter = context.branchId
      ? ` AND pa.branch_id=$${values.push(context.branchId)}`
      : "";
    const result = await this.database.tenantQuery(
      context.tenantId,
      `SELECT pa.id,pa.product_id AS "productId",p.name AS "productName",
              pa.branch_id AS "branchId",b.name AS "branchName",
              pa.requested_by_user_id AS "requestedByUserId",u.name AS "requestedByName",
              pa.requested_unit_price AS "requestedUnitPrice",
              pa.requested_discount_amount AS "requestedDiscountAmount",
              pa.requested_total_amount AS "requestedTotalAmount",
              pa.requested_cost_amount AS "requestedCostAmount",
              pa.requested_margin_percent AS "requestedMarginPercent",
              pa.quantity,pa.reason,pa.expires_at AS "expiresAt",pa.created_at AS "createdAt"
       FROM pricing_approvals pa
       JOIN products p ON p.tenant_id=pa.tenant_id AND p.id=pa.product_id
       JOIN branches b ON b.tenant_id=pa.tenant_id AND b.id=pa.branch_id
       JOIN users u ON u.id=pa.requested_by_user_id
       WHERE pa.tenant_id=$1 AND pa.status='pending' AND pa.expires_at > now()${branchFilter}
       ORDER BY pa.expires_at,pa.created_at`,
      values,
    );
    return { data: result.rows };
  }

  async listPolicies(context: TenantContext, query: PricePolicyListQuery) {
    const page = pagination(query);
    const values: unknown[] = [context.tenantId];
    const filters = ["pp.tenant_id=$1"];
    if (query.productId) {
      values.push(query.productId);
      filters.push(`pp.product_id=$${values.length}`);
    }
    const branchId = this.scopedBranchId(context, query.branchId);
    if (branchId) {
      values.push(branchId);
      filters.push(`pp.branch_id=$${values.length}`);
    }
    if (query.customerSegmentId) {
      values.push(query.customerSegmentId);
      filters.push(`pp.customer_segment_id=$${values.length}`);
    }
    if (typeof query.isActive === "boolean") {
      values.push(query.isActive);
      filters.push(`pp.is_active=$${values.length}`);
    }
    const count = await this.database.tenantQuery<{ total: string }>(
      context.tenantId,
      `SELECT count(*)::text AS total FROM price_policies pp WHERE ${filters.join(" AND ")}`,
      values,
    );
    values.push(page.pageSize, page.offset);
    const rows = await this.database.tenantQuery(
      context.tenantId,
      `SELECT pp.id,pp.product_id AS "productId",p.name AS "productName",pp.branch_id AS "branchId",
        b.name AS "branchName",pp.customer_segment_id AS "customerSegmentId",cs.name AS "customerSegmentName",
        pp.starts_at AS "startsAt",pp.ends_at AS "endsAt",pp.min_quantity AS "minQuantity",
        pp.reference_price AS "referencePrice",pp.min_price AS "minPrice",pp.max_price AS "maxPrice",
        pp.min_margin_percent AS "minMarginPercent",pp.margin_mode AS "marginMode",pp.priority,pp.version,
        pp.is_active AS "isActive",pp.created_at AS "createdAt"
       FROM price_policies pp
       JOIN products p ON p.id=pp.product_id AND p.tenant_id=pp.tenant_id
       LEFT JOIN branches b ON b.id=pp.branch_id AND b.tenant_id=pp.tenant_id
       LEFT JOIN customer_segments cs ON cs.id=pp.customer_segment_id AND cs.tenant_id=pp.tenant_id
       WHERE ${filters.join(" AND ")}
       ORDER BY pp.created_at DESC,pp.version DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { data: rows.rows, pagination: { ...page, total: Number(count.rows[0]?.total ?? 0) } };
  }

  async createPolicy(context: TenantContext, input: PricePolicyCreateInput) {
    const scopedInput = { ...input, branchId: this.scopedBranchId(context, input.branchId) };
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      await this.assertPolicyReferences(client, context, scopedInput);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `pricing-policy:${context.tenantId}:${scopedInput.productId}:${scopedInput.branchId ?? "all"}:${scopedInput.customerSegmentId ?? "all"}:${scopedInput.minQuantity}`,
      ]);
      const versionResult = await client.query<{ version: number }>(
        `SELECT COALESCE(MAX(version),0)::int + 1 AS version
         FROM price_policies
         WHERE tenant_id=$1 AND product_id=$2
           AND branch_id IS NOT DISTINCT FROM $3::uuid
           AND customer_segment_id IS NOT DISTINCT FROM $4::uuid
           AND min_quantity=$5`,
        [context.tenantId, scopedInput.productId, scopedInput.branchId ?? null, scopedInput.customerSegmentId ?? null, scopedInput.minQuantity],
      );
      const version = versionResult.rows[0]?.version ?? 1;
      const created = await client.query<{ id: string }>(
        `INSERT INTO price_policies(
          tenant_id,product_id,branch_id,customer_segment_id,starts_at,ends_at,min_quantity,
          reference_price,min_price,max_price,min_margin_percent,margin_mode,priority,version,created_by_user_id
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [
          context.tenantId,
          scopedInput.productId,
          scopedInput.branchId ?? null,
          scopedInput.customerSegmentId ?? null,
          scopedInput.startsAt ?? null,
          scopedInput.endsAt ?? null,
          scopedInput.minQuantity,
          scopedInput.referencePrice,
          scopedInput.minPrice,
          scopedInput.maxPrice,
          scopedInput.minMarginPercent ?? null,
          scopedInput.marginMode,
          scopedInput.priority,
          version,
          context.userId,
        ],
      );
      const policyId = created.rows[0]!.id;
      await this.insertAuditInTransaction(client, context, "pricing.policy.version_created", "price_policy", policyId, {
        version,
      });
      return { id: policyId, version };
    });
  }

  async deactivatePolicy(context: TenantContext, policyId: string) {
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const values: unknown[] = [context.tenantId, policyId];
      const branchFilter = context.branchId ? ` AND branch_id=$${values.push(context.branchId)}` : "";
      const result = await client.query<{ id: string }>(
        `UPDATE price_policies SET is_active=false,updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND is_active=true${branchFilter} RETURNING id`,
        values,
      );
      ensureFound(result.rows[0], "Política de preço");
      await this.insertAuditInTransaction(client, context, "pricing.policy.deactivated", "price_policy", policyId);
      return { ok: true };
    });
  }

  async resolve(context: TenantContext, input: PricePolicyResolveQuery): Promise<PriceResolution> {
    ensureBranchAccess(context, input.branchId);
    const result = await this.database.tenantQuery<ResolutionRow>(
      context.tenantId,
      pricingResolutionSql,
      [context.tenantId, input.productId, input.branchId, input.customerId ?? null, input.quantity],
    );
    return this.mapResolution(ensureFound(result.rows[0], "Produto"), input.unitPrice);
  }

  async resolveForSale(
    context: TenantContext,
    input: PricePolicyResolveQuery,
    client: PoolClient,
  ): Promise<PriceResolution> {
    const result = await client.query<ResolutionRow>(pricingResolutionSql, [
      context.tenantId,
      input.productId,
      input.branchId,
      input.customerId ?? null,
      input.quantity,
    ]);
    return this.mapResolution(ensureFound(result.rows[0], "Produto"), input.unitPrice);
  }

  async createApproval(context: TenantContext, input: PricingApprovalRequestInput) {
    ensureBranchAccess(context, input.branchId);
    return this.database.tenantTransaction(context.tenantId, async (client) => {
      const quantity = normalizeQuantity(input.quantity);
      const allocatedAdjustmentAmount = roundMoney(input.allocatedAdjustmentAmount ?? 0);
      const baseResolution = await this.resolveForSale(context, { ...input, quantity }, client);
      const itemPricing = calculateSaleItemPricing({
        unitPrice: input.unitPrice,
        costPrice: baseResolution.costPrice,
        minPrice: baseResolution.minPrice,
        maxPrice: baseResolution.maxPrice,
        quantity,
        discountAmount: roundMoney(input.discountAmount + allocatedAdjustmentAmount),
      });
      const resolution = {
        ...baseResolution,
        unitPrice: itemPricing.effectiveUnitPrice,
        projectedMarginPercent: itemPricing.projectedMarginPercent,
        marginStatus: baseResolution.marginMode
          ? evaluateMargin(
              { minMarginPercent: baseResolution.minMarginPercent, marginMode: baseResolution.marginMode },
              itemPricing.projectedMarginPercent,
            ).status
          : "ok" as const,
        priceWithinLimits: itemPricing.priceWithinLimits,
      };
      if (!resolution.policyId) throw new BadRequestException("Não há política ativa para solicitar aprovação.");
      if (resolution.marginStatus === "block") {
        throw new ForbiddenException("A política bloqueia esta margem e não permite aprovação.");
      }
      if (resolution.priceWithinLimits && resolution.marginStatus !== "approval_required") {
        throw new BadRequestException("Esta venda não exige aprovação de preço ou margem.");
      }
      const created = await client.query<{ id: string; expires_at: Date }>(
        `INSERT INTO pricing_approvals(
          tenant_id,product_id,branch_id,customer_segment_id,price_policy_id,price_policy_version,
          requested_unit_price,requested_discount_amount,requested_allocated_adjustment_amount,
          requested_total_amount,requested_cost_amount,quantity,requested_margin_percent,
          basket_fingerprint,reason,requested_by_user_id
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id,expires_at`,
        [
          context.tenantId,
          input.productId,
          input.branchId,
          resolution.customerSegmentId,
          resolution.policyId,
          resolution.policyVersion,
          input.unitPrice,
          input.discountAmount,
          allocatedAdjustmentAmount,
          itemPricing.netTotal,
          itemPricing.costTotal,
          quantity,
          resolution.projectedMarginPercent,
          input.basketFingerprint ?? null,
          input.reason,
          context.userId,
        ],
      );
      await this.insertAuditInTransaction(client, context, "pricing.approval.requested", "pricing_approval", created.rows[0]!.id);
      return { id: created.rows[0]!.id, expiresAt: created.rows[0]!.expires_at };
    });
  }

  async decideApproval(
    context: TenantContext,
    approvalId: string,
    input: PricingApprovalDecisionInput,
  ) {
    if (!context.permissions.includes(permissions.pricing.authorizeException)) {
      throw new ForbiddenException("Permissão insuficiente para autorizar exceção de preço.");
    }
    const outcome = await this.database.tenantTransaction(context.tenantId, async (client) => {
      const found = await client.query<{
        requested_by_user_id: string;
        branch_id: string;
        status: string;
        expires_at: Date;
      }>(
        `SELECT requested_by_user_id,branch_id,status,expires_at FROM pricing_approvals
         WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [context.tenantId, approvalId],
      );
      const approval = ensureFound(found.rows[0], "Solicitação de aprovação");
      ensureBranchAccess(context, approval.branch_id);
      if (approval.requested_by_user_id === context.userId) {
        throw new ForbiddenException("O solicitante não pode aprovar a própria exceção.");
      }
      if (approval.status !== "pending") throw new BadRequestException("Esta solicitação já foi decidida.");
      if (new Date(approval.expires_at) <= new Date()) {
        await client.query(
          "UPDATE pricing_approvals SET status='expired',updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [context.tenantId, approvalId],
        );
        return { kind: "expired" as const };
      }
      const status = input.approved ? "approved" : "rejected";
      await client.query(
        `UPDATE pricing_approvals
         SET status=$3,approved_by_user_id=$4,approved_at=now(),decision_reason=$5,updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [context.tenantId, approvalId, status, context.userId, input.reason ?? null],
      );
      await this.insertAuditInTransaction(client, context, `pricing.approval.${status}`, "pricing_approval", approvalId);
      return { kind: "decided" as const, id: approvalId, status };
    });
    if (outcome.kind === "expired") {
      throw new BadRequestException("A solicitação de aprovação expirou.");
    }
    return { id: outcome.id, status: outcome.status };
  }

  async validateApproval(
    client: PoolClient,
    context: TenantContext,
    input: {
      approvalId?: string;
      quantity: number;
      unitPrice: number;
      discountAmount: number;
      netTotal: number;
      costTotal: number;
      projectedMarginPercent: number;
      branchId: string;
      allocatedAdjustmentAmount?: number;
      basketFingerprint?: string;
    },
    resolution: PriceResolution,
  ) {
    if (resolution.marginStatus === "block") {
      throw new ForbiddenException("A política bloqueia a margem projetada para este item.");
    }
    const requiresApproval = !resolution.priceWithinLimits || resolution.marginStatus === "approval_required";
    if (!requiresApproval) return null;
    if (!input.approvalId) {
      throw new ForbiddenException("Esta exceção exige aprovação de um segundo responsável.");
    }
    const approved = await client.query<{ approved_by_user_id: string; approvedReason: string }>(
      `SELECT approved_by_user_id,reason AS "approvedReason" FROM pricing_approvals
       WHERE tenant_id=$1 AND id=$2 AND status='approved' AND expires_at>now()
         AND requested_by_user_id=$3 AND product_id=$4 AND branch_id=$5
         AND price_policy_id=$6 AND price_policy_version=$7
         AND requested_unit_price=$8 AND requested_discount_amount=$9
         AND requested_total_amount=$10 AND quantity=$11
         AND requested_cost_amount=$12 AND requested_margin_percent=$13
         AND customer_segment_id IS NOT DISTINCT FROM $14::uuid
         AND requested_allocated_adjustment_amount=$15
         AND basket_fingerprint IS NOT DISTINCT FROM $16::char(64)
       FOR UPDATE`,
      [
        context.tenantId,
        input.approvalId,
        context.userId,
        resolution.productId,
        input.branchId,
        resolution.policyId,
        resolution.policyVersion,
        roundMoney(input.unitPrice),
        roundMoney(input.discountAmount),
        roundMoney(input.netTotal),
        normalizeQuantity(input.quantity),
        roundMoney(input.costTotal),
        Number(input.projectedMarginPercent.toFixed(4)),
        resolution.customerSegmentId,
        roundMoney(input.allocatedAdjustmentAmount ?? 0),
        input.basketFingerprint ?? null,
      ],
    );
    const approval = ensureFound(approved.rows[0], "Aprovação de preço válida");
    return {
      approvalId: input.approvalId,
      approvedByUserId: approval.approved_by_user_id,
      approvedReason: approval.approvedReason,
    };
  }

  async consumeApproval(
    client: PoolClient,
    context: TenantContext,
    approvalId: string,
    saleId: string,
    saleItemId: string,
    input: {
      unitPrice: number;
      discountAmount: number;
      netTotal: number;
      quantity: number;
      costTotal: number;
      projectedMarginPercent: number;
      policyId: string | null;
      policyVersion: number | null;
      allocatedAdjustmentAmount?: number;
      basketFingerprint?: string;
    },
  ) {
    const consumed = await client.query<{ id: string; approvedReason: string }>(
      `UPDATE pricing_approvals
       SET status='consumed',consumed_at=now(),consumed_sale_id=$3,consumed_sale_item_id=$4,updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status='approved'
         AND requested_total_amount=$5 AND quantity=$6
         AND requested_unit_price=$7 AND requested_discount_amount=$8
         AND requested_cost_amount=$9 AND requested_margin_percent=$10
         AND price_policy_id=$11 AND price_policy_version=$12
         AND requested_allocated_adjustment_amount=$13
         AND basket_fingerprint IS NOT DISTINCT FROM $14::char(64)
       RETURNING id,reason AS "approvedReason"`,
      [
        context.tenantId, approvalId, saleId, saleItemId,
        roundMoney(input.netTotal), normalizeQuantity(input.quantity), roundMoney(input.unitPrice),
        roundMoney(input.discountAmount), roundMoney(input.costTotal), Number(input.projectedMarginPercent.toFixed(4)),
        input.policyId, input.policyVersion, roundMoney(input.allocatedAdjustmentAmount ?? 0),
        input.basketFingerprint ?? null,
      ],
    );
    ensureFound(consumed.rows[0], "Aprovação de preço válida ou ainda não consumida");
    return { id: consumed.rows[0]!.id, approvedReason: consumed.rows[0]!.approvedReason };
  }

  private mapResolution(row: ResolutionRow, requestedUnitPrice?: number): PriceResolution {
    if (row.policyAmbiguous) {
      throw new ConflictException("Configuração de preço ambígua. Contate um administrador.");
    }
    const policyId = row.policyId ?? null;
    const salePrice = Number(row.salePrice);
    const legacyPrice = row.legacyFixedPrice
      ? roundMoney(Number(row.legacyFixedPrice))
      : row.legacyDiscountPercent
        ? roundMoney(salePrice * (1 - Number(row.legacyDiscountPercent) / 100))
        : salePrice;
    const referencePrice = policyId ? Number(row.referencePrice) : legacyPrice;
    const unitPrice = policyId ? (requestedUnitPrice ?? referencePrice) : referencePrice;
    const costPrice = Number(row.costPrice);
    const projectedMarginPercent = marginPercent(unitPrice, costPrice);
    const minMarginPercent = policyId && row.minMarginPercent !== null ? Number(row.minMarginPercent) : null;
    const marginMode = policyId ? row.marginMode : null;
    const margin = policyId
      ? evaluateMargin(
          { minMarginPercent, marginMode: marginMode! },
          projectedMarginPercent,
        )
      : { status: "ok" as const };
    const minPrice = policyId ? Number(row.minPrice) : null;
    const maxPrice = policyId ? Number(row.maxPrice) : null;
    return {
      productId: row.productId,
      productName: row.productName,
      customerSegmentId: row.customerSegmentId,
      customerSegmentCode: row.customerSegmentCode,
      policyId,
      policyVersion: row.policyVersion ?? null,
      referencePrice,
      minPrice,
      maxPrice,
      costPrice,
      unitPrice,
      projectedMarginPercent,
      marginStatus: margin.status,
      minMarginPercent,
      marginMode,
      priority: row.policyPriority ?? null,
      priceWithinLimits: minPrice === null || (unitPrice >= minPrice && unitPrice <= maxPrice!),
    };
  }

  private async assertPolicyReferences(client: PoolClient, context: TenantContext, input: PricePolicyCreateInput) {
    const product = await client.query<{ id: string }>(
      `SELECT id FROM products WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL
       AND is_active=true AND (branch_id IS NULL OR branch_id=$3)`,
      [context.tenantId, input.productId, input.branchId ?? null],
    );
    ensureFound(product.rows[0], "Produto");
    if (input.branchId) {
      const branch = await client.query<{ id: string }>(
        "SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
        [context.tenantId, input.branchId],
      );
      ensureFound(branch.rows[0], "Filial");
    }
    if (input.customerSegmentId) {
      const segment = await client.query<{ id: string }>(
        "SELECT id FROM customer_segments WHERE tenant_id=$1 AND id=$2 AND is_active=true",
        [context.tenantId, input.customerSegmentId],
      );
      ensureFound(segment.rows[0], "Segmento de cliente");
    }
  }

  private scopedBranchId(context: TenantContext, requestedBranchId?: string) {
    ensureBranchAccess(context, requestedBranchId);
    return context.branchId ?? requestedBranchId;
  }

  private async insertAudit(
    context: TenantContext,
    action: string,
    entityType: string,
    entityId?: string,
  ) {
    await this.database.tenantQuery(
      context.tenantId,
      `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,$3,$4,$5,'{}')`,
      [context.tenantId, context.userId, action, entityType, entityId ?? null],
    );
  }

  private async insertAuditInTransaction(
    client: PoolClient,
    context: TenantContext,
    action: string,
    entityType: string,
    entityId?: string,
    metadata: Record<string, unknown> = {},
  ) {
    await client.query(
      `INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
      [context.tenantId, context.userId, action, entityType, entityId ?? null, JSON.stringify(metadata)],
    );
  }
}

const pricingResolutionSql = `
  SELECT
    p.id AS "productId",p.name AS "productName",p.branch_id AS "productBranchId",
    p.sale_price::text AS "salePrice",p.cost_price::text AS "costPrice",
    c.customer_segment_id AS "customerSegmentId",cs.code AS "customerSegmentCode",
    legacy.fixed_price::text AS "legacyFixedPrice",legacy.discount_percent::text AS "legacyDiscountPercent",
    policy.id AS "policyId",policy.version AS "policyVersion",
    policy.reference_price::text AS "referencePrice",policy.min_price::text AS "minPrice",
    policy.max_price::text AS "maxPrice",policy.min_margin_percent::text AS "minMarginPercent",
    policy.margin_mode AS "marginMode",policy.priority AS "policyPriority",
    policy.is_ambiguous AS "policyAmbiguous"
  FROM products p
  LEFT JOIN customers c ON c.tenant_id=p.tenant_id AND c.id=$4::uuid AND c.deleted_at IS NULL
  LEFT JOIN customer_segments cs ON cs.tenant_id=p.tenant_id AND cs.id=c.customer_segment_id AND cs.is_active=true
  LEFT JOIN LATERAL (
    SELECT pr.fixed_price,pr.discount_percent
    FROM price_rules pr JOIN price_tables pt ON pt.id=pr.price_table_id AND pt.tenant_id=pr.tenant_id
    WHERE pr.tenant_id=p.tenant_id AND pr.product_id=p.id AND pt.is_active=true
      AND (pt.branch_id IS NULL OR pt.branch_id=$3::uuid)
      AND (pt.customer_group IS NULL OR pt.customer_group=cs.code)
      AND (pt.starts_at IS NULL OR pt.starts_at<=now()) AND (pt.ends_at IS NULL OR pt.ends_at>=now())
      AND pr.min_quantity<=$5
    ORDER BY (pt.branch_id IS NOT NULL)::int DESC,(pt.customer_group IS NOT NULL)::int DESC,pr.min_quantity DESC
    LIMIT 1
  ) legacy ON true
  LEFT JOIN LATERAL (
    WITH ranked AS (
      SELECT pp.*,
        dense_rank() OVER (
          ORDER BY pp.priority DESC,
            ((pp.branch_id IS NOT NULL)::int + (pp.customer_segment_id IS NOT NULL)::int) DESC,
            pp.min_quantity DESC,pp.version DESC
        ) AS resolution_rank
      FROM price_policies pp
      WHERE pp.tenant_id=p.tenant_id AND pp.product_id=p.id AND pp.is_active=true
        AND (pp.branch_id IS NULL OR pp.branch_id=$3::uuid)
        AND (pp.customer_segment_id IS NULL OR pp.customer_segment_id=cs.id)
        AND (pp.starts_at IS NULL OR pp.starts_at<=now()) AND (pp.ends_at IS NULL OR pp.ends_at>=now())
        AND pp.min_quantity<=$5
    ), top_policies AS (
      SELECT * FROM ranked WHERE resolution_rank=1
    )
    SELECT top_policies.id,top_policies.version,top_policies.reference_price,top_policies.min_price,
      top_policies.max_price,top_policies.min_margin_percent,top_policies.margin_mode,top_policies.priority,
      (SELECT count(DISTINCT (branch_id,customer_segment_id)) > 1 FROM top_policies) AS is_ambiguous
    FROM top_policies
    ORDER BY top_policies.id
    LIMIT 1
  ) policy ON true
  WHERE p.tenant_id=$1 AND p.id=$2::uuid AND p.deleted_at IS NULL AND p.is_active=true
    AND (p.branch_id IS NULL OR p.branch_id=$3::uuid)
    AND ($4::uuid IS NULL OR (c.id IS NOT NULL AND (c.branch_id IS NULL OR c.branch_id=$3::uuid)))
`;

function marginPercent(unitPrice: number, costPrice: number) {
  if (unitPrice <= 0) return 0;
  return Number((((unitPrice - costPrice) / unitPrice) * 100).toFixed(2));
}
