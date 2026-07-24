import type { INestApplication } from "@nestjs/common";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createAdminPool,
  createTestApp,
  resetDatabase,
  seedBaselineTenants,
  seedRoleUser,
  type SeededTenant,
} from "./test-helpers";

describe.sequential("commercial roadmap api flows", { timeout: 90_000 }, () => {
  let app: INestApplication;
  let adminPool: Pool;
  let tenantA: SeededTenant;
  let tenantB: SeededTenant;

  beforeAll(async () => {
    adminPool = createAdminPool();
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(adminPool);
    ({ tenantA, tenantB } = await seedBaselineTenants(adminPool));
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await adminPool.end();
  }, 60_000);

  it("requires a second authorized user for a price exception and preserves tenant and branch isolation", async () => {
    const owner = await login(app, tenantA);
    const tenantBSession = await login(app, tenantB);
    const manager = await seedRoleUser(adminPool, tenantA, "manager", {
      email: "manager-pricing@example.com",
      name: "Gerente de Precos",
      branchId: tenantA.branchId,
    });
    const seller = await seedRoleUser(adminPool, tenantA, "seller", {
      email: "seller-pricing@example.com",
      name: "Vendedor Solicitante",
      branchId: tenantA.branchId,
    });
    const managerSession = await login(app, manager);
    const sellerSession = await login(app, seller);
    const product = await createProduct(owner, tenantA, {
      name: "Produto com Politica",
      sku: "PRICE-E2E-001",
      costPrice: 70,
      salePrice: 100,
    });
    await addStock(owner, tenantA, product.id, 10);

    const policy = await owner.post("/api/v1/pricing/policies").set(tenantHeader(tenantA)).send({
      productId: product.id,
      branchId: tenantA.branchId,
      minQuantity: 1,
      referencePrice: 100,
      minPrice: 90,
      maxPrice: 110,
      minMarginPercent: 20,
      marginMode: "approval_required",
      priority: 100,
    });
    expect(policy.status).toBe(201);
    expect(policy.body).toMatchObject({ version: 1 });

    const preview = await sellerSession
      .post("/api/v1/sales/preview")
      .set(tenantHeader(tenantA))
      .send({
        branchId: tenantA.branchId,
        items: [{ productId: product.id, quantity: 1, unitPrice: 80 }],
        payments: [],
      });
    expect(preview.status).toBe(201);
    expect(preview.body.approvalsRequired).toHaveLength(1);
    expect(preview.body.approvalsRequired[0]).toMatchObject({ productId: product.id });
    expect(preview.body.fingerprint).toMatch(/^[a-f0-9]{64}$/);

    const approval = await sellerSession
      .post("/api/v1/pricing/approvals")
      .set(tenantHeader(tenantA))
      .send({
        productId: product.id,
        branchId: tenantA.branchId,
        quantity: 1,
        unitPrice: 80,
        discountAmount: 0,
        allocatedAdjustmentAmount: 0,
        basketFingerprint: preview.body.fingerprint,
        reason: "Condicao comercial excepcional aprovada para este cliente.",
      });
    expect(approval.status).toBe(201);

    const selfDecision = await sellerSession
      .post(`/api/v1/pricing/approvals/${approval.body.id}/decision`)
      .set(tenantHeader(tenantA))
      .send({ approved: true });
    expect(selfDecision.status).toBe(403);

    const secondPersonDecision = await managerSession
      .post(`/api/v1/pricing/approvals/${approval.body.id}/decision`)
      .set(tenantHeader(tenantA))
      .send({ approved: true, reason: "Excecao conferida pelo gerente responsavel." });
    expect(secondPersonDecision.status).toBe(201);
    expect(secondPersonDecision.body).toMatchObject({ id: approval.body.id, status: "approved" });

    const sale = await sellerSession
      .post("/api/v1/sales")
      .set(tenantHeader(tenantA))
      .set("idempotency-key", "pricing-approved-sale-001")
      .send({
        branchId: tenantA.branchId,
        compositionFingerprint: preview.body.fingerprint,
        items: [
          {
            productId: product.id,
            quantity: 1,
            unitPrice: 80,
            pricingApprovalId: approval.body.id,
          },
        ],
        payments: [],
      });
    expect(sale.status).toBe(201);
    expect(sale.body).toMatchObject({
      totalAmount: 80,
      compositionFingerprint: preview.body.fingerprint,
    });

    const approvalState = await adminPool.query<{
      status: string;
      requested_by_user_id: string;
      approved_by_user_id: string;
      consumed_sale_id: string;
    }>(
      `SELECT status,requested_by_user_id,approved_by_user_id,consumed_sale_id
       FROM pricing_approvals WHERE tenant_id=$1 AND id=$2`,
      [tenantA.tenantId, approval.body.id],
    );
    expect(approvalState.rows[0]).toMatchObject({
      status: "consumed",
      requested_by_user_id: seller.userId,
      approved_by_user_id: manager.userId,
      consumed_sale_id: sale.body.id,
    });

    const tenantBPolicyRead = await tenantBSession
      .get("/api/v1/pricing/policies")
      .set(tenantHeader(tenantB))
      .query({ productId: product.id, page: 1, pageSize: 20 });
    expect(tenantBPolicyRead.status).toBe(200);
    expect(tenantBPolicyRead.body.pagination.total).toBe(0);

    const foreignBranch = await owner
      .post("/api/v1/branches")
      .set(tenantHeader(tenantA))
      .send({ name: "Filial Fora do Escopo", code: "OUT-SCOPE", isActive: true });
    expect(foreignBranch.status).toBe(201);
    const branchDenied = await managerSession
      .get("/api/v1/pricing/resolve")
      .set(tenantHeader(tenantA))
      .query({ productId: product.id, branchId: foreignBranch.body.id, quantity: 1 });
    expect(branchDenied.status).toBe(403);
  });

  it("reserves stock without decrementing it and converts a commercial document exactly once", async () => {
    const owner = await login(app, tenantA);
    const tenantBSession = await login(app, tenantB);
    const product = await createProduct(owner, tenantA, {
      name: "Produto Reservavel",
      sku: "RESERVE-E2E-001",
      costPrice: 40,
      salePrice: 100,
    });
    await addStock(owner, tenantA, product.id, 12);

    const documentId = await seedApprovedCommercialDocument(adminPool, tenantA, product.id);
    const reserved = await owner
      .patch(`/api/v1/operations/commercial-documents/${documentId}/status`)
      .set(tenantHeader(tenantA))
      .send({ action: "reserve" });
    expect(reserved.status).toBe(200);
    expect(reserved.body).toMatchObject({ id: documentId, status: "reserved" });

    const beforeConversion = await stockState(adminPool, tenantA, product.id, documentId);
    expect(beforeConversion).toEqual({
      balance: 12,
      activeReservation: 3,
      reservationStatus: "active",
    });

    const tenantBRead = await tenantBSession
      .get("/api/v1/operations/commercial-documents")
      .set(tenantHeader(tenantB))
      .query({ page: 1, pageSize: 20 });
    expect(tenantBRead.status).toBe(200);
    expect(tenantBRead.body.pagination.total).toBe(0);

    const firstConversion = await owner
      .post(`/api/v1/operations/commercial-documents/${documentId}/convert`)
      .set(tenantHeader(tenantA))
      .set("idempotency-key", "commercial-conversion-001")
      .send({});
    expect(firstConversion.status).toBe(201);
    expect(firstConversion.body.reused).toBe(false);

    const replay = await owner
      .post(`/api/v1/operations/commercial-documents/${documentId}/convert`)
      .set(tenantHeader(tenantA))
      .set("idempotency-key", "commercial-conversion-001")
      .send({});
    expect(replay.status).toBe(201);
    expect(replay.body).toMatchObject({ id: firstConversion.body.id, reused: true });

    const afterConversion = await stockState(adminPool, tenantA, product.id, documentId);
    expect(afterConversion).toEqual({
      balance: 9,
      activeReservation: 0,
      reservationStatus: "consumed",
    });
    const conversionState = await adminPool.query<{ status: string; converted_sale_id: string }>(
      "SELECT status,converted_sale_id FROM quotes WHERE tenant_id=$1 AND id=$2",
      [tenantA.tenantId, documentId],
    );
    expect(conversionState.rows[0]).toEqual({
      status: "converted",
      converted_sale_id: firstConversion.body.id,
    });
    const saleCount = await adminPool.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM sales WHERE tenant_id=$1 AND commercial_origin_id=$2",
      [tenantA.tenantId, documentId],
    );
    expect(saleCount.rows[0]?.total).toBe(1);
  });

  it("locks payment fee snapshots and supports settlement, single reversal and reconciliation", async () => {
    const owner = await login(app, tenantA);
    const product = await createProduct(owner, tenantA, {
      name: "Produto Financeiro",
      sku: "FIN-E2E-001",
      costPrice: 50,
      salePrice: 100,
    });
    await addStock(owner, tenantA, product.id, 5);

    const acquirer = await owner
      .post("/api/v1/financial/acquirers")
      .set(tenantHeader(tenantA))
      .send({
        branchId: tenantA.branchId,
        name: "Adquirente E2E",
        code: "ACQ_E2E",
        isActive: true,
      });
    expect(acquirer.status).toBe(201);

    const feeRule = await owner
      .post("/api/v1/financial/fee-rules")
      .set(tenantHeader(tenantA))
      .send({
        acquirerId: acquirer.body.id,
        paymentMethod: "credit_card",
        brand: "visa",
        installmentFrom: 1,
        installmentTo: 6,
        percentageBasisPoints: 250,
        fixedFeeCents: 30,
        anticipationBasisPoints: 0,
        settlementDays: 2,
        validFrom: new Date(Date.now() - 60_000).toISOString(),
      });
    expect(feeRule.status).toBe(201);
    expect(feeRule.body.version).toBe(1);

    const sale = await owner
      .post("/api/v1/sales")
      .set(tenantHeader(tenantA))
      .set("idempotency-key", "financial-snapshot-sale-001")
      .send({
        branchId: tenantA.branchId,
        items: [{ productId: product.id, quantity: 1, unitPrice: 100 }],
        payments: [
          {
            method: "credit_card",
            amount: 100,
            status: "paid",
            acquirerId: acquirer.body.id,
            brand: "visa",
            installments: 2,
          },
        ],
      });
    expect(sale.status).toBe(201);

    const payment = await adminPool.query<{
      id: string;
      gross_amount: string;
      total_fee_amount: string;
      net_amount: string;
      fee_rule_id: string;
      fee_rule_version: number;
      snapshot_locked_at: Date;
    }>(
      `SELECT id,gross_amount::text,total_fee_amount::text,net_amount::text,
              fee_rule_id,fee_rule_version,snapshot_locked_at
       FROM sale_payments WHERE tenant_id=$1 AND sale_id=$2`,
      [tenantA.tenantId, sale.body.id],
    );
    expect(payment.rows[0]).toMatchObject({
      gross_amount: "100.00",
      total_fee_amount: "2.80",
      net_amount: "97.20",
      fee_rule_id: feeRule.body.id,
      fee_rule_version: 1,
    });
    expect(payment.rows[0]?.snapshot_locked_at).toBeInstanceOf(Date);

    const settlement = await owner
      .post("/api/v1/financial/settlements")
      .set(tenantHeader(tenantA))
      .send({
        paymentId: payment.rows[0]!.id,
        settledAmountCents: 9_720,
        effectiveAt: new Date().toISOString(),
        externalReference: "e2e-settlement-001",
      });
    expect(settlement.status).toBe(201);
    expect(settlement.body).toMatchObject({ settlementStatus: "settled", idempotentReplay: false });

    const reversal = await owner
      .post(`/api/v1/financial/settlements/${settlement.body.id}/reverse`)
      .set(tenantHeader(tenantA))
      .send({ reason: "Correcao do arquivo bancario", externalReference: "e2e-reversal-001" });
    expect(reversal.status).toBe(201);
    expect(reversal.body.status).toBe("reversed");

    const duplicateReversal = await owner
      .post(`/api/v1/financial/settlements/${settlement.body.id}/reverse`)
      .set(tenantHeader(tenantA))
      .send({ reason: "Segunda tentativa indevida", externalReference: "e2e-reversal-002" });
    expect(duplicateReversal.status).toBe(409);
    expect(JSON.stringify(duplicateReversal.body)).toMatch(
      /SETTLEMENT_ALREADY_REVERSED|já foi estornada/i,
    );

    const reconciliation = await owner
      .post("/api/v1/financial/reconciliation-batches")
      .set(tenantHeader(tenantA))
      .send({
        branchId: tenantA.branchId,
        acquirerId: acquirer.body.id,
        externalReference: "e2e-reconciliation-001",
        statementDate: dateOffset(0),
        items: [
          {
            paymentId: payment.rows[0]!.id,
            actualAmountCents: 9_500,
            externalReference: "e2e-reconciliation-line-001",
          },
        ],
      });
    expect(reconciliation.status).toBe(201);
    expect(reconciliation.body).toMatchObject({
      status: "diverged",
      expectedAmount: "97.20",
      actualAmount: "95.00",
      differenceAmount: "-2.20",
    });

    const persisted = await adminPool.query<{ reversals: number; batches: number }>(
      `SELECT
         (SELECT count(*)::int FROM payment_settlements WHERE tenant_id=$1 AND reversed_settlement_id=$2) AS reversals,
         (SELECT count(*)::int FROM reconciliation_batches WHERE tenant_id=$1 AND external_reference=$3) AS batches`,
      [tenantA.tenantId, settlement.body.id, "e2e-reconciliation-001"],
    );
    expect(persisted.rows[0]).toEqual({ reversals: 1, batches: 1 });
  });

  it("keeps JSON, CSV and PDF reports aligned for identical authorized filters", async () => {
    const owner = await login(app, tenantA);
    const product = await createProduct(owner, tenantA, {
      name: "Produto de Relatorio",
      sku: "REPORT-E2E-001",
      costPrice: 20,
      salePrice: 50,
    });
    await addStock(owner, tenantA, product.id, 6);

    const acquirer = await owner
      .post("/api/v1/financial/acquirers")
      .set(tenantHeader(tenantA))
      .send({
        branchId: tenantA.branchId,
        name: "Relatorios Pay",
        code: "REPORT_PAY",
        isActive: true,
      });
    await owner
      .post("/api/v1/financial/fee-rules")
      .set(tenantHeader(tenantA))
      .send({
        acquirerId: acquirer.body.id,
        paymentMethod: "credit_card",
        brand: "visa",
        installmentFrom: 1,
        installmentTo: 1,
        percentageBasisPoints: 200,
        fixedFeeCents: 0,
        anticipationBasisPoints: 0,
        settlementDays: 1,
        validFrom: new Date(Date.now() - 60_000).toISOString(),
      });

    // The report contract is independent from document creation. Seed its persisted
    // input directly so format coverage remains useful even when the creation flow is red.
    await adminPool.query(
      `INSERT INTO quotes(
         tenant_id,branch_id,seller_user_id,status,total_amount,valid_until,
         commercial_document_type,document_number
       ) VALUES($1,$2,$3,'draft',100,$4,'dav',1)`,
      [tenantA.tenantId, tenantA.branchId, tenantA.userId, dateOffset(5)],
    );

    const sale = await owner
      .post("/api/v1/sales")
      .set(tenantHeader(tenantA))
      .send({
        branchId: tenantA.branchId,
        items: [{ productId: product.id, quantity: 1, unitPrice: 50 }],
        payments: [
          {
            method: "credit_card",
            amount: 50,
            status: "paid",
            acquirerId: acquirer.body.id,
            brand: "visa",
            installments: 1,
          },
        ],
      });
    expect(sale.status).toBe(201);

    const filters = {
      startDate: dateOffset(-1),
      endDate: dateOffset(1),
      branchId: tenantA.branchId,
    };
    await assertReportFormats(owner, tenantA, "commercial-documents", filters, {
      expectedRows: 1,
      expectedCsvFragments: ["Número;Tipo;Situação", "dav", "Rascunho", "R$ 100,00"],
    });
    await assertReportFormats(owner, tenantA, "financial-net", filters, {
      expectedRows: 1,
      expectedCsvFragments: ["Data;Loja;Venda", "credit_card", "R$ 50,00", "R$ 1,00", "R$ 49,00"],
    });

    const tenantBSession = await login(app, tenantB);
    const isolated = await tenantBSession
      .get("/api/v1/reports/commercial-documents")
      .set(tenantHeader(tenantB))
      .query({ startDate: dateOffset(-1), endDate: dateOffset(1) });
    expect(isolated.status).toBe(200);
    expect(isolated.body.rows).toEqual([]);
  });
});

