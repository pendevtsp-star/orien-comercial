import "dotenv/config";
import argon2 from "argon2";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
const password = process.env.OPERATIONAL_TEST_SEED_PASSWORD;
const pepper = process.env.PASSWORD_PEPPER ?? "local-development-pepper";
const email = process.env.OPERATIONAL_TEST_SEED_EMAIL ?? "teste.full@useorien.com.br";
const tenantSlug = "laboratorio-operacional-orien";

if (!connectionString) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required.");
if (!password || !/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password)) {
  throw new Error("OPERATIONAL_TEST_SEED_PASSWORD must have 8+ characters, uppercase, number and special character.");
}

type ProductFixture = { sku: string; barcode: string; name: string; category: string; cost: number; sale: number; min: number };

const products: ProductFixture[] = [
  { sku: "LAB-ARROZ-5KG", barcode: "7891000000101", name: "Arroz Tipo 1 5kg", category: "Mercearia", cost: 21.5, sale: 29.9, min: 10 },
  { sku: "LAB-FEIJAO-1KG", barcode: "7891000000102", name: "Feijão Carioca 1kg", category: "Mercearia", cost: 5.8, sale: 8.99, min: 18 },
  { sku: "LAB-CAFE-500G", barcode: "7891000000103", name: "Café Torrado 500g", category: "Mercearia", cost: 12.9, sale: 19.9, min: 8 },
  { sku: "LAB-ACUCAR-1KG", barcode: "7891000000104", name: "Açúcar Refinado 1kg", category: "Mercearia", cost: 4.2, sale: 6.99, min: 20 },
  { sku: "LAB-AGUA-500", barcode: "7891000000105", name: "Água Mineral 500ml", category: "Bebidas", cost: 1.3, sale: 3, min: 48 },
  { sku: "LAB-REFRI-2L", barcode: "7891000000106", name: "Refrigerante Cola 2L", category: "Bebidas", cost: 6.2, sale: 10.99, min: 16 },
  { sku: "LAB-SUCO-1L", barcode: "7891000000107", name: "Suco Integral Uva 1L", category: "Bebidas", cost: 8.5, sale: 13.9, min: 10 },
  { sku: "LAB-DETERG-500", barcode: "7891000000108", name: "Detergente Neutro 500ml", category: "Limpeza", cost: 1.95, sale: 3.99, min: 24 },
  { sku: "LAB-SABAO-1KG", barcode: "7891000000109", name: "Sabão em Pó 1kg", category: "Limpeza", cost: 9.7, sale: 15.9, min: 12 },
  { sku: "LAB-PAPEL-4", barcode: "7891000000110", name: "Papel Higiênico 4 rolos", category: "Limpeza", cost: 7.4, sale: 11.99, min: 14 },
  { sku: "LAB-LAMPADA-9W", barcode: "7891000000111", name: "Lâmpada LED 9W", category: "Utilidades", cost: 5.1, sale: 9.9, min: 8 },
  { sku: "LAB-PILHA-AA", barcode: "7891000000112", name: "Pilha Alcalina AA 2 un", category: "Utilidades", cost: 6.8, sale: 12.5, min: 10 },
];

async function upsertId(client: PoolClient, sql: string, params: unknown[]) {
  const result = await client.query<{ id: string }>(sql, params);
  if (!result.rows[0]) throw new Error("Could not create operational test fixture.");
  return result.rows[0].id;
}

