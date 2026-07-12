import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional()
});

export const resourceListQuerySchema = paginationQuerySchema.extend({
  sortBy: z.string().trim().min(1).max(64).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  isActive: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .optional()
});

export const salesListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["sold", "cancelled"]).optional(),
  sortBy: z.enum(["createdAt", "totalAmount", "status"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc")
});

export const stockListQuerySchema = paginationQuerySchema.extend({
  stockStatus: z.enum(["critical", "healthy"]).optional(),
  sortBy: z.enum(["productName", "quantity", "minStock", "branchName"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("asc")
});

export const stockMovementListQuerySchema = paginationQuerySchema.extend({
  movementType: z.string().trim().min(1).max(60).optional(),
  sortBy: z.enum(["createdAt", "movementType", "productName", "branchName"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc")
});

export const financialListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["open", "paid", "cancelled"]).optional(),
  reconciliationStatus: z.enum(["pending", "reconciled", "diverged"]).optional(),
  sortBy: z.enum(["dueDate", "amount", "status", "createdAt"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("asc")
});

export const membershipListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["active", "disabled"]).optional()
});

export const inviteListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional()
});

export const auditLogListQuerySchema = paginationQuerySchema.extend({
  sortBy: z.enum(["createdAt", "action", "entityType"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc")
});

export const dashboardQuerySchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional()
}).refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, { message: "endDate must be after startDate" });

export const branchGoalSchema = z.object({
  branchId: uuidSchema,
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  salesTarget: z.coerce.number().positive()
}).refine((value) => value.periodEnd >= value.periodStart, { message: "periodEnd must be after periodStart" });

export const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(256),
  rememberMe: z.boolean().default(false)
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase())
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(12).max(256)
});

export const branchCreateSchema = z.object({
  legalEntityId: uuidSchema.optional(),
  name: z.string().trim().min(2).max(140),
  code: z.string().trim().min(1).max(32),
  phone: z.string().trim().max(30).optional(),
  email: z.string().email().optional(),
  addressLine1: z.string().trim().max(180).optional(),
  city: z.string().trim().max(90).optional(),
  state: z.string().trim().max(2).optional(),
  zipCode: z.string().trim().max(16).optional(),
  isActive: z.boolean().default(true)
});

export const branchUpdateSchema = branchCreateSchema.partial();

export const productCreateSchema = z.object({
  branchId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  name: z.string().trim().min(2).max(180),
  sku: z.string().trim().min(1).max(64).optional(),
  barcode: z.string().trim().max(64).optional(),
  description: z.string().trim().max(2000).optional(),
  unit: z.string().trim().min(1).max(16).default("un"),
  costPrice: z.coerce.number().min(0).default(0),
  salePrice: z.coerce.number().min(0),
  promotionalPrice: z.coerce.number().min(0).optional(),
  minStock: z.coerce.number().min(0).default(0),
  imageUrl: z.string().url().max(2048).optional(),
  imageData: z.string().max(7_000_000).optional(),
  isActive: z.boolean().default(true)
});

export const productUpdateSchema = productCreateSchema.partial();