async function login(app: INestApplication, tenant: SeededTenant) {
  const agent = request.agent(app.getHttpServer());
  const response = await agent.post("/api/v1/auth/login").send({
    email: tenant.email,
    password: tenant.password,
  });
  expect(response.status).toBe(201);
  return agent;
}

function tenantHeader(tenant: SeededTenant) {
  return { "x-tenant-id": tenant.tenantId };
}

async function createProduct(
  agent: ReturnType<typeof request.agent>,
  tenant: SeededTenant,
  input: { name: string; sku: string; costPrice: number; salePrice: number },
) {
  const response = await agent
    .post("/api/v1/products")
    .set(tenantHeader(tenant))
    .send({
      branchId: tenant.branchId,
      ...input,
      unit: "un",
      minStock: 1,
      isActive: true,
    });
  expect(response.status).toBe(201);
  return { id: response.body.id as string };
}

async function addStock(
  agent: ReturnType<typeof request.agent>,
  tenant: SeededTenant,
  productId: string,
  quantity: number,
) {
  const response = await agent.post("/api/v1/stock/adjustments").set(tenantHeader(tenant)).send({
    branchId: tenant.branchId,
    productId,
    quantityDelta: quantity,
    reason: "Carga comercial E2E",
  });
  expect(response.status).toBe(201);
}

