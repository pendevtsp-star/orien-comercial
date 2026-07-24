export const permissions = {
  platform: {
    manageTenants: "platform.tenants.manage",
    viewAudit: "platform.audit.view",
  },
  tenants: {
    read: "tenants.read",
    update: "tenants.update",
  },
  users: {
    invite: "users.invite",
    read: "users.read",
    manageRoles: "users.roles.manage",
    manageMemberships: "users.memberships.manage",
  },
  branches: {
    read: "branches.read",
    create: "branches.create",
    update: "branches.update",
    delete: "branches.delete",
  },
  products: {
    read: "products.read",
    create: "products.create",
    update: "products.update",
    delete: "products.delete",
  },
  customers: {
    read: "customers.read",
    create: "customers.create",
    update: "customers.update",
    delete: "customers.delete",
  },
  stock: {
    read: "stock.read",
    adjust: "stock.adjust",
    transfer: "stock.transfer",
    inventory: "stock.inventory",
    purchase: "stock.purchase",
    reports: "stock.reports",
  },
  sales: {
    read: "sales.read",
    create: "sales.create",
    cancel: "sales.cancel",
    history: "sales.history",
  },
  pricing: {
    manage: "pricing.policies.manage",
    authorizeException: "pricing.exceptions.authorize",
  },
  financial: {
    read: "financial.read",
    receive: "financial.receive",
    pay: "financial.pay",
    reconcile: "financial.reconcile",
    categories: "financial.categories.manage",
  },
  subscriptions: {
    read: "subscriptions.read",
    manage: "subscriptions.manage",
    webhook: "subscriptions.webhook",
  },
  dashboard: {
    read: "dashboard.read",
  },
  fiscal: {
    read: "fiscal.read",
    configure: "fiscal.configure",
    issue: "fiscal.issue",
    cancel: "fiscal.cancel",
    review: "fiscal.review",
    activate: "fiscal.activate",
  },
} as const;

export type Permission = Leaves<typeof permissions>;

type Leaves<T> = T extends string
  ? T
  : {
      [K in keyof T]: Leaves<T[K]>;
    }[keyof T];

export const roleSlugs = {
  owner: "owner",
  admin: "admin",
  manager: "manager",
  seller: "seller",
  cashier: "cashier",
  stock: "stock",
  finance: "finance",
  accountant: "accountant",
  support: "support",
  viewer: "viewer",
} as const;

export type RoleSlug = (typeof roleSlugs)[keyof typeof roleSlugs];

export const defaultRolePermissions: Record<RoleSlug, Permission[]> = {
  owner: Object.values(permissions).flatMap((group) => Object.values(group)),
  admin: [
    permissions.tenants.read,
    permissions.users.invite,
    permissions.users.read,
    permissions.users.manageMemberships,
    permissions.branches.read,
    permissions.branches.create,
    permissions.branches.update,
    permissions.products.read,
    permissions.products.create,
    permissions.products.update,
    permissions.products.delete,
    permissions.customers.read,
    permissions.customers.create,
    permissions.customers.update,
    permissions.stock.read,
    permissions.stock.adjust,
    permissions.stock.transfer,
    permissions.stock.inventory,
    permissions.stock.purchase,
    permissions.stock.reports,
    permissions.sales.read,
    permissions.sales.create,
    permissions.sales.cancel,
    permissions.sales.history,
    permissions.pricing.manage,
    permissions.pricing.authorizeException,
    permissions.financial.read,
    permissions.financial.receive,
    permissions.financial.pay,
    permissions.financial.reconcile,
    permissions.financial.categories,
    permissions.subscriptions.read,
    permissions.subscriptions.manage,
    permissions.dashboard.read,
    permissions.fiscal.read,
    permissions.fiscal.configure,
    permissions.fiscal.issue,
    permissions.fiscal.cancel,
    permissions.fiscal.review,
    permissions.fiscal.activate,
  ],
  manager: [
    permissions.branches.read,
    permissions.products.read,
    permissions.products.create,
    permissions.products.update,
    permissions.customers.read,
    permissions.customers.create,
    permissions.customers.update,
    permissions.stock.read,
    permissions.stock.adjust,
    permissions.stock.transfer,
    permissions.stock.inventory,
    permissions.stock.reports,
    permissions.sales.read,
    permissions.sales.create,
    permissions.sales.cancel,
    permissions.sales.history,
    permissions.pricing.manage,
    permissions.pricing.authorizeException,
    permissions.financial.read,
    permissions.financial.receive,
    permissions.financial.pay,
    permissions.financial.reconcile,
    permissions.users.read,
    permissions.users.invite,
    permissions.subscriptions.read,
    permissions.dashboard.read,
    permissions.fiscal.read,
    permissions.fiscal.issue,
    permissions.fiscal.cancel,
    permissions.fiscal.review,
  ],
  seller: [
    permissions.products.read,
    permissions.customers.read,
    permissions.customers.create,
    permissions.customers.update,
    permissions.sales.read,
    permissions.sales.create,
    permissions.sales.history,
    permissions.dashboard.read,
    permissions.fiscal.read,
    permissions.fiscal.issue,
  ],
  cashier: [
    permissions.products.read,
    permissions.customers.read,
    permissions.sales.read,
    permissions.sales.create,
    permissions.sales.history,
    permissions.dashboard.read,
    permissions.fiscal.read,
    permissions.fiscal.issue,
  ],
  stock: [
    permissions.branches.read,
    permissions.products.read,
    permissions.products.create,
    permissions.products.update,
    permissions.stock.read,
    permissions.stock.adjust,
    permissions.stock.transfer,
    permissions.stock.inventory,
    permissions.stock.purchase,
    permissions.stock.reports,
    permissions.dashboard.read,
    permissions.fiscal.read,
  ],
  finance: [
    permissions.customers.read,
    permissions.sales.read,
    permissions.sales.history,
    permissions.financial.read,
    permissions.financial.receive,
    permissions.financial.pay,
    permissions.financial.reconcile,
    permissions.financial.categories,
    permissions.subscriptions.read,
    permissions.dashboard.read,
    permissions.fiscal.read,
  ],
  accountant: [
    permissions.products.read,
    permissions.stock.reports,
    permissions.financial.read,
    permissions.dashboard.read,
    permissions.fiscal.read,
    permissions.fiscal.review,
  ],
  support: [
    permissions.tenants.read,
    permissions.users.read,
    permissions.subscriptions.read,
    permissions.dashboard.read,
  ],
  viewer: [
    permissions.branches.read,
    permissions.products.read,
    permissions.customers.read,
    permissions.dashboard.read,
  ],
};

export function hasEveryPermission(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  const permissionSet = new Set(granted);
  return required.every((permission) => permissionSet.has(permission));
}

export function assertTenantScopedQuery(input: {
  tenantId?: string | null;
  resourceId?: string | null;
}): void {
  if (!input.tenantId) {
    throw new Error("Tenant-scoped queries must include tenantId.");
  }

  if (!input.resourceId) {
    throw new Error("Resource queries must include the target resource id.");
  }
}
