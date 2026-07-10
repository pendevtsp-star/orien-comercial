import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
};

export const tenantStatusEnum = pgEnum("tenant_status", [
  "trial",
  "active",
  "past_due",
  "suspended",
  "cancelled"
]);

export const membershipStatusEnum = pgEnum("membership_status", ["active", "invited", "disabled"]);
export const customerTypeEnum = pgEnum("customer_type", ["individual", "company"]);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    status: tenantStatusEnum("status").notNull().default("trial"),
    planSlug: varchar("plan_slug", { length: 80 }),
    ...timestamps
  },
  (table) => ({
    slugIdx: uniqueIndex("tenants_slug_idx").on(table.slug)
  })
);

export const tenantDomains = pgTable(
  "tenant_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    hostname: varchar("hostname", { length: 255 }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    hostnameIdx: uniqueIndex("tenant_domains_hostname_idx").on(table.hostname),
    tenantIdx: index("tenant_domains_tenant_idx").on(table.tenantId)
  })
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    isEmailVerified: boolean("is_email_verified").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email)
  })
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps
  },
  (table) => ({
    tenantSlugIdx: uniqueIndex("roles_tenant_slug_idx").on(table.tenantId, table.slug)
  })
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 120 }).notNull(),
    description: varchar("description", { length: 255 }).notNull()
  },
  (table) => ({
    slugIdx: uniqueIndex("permissions_slug_idx").on(table.slug)
  })
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionId] })
  })
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id"),
    status: membershipStatusEnum("status").notNull().default("active"),
    ...timestamps
  },
  (table) => ({
    tenantUserIdx: uniqueIndex("memberships_tenant_user_idx").on(table.tenantId, table.userId),
    tenantIdx: index("memberships_tenant_idx").on(table.tenantId),
    userIdx: index("memberships_user_idx").on(table.userId)
  })
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdx: index("sessions_user_idx").on(table.userId)
  })
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "restrict" }),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  ...timestamps
});

export const legalEntities = pgTable(
  "legal_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    document: varchar("document", { length: 20 }).notNull(),
    documentType: varchar("document_type", { length: 12 }).notNull().default("cnpj"),
    ...timestamps
  },
  (table) => ({
    tenantDocumentIdx: uniqueIndex("legal_entities_tenant_document_idx").on(table.tenantId, table.document)
  })
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    legalEntityId: uuid("legal_entity_id").references(() => legalEntities.id, { onDelete: "set null" }),
    name: varchar("name", { length: 140 }).notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    email: varchar("email", { length: 255 }),
    addressLine1: varchar("address_line1", { length: 180 }),
    city: varchar("city", { length: 90 }),
    state: varchar("state", { length: 2 }),
    zipCode: varchar("zip_code", { length: 16 }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps
  },
  (table) => ({
    tenantCodeIdx: uniqueIndex("branches_tenant_code_idx").on(table.tenantId, table.code),
    tenantIdx: index("branches_tenant_idx").on(table.tenantId)
  })
);

export const tenantSettings = pgTable("tenant_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 120 }).notNull(),
  value: jsonb("value").notNull().default({}),
  ...timestamps
});

export const branchSettings = pgTable("branch_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 120 }).notNull(),
  value: jsonb("value").notNull().default({}),
  ...timestamps
});

export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    ...timestamps
  },
  (table) => ({
    tenantNameIdx: uniqueIndex("product_categories_tenant_name_idx").on(table.tenantId, table.name)
  })
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    categoryId: uuid("category_id").references(() => productCategories.id, { onDelete: "set null" }),
    name: varchar("name", { length: 180 }).notNull(),
    sku: varchar("sku", { length: 64 }),
    barcode: varchar("barcode", { length: 64 }),
    description: text("description"),
    unit: varchar("unit", { length: 16 }).notNull().default("un"),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }).notNull().default("0"),
    salePrice: numeric("sale_price", { precision: 12, scale: 2 }).notNull(),
    promotionalPrice: numeric("promotional_price", { precision: 12, scale: 2 }),
    minStock: numeric("min_stock", { precision: 12, scale: 3 }).notNull().default("0"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps
  },
  (table) => ({
    tenantSkuIdx: uniqueIndex("products_tenant_sku_idx").on(table.tenantId, table.sku),
    tenantIdx: index("products_tenant_idx").on(table.tenantId),
    branchIdx: index("products_branch_idx").on(table.branchId),
    nameIdx: index("products_name_idx").on(table.name)
  })
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    type: customerTypeEnum("type").notNull().default("individual"),
    name: varchar("name", { length: 180 }).notNull(),
    document: varchar("document", { length: 20 }),
    phone: varchar("phone", { length: 30 }),
    whatsapp: varchar("whatsapp", { length: 30 }),
    email: varchar("email", { length: 255 }),
    birthDate: date("birth_date"),
    addressLine1: varchar("address_line1", { length: 180 }),
    city: varchar("city", { length: 90 }),
    state: varchar("state", { length: 2 }),
    zipCode: varchar("zip_code", { length: 16 }),
    tags: text("tags").array().notNull().default([]),
    notes: text("notes"),
    communicationOptIn: boolean("communication_opt_in").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps
  },
  (table) => ({
    tenantDocumentIdx: uniqueIndex("customers_tenant_document_idx").on(table.tenantId, table.document),
    tenantIdx: index("customers_tenant_idx").on(table.tenantId),
    branchIdx: index("customers_branch_idx").on(table.branchId),
    nameIdx: index("customers_name_idx").on(table.name)
  })
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 120 }).notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantIdx: index("audit_logs_tenant_idx").on(table.tenantId),
    actorIdx: index("audit_logs_actor_idx").on(table.actorUserId)
  })
);

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 80 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  priceCents: integer("price_cents").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps
});
