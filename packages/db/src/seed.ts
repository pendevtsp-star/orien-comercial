import "dotenv/config";
import argon2 from "argon2";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
const ownerEmail = (process.env.PLATFORM_OWNER_EMAIL ?? "admin@example.com").toLowerCase();
const ownerPassword = process.env.PLATFORM_OWNER_PASSWORD ?? "ChangeMe123!DoNotUseInProduction";
const pepper = process.env.PASSWORD_PEPPER ?? "local-development-pepper";

if (!connectionString) {
  throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required to seed.");
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

const roleSlugs = {
  owner: "owner",
  admin: "admin",
  manager: "manager",
  seller: "seller",
  cashier: "cashier",
  stock: "stock",
  finance: "finance",
  support: "support",
  viewer: "viewer"
} as const;

type RoleSlug = (typeof roleSlugs)[keyof typeof roleSlugs];

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

const flatPermissions = permissionSlugs.map((slug) => ({
    slug,
    description: slug.replaceAll(".", " ")
}));

async function main() {
  const pool = new Pool({ connectionString, application_name: "sgc-seed" });

  try {
    const passwordHash = await argon2.hash(`${ownerPassword}${pepper}`, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1
    });

    await pool.query("BEGIN");

    const tenant = await pool.query<{ id: string }>(
      `
      INSERT INTO tenants (name, slug, status, plan_slug)
      VALUES ('Tenant Demonstracao', 'tenant-demo', 'active', 'starter')
      ON CONFLICT (slug) DO UPDATE SET updated_at = now()
      RETURNING id
      `
    );

    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) throw new Error("Failed to upsert demo tenant.");

    const user = await pool.query<{ id: string }>(
      `
      INSERT INTO users (email, name, password_hash, is_email_verified)
      VALUES ($1, 'Administrador', $2, true)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()
      RETURNING id
      `,
      [ownerEmail, passwordHash]
    );

    const userId = user.rows[0]?.id;
    if (!userId) throw new Error("Failed to upsert owner user.");

    for (const permission of flatPermissions) {
      await pool.query(
        `
        INSERT INTO permissions (slug, description)
        VALUES ($1, $2)
        ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description
        `,
        [permission.slug, permission.description]
      );
    }

    const roleIds = new Map<string, string>();
    for (const roleSlug of Object.values(roleSlugs)) {
      const roleName = roleSlug.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
      const role = await pool.query<{ id: string }>(
        `
        INSERT INTO roles (tenant_id, slug, name, is_system)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (tenant_id, slug) DO UPDATE SET updated_at = now()
        RETURNING id
        `,
        [tenantId, roleSlug, roleName]
      );
      roleIds.set(roleSlug, role.rows[0]!.id);
    }

    for (const [roleSlug, rolePermissions] of Object.entries(defaultRolePermissions)) {
      const roleId = roleIds.get(roleSlug);
      if (!roleId) continue;

      for (const permissionSlug of rolePermissions) {
        await pool.query(
          `
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT $1, id FROM permissions WHERE slug = $2
          ON CONFLICT DO NOTHING
          `,
          [roleId, permissionSlug]
        );
      }
    }

    const ownerRoleId = roleIds.get(roleSlugs.owner);
    if (!ownerRoleId) throw new Error("Owner role was not created.");

    await pool.query(
      `
      INSERT INTO memberships (tenant_id, user_id, role_id, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id, status = 'active', updated_at = now()
      `,
      [tenantId, userId, ownerRoleId]
    );

    const branch = await pool.query<{ id: string }>(
      `
      INSERT INTO branches (tenant_id, name, code, city, state, is_active)
      VALUES ($1, 'Matriz', 'MATRIZ', 'Sao Paulo', 'SP', true)
      ON CONFLICT (tenant_id, code) DO UPDATE SET updated_at = now()
      RETURNING id
      `,
      [tenantId]
    );

    await pool.query(
      `
      INSERT INTO product_categories (tenant_id, name)
      VALUES ($1, 'Geral')
      ON CONFLICT (tenant_id, name) DO NOTHING
      `,
      [tenantId]
    );

    await pool.query(
      `
      INSERT INTO customers (tenant_id, branch_id, type, name, email, communication_opt_in, is_active)
      VALUES ($1, $2, 'individual', 'Cliente Exemplo', 'cliente@example.com', true, true)
      ON CONFLICT (tenant_id, document) DO NOTHING
      `,
      [tenantId, branch.rows[0]?.id ?? null]
    );

    await pool.query("COMMIT");
    console.log(`Seed completed. Login: ${ownerEmail}`);
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    await pool.end();
  }
}

void main();