async function seedApprovedCommercialDocument(pool: Pool, tenant: SeededTenant, productId: string) {
  const document = await pool.query<{ id: string }>(
    `INSERT INTO quotes(
       tenant_id,branch_id,seller_user_id,status,total_amount,valid_until,notes,
       commercial_document_type,document_number,approved_at
     ) VALUES($1,$2,$3,'approved',300,$4,$5,'order',1,now())
     RETURNING id`,
    [
      tenant.tenantId,
      tenant.branchId,
      tenant.userId,
      dateOffset(7),
      "Pedido aprovado para validar reserva e conversao",
    ],
  );
  await pool.query(
    `INSERT INTO quote_items(
       tenant_id,quote_id,product_id,description,quantity,unit_price,discount_amount,reserved_quantity
     ) VALUES($1,$2,$3,'Produto Reservavel',3,100,0,0)`,
    [tenant.tenantId, document.rows[0]!.id, productId],
  );
  return document.rows[0]!.id;
}

async function stockState(pool: Pool, tenant: SeededTenant, productId: string, documentId: string) {
  const result = await pool.query<{
    balance: string;
    active_reservation: string;
    reservation_status: string;
  }>(
    `SELECT sb.quantity::text AS balance,
            COALESCE(SUM(sr.quantity) FILTER (WHERE sr.status='active'),0)::text AS active_reservation,
            COALESCE(MAX(sr.status),'missing') AS reservation_status
     FROM stock_balances sb
     LEFT JOIN stock_reservations sr
       ON sr.tenant_id=sb.tenant_id AND sr.branch_id=sb.branch_id
      AND sr.product_id=sb.product_id AND sr.quote_id=$4
     WHERE sb.tenant_id=$1 AND sb.branch_id=$2 AND sb.product_id=$3
     GROUP BY sb.quantity`,
    [tenant.tenantId, tenant.branchId, productId, documentId],
  );
  return {
    balance: Number(result.rows[0]?.balance ?? 0),
    activeReservation: Number(result.rows[0]?.active_reservation ?? 0),
    reservationStatus: result.rows[0]?.reservation_status ?? "missing",
  };
}

