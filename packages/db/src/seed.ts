import "dotenv/config";
import argon2 from "argon2";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
const ownerEmail = (process.env.PLATFORM_OWNER_EMAIL ?? "admin@example.com").toLowerCase();
const ownerPassword = process.env.PLATFORM_OWNER_PASSWORD ?? "ChangeMe123!DoNotUseInProduction";
const pepper = process.env.PASSWORD_PEPPER ?? "local-development-pepper";
const seedDemoUsers = process.env.SEED_DEMO_USERS === "true";
const demoUserPassword = process.env.DEMO_USER_PASSWORD;

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
  "dashboard.read",
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
  viewer: "viewer",
} as const;

type RoleSlug = (typeof roleSlugs)[keyof typeof roleSlugs];

const roleNames: Record<RoleSlug, string> = {
  owner: "Proprietario",
  admin: "Administrador",
  manager: "Gerente",
  seller: "Vendedor",
  cashier: "Caixa",
  stock: "Estoquista",
  finance: "Financeiro",
  support: "Suporte",
  viewer: "Consulta",
};

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
    "dashboard.read",
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
    "dashboard.read",
  ],
  seller: [
    "products.read",
    "customers.read",
    "customers.create",
    "customers.update",
    "sales.read",
    "sales.create",
    "sales.history",
    "dashboard.read",
  ],
  cashier: [
    "products.read",
    "customers.read",
    "sales.read",
    "sales.create",
    "sales.history",
    "dashboard.read",
  ],
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
    "dashboard.read",
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
    "dashboard.read",
  ],
  support: ["tenants.read", "users.read", "subscriptions.read", "dashboard.read"],
  viewer: ["branches.read", "products.read", "customers.read", "dashboard.read"],
};

const flatPermissions = permissionSlugs.map((slug) => ({
  slug,
  description: slug.replaceAll(".", " "),
}));

