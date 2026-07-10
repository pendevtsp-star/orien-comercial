import "reflect-metadata";
import argon2 from "argon2";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { AppModule } from "../../src/modules/app.module";
import { HttpExceptionFilter } from "../../src/shared/http-exception.filter";

loadEnvFile();

const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
const pepper = process.env.PASSWORD_PEPPER ?? "local-development-pepper";

if (!connectionString) {
  throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required for e2e tests.");
}

const permissionSlugs = [
  "platform.tenants.manage",
  "platform.audit.view",
  "tenants.read",
  "tenants.update",
  "users.invite",
  "users.read",
  "users.roles.manage",
  "users.memberships.manage",
  "branches.read",
  "branches.create",
  "branches.update",
  "branches.delete",
  "products.read",
  "products.create",
  "products.update",
  "products.delete",
  "customers.read",
  "customers.create",
  "customers.update",
  "customers.delete",
  "stock.read",
  "stock.adjust",
  "stock.transfer",
  "stock.inventory",
  "stock.purchase",
  "stock.reports",
  "sales.read",
  "sales.create",
  "sales.cancel",
  "sales.history",
  "financial.read",
  "financial.receive",
  "financial.pay",
  "financial.reconcile",
  "financial.categories.manage",
  "subscriptions.read",
  "subscriptions.manage",
  "subscriptions.webhook",
  "dashboard.read"
] as const;

const roleSlugs = ["owner", "admin", "manager", "seller", "cashier", "stock", "finance", "support", "viewer"] as const;

type RoleSlug = (typeof roleSlugs)[number];

const defaultRolePermissions: Record<RoleSlug, string[]> = {
  owner: [...permissionSlugs],
  admin: [
    "tenants.read",
    "users.invite",
    "users.read",
    "users.memberships.manage",
    "branches.read",
    "branches.create",
    "branches.update",
    "products.read",
    "products.create",
    "products.update",
    "products.delete",
    "customers.read",
    "customers.create",
    "customers.update",
    "stock.read",
    "stock.adjust",
    "stock.transfer",
    "stock.inventory",
    "stock.purchase",
    "stock.reports",
    "sales.read",
    "sales.create",
    "sales.cancel",
    "sales.history",
    "financial.read",
    "financial.receive",
    "financial.pay",
    "financial.reconcile",
    "financial.categories.manage",
    "subscriptions.read",
    "subscriptions.manage",
    "dashboard.read"
  ],
  manager: [
    "branches.read",
    "products.read",
    "products.create",
    "products.update",
    "customers.read",
    "customers.create",
    "customers.update",
    "stock.read",
    "stock.adjust",
    "stock.transfer",
    "stock.inventory",
    "stock.reports",
    "sales.read",
    "sales.create",
    "sales.cancel",
    "sales.history",
    "financial.read",
    "financial.receive",
    "financial.pay",
    "financial.reconcile",
    "users.read",
    "users.invite",
    "subscriptions.read",
    "dashboard.read"
  ],
  seller: ["products.read", "customers.read", "customers.create", "customers.update", "sales.read", "sales.create", "sales.history", "dashboard.read"],
  cashier: ["products.read", "customers.read", "sales.read", "sales.create", "sales.history", "dashboard.read"],
  stock: [
    "branches.read",
    "products.read",
    "products.create",
    "products.update",
    "stock.read",
    "stock.adjust",
    "stock.transfer",
    "stock.inventory",
    "stock.purchase",
    "stock.reports",
    "dashboard.read"
  ],
  finance: [
    "customers.read",
    "sales.read",
    "sales.history",
    "financial.read",
    "financial.receive",
    "financial.pay",
    "financial.reconcile",
    "financial.categories.manage",
    "subscriptions.read",
    "dashboard.read"
  ],
  support: ["tenants.read", "users.read", "subscriptions.read", "dashboard.read"],
  viewer: ["branches.read", "products.read", "customers.read", "dashboard.read"]
};

export interface SeededTenant {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  email: string;
  password: string;
  branchId: string;
  roleIds: Record<RoleSlug, string>;
}

export async function createTestApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.use(cookieParser(process.env.COOKIE_SECRET));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  return app;
}

export function createAdminPool() {
  return new Pool({ connectionString, application_name: "sgc-e2e" });
}