export const customerCreateSchema = z.object({
  branchId: uuidSchema.optional(),
  type: z.enum(["individual", "company"]).default("individual"),
  name: z.string().trim().min(2).max(180),
  document: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(30).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  email: z.string().email().optional(),
  birthDate: z.string().date().optional(),
  addressLine1: z.string().trim().max(180).optional(),
  city: z.string().trim().max(90).optional(),
  state: z.string().trim().max(2).optional(),
  zipCode: z.string().trim().max(16).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  notes: z.string().trim().max(2000).optional(),
  communicationOptIn: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const stockAdjustmentSchema = z.object({
  branchId: uuidSchema,
  productId: uuidSchema,
  quantityDelta: z.coerce.number().refine((value) => value !== 0, "quantityDelta must not be zero"),
  reason: z.string().trim().min(3).max(180)
});

export const saleItemSchema = z.object({
  productId: uuidSchema,
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0).optional(),
  discountAmount: z.coerce.number().min(0).default(0)
});

export const salePaymentSchema = z.object({
  method: z.string().trim().min(2).max(60),
  amount: z.coerce.number().positive(),
  status: z.enum(["pending", "paid"]).default("paid")
});

export const saleCreateSchema = z.object({
  branchId: uuidSchema,
  cashRegisterSessionId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  items: z.array(saleItemSchema).min(1).max(100),
  payments: z.array(salePaymentSchema).max(10).default([]),
  notes: z.string().trim().max(500).optional()
});

export const financialEntryCreateSchema = z.object({
  branchId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  supplierId: uuidSchema.optional(),
  amount: z.coerce.number().positive(),
  dueDate: z.string().date(),
  status: z.enum(["open", "paid", "cancelled"]).default("open"),
  description: z.string().trim().max(220).optional(),
  categoryId: uuidSchema.optional(),
  installmentCount: z.coerce.number().int().min(1).max(24).default(1),
  paymentMethod: z.string().trim().max(60).optional()
});

export const saleCancelSchema = z.object({
  reason: z.string().trim().min(3).max(180)
});

export const cashRegisterOpenSchema = z.object({
  branchId: uuidSchema,
  openingAmount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(500).optional()
});

export const cashRegisterCloseSchema = z.object({
  closingAmount: z.coerce.number().min(0),
  notes: z.string().trim().max(500).optional()
});

export const cashRegisterCurrentQuerySchema = z.object({ branchId: uuidSchema });

export const cashRegisterMovementSchema = z.object({
  type: z.enum(["supply", "withdrawal"]),
  amount: z.coerce.number().positive(),
  reason: z.string().trim().min(3).max(180)
});

export const purchaseOrderCreateSchema = z.object({
  branchId: uuidSchema,
  supplierId: uuidSchema,
  expectedAt: z.string().date().optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    productId: uuidSchema,
    quantity: z.coerce.number().positive(),
    unitCost: z.coerce.number().min(0)
  })).min(1).max(100)
});

export const purchaseOrderReceiveSchema = z.object({
  documentNumber: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    productId: uuidSchema,
    quantity: z.coerce.number().positive()
  })).min(1).max(100)
});

export const importPreviewSchema = z.object({
  entityType: z.enum(["products", "customers"]),
  fileBase64: z.string().min(16).max(20_000_000)
});

export const importCommitSchema = z.object({ jobId: uuidSchema });

export const alertRuleSchema = z.object({
  type: z.enum(["low_stock", "overdue_receivables", "cancelled_sales"]),
  channel: z.literal("email").default("email"),
  recipient: z.string().email(),
  isActive: z.boolean().default(true)
});

export const stockTransferItemSchema = z.object({
  productId: uuidSchema,
  quantity: z.coerce.number().positive()
});

export const stockTransferCreateSchema = z.object({
  sourceBranchId: uuidSchema,
  targetBranchId: uuidSchema,
  items: z.array(stockTransferItemSchema).min(1).max(100)
});

export const inventoryCountCreateSchema = z.object({
  branchId: uuidSchema,
  notes: z.string().trim().max(500).optional(),
  items: z.array(
    z.object({
      productId: uuidSchema,
      countedQuantity: z.coerce.number().min(0)
    })
  ).min(1).max(200)
});

export const purchaseEntryCreateSchema = z.object({
  branchId: uuidSchema,
  supplierId: uuidSchema.optional(),
  supplierName: z.string().trim().min(2).max(180).optional(),
  documentNumber: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(
    z.object({
      productId: uuidSchema,
      quantity: z.coerce.number().positive(),
      unitCost: z.coerce.number().min(0)
    })
  ).min(1).max(100)
}).refine((value) => value.supplierId || value.supplierName, { message: "supplierId or supplierName is required" });

export const supplierCreateSchema = z.object({
  branchId: uuidSchema.optional(),
  name: z.string().trim().min(2).max(180),
  document: z.string().trim().max(20).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(30).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(2000).optional(),
  isActive: z.boolean().default(true)
});
export const supplierUpdateSchema = supplierCreateSchema.partial();

export const financialCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(["income", "expense"])
});

export const financialMarkPaidSchema = z.object({
  paymentMethod: z.string().trim().min(2).max(60),
  paidAt: z.string().datetime().optional()
});

export const financialReconcileSchema = z.object({
  reconciliationStatus: z.enum(["pending", "reconciled", "diverged"])
});

export const userInviteSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  roleId: uuidSchema,
  branchId: uuidSchema.optional()
});