async function assertReportFormats(
  agent: ReturnType<typeof request.agent>,
  tenant: SeededTenant,
  report: "commercial-documents" | "financial-net",
  filters: Record<string, string>,
  expected: { expectedRows: number; expectedCsvFragments: string[] },
) {
  const json = await agent
    .get(`/api/v1/reports/${report}`)
    .set(tenantHeader(tenant))
    .query(filters);
  expect(json.status).toBe(200);
  expect(json.body.rows).toHaveLength(expected.expectedRows);
  expect(json.body.summary[0].value).toBe(expected.expectedRows);

  const csv = await agent
    .get(`/api/v1/reports/${report}/csv`)
    .set(tenantHeader(tenant))
    .query(filters);
  expect(csv.status).toBe(200);
  expect(csv.headers["content-type"]).toMatch(/^text\/csv/);
  const normalizedCsv = csv.text.replaceAll("\u00a0", " ");
  for (const fragment of expected.expectedCsvFragments) expect(normalizedCsv).toContain(fragment);
  expect(csv.text.trim().split(/\r?\n/)).toHaveLength(expected.expectedRows + 1);

  const pdf = await agent
    .get(`/api/v1/reports/${report}/pdf`)
    .set(tenantHeader(tenant))
    .query(filters)
    .buffer(true)
    .parse(binaryParser);
  expect(pdf.status).toBe(200);
  expect(pdf.headers["content-type"]).toMatch(/^application\/pdf/);
  expect(Buffer.isBuffer(pdf.body)).toBe(true);
  expect((pdf.body as Buffer).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect((pdf.body as Buffer).byteLength).toBeGreaterThan(500);
}

function binaryParser(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer | string) =>
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
  );
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", (error: Error) => callback(error));
}

function dateOffset(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