export async function resetDatabase(pool: Pool) {
  const tables = await pool.query<{ tablename: string }>(
    `
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '__drizzle_migrations'
    ORDER BY tablename
    `
  );

  if (!tables.rowCount) return;

  const names = tables.rows.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
  await pool.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

export async function seedTenant(
  pool: Pool,
  input: {
    tenantName: string;
    tenantSlug: string;
    ownerEmail: string;
    ownerName: string;
    ownerPassword: string;
    branchName: string;
    branchCode: string;
  }
): Promise<SeededTenant> {
  const passwordHash = await argon2.hash(`${input.ownerPassword}${pepper}`, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1
  });

  await ensurePermissions(pool);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tenantResult = await client.query<{ id: string }>(
      `
      INSERT INTO tenants (name, slug, status, plan_slug)
      VALUES ($1, $2, 'active', 'starter')
      RETURNING id
      `,
      [input.tenantName, input.tenantSlug]
    );
    const tenantId = tenantResult.rows[0]!.id;

    const userResult = await client.query<{ id: string }>(
      `
      INSERT INTO users (email, name, password_hash, is_email_verified)
      VALUES ($1, $2, $3, true)
      RETURNING id
      `,
      [input.ownerEmail.toLowerCase(), input.ownerName, passwordHash]
    );
    const userId = userResult.rows[0]!.id;

    const roleIds = {} as Record<RoleSlug, string>;
    for (const roleSlug of roleSlugs) {
      const roleName = roleSlug.replace(/^\w/, (letter) => letter.toUpperCase());
      const roleResult = await client.query<{ id: string }>(
        `
        INSERT INTO roles (tenant_id, slug, name, is_system)
        VALUES ($1, $2, $3, true)
        RETURNING id
        `,
        [tenantId, roleSlug, roleName]
      );

      roleIds[roleSlug] = roleResult.rows[0]!.id;
    }

    for (const roleSlug of roleSlugs) {
      const roleId = roleIds[roleSlug];
      for (const permissionSlug of defaultRolePermissions[roleSlug]) {
        await client.query(
          `
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT $1, id
          FROM permissions
          WHERE slug = $2
          `,
          [roleId, permissionSlug]
        );
      }
    }

    await client.query(
      `
      INSERT INTO memberships (tenant_id, user_id, role_id, status)
      VALUES ($1, $2, $3, 'active')
      `,
      [tenantId, userId, roleIds.owner]
    );

    const branchResult = await client.query<{ id: string }>(
      `
      INSERT INTO branches (tenant_id, name, code, city, state, is_active)
      VALUES ($1, $2, $3, 'Sao Paulo', 'SP', true)
      RETURNING id
      `,
      [tenantId, input.branchName, input.branchCode]
    );

    await client.query(
      `
      INSERT INTO product_categories (tenant_id, name)
      VALUES ($1, 'Geral')
      `,
      [tenantId]
    );

    await client.query("COMMIT");

    return {
      tenantId,
      tenantSlug: input.tenantSlug,
      userId,
      email: input.ownerEmail.toLowerCase(),
      password: input.ownerPassword,
      branchId: branchResult.rows[0]!.id,
      roleIds
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function seedBaselineTenants(pool: Pool) {
  const tenantA = await seedTenant(pool, {
    tenantName: "Tenant Demonstracao",
    tenantSlug: "tenant-demo",
    ownerEmail: "admin@example.com",
    ownerName: "Administrador Demo",
    ownerPassword: "ChangeMe123!DoNotUseInProduction",
    branchName: "Matriz Demo",
    branchCode: "MATRIZ-A"
  });

  const tenantB = await seedTenant(pool, {
    tenantName: "Tenant Secundario",
    tenantSlug: "tenant-b",
    ownerEmail: "admin-b@example.com",
    ownerName: "Administrador B",
    ownerPassword: "ChangeMe123!DoNotUseInProduction",
    branchName: "Matriz B",
    branchCode: "MATRIZ-B"
  });

  return { tenantA, tenantB };
}

async function ensurePermissions(pool: Pool) {
  for (const slug of permissionSlugs) {
    await pool.query(
      `
      INSERT INTO permissions (slug, description)
      VALUES ($1, $2)
      ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description
      `,
      [slug, slug.replaceAll(".", " ")]
    );
  }
}

function loadEnvFile() {
  const envPath = resolve(process.cwd(), "..", "..", ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