async function main() {
  const pool = new Pool({ connectionString, application_name: "orien-operational-test-seed" });
  const passwordHash = await argon2.hash(`${password}${pepper}`, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const planId = await upsertId(client,
      `INSERT INTO plans(slug,name,price_cents,is_active) VALUES('full','Full - laboratório de testes',0,false)
       ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,price_cents=0,is_active=false,updated_at=now() RETURNING id`, []);
    const tenantId = await upsertId(client,
      `INSERT INTO tenants(name,slug,status,plan_slug) VALUES('Laboratório Operacional Orien',$1,'active','full')
       ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,status='active',plan_slug='full',deleted_at=NULL,updated_at=now() RETURNING id`, [tenantSlug]);
    await client.query(
      `INSERT INTO subscriptions(tenant_id,plan_id,provider,status,current_period_ends_at)
       SELECT $1,$2,'manual_test','active',now()+interval '365 days'
       WHERE NOT EXISTS(SELECT 1 FROM subscriptions WHERE tenant_id=$1 AND provider='manual_test')`, [tenantId, planId]);

    const entities = [
      { name: "Laboratório Varejo Ltda", document: "00000000000191", branch: "Loja Centro", code: "CENTRO" },
      { name: "Laboratório Atacado Ltda", document: "00000000000272", branch: "Atacado Norte", code: "ATACADO" },
      { name: "Laboratório Serviços Ltda", document: "00000000000353", branch: "Serviços Sul", code: "SERVICOS" },
    ];
    const branches = new Map<string, string>();
    for (const entity of entities) {
      const legalEntityId = await upsertId(client,
        `INSERT INTO legal_entities(tenant_id,name,document,document_type) VALUES($1,$2,$3,'cnpj')
         ON CONFLICT(tenant_id,document) DO UPDATE SET name=EXCLUDED.name,deleted_at=NULL,updated_at=now() RETURNING id`, [tenantId, entity.name, entity.document]);
      const branchId = await upsertId(client,
        `INSERT INTO branches(tenant_id,legal_entity_id,name,code,email,city,state,is_active) VALUES($1,$2,$3,$4,'teste@useorien.com.br','São Paulo','SP',true)
         ON CONFLICT(tenant_id,code) DO UPDATE SET legal_entity_id=EXCLUDED.legal_entity_id,name=EXCLUDED.name,is_active=true,deleted_at=NULL,updated_at=now() RETURNING id`, [tenantId, legalEntityId, entity.branch, entity.code]);
      branches.set(entity.code, branchId);
    }

    const roles = [
      ["owner", "Proprietário"], ["admin", "Administrador"], ["manager", "Gerente"], ["seller", "Vendedor"], ["cashier", "Caixa"], ["stock", "Estoquista"], ["finance", "Financeiro"],
    ] as const;
    const roleIds = new Map<string, string>();
    for (const [slug, name] of roles) {
      const roleId = await upsertId(client,
        `INSERT INTO roles(tenant_id,slug,name,is_system) VALUES($1,$2,$3,true)
         ON CONFLICT(tenant_id,slug) DO UPDATE SET name=EXCLUDED.name,deleted_at=NULL,updated_at=now() RETURNING id`, [tenantId, slug, name]);
      roleIds.set(slug, roleId);
      const permissionFilter = ["owner", "admin", "manager"].includes(slug)
        ? "true"
        : slug === "stock" ? "slug LIKE 'stock.%' OR slug LIKE 'products.%' OR slug LIKE 'purchases.%'"
        : slug === "finance" ? "slug LIKE 'financial.%' OR slug LIKE 'reports.%'"
        : "slug LIKE 'sales.%' OR slug LIKE 'customers.%'";
      await client.query(`INSERT INTO role_permissions(role_id,permission_id) SELECT $1,id FROM permissions WHERE ${permissionFilter} ON CONFLICT DO NOTHING`, [roleId]);
    }

    const users = [
      { email, name: "Teste Full - Proprietário", role: "owner", branch: null },
      { email: "gerente.centro@teste.orien.local", name: "Marina Gerente", role: "manager", branch: "CENTRO" },
      { email: "caixa.centro@teste.orien.local", name: "Paulo Caixa", role: "cashier", branch: "CENTRO" },
      { email: "estoque.atacado@teste.orien.local", name: "Bruna Estoque", role: "stock", branch: "ATACADO" },
      { email: "financeiro.servicos@teste.orien.local", name: "Diego Financeiro", role: "finance", branch: "SERVICOS" },
    ];
    const userIds = new Map<string, string>();
    for (const user of users) {
      const userId = await upsertId(client,
        `INSERT INTO users(email,name,password_hash,is_email_verified,must_change_password) VALUES($1,$2,$3,true,false)
         ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,is_email_verified=true,must_change_password=false,deleted_at=NULL,updated_at=now() RETURNING id`, [user.email, user.name, passwordHash]);
      userIds.set(user.role, userId);
      await client.query(
        `INSERT INTO memberships(tenant_id,user_id,role_id,branch_id,status) VALUES($1,$2,$3,$4,'active')
         ON CONFLICT(tenant_id,user_id) DO UPDATE SET role_id=EXCLUDED.role_id,branch_id=EXCLUDED.branch_id,status='active',deleted_at=NULL,updated_at=now()`,
        [tenantId, userId, roleIds.get(user.role), user.branch ? branches.get(user.branch) : null]);
    }

    const categoryIds = new Map<string, string>();
    for (const category of [...new Set(products.map((product) => product.category))]) {
      categoryIds.set(category, await upsertId(client,
        `INSERT INTO product_categories(tenant_id,name) VALUES($1,$2) ON CONFLICT(tenant_id,name) DO UPDATE SET deleted_at=NULL,updated_at=now() RETURNING id`, [tenantId, category]));
    }
    const productIds = new Map<string, string>();
    for (const product of products) {
      const productId = await upsertId(client,
        `INSERT INTO products(tenant_id,category_id,name,sku,barcode,unit,cost_price,sale_price,min_stock,is_active)
         VALUES($1,$2,$3,$4,$5,'un',$6,$7,$8,true)
         ON CONFLICT(tenant_id,sku) DO UPDATE SET category_id=EXCLUDED.category_id,name=EXCLUDED.name,barcode=EXCLUDED.barcode,cost_price=EXCLUDED.cost_price,sale_price=EXCLUDED.sale_price,min_stock=EXCLUDED.min_stock,is_active=true,deleted_at=NULL,updated_at=now() RETURNING id`,
        [tenantId, categoryIds.get(product.category), product.name, product.sku, product.barcode, product.cost, product.sale, product.min]);
      productIds.set(product.sku, productId);
      for (const [code, branchId] of branches) {
        const quantity = code === "CENTRO" ? (product.sku === "LAB-PILHA-AA" ? 4 : 30) : code === "ATACADO" ? 80 : 12;
        await client.query(
          `INSERT INTO stock_balances(tenant_id,branch_id,product_id,quantity) VALUES($1,$2,$3,$4)
           ON CONFLICT(tenant_id,branch_id,product_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now()`, [tenantId, branchId, productId, quantity]);
      }
    }

    const currentSupplier = await client.query<{ id: string }>(
      "SELECT id FROM suppliers WHERE tenant_id=$1 AND document='00000000000434' AND deleted_at IS NULL LIMIT 1", [tenantId]);
    const supplierId = currentSupplier.rows[0]?.id ?? await upsertId(client,
      `INSERT INTO suppliers(tenant_id,branch_id,name,document,email,is_active) VALUES($1,$2,'Distribuidora Laboratório','00000000000434','compras@teste.orien.local',true) RETURNING id`,
      [tenantId, branches.get("CENTRO")]);
    const customerIds: string[] = [];
    for (const [index, name] of ["Ana Cliente", "Carlos Cliente", "Joana Cliente", "Mercado Parceiro", "Rita Cliente", "Rodrigo Cliente"].entries()) {
      customerIds.push(await upsertId(client,
        `INSERT INTO customers(tenant_id,branch_id,type,name,document,phone,whatsapp,email,communication_opt_in,is_active)
         VALUES($1,$2,$3,$4,$5,'11990000000','11990000000',$6,true,true)
         ON CONFLICT(tenant_id,document) DO UPDATE SET name=EXCLUDED.name,is_active=true,deleted_at=NULL,updated_at=now() RETURNING id`,
        [tenantId, branches.get(index % 2 ? "ATACADO" : "CENTRO"), index === 3 ? "company" : "individual", name, `9000000000${index}`, `cliente${index}@teste.orien.local`]));
    }
    const orderId = await upsertId(client,
      `INSERT INTO purchase_orders(tenant_id,branch_id,supplier_id,status,expected_at,notes,total_amount,created_by_user_id)
       SELECT $1,$2,$3,'approved',current_date+2,'Carga de teste operacional',450,$4
       WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE tenant_id=$1 AND notes='Carga de teste operacional') RETURNING id`,
      [tenantId, branches.get("CENTRO"), supplierId, userIds.get("owner")]);
    for (const product of products.slice(0, 4)) {
      await client.query(`INSERT INTO purchase_order_items(tenant_id,purchase_order_id,product_id,quantity,unit_cost)
        SELECT $1,$2,$3,20,$4 WHERE NOT EXISTS(SELECT 1 FROM purchase_order_items WHERE purchase_order_id=$2 AND product_id=$3)`,
        [tenantId, orderId, productIds.get(product.sku), product.cost]);
    }
    const saleId = await upsertId(client,
      `INSERT INTO sales(tenant_id,branch_id,customer_id,seller_user_id,status,total_amount)
       SELECT $1,$2,$3,$4,'sold',43.88 WHERE NOT EXISTS(SELECT 1 FROM sales WHERE tenant_id=$1 AND status='sold' AND total_amount=43.88) RETURNING id`,
      [tenantId, branches.get("CENTRO"), customerIds[0], userIds.get("cashier")]);
    for (const product of products.slice(0, 3)) {
      await client.query(`INSERT INTO sale_items(tenant_id,sale_id,product_id,description,quantity,unit_price)
        SELECT $1,$2,$3,$4,2,$5 WHERE NOT EXISTS(SELECT 1 FROM sale_items WHERE sale_id=$2 AND product_id=$3)`,
        [tenantId, saleId, productIds.get(product.sku), product.name, product.sale]);
    }
    await client.query(`INSERT INTO sale_payments(tenant_id,sale_id,method,amount,status)
      SELECT $1,$2,'pix',43.88,'paid' WHERE NOT EXISTS(SELECT 1 FROM sale_payments WHERE sale_id=$2)`, [tenantId, saleId]);
    await client.query(`INSERT INTO accounts_receivable(tenant_id,branch_id,customer_id,sale_id,amount,due_date,status)
      SELECT $1,$2,$3,$4,120,current_date+5,'open' WHERE NOT EXISTS(SELECT 1 FROM accounts_receivable WHERE tenant_id=$1 AND sale_id=$4)`, [tenantId, branches.get("CENTRO"), customerIds[1], saleId]);
    await client.query(`INSERT INTO accounts_payable(tenant_id,branch_id,supplier_id,amount,due_date,status)
      SELECT $1,$2,$3,450,current_date+7,'open' WHERE NOT EXISTS(SELECT 1 FROM accounts_payable WHERE tenant_id=$1 AND supplier_id=$3 AND amount=450)`, [tenantId, branches.get("CENTRO"), supplierId]);
    await client.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
      VALUES($1,$2,'operational_test.seeded','tenant',$1,$3::jsonb)`, [tenantId, userIds.get("owner"), JSON.stringify({ source: "seed:operational-test", companies: 3, products: products.length })]);
    await client.query("COMMIT");
    console.log(`Operational test tenant ready: ${tenantSlug}`);
    console.log(`Test login: ${email}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