export const membershipUpdateSchema = z.object({
  roleId: uuidSchema,
  branchId: uuidSchema.optional().nullable(),
  status: z.enum(["active", "disabled"])
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(16),
  name: z.string().trim().min(2).max(160),
  password: z.string().min(12).max(256)
});

export const subscriptionCheckoutSchema = z.object({
  planSlug: z.string().trim().min(2).max(80),
  billingType: z.enum(["UNDEFINED", "BOLETO", "CREDIT_CARD", "PIX"]).default("PIX")
});

export const asaasWebhookSchema = z.object({
  id: z.string(),
  event: z.string(),
  payment: z.object({
    object: z.string().optional(),
    id: z.string(),
    customer: z.string().optional(),
    subscription: z.string().optional(),
    externalReference: z.string().optional(),
    invoiceUrl: z.string().url().optional(),
    value: z.coerce.number().optional(),
    status: z.string().optional()
  }).optional()
});

export const tenantBrandingSchema = z.object({
  companyName: z.string().trim().min(2).max(180),
  tradingName: z.string().trim().max(180).optional(),
  documentId: z.string().trim().max(40).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f172a"),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb"),
  supportEmail: z.string().email().optional(),
  supportPhone: z.string().trim().max(30).optional(),
  website: z.string().trim().max(180).optional(),
  logoUrl: z.string().url().optional(),
  footerNote: z.string().trim().max(240).optional()
});

export const integrationSettingsSchema = z.object({ provider: z.enum(["asaas_business", "smtp", "whatsapp_meta", "fiscal"]), mode: z.enum(["sandbox", "homologation", "production"]).default("sandbox"), status: z.enum(["disabled", "configured"]).default("configured"), settings: z.record(z.string(), z.string().max(500)).default({}) });
export const integrationCredentialSchema = z.object({ secret: z.string().min(8).max(4000) });

export type LoginInput = z.infer<typeof loginSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type ResourceListQuery = z.infer<typeof resourceListQuerySchema>;
export type SalesListQuery = z.infer<typeof salesListQuerySchema>;
export type StockListQuery = z.infer<typeof stockListQuerySchema>;
export type StockMovementListQuery = z.infer<typeof stockMovementListQuerySchema>;
export type FinancialListQuery = z.infer<typeof financialListQuerySchema>;
export type MembershipListQuery = z.infer<typeof membershipListQuerySchema>;
export type InviteListQuery = z.infer<typeof inviteListQuerySchema>;
export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;
export type BranchCreateInput = z.infer<typeof branchCreateSchema>;
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type SaleCreateInput = z.infer<typeof saleCreateSchema>;
export type FinancialEntryCreateInput = z.infer<typeof financialEntryCreateSchema>;
export type SaleCancelInput = z.infer<typeof saleCancelSchema>;
export type CashRegisterOpenInput = z.infer<typeof cashRegisterOpenSchema>;
export type CashRegisterCloseInput = z.infer<typeof cashRegisterCloseSchema>;
export type CashRegisterMovementInput = z.infer<typeof cashRegisterMovementSchema>;
export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;
export type PurchaseOrderReceiveInput = z.infer<typeof purchaseOrderReceiveSchema>;
export type ImportPreviewInput = z.infer<typeof importPreviewSchema>;
export type StockTransferCreateInput = z.infer<typeof stockTransferCreateSchema>;
export type InventoryCountCreateInput = z.infer<typeof inventoryCountCreateSchema>;
export type PurchaseEntryCreateInput = z.infer<typeof purchaseEntryCreateSchema>;
export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
export type FinancialCategoryInput = z.infer<typeof financialCategorySchema>;
export type FinancialMarkPaidInput = z.infer<typeof financialMarkPaidSchema>;
export type FinancialReconcileInput = z.infer<typeof financialReconcileSchema>;
export type UserInviteInput = z.infer<typeof userInviteSchema>;
export type MembershipUpdateInput = z.infer<typeof membershipUpdateSchema>;
export type InviteAcceptInput = z.infer<typeof inviteAcceptSchema>;
export type SubscriptionCheckoutInput = z.infer<typeof subscriptionCheckoutSchema>;
export type AsaasWebhookInput = z.infer<typeof asaasWebhookSchema>;
export type TenantBrandingInput = z.infer<typeof tenantBrandingSchema>;
