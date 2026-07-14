import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
});

export const resourceListQuerySchema = paginationQuerySchema.extend({
  sortBy: z.string().trim().min(1).max(64).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  isActive: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .optional(),
});

export const salesListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["sold", "cancelled"]).optional(),
  sortBy: z.enum(["createdAt", "totalAmount", "status"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export const stockListQuerySchema = paginationQuerySchema.extend({
  stockStatus: z.enum(["critical", "healthy"]).optional(),
  sortBy: z.enum(["productName", "quantity", "minStock", "branchName"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
});

export const stockMovementListQuerySchema = paginationQuerySchema.extend({
  movementType: z.string().trim().min(1).max(60).optional(),
  sortBy: z.enum(["createdAt", "movementType", "productName", "branchName"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export const financialListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["open", "paid", "cancelled"]).optional(),
  reconciliationStatus: z.enum(["pending", "reconciled", "diverged"]).optional(),
  sortBy: z.enum(["dueDate", "amount", "status", "createdAt"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
});

export const membershipListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["active", "disabled"]).optional(),
});

export const inviteListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
});

export const auditLogListQuerySchema = paginationQuerySchema
  .extend({
    sortBy: z.enum(["createdAt", "action", "entityType"]).optional(),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
    entityType: z.string().trim().min(1).max(120).optional(),
    entityId: uuidSchema.optional(),
    actorUserId: uuidSchema.optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    message: "endDate must be after startDate",
  });

export const dashboardQuerySchema = z
  .object({
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    message: "endDate must be after startDate",
  });

export const branchGoalSchema = z
  .object({
    branchId: uuidSchema,
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    salesTarget: z.coerce.number().positive(),
  })
  .refine((value) => value.periodEnd >= value.periodStart, {
    message: "periodEnd must be after periodStart",
  });

export const onboardingStateSchema = z.object({
  dismissed: z.boolean().optional(),
  completedKeys: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(256),
  rememberMe: z.boolean().default(false),
});

export const strongPasswordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(256)
  .regex(/[A-Z]/, "A senha deve conter ao menos uma letra maiúscula.")
  .regex(/[0-9]/, "A senha deve conter ao menos um número.")
  .regex(/[^A-Za-z0-9]/, "A senha deve conter ao menos um caractere especial.");

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: strongPasswordSchema,
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
  isActive: z.boolean().default(true),
});

export const branchUpdateSchema = branchCreateSchema.partial();

