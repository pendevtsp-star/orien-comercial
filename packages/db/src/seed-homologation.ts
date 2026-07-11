import "dotenv/config";
import argon2 from "argon2";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
const password = process.env.HOMOLOGATION_SEED_PASSWORD;
const pepper = process.env.PASSWORD_PEPPER ?? "local-development-pepper";

if (!connectionString) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required.");
if (!password || password.length < 12) {
  throw new Error("HOMOLOGATION_SEED_PASSWORD with at least 12 characters is required.");
}

const fixtures = [
  { name: "Comercio Horizonte", slug: "homolog-horizonte" },
  { name: "Casa Aurora", slug: "homolog-aurora" },
];
const roles = ["owner", "admin", "manager", "seller", "cashier", "stock", "finance"] as const;
const roleNames: Record<(typeof roles)[number], string> = {
  owner: "Proprietario",
  admin: "Administrador",
  manager: "Gerente",
  seller: "Vendedor",
  cashier: "Caixa",
  stock: "Estoquista",
  finance: "Financeiro",
};

async function main() {
  const pool = new Pool({ connectionString, application_name: "sgc-homologation-seed" });
  const passwordHash = await argon2.hash(`${password}${pepper}`, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  try {
    for (const fixture of fixtures) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tenant = await client.query<{ id: string }>(
          `INSERT INTO tenants(name,slug,status,plan_slug) VALUES($1,$2,'active','starter')
           ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,updated_at=now() RETURNING id`,
          [fixture.name, fixture.slug],
        );
        const tenantId = tenant.rows[0]!.id;
        const branchIds = new Map<string, string>();
        for (const branch of [
          { name: "Matriz", code: "MATRIZ" },
          { name: "Loja Centro", code: "CENTRO" },
        ]) {
          const result = await client.query<{ id: string }>(
            `INSERT INTO branches(tenant_id,name,code,is_active) VALUES($1,$2,$3,true)
             ON CONFLICT(tenant_id,code) DO UPDATE SET name=EXCLUDED.name,is_active=true,updated_at=now() RETURNING id`,
            [tenantId, branch.name, branch.code],
          );
          branchIds.set(branch.code, result.rows[0]!.id);
        }

        const roleIds = new Map<string, string>();
        for (const role of roles) {
          const result = await client.query<{ id: string }>(
            `INSERT INTO roles(tenant_id,slug,name,is_system) VALUES($1,$2,$3,true)
             ON CONFLICT(tenant_id,slug) DO UPDATE SET name=EXCLUDED.name,updated_at=now() RETURNING id`,
            [tenantId, role, roleNames[role]],
          );
          const roleId = result.rows[0]!.id;
          roleIds.set(role, roleId);
          await client.query(
            `INSERT INTO role_permissions(role_id,permission_id)
             SELECT $1,rp.permission_id FROM roles r JOIN role_permissions rp ON rp.role_id=r.id
             JOIN tenants t ON t.id=r.tenant_id
             WHERE t.slug='tenant-demo' AND r.slug=$2 ON CONFLICT DO NOTHING`,
            [roleId, role],
          );
        }

        for (const role of roles) {
          const email = `${role}.${fixture.slug}@orien.test`;
          const user = await client.query<{ id: string }>(
            `INSERT INTO users(email,name,password_hash,is_email_verified,must_change_password)
             VALUES($1,$2,$3,true,true)
             ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,must_change_password=true,updated_at=now()
             RETURNING id`,
            [email, `${roleNames[role]} ${fixture.name}`, passwordHash],
          );
          const branchId = ["manager", "seller", "cashier"].includes(role)
            ? branchIds.get("CENTRO")
            : role === "stock"
              ? branchIds.get("MATRIZ")
              : null;
          await client.query(
            `INSERT INTO memberships(tenant_id,user_id,role_id,branch_id,status) VALUES($1,$2,$3,$4,'active')
             ON CONFLICT(tenant_id,user_id) DO UPDATE SET role_id=EXCLUDED.role_id,branch_id=EXCLUDED.branch_id,status='active',updated_at=now()`,
            [tenantId, user.rows[0]!.id, roleIds.get(role), branchId],
          );
        }
        await client.query("COMMIT");
        console.log(`Homologation tenant ready: ${fixture.slug}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

void main();