async function main() {
  const pool = new Pool({ connectionString, application_name: "sgc-seed" });

  try {
    const passwordHash = await argon2.hash(`${ownerPassword}${pepper}`, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    await pool.query("BEGIN");

    const tenant = await pool.query<{ id: string }>(
      `
      INSERT INTO tenants (name, slug, status, plan_slug)
      VALUES ('Tenant Demonstracao', 'tenant-demo', 'active', 'starter')
      ON CONFLICT (slug) DO UPDATE SET updated_at = now()
      RETURNING id
      `,
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
      [ownerEmail, passwordHash],
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
        [permission.slug, permission.description],
      );
    }

    const roleIds = new Map<string, string>();
    for (const roleSlug of Object.values(roleSlugs)) {
      const roleName = roleNames[roleSlug];
      const role = await pool.query<{ id: string }>(
        `
        INSERT INTO roles (tenant_id, slug, name, is_system)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
        RETURNING id
        `,
        [tenantId, roleSlug, roleName],
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
          [roleId, permissionSlug],
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
      [tenantId, userId, ownerRoleId],
    );

    const branch = await pool.query<{ id: string }>(
      `
      INSERT INTO branches (tenant_id, name, code, city, state, is_active)
      VALUES ($1, 'Matriz', 'MATRIZ', 'Sao Paulo', 'SP', true)
      ON CONFLICT (tenant_id, code) DO UPDATE SET updated_at = now()
      RETURNING id
      `,
      [tenantId],
    );

    const branchId = branch.rows[0]?.id;
    if (!branchId) throw new Error("Failed to upsert demo branch.");

    if (seedDemoUsers) {
      if (!demoUserPassword || demoUserPassword.length < 12) {
        throw new Error("DEMO_USER_PASSWORD with at least 12 characters is required.");
      }
      const demoPasswordHash = await argon2.hash(`${demoUserPassword}${pepper}`, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
      const demoUsers: Array<{ email: string; name: string; role: RoleSlug }> = [
        { email: "gerente@orien.test", name: "Gerente Teste", role: roleSlugs.manager },
        { email: "vendedor@orien.test", name: "Vendedor Teste", role: roleSlugs.seller },
        { email: "caixa@orien.test", name: "Caixa Teste", role: roleSlugs.cashier },
        { email: "estoque@orien.test", name: "Estoquista Teste", role: roleSlugs.stock },
        { email: "financeiro@orien.test", name: "Financeiro Teste", role: roleSlugs.finance },
        { email: "consulta@orien.test", name: "Consulta Teste", role: roleSlugs.viewer },
      ];

      for (const demoUser of demoUsers) {
        const demo = await pool.query<{ id: string }>(
          `INSERT INTO users (email,name,password_hash,is_email_verified,must_change_password)
           VALUES ($1,$2,$3,true,true)
           ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,must_change_password=true,updated_at=now()
           RETURNING id`,
          [demoUser.email, demoUser.name, demoPasswordHash],
        );
        await pool.query(
          `INSERT INTO memberships (tenant_id,user_id,role_id,branch_id,status)
           VALUES ($1,$2,$3,$4,'active')
           ON CONFLICT (tenant_id,user_id) DO UPDATE SET role_id=EXCLUDED.role_id,branch_id=EXCLUDED.branch_id,status='active',updated_at=now()`,
          [tenantId, demo.rows[0]!.id, roleIds.get(demoUser.role), branchId],
        );
      }
    }

    const category = await pool.query<{ id: string }>(
      `
      INSERT INTO product_categories (tenant_id, name)
      VALUES ($1, 'Geral')
      ON CONFLICT (tenant_id, name) DO UPDATE SET updated_at=now()
      RETURNING id
      `,
      [tenantId],
    );

    const demoProducts = [
      {
        name: "Café Tradicional 500g",
        sku: "ORI-CAF-500",
        barcode: "7891000000016",
        cost: 12.5,
        price: 19.9,
        min: 10,
        quantity: 42,
      },
      {
        name: "Leite Integral 1L",
        sku: "ORI-LEI-1L",
        barcode: "7891000000023",
        cost: 4.2,
        price: 6.9,
        min: 12,
        quantity: 36,
      },
      {
        name: "Açúcar Refinado 1kg",
        sku: "ORI-ACU-1K",
        barcode: "7891000000030",
        cost: 4.8,
        price: 7.5,
        min: 8,
        quantity: 25,
      },
      {
        name: "Biscoito Recheado 120g",
        sku: "ORI-BIS-120",
        barcode: "7891000000047",
        cost: 2.9,
        price: 5.5,
        min: 15,
        quantity: 50,
      },
      {
        name: "Água Mineral 500ml",
        sku: "ORI-AGU-500",
        barcode: "7891000000054",
        cost: 1.25,
        price: 3.0,
        min: 20,
        quantity: 72,
      },
    ];

    for (const item of demoProducts) {
      const product = await pool.query<{ id: string }>(
        `INSERT INTO products (tenant_id,branch_id,category_id,name,sku,barcode,unit,cost_price,sale_price,min_stock,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,'un',$7,$8,$9,true)
         ON CONFLICT (tenant_id,sku) DO UPDATE SET name=EXCLUDED.name,barcode=EXCLUDED.barcode,cost_price=EXCLUDED.cost_price,sale_price=EXCLUDED.sale_price,min_stock=EXCLUDED.min_stock,is_active=true,deleted_at=null,updated_at=now()
         RETURNING id`,
        [
          tenantId,
          branchId,
          category.rows[0]!.id,
          item.name,
          item.sku,
          item.barcode,
          item.cost,
          item.price,
          item.min,
        ],
      );
      await pool.query(
        `INSERT INTO stock_balances (tenant_id,branch_id,product_id,quantity)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (tenant_id,branch_id,product_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now()`,
        [tenantId, branchId, product.rows[0]!.id, item.quantity],
      );
    }

    await pool.query(
      `INSERT INTO suppliers (tenant_id,branch_id,name,document,email,phone,whatsapp,notes,is_active)
       VALUES ($1,$2,'Distribuidora Horizonte','12345678000190','compras@horizonte.test','11999990000','11999990000','Fornecedor de demonstracao',true)
       ON CONFLICT (tenant_id,document) WHERE document IS NOT NULL AND deleted_at IS NULL
       DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,whatsapp=EXCLUDED.whatsapp,is_active=true,deleted_at=null,updated_at=now()`,
      [tenantId, branchId],
    );

    await pool.query(
      `
      INSERT INTO customers (tenant_id, branch_id, type, name, document, email, phone, whatsapp, communication_opt_in, is_active)
      VALUES ($1, $2, 'individual', 'Cliente Exemplo', '12345678909', 'cliente@example.com', '11988887777', '11988887777', true, true)
      ON CONFLICT (tenant_id, document) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,whatsapp=EXCLUDED.whatsapp,is_active=true,deleted_at=null,updated_at=now()
      `,
      [tenantId, branchId],
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