const optionalFiscalCode = (length: number, label: string) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${length}}$`), `${label} deve ter ${length} dígitos.`)
    .optional();

export const productFiscalSchema = z.object({
  ncm: optionalFiscalCode(8, "NCM"),
  cest: optionalFiscalCode(7, "CEST"),
  taxOrigin: z.enum(["0", "1", "2", "3", "4", "5", "6", "7", "8"]).optional(),
  cfopDomestic: optionalFiscalCode(4, "CFOP interno"),
  cfopInterstate: optionalFiscalCode(4, "CFOP interestadual"),
  icmsTaxCode: z
    .string()
    .trim()
    .regex(/^\d{2,4}$/, "CST/CSOSN deve ter entre 2 e 4 dígitos.")
    .optional(),
  pisTaxCode: optionalFiscalCode(2, "CST PIS"),
  cofinsTaxCode: optionalFiscalCode(2, "CST COFINS"),
  ipiTaxCode: optionalFiscalCode(2, "CST IPI"),
  subjectToIcmsSt: z.boolean().optional(),
  icmsRate: z.coerce.number().min(0).max(100).optional(),
  icmsStRate: z.coerce.number().min(0).max(100).optional(),
  icmsStMvaRate: z.coerce.number().min(0).max(1000).optional(),
  fcpRate: z.coerce.number().min(0).max(100).optional(),
  pisRate: z.coerce.number().min(0).max(100).optional(),
  cofinsRate: z.coerce.number().min(0).max(100).optional(),
  ipiRate: z.coerce.number().min(0).max(100).optional(),
  taxBenefitCode: z.string().trim().max(20).optional(),
  fiscalNotes: z.string().trim().max(2000).optional(),
});

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
  initialStock: z.coerce.number().min(0).optional(),
  initialStockBranchId: uuidSchema.optional(),
  imageUrl: z.string().url().max(2048).optional(),
  imageData: z.string().max(7_000_000).optional(),
  fiscal: productFiscalSchema.optional(),
  isActive: z.boolean().default(true),
});

export const productUpdateSchema = productCreateSchema.partial();

export const productBarcodeLookupSchema = z.object({
  barcode: z.string().trim().min(8).max(64),
});

export const productSkuSuggestionSchema = z.object({
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,12}$/)
    .optional(),
});

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
  isActive: z.boolean().default(true),
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const stockAdjustmentSchema = z.object({
  branchId: uuidSchema,
  productId: uuidSchema,
  quantityDelta: z.coerce.number().refine((value) => value !== 0, "quantityDelta must not be zero"),
  reason: z.string().trim().min(3).max(180),
});

export const saleItemSchema = z.object({
  productId: uuidSchema,
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0).optional(),
  discountAmount: z.coerce.number().min(0).default(0),
});

export const salePaymentSchema = z.object({
  method: z.string().trim().min(2).max(60),
  amount: z.coerce.number().positive(),
  status: z.enum(["pending", "paid"]).default("paid"),
});

export const saleCreateSchema = z.object({
  branchId: uuidSchema,
  cashRegisterSessionId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  customerDocument: z.string().trim().max(20).optional(),
  loyaltyPointsToRedeem: z.coerce.number().int().min(0).default(0),
  loyaltyRewardId: uuidSchema.optional(),
  loyaltyCouponCode: z.string().trim().min(3).max(64).optional(),
  fiscalRequested: z.boolean().default(false),
  items: z.array(saleItemSchema).min(1).max(100),
  payments: z.array(salePaymentSchema).max(10).default([]),
  notes: z.string().trim().max(500).optional(),
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
  paymentMethod: z.string().trim().max(60).optional(),
});

export const saleCancelSchema = z.object({
  reason: z.string().trim().min(3).max(180),
});

export const cashRegisterOpenSchema = z.object({
  branchId: uuidSchema,
  openingAmount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(500).optional(),
});

export const cashRegisterCloseSchema = z.object({
  closingAmount: z.coerce.number().min(0),
  notes: z.string().trim().max(500).optional(),
});

export const cashRegisterCurrentQuerySchema = z.object({ branchId: uuidSchema });

export const cashRegisterMovementSchema = z.object({
  type: z.enum(["supply", "withdrawal"]),
  amount: z.coerce.number().positive(),
  reason: z.string().trim().min(3).max(180),
});

export const purchaseOrderCreateSchema = z.object({
  branchId: uuidSchema,
  supplierId: uuidSchema,
  expectedAt: z.string().date().optional(),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        quantity: z.coerce.number().positive(),
        unitCost: z.coerce.number().min(0),
      }),
    )
    .min(1)
    .max(100),
});

export const purchaseOrderReceiveSchema = z.object({
  documentNumber: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        quantity: z.coerce.number().positive(),
      }),
    )
    .min(1)
    .max(100),
});

export const importPreviewSchema = z.object({
  entityType: z.enum(["products", "customers"]),
  fileBase64: z.string().min(16).max(20_000_000),
});

export const importCommitSchema = z.object({
  jobId: uuidSchema,
  ignoreRejectedRows: z.boolean().default(false),
});

export const alertRuleSchema = z.object({
  type: z.enum(["low_stock", "overdue_receivables", "cancelled_sales"]),
  channel: z.literal("email").default("email"),
  recipient: z.string().email(),
  isActive: z.boolean().default(true),
});

export const rolePermissionsUpdateSchema = z.object({
  permissions: z.array(z.string().trim().min(3).max(120)).max(200),
});

export const supportTicketListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["open", "waiting_support", "waiting_customer", "resolved", "closed"]).optional(),
  category: z
    .enum(["general", "billing", "technical", "operation", "integration", "bug", "suggestion"])
    .optional(),
});

export const supportTicketCreateSchema = z.object({
  branchId: uuidSchema.optional(),
  subject: z.string().trim().min(4).max(180),
  description: z.string().trim().min(10).max(3000),
  category: z
    .enum(["general", "billing", "technical", "operation", "integration", "bug", "suggestion"])
    .default("general"),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  pageUrl: z.string().trim().max(500).optional(),
  requestId: z.string().trim().max(120).optional(),
  attachmentUrls: z.array(z.string().url().max(800)).max(5).default([]),
});

export const supportTicketMessageSchema = z.object({
  body: z.string().trim().min(2).max(3000),
});

export const supportTicketStatusSchema = z.object({
  status: z.enum(["open", "waiting_support", "waiting_customer", "resolved", "closed"]),
});

export const stockTransferItemSchema = z.object({
  productId: uuidSchema,
  quantity: z.coerce.number().positive(),
});

export const stockTransferCreateSchema = z.object({
  sourceBranchId: uuidSchema,
  targetBranchId: uuidSchema,
  items: z.array(stockTransferItemSchema).min(1).max(100),
});

export const inventoryCountCreateSchema = z.object({
  branchId: uuidSchema,
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        countedQuantity: z.coerce.number().min(0),
      }),
    )
    .min(1)
    .max(200),
});

export const purchaseEntryCreateSchema = z
  .object({
    branchId: uuidSchema,
    supplierId: uuidSchema.optional(),
    supplierName: z.string().trim().min(2).max(180).optional(),
    documentNumber: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(500).optional(),
    items: z
      .array(
        z.object({
          productId: uuidSchema,
          quantity: z.coerce.number().positive(),
          unitCost: z.coerce.number().min(0),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine((value) => value.supplierId || value.supplierName, {
    message: "supplierId or supplierName is required",
  });

export const purchaseXmlPreviewSchema = z.object({
  xml: z.string().trim().min(80).max(8_000_000),
  branchId: uuidSchema,
});

export const purchaseKeyPreviewSchema = z.object({
  accessKey: z.string().trim().regex(/^\d{44}$/, "Informe os 44 dígitos da chave da NF-e."),
  branchId: uuidSchema,
});

export const purchaseXmlCommitSchema = z
  .object({
    branchId: uuidSchema,
    supplierId: uuidSchema.optional(),
    supplierName: z.string().trim().min(2).max(180).optional(),
    documentKey: z
      .string()
      .trim()
      .regex(/^\d{44}$/)
      .optional(),
    documentNumber: z.string().trim().min(1).max(80),
    xml: z.string().trim().min(80).max(8_000_000).optional(),
    source: z.enum(["xml_upload", "focus_key"]).default("xml_upload"),
    purchaseOrderId: uuidSchema.optional(),
    createSupplier: z.boolean().default(false),
    notes: z.string().trim().max(500).optional(),
    items: z
      .array(
        z.object({
          sourceIndex: z.coerce.number().int().min(0),
          action: z.enum(["link", "create", "ignore"]),
          productId: uuidSchema.optional(),
          name: z.string().trim().min(2).max(180),
          barcode: z.string().trim().max(64).optional(),
          sku: z.string().trim().max(64).optional(),
          quantity: z.coerce.number().positive(),
          unitCost: z.coerce.number().min(0),
          salePrice: z.coerce.number().min(0).optional(),
        }),
      )
      .min(1)
      .max(300),
  })
  .refine((value) => value.supplierId || value.supplierName, {
    message: "supplierId or supplierName is required",
  });

export const inboundFiscalListQuerySchema = paginationQuerySchema.extend({
  branchId: uuidSchema.optional(),
  status: z.enum(["ready", "review_pending", "received", "rejected", "cancelled"]).optional(),
  manifestationStatus: z
    .enum(["pending", "ciencia", "confirmacao", "desconhecimento", "nao_realizada"])
    .optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const inboundFiscalManifestSchema = z
  .object({
    type: z.enum(["ciencia", "confirmacao", "desconhecimento", "nao_realizada"]),
    justification: z.string().trim().min(15).max(255).optional(),
  })
  .refine((value) => value.type !== "nao_realizada" || Boolean(value.justification), {
    message: "Explique por que a operação não foi realizada.",
  });

export const inboundFiscalItemResolutionSchema = z
  .object({
    action: z.enum(["link", "create", "ignore"]),
    productId: uuidSchema.optional(),
    name: z.string().trim().min(2).max(180).optional(),
    sku: z.string().trim().max(64).optional(),
    quantity: z.coerce.number().positive().optional(),
    unitCost: z.coerce.number().min(0).optional(),
    salePrice: z.coerce.number().min(0).optional(),
  })
  .refine((value) => value.action !== "link" || Boolean(value.productId), {
    message: "Selecione o produto para vincular este item.",
  })
  .refine((value) => value.action !== "create" || Boolean(value.name), {
    message: "Informe o nome do produto que será criado.",
  });

export const inboundFiscalReceiveSchema = z.object({
  supplierId: uuidSchema.optional(),
  supplierName: z.string().trim().min(2).max(180).optional(),
  purchaseOrderId: uuidSchema.optional(),
  createSupplier: z.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
});

export const accountingClosureSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  branchId: uuidSchema.optional(),
});

export const supplierCreateSchema = z.object({
  branchId: uuidSchema.optional(),
  name: z.string().trim().min(2).max(180),
  document: z.string().trim().max(20).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(30).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(2000).optional(),
  isActive: z.boolean().default(true),
});
export const supplierUpdateSchema = supplierCreateSchema.partial();

export const financialCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(["income", "expense"]),
});

export const financialMarkPaidSchema = z.object({
  paymentMethod: z.string().trim().min(2).max(60),
  paidAt: z.string().datetime().optional(),
});

export const financialReconcileSchema = z.object({
  reconciliationStatus: z.enum(["pending", "reconciled", "diverged"]),
});

export const userInviteSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  roleId: uuidSchema,
  branchId: uuidSchema.optional(),
});

export const membershipUpdateSchema = z.object({
  roleId: uuidSchema,
  branchId: uuidSchema.optional().nullable(),
  status: z.enum(["active", "disabled"]),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(16),
  name: z.string().trim().min(2).max(160),
  password: strongPasswordSchema,
});

export const subscriptionCheckoutSchema = z.object({
  planSlug: z.string().trim().min(2).max(80),
  billingType: z.enum(["UNDEFINED", "BOLETO", "CREDIT_CARD", "PIX"]).default("PIX"),
});

export const publicSubscriptionCheckoutSchema = subscriptionCheckoutSchema.extend({
  companyName: z.string().trim().min(2).max(160),
  document: z.string().trim().min(11).max(20),
  ownerName: z.string().trim().min(2).max(160),
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  password: strongPasswordSchema,
  couponCode: z.string().trim().min(3).max(48).optional(),
});

export const asaasWebhookSchema = z.object({
  id: z.string(),
  event: z.string(),
  payment: z
    .object({
      object: z.string().optional(),
      id: z.string(),
      customer: z.string().optional(),
      subscription: z.string().optional(),
      externalReference: z.string().optional(),
      invoiceUrl: z.string().url().optional(),
      value: z.coerce.number().optional(),
      status: z.string().optional(),
    })
    .optional(),
});

export const tenantBrandingSchema = z.object({
  companyName: z.string().trim().min(2).max(180),
  tradingName: z.string().trim().max(180).optional(),
  documentId: z.string().trim().max(40).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#0f172a"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#2563eb"),
  supportEmail: z.string().email().optional(),
  supportPhone: z.string().trim().max(30).optional(),
  website: z.string().trim().max(180).optional(),
  logoUrl: z.string().url().optional(),
  logoData: z.string().max(7_000_000).optional(),
  footerNote: z.string().trim().max(240).optional(),
});

export const printingSettingsSchema = z.object({
  branchId: uuidSchema.optional(),
  labelSize: z.enum(["50x30", "60x40", "80x40"]).default("50x30"),
  dpi: z.enum(["203", "300"]).default("203"),
  receiptMode: z.enum(["browser", "thermal", "none"]).default("browser"),
  receiptWidth: z.enum(["58", "80"]).default("80"),
  receiptCopies: z.coerce.number().int().min(1).max(5).default(1),
  receiptShowLogo: z.boolean().default(true),
  receiptShowDocument: z.boolean().default(true),
  receiptFooter: z.string().trim().max(180).optional(),
  defaultPrinterName: z.string().trim().max(120).optional(),
  silentPrint: z.boolean().default(false),
  autoCut: z.boolean().default(true),
  openCashDrawer: z.boolean().default(false),
});

export const printerProfileSchema = z.object({
  id: uuidSchema.optional(),
  branchId: uuidSchema,
  name: z.string().trim().min(2).max(80),
  purpose: z.enum(["sale_receipt", "customer_receipt", "labels", "documents", "fiscal"]),
  width: z.enum(["58", "80", "a4"]).default("80"),
  copies: z.coerce.number().int().min(1).max(5).default(1),
  showLogo: z.boolean().default(true),
  showDocument: z.boolean().default(true),
  footer: z.string().trim().max(220).optional(),
  deviceHint: z.string().trim().max(120).optional(),
  isDefault: z.boolean().default(false),
});

export const integrationSettingsSchema = z.object({
  provider: z.enum(["asaas_business", "smtp", "whatsapp_meta", "fiscal"]),
  mode: z.enum(["sandbox", "homologation", "production"]).default("sandbox"),
  status: z.enum(["disabled", "configured"]).default("configured"),
  settings: z.record(z.string(), z.string().max(500)).default({}),
});
export const integrationCredentialSchema = z.object({ secret: z.string().min(8).max(4000) });

export const branchFiscalSettingsSchema = z.object({
  provider: z.enum(["focus_nfe", "spedy"]).default("focus_nfe"),
  environment: z.enum(["homologation", "production"]).default("homologation"),
  documentMode: z.enum(["nfce", "nfe", "both"]).default("nfce"),
  taxRegime: z.enum(["simples_nacional", "simples_excesso", "regime_normal"]),
  legalName: z.string().trim().min(2).max(180),
  tradeName: z.string().trim().min(2).max(180),
  taxId: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{14}$/, "Informe um CNPJ válido para emissão fiscal.")),
  stateRegistration: z.string().trim().min(2).max(32),
  municipalRegistration: z.string().trim().max(32).optional(),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  cityCode: z
    .string()
    .trim()
    .regex(/^\d{7}$/, "Informe o código IBGE do município."),
  addressLine: z.string().trim().min(2).max(180),
  addressNumber: z.string().trim().min(1).max(24),
  district: z.string().trim().min(2).max(100),
  postalCode: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{8}$/)),
  cscIdentifier: z.string().trim().max(12).optional(),
  nfceSeries: z.coerce.number().int().min(1).max(999),
  nextNfceNumber: z.coerce.number().int().min(1),
  nfeSeries: z.coerce.number().int().min(1).max(999),
  nextNfeNumber: z.coerce.number().int().min(1),
  contingencyEnabled: z.boolean().default(true),
  certificateMode: z.enum(["provider_managed", "orien_vault"]).default("provider_managed"),
  certificateExpiresAt: z.string().datetime().optional(),
});

export const fiscalCredentialSchema = z
  .object({
    certificateBase64: z.string().max(3_000_000).optional(),
    certificatePassword: z.string().max(256).optional(),
    cscToken: z.string().trim().max(256).optional(),
  })
  .refine(
    (value) => Boolean(value.certificateBase64 || value.cscToken),
    "Informe o certificado ou o CSC.",
  );

export const fiscalIssueSchema = z.object({
  saleId: uuidSchema,
  documentType: z.enum(["nfce", "nfe"]).default("nfce"),
  contingency: z.boolean().default(false),
});

export const fiscalCancelSchema = z.object({
  justification: z.string().trim().min(15).max(255),
});

export const fiscalNumberVoidSchema = z.object({
  series: z.coerce.number().int().min(1).max(999),
  numberStart: z.coerce.number().int().min(1),
  numberEnd: z.coerce.number().int().min(1),
  justification: z.string().trim().min(15).max(255),
}).refine(
  (value) => value.numberEnd >= value.numberStart,
  "O número final deve ser maior ou igual ao número inicial.",
);

export const fiscalReviewSchema = z
  .object({
    status: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(1000).optional(),
  })
  .refine(
    (value) => value.status !== "rejected" || Boolean(value.note),
    "Informe o motivo da reprovação.",
  );

export const fiscalProductionActionSchema = z.object({
  note: z.string().trim().min(5).max(1000),
});

export const fiscalDocumentListQuerySchema = paginationQuerySchema.extend({
  branchId: uuidSchema.optional(),
  status: z
    .enum([
      "queued",
      "transmitting",
      "authorized",
      "cancelled",
      "rejected",
      "retry_pending",
      "error",
      "contingency",
    ])
    .optional(),
  documentType: z.enum(["nfce", "nfe"]).optional(),
});

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
export type OnboardingStateInput = z.infer<typeof onboardingStateSchema>;
export type BranchCreateInput = z.infer<typeof branchCreateSchema>;
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductFiscalInput = z.infer<typeof productFiscalSchema>;
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
export type PurchaseXmlPreviewInput = z.infer<typeof purchaseXmlPreviewSchema>;
export type PurchaseXmlCommitInput = z.infer<typeof purchaseXmlCommitSchema>;
export type PurchaseKeyPreviewInput = z.infer<typeof purchaseKeyPreviewSchema>;
export type InboundFiscalListQuery = z.infer<typeof inboundFiscalListQuerySchema>;
export type InboundFiscalManifestInput = z.infer<typeof inboundFiscalManifestSchema>;
export type InboundFiscalItemResolutionInput = z.infer<typeof inboundFiscalItemResolutionSchema>;
export type InboundFiscalReceiveInput = z.infer<typeof inboundFiscalReceiveSchema>;
export type AccountingClosureInput = z.infer<typeof accountingClosureSchema>;
export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
export type FinancialCategoryInput = z.infer<typeof financialCategorySchema>;
export type FinancialMarkPaidInput = z.infer<typeof financialMarkPaidSchema>;
export type FinancialReconcileInput = z.infer<typeof financialReconcileSchema>;
export type SupportTicketListQuery = z.infer<typeof supportTicketListQuerySchema>;
export type SupportTicketCreateInput = z.infer<typeof supportTicketCreateSchema>;
export type SupportTicketMessageInput = z.infer<typeof supportTicketMessageSchema>;
export type SupportTicketStatusInput = z.infer<typeof supportTicketStatusSchema>;
export type UserInviteInput = z.infer<typeof userInviteSchema>;
export type MembershipUpdateInput = z.infer<typeof membershipUpdateSchema>;
export type InviteAcceptInput = z.infer<typeof inviteAcceptSchema>;
export type SubscriptionCheckoutInput = z.infer<typeof subscriptionCheckoutSchema>;
export type PublicSubscriptionCheckoutInput = z.infer<typeof publicSubscriptionCheckoutSchema>;
export type AsaasWebhookInput = z.infer<typeof asaasWebhookSchema>;
export type TenantBrandingInput = z.infer<typeof tenantBrandingSchema>;
export type PrintingSettingsInput = z.infer<typeof printingSettingsSchema>;
export type PrinterProfileInput = z.infer<typeof printerProfileSchema>;
export type BranchFiscalSettingsInput = z.infer<typeof branchFiscalSettingsSchema>;
export type FiscalCredentialInput = z.infer<typeof fiscalCredentialSchema>;
export type FiscalIssueInput = z.infer<typeof fiscalIssueSchema>;
export type FiscalCancelInput = z.infer<typeof fiscalCancelSchema>;
export type FiscalNumberVoidInput = z.infer<typeof fiscalNumberVoidSchema>;
export type FiscalReviewInput = z.infer<typeof fiscalReviewSchema>;
export type FiscalProductionActionInput = z.infer<typeof fiscalProductionActionSchema>;
export type FiscalDocumentListQuery = z.infer<typeof fiscalDocumentListQuerySchema>;
