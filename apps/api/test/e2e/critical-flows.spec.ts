import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type { Pool } from "pg";
import { createAdminPool, createTestApp, resetDatabase, seedBaselineTenants, seedRoleUser, type SeededTenant } from "./test-helpers";

describe.sequential("critical api flows", () => {
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
  });

  afterAll(async () => {
    await app.close();
    await adminPool.end();
  });

  it("rotates refresh tokens and rejects reused refresh cookies", async () => {
    const { agent, cookies: initialLogin } = await login(app, tenantA);

    const meResponse = await agent.get("/api/v1/me");
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe(tenantA.email);
    expect(meResponse.body.memberships).toHaveLength(1);

    const refreshResponse = await agent.post("/api/v1/auth/refresh");
    expect(refreshResponse.status).toBe(201);
    expect(refreshResponse.body).toEqual({ ok: true });

    const refreshedCookies = extractCookies(refreshResponse);
    expect(refreshedCookies.refreshToken).toBeTruthy();
    expect(refreshedCookies.refreshToken).not.toBe(initialLogin.refreshToken);

    const staleRefresh = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${initialLogin.refreshToken}`]);

    expect(staleRefresh.status).toBe(401);
    expect(staleRefresh.body.message).toMatch(/Refresh token invalido|Sessao expirada/);
  });

  it("persists remembered sessions and revokes access immediately on logout", async () => {
    const agent = request.agent(app.getHttpServer());
    const loginResponse = await agent.post("/api/v1/auth/login").send({
      email: tenantA.email,
      password: tenantA.password,
      rememberMe: true,
    });
    expect(loginResponse.status).toBe(201);
    const cookies = loginResponse.headers["set-cookie"] ?? [];
    expect(cookies.some((cookie: string) => cookie.startsWith("refresh_token=") && /Max-Age=/i.test(cookie))).toBe(true);
    const accessToken = readCookieValue(cookies, "access_token");

    const logoutResponse = await agent.post("/api/v1/auth/logout");
    expect(logoutResponse.status).toBe(201);

    const revokedAccess = await request(app.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(revokedAccess.status).toBe(401);
  });

  it("enforces tenant isolation and keeps CRUD listings paginated and filterable", async () => {
    const tenantAAgent = await login(app, tenantA);
    const tenantBAgent = await login(app, tenantB);

    const branchAResponse = await tenantAAgent
      .post("/api/v1/branches")
      .set("x-tenant-id", tenantA.tenantId)
      .send({ name: "Loja Norte", code: "NORTE", city: "Sao Paulo", state: "SP", isActive: true });
    expect(branchAResponse.status).toBe(201);
    const branchAId = branchAResponse.body.id as string;

    const branchBResponse = await tenantBAgent
      .post("/api/v1/branches")
      .set("x-tenant-id", tenantB.tenantId)
      .send({ name: "Loja Externa", code: "EXTERNA", city: "Curitiba", state: "PR", isActive: true });
    expect(branchBResponse.status).toBe(201);
    const branchBId = branchBResponse.body.id as string;

    const listBranches = await tenantAAgent
      .get("/api/v1/branches")
      .set("x-tenant-id", tenantA.tenantId)
      .query({ search: "Loja", page: 1, pageSize: 1 });

    expect(listBranches.status).toBe(200);
    expect(listBranches.body.pagination.total).toBe(1);
    expect(listBranches.body.data).toHaveLength(1);
    expect(listBranches.body.data[0].name).toBe("Loja Norte");

    const forbiddenBranchRead = await tenantAAgent.get(`/api/v1/branches/${branchBId}`).set("x-tenant-id", tenantA.tenantId);
    expect(forbiddenBranchRead.status).toBe(404);

    const productOne = await tenantAAgent
      .post("/api/v1/products")
      .set("x-tenant-id", tenantA.tenantId)
      .send({
        branchId: branchAId,
        name: "Filtro Alpha",
        sku: "ALPHA-001",
        unit: "un",
        costPrice: 10,
        salePrice: 25,
        minStock: 2,
        isActive: true
      });
    expect(productOne.status).toBe(201);
    const productOneId = productOne.body.id as string;

    const productTwo = await tenantAAgent
      .post("/api/v1/products")
      .set("x-tenant-id", tenantA.tenantId)
      .send({
        branchId: branchAId,
        name: "Filtro Beta",
        sku: "BETA-002",
        unit: "un",
        costPrice: 8,
        salePrice: 18,
        minStock: 1,
        isActive: true
      });
    expect(productTwo.status).toBe(201);
    const productTwoId = productTwo.body.id as string;

    const productList = await tenantAAgent
      .get("/api/v1/products")
      .set("x-tenant-id", tenantA.tenantId)
      .query({ search: "Filtro", page: 1, pageSize: 1 });

    expect(productList.status).toBe(200);
    expect(productList.body.pagination.total).toBe(2);
    expect(productList.body.data).toHaveLength(1);

    const updateProduct = await tenantAAgent
      .patch(`/api/v1/products/${productOneId}`)
      .set("x-tenant-id", tenantA.tenantId)
      .send({ salePrice: 29, description: "Atualizado via e2e" });
    expect(updateProduct.status).toBe(200);
    expect(Number(updateProduct.body.sale_price)).toBe(29);

    const getProduct = await tenantAAgent.get(`/api/v1/products/${productOneId}`).set("x-tenant-id", tenantA.tenantId);
    expect(getProduct.status).toBe(200);
    expect(getProduct.body.name).toBe("Filtro Alpha");

    const foreignProductRead = await tenantBAgent.get(`/api/v1/products/${productOneId}`).set("x-tenant-id", tenantB.tenantId);
    expect(foreignProductRead.status).toBe(404);

    const customerOne = await tenantAAgent
      .post("/api/v1/customers")
      .set("x-tenant-id", tenantA.tenantId)
      .send({
        branchId: branchAId,
        type: "individual",
        name: "Cliente Alpha",
        email: "cliente.alpha@example.com",
        tags: ["vip"],
        communicationOptIn: true,
        isActive: true
      });
    expect(customerOne.status).toBe(201);
    const customerOneId = customerOne.body.id as string;

    const customerTwo = await tenantAAgent
      .post("/api/v1/customers")
      .set("x-tenant-id", tenantA.tenantId)
      .send({
        branchId: branchAId,
        type: "company",
        name: "Cliente Beta",
        email: "cliente.beta@example.com",
        tags: ["lead"],
        communicationOptIn: false,
        isActive: true
      });
    expect(customerTwo.status).toBe(201);
    const customerTwoId = customerTwo.body.id as string;

    const customerList = await tenantAAgent
      .get("/api/v1/customers")
      .set("x-tenant-id", tenantA.tenantId)
      .query({ search: "Cliente", page: 2, pageSize: 1 });

    expect(customerList.status).toBe(200);
    expect(customerList.body.pagination.total).toBe(2);
    expect(customerList.body.data).toHaveLength(1);

    const updateCustomer = await tenantAAgent
      .patch(`/api/v1/customers/${customerOneId}`)
      .set("x-tenant-id", tenantA.tenantId)
      .send({ name: "Cliente Alpha Premium", notes: "Atualizado em teste" });
    expect(updateCustomer.status).toBe(200);
    expect(updateCustomer.body.name).toBe("Cliente Alpha Premium");

    const deleteProduct = await tenantAAgent.delete(`/api/v1/products/${productTwoId}`).set("x-tenant-id", tenantA.tenantId);
    expect(deleteProduct.status).toBe(200);
    expect(deleteProduct.body).toEqual({ ok: true });

    const deletedProductRead = await tenantAAgent.get(`/api/v1/products/${productTwoId}`).set("x-tenant-id", tenantA.tenantId);
    expect(deletedProductRead.status).toBe(404);

    const deleteCustomer = await tenantAAgent.delete(`/api/v1/customers/${customerTwoId}`).set("x-tenant-id", tenantA.tenantId);
    expect(deleteCustomer.status).toBe(200);
    expect(deleteCustomer.body).toEqual({ ok: true });
  });

  it("creates a multi-item sale, generates linked receivables, and settles the linked financial entry", async () => {
    const agent = await login(app, tenantA);

    const customerResponse = await agent
      .post("/api/v1/customers")
      .set("x-tenant-id", tenantA.tenantId)
      .send({
        branchId: tenantA.branchId,
        type: "individual",
        name: "Cliente Fluxo Real",
        email: "fluxo.real@example.com",
        tags: ["e2e"],
        communicationOptIn: true,
        isActive: true
      });
    expect(customerResponse.status).toBe(201);
    const customerId = customerResponse.body.id as string;

    const firstProductResponse = await agent
      .post("/api/v1/products")
      .set("x-tenant-id", tenantA.tenantId)
      .send({
        branchId: tenantA.branchId,
        name: "Produto Combo A",
        sku: "COMBO-A",
        unit: "un",
        costPrice: 15,
        salePrice: 30,
        minStock: 1,
        isActive: true
      });
    expect(firstProductResponse.status).toBe(201);
    const firstProductId = firstProductResponse.body.id as string;

    const secondProductResponse = await agent
      .post("/api/v1/products")
      .set("x-tenant-id", tenantA.tenantId)
      .send({
        branchId: tenantA.branchId,
        name: "Produto Combo B",
        sku: "COMBO-B",
        unit: "un",
        costPrice: 12,
        salePrice: 20,
        minStock: 1,
        isActive: true
      });
    expect(secondProductResponse.status).toBe(201);
    const secondProductId = secondProductResponse.body.id as string;

    for (const productId of [firstProductId, secondProductId]) {
      const stockResponse = await agent
        .post("/api/v1/stock/adjustments")
        .set("x-tenant-id", tenantA.tenantId)
        .send({
          branchId: tenantA.branchId,
          productId,
          quantityDelta: 20,
          reason: "Carga inicial de e2e"
        });

      expect(stockResponse.status).toBe(201);
      expect(stockResponse.body.ok).toBe(true);
    }

    const saleResponse = await agent
      .post("/api/v1/sales")
      .set("x-tenant-id", tenantA.tenantId)
      .send({
        branchId: tenantA.branchId,
        customerId,
        notes: "Fluxo real e2e",
        items: [
          { productId: firstProductId, quantity: 2, unitPrice: 30, discountAmount: 0 },
          { productId: secondProductId, quantity: 1, unitPrice: 20, discountAmount: 0 }
        ],
        payments: [{ method: "pix", amount: 30, status: "paid" }]
      });

    expect(saleResponse.status).toBe(201);
    expect(saleResponse.body.totalAmount).toBe(80);
    expect(saleResponse.body.paidAmount).toBe(30);
    expect(saleResponse.body.openAmount).toBe(50);
    const saleId = saleResponse.body.id as string;

    const salesList = await agent
      .get("/api/v1/sales")
      .set("x-tenant-id", tenantA.tenantId)
      .query({ status: "sold", search: "Fluxo real e2e", page: 1, pageSize: 10 });

    expect(salesList.status).toBe(200);
    expect(salesList.body.pagination.total).toBe(1);
    expect(salesList.body.data[0].id).toBe(saleId);
    expect(salesList.body.data[0].itemCount).toBe(2);
    expect(Number(salesList.body.data[0].openAmount)).toBe(50);

    const historyResponse = await agent.get(`/api/v1/sales/${saleId}/history`).set("x-tenant-id", tenantA.tenantId);
    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.payments).toHaveLength(1);
    expect(historyResponse.body.movements).toHaveLength(2);
    expect(historyResponse.body.receivables).toHaveLength(1);
    expect(Number(historyResponse.body.receivables[0].amount)).toBe(50);

    const receivablesResponse = await agent
      .get("/api/v1/financial/receivables")
      .set("x-tenant-id", tenantA.tenantId)
      .query({ status: "open", search: saleId, page: 1, pageSize: 10 });

    expect(receivablesResponse.status).toBe(200);
    expect(receivablesResponse.body.pagination.total).toBe(1);
    expect(Number(receivablesResponse.body.data[0].amount)).toBe(50);

    const receivableId = receivablesResponse.body.data[0].id as string;
    const payResponse = await agent
      .patch(`/api/v1/financial/receivables/${receivableId}/pay`)
      .set("x-tenant-id", tenantA.tenantId)
      .send({ paymentMethod: "cartao" });

    expect(payResponse.status).toBe(200);
    expect(payResponse.body.status).toBe("paid");

    const paidReceivables = await agent
      .get("/api/v1/financial/receivables")
      .set("x-tenant-id", tenantA.tenantId)
      .query({ status: "paid", search: saleId, page: 1, pageSize: 10 });

    expect(paidReceivables.status).toBe(200);
    expect(paidReceivables.body.pagination.total).toBe(1);

    const cashflowResponse = await agent.get("/api/v1/financial/cashflow").set("x-tenant-id", tenantA.tenantId);
    expect(cashflowResponse.status).toBe(200);
    expect(cashflowResponse.body.receivableOpen).toBe(0);
    expect(cashflowResponse.body.paidIn).toBe(50);
  });

  it("enforces role and branch scopes for manager and seller", async () => {
    const owner = await login(app, tenantA);
    const secondBranch = await owner.agent
      .post("/api/v1/branches")
      .set("x-tenant-id", tenantA.tenantId)
      .send({ name: "Filial Restrita", code: "RESTRITA", isActive: true });
    expect(secondBranch.status).toBe(201);

    const manager = await seedRoleUser(adminPool, tenantA, "manager", {
      email: "manager-scope@example.com",
      name: "Gerente Escopo",
      branchId: tenantA.branchId,
    });
    const seller = await seedRoleUser(adminPool, tenantA, "seller", {
      email: "seller-scope@example.com",
      name: "Vendedor Escopo",
      branchId: tenantA.branchId,
    });
    const managerAgent = await login(app, manager);
    const sellerAgent = await login(app, seller);

    const managerOwnBranch = await managerAgent.agent
      .get("/api/v1/branches")
      .set("x-tenant-id", tenantA.tenantId);
    expect(managerOwnBranch.status).toBe(200);
    expect(managerOwnBranch.body.data.every((row: { id: string }) => row.id === tenantA.branchId)).toBe(true);

    const sellerStockAdjustment = await sellerAgent.agent
      .post("/api/v1/stock/adjustments")
      .set("x-tenant-id", tenantA.tenantId)
      .send({ branchId: tenantA.branchId, productId: tenantA.branchId, quantityDelta: 1, reason: "Negado" });
    expect(sellerStockAdjustment.status).toBe(403);

    const managerForeignBranch = await managerAgent.agent
      .get(`/api/v1/branches/${secondBranch.body.id}`)
      .set("x-tenant-id", tenantA.tenantId);
    expect([403, 404]).toContain(managerForeignBranch.status);
  });
});

async function login(app: INestApplication, tenant: SeededTenant) {
  const agent = request.agent(app.getHttpServer());
  const response = await agent.post("/api/v1/auth/login").send({
    email: tenant.email,
    password: tenant.password
  });

  expect(response.status).toBe(201);
  return Object.assign(agent, { agent, cookies: extractCookies(response) });
}

function extractCookies(response: { headers?: { "set-cookie"?: string[] } }) {
  const setCookie = response.headers?.["set-cookie"] ?? [];
  return {
    accessToken: readCookieValue(setCookie, "access_token"),
    refreshToken: readCookieValue(setCookie, "refresh_token")
  };
}

function readCookieValue(setCookie: string[], name: string) {
  const cookie = setCookie.find((value) => value.startsWith(`${name}=`));
  return cookie?.split(";")[0]?.slice(name.length + 1) ?? "";
}
