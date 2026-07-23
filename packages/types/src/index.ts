import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const sha256FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);

function hasMaximumDecimalPlaces(value: number, scale: number) {
  const scaled = value * 10 ** scale;
  return Math.abs(scaled - Math.round(scaled)) < 1e-8;
}

export const moneySchema = z.coerce
  .number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .refine((value) => hasMaximumDecimalPlaces(value, 2), "Valor monetário aceita no máximo 2 casas decimais.");

export const quantitySchema = z.coerce
  .number()
  .finite()
  .positive()
  .max(999_999_999.999)
  .refine((value) => hasMaximumDecimalPlaces(value, 3), "Quantidade aceita no máximo 3 casas decimais.");

export function normalizeQuantity(value: number) {
  return Number(value.toFixed(3));
}

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

const bulkIdsSchema = z
  .array(uuidSchema)
  .min(1, "Selecione ao menos um registro.")
  .max(100, "Cada lote aceita no máximo 100 registros.")
  .transform((ids) => Array.from(new Set(ids)));

export const bulkStatusUpdateSchema = z.object({
  ids: bulkIdsSchema,
  isActive: z.boolean(),
  reason: z.string().trim().min(3).max(240).optional(),
}).strict();

export const membershipBulkStatusUpdateSchema = z.object({
  membershipIds: bulkIdsSchema,
  status: z.enum(["active", "disabled"]),
  reason: z.string().trim().min(3).max(240).optional(),
}).strict();

export const salesListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["sold", "cancelled"]).optional(),
  sortBy: z.enum(["createdAt", "totalAmount", "status"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export const commercialDocumentTypeSchema = z.enum(["quote", "order", "dav"]);
export const commercialDocumentStatusSchema = z.enum([
  "draft",
  "sent",
  "approved",
  "reserved",
  "converted",
  "expired",
  "cancelled",
]);

export const commercialDocumentCreateSchema = z
  .object({
    type: commercialDocumentTypeSchema.default("quote"),
    branchId: uuidSchema,
    customerId: uuidSchema.optional(),
    validUntil: z.string().date(),
    notes: z.string().trim().max(500).optional(),
    reserveStock: z.boolean().default(false),
    items: z
      .array(
        z.object({
          productId: uuidSchema,
          quantity: quantitySchema,
          unitPrice: moneySchema,
          discountAmount: moneySchema.default(0),
        }),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const commercialDocumentTransitionSchema = z
  .object({
    action: z.enum(["send", "approve", "reserve", "expire", "cancel"]),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "cancel" && !value.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Informe o motivo do cancelamento.",
      });
    }
  });

export const commercialDocumentListQuerySchema = paginationQuerySchema
  .extend({
    branchId: uuidSchema.optional(),
    customerId: uuidSchema.optional(),
    sellerId: uuidSchema.optional(),
    type: commercialDocumentTypeSchema.optional(),
    status: commercialDocumentStatusSchema.optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    sortBy: z.enum(["createdAt", "validUntil", "totalAmount", "status", "number"]).optional(),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "A data final deve ser igual ou posterior à inicial.",
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
  branchId: uuidSchema.optional(),
  paymentMethod: z.string().trim().min(1).max(60).optional(),
  dueDateFrom: z.string().date().optional(),
  dueDateTo: z.string().date().optional(),
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

const reportStatusSchema = z.enum([
  "draft",
  "sent",
  "approved",
  "reserved",
  "converted",
  "expired",
  "cancelled",
  "pending",
  "paid",
  "refunded",
]);

export const reportFiltersSchema = z
  .object({
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    branchId: uuidSchema.optional(),
    sellerId: uuidSchema.optional(),
    customerId: uuidSchema.optional(),
    documentType: z.enum(["quote", "order", "dav"]).optional(),
    status: reportStatusSchema.optional(),
    acquirerId: uuidSchema.optional(),
    cardBrand: z.string().trim().min(1).max(60).transform((value) => value.toLowerCase()).optional(),
  })
  .superRefine((value, context) => {
    if (!value.startDate || !value.endDate) return;
    if (value.endDate < value.startDate) {
      context.addIssue({ code: "custom", path: ["endDate"], message: "A data final deve ser igual ou posterior à inicial." });
      return;
    }
    const start = Date.parse(`${value.startDate}T00:00:00.000Z`);
    const end = Date.parse(`${value.endDate}T00:00:00.000Z`);
    if ((end - start) / 86_400_000 > 366) {
      context.addIssue({ code: "custom", path: ["endDate"], message: "O período máximo para exportação é de 366 dias." });
    }
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
  costPrice: moneySchema.default(0),
  salePrice: moneySchema,
  promotionalPrice: moneySchema.optional(),
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
  customerSegmentId: uuidSchema.optional().nullable(),
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
  quantity: quantitySchema,
  unitPrice: moneySchema.optional(),
  discountAmount: moneySchema.default(0),
  pricingApprovalId: uuidSchema.optional(),
});

export const customerSegmentCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,80}$/),
  isActive: z.boolean().default(true),
});

export const pricePolicyCreateSchema = z
  .object({
    productId: uuidSchema,
    branchId: uuidSchema.optional(),
    customerSegmentId: uuidSchema.optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    minQuantity: quantitySchema.default(1),
    referencePrice: moneySchema,
    minPrice: moneySchema,
    maxPrice: moneySchema,
    minMarginPercent: z.coerce.number().min(-100).max(10_000).optional(),
    marginMode: z.enum(["warn", "block", "approval_required"]).default("warn"),
    priority: z.coerce.number().int().min(0).max(1000).default(0),
  })
  .refine((value) => value.minPrice <= value.referencePrice, {
    message: "O preço mínimo não pode superar o preço de referência.",
    path: ["minPrice"],
  })
  .refine((value) => value.referencePrice <= value.maxPrice, {
    message: "O preço de referência não pode superar o preço máximo.",
    path: ["referencePrice"],
  })
  .refine((value) => !value.startsAt || !value.endsAt || value.startsAt <= value.endsAt, {
    message: "A vigência final deve ser posterior à inicial.",
    path: ["endsAt"],
  });

export const pricePolicyListQuerySchema = paginationQuerySchema.extend({
  productId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  customerSegmentId: uuidSchema.optional(),
  isActive: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .optional(),
});

export const pricePolicyResolveQuerySchema = z.object({
  productId: uuidSchema,
  branchId: uuidSchema,
  quantity: quantitySchema,
  customerId: uuidSchema.optional(),
  unitPrice: moneySchema.optional(),
});

export const pricingApprovalRequestSchema = z.object({
  productId: uuidSchema,
  branchId: uuidSchema,
  customerId: uuidSchema.optional(),
  quantity: quantitySchema,
  unitPrice: moneySchema,
  discountAmount: moneySchema.default(0),
  allocatedAdjustmentAmount: moneySchema.default(0),
  basketFingerprint: sha256FingerprintSchema,
  reason: z.string().trim().min(10).max(500),
});

export const pricingApprovalDecisionSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().min(10).max(500).optional(),
}).refine((value) => value.approved || Boolean(value.reason), {
  message: "Informe o motivo da recusa.",
  path: ["reason"],
});

export const salePaymentSchema = z.object({
  method: z.string().trim().min(2).max(60),
  amount: moneySchema.refine((value) => value > 0, "O valor deve ser maior que zero."),
  status: z.enum(["pending", "paid"]).default("paid"),
  acquirerId: uuidSchema.optional(),
  brand: z.string().trim().min(2).max(60).transform((value) => value.toLowerCase()).optional(),
  installments: z.coerce.number().int().min(1).max(120).default(1),
});

export const saleCreateSchema = z.object({
  branchId: uuidSchema,
  compositionFingerprint: sha256FingerprintSchema.optional(),
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
}).strict().refine(
  (value) => !value.items.some((item) => item.pricingApprovalId) || Boolean(value.compositionFingerprint),
  { message: "A composição da venda é obrigatória ao usar uma aprovação.", path: ["compositionFingerprint"] },
);

export const salePreviewSchema = saleCreateSchema;

export const financialEntryCreateSchema = z.object({
  branchId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  supplierId: uuidSchema.optional(),
  amount: moneySchema.refine((value) => value > 0, "O valor deve ser maior que zero."),
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
  openingAmount: moneySchema.default(0),
  notes: z.string().trim().max(500).optional(),
});

export const cashRegisterCloseSchema = z.object({
  closingAmount: moneySchema,
  notes: z.string().trim().max(500).optional(),
});

export const cashRegisterCurrentQuerySchema = z.object({ branchId: uuidSchema });

export const cashRegisterMovementSchema = z.object({
  type: z.enum(["supply", "withdrawal"]),
  amount: moneySchema.refine((value) => value > 0, "O valor deve ser maior que zero."),
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
        unitCost: moneySchema,
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
  type: z.enum(["low_stock", "overdue_receivables", "cancelled_sales", "open_cash", "pending_purchase", "integration_error"]),
  channel: z.enum(["email", "in_app"]).default("email"),
  recipient: z.string().email(),
  isActive: z.boolean().default(true),
  branchId: uuidSchema.nullable().optional(),
  escalationHours: z.coerce.number().int().min(1).max(720).default(24),
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
          unitCost: moneySchema,
          salePrice: moneySchema.optional(),
          applyCost: z.boolean().default(false),
          applySalePrice: z.boolean().default(false),
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
    unitCost: moneySchema.optional(),
    salePrice: moneySchema.optional(),
    applyCost: z.boolean().default(false),
    applySalePrice: z.boolean().default(false),
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

export const accountantPortalAccessCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  branchId: uuidSchema.optional(),
  expiresInDays: z.coerce.number().int().min(1).max(180).default(30),
  allowedPeriodStart: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  allowedPeriodEnd: z.string().regex(/^\d{4}-\d{2}$/).optional(),
}).refine((value) => !value.allowedPeriodStart || !value.allowedPeriodEnd || value.allowedPeriodEnd >= value.allowedPeriodStart, {
  message: "A competência final deve ser maior ou igual à inicial.",
});

export const accountantPortalTokenSchema = z.object({
  token: z.string().trim().min(32).max(160).optional(),
  sessionToken: z.string().trim().min(32).max(180).optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
}).refine((value) => Boolean(value.token || value.sessionToken), {
  message: "Informe o token ou a sessão do portal.",
});

export const accountantPortalLoginRequestSchema = z.object({
  token: z.string().trim().min(32).max(160),
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
});

export const accountantPortalLoginVerifySchema = accountantPortalLoginRequestSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/, "Informe o código de 6 dígitos."),
});

export const accountantPortalExportQuerySchema = accountantPortalTokenSchema.extend({
  format: z.enum(["csv", "pdf", "xml"]).default("csv"),
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

const financialCodeSchema = z.string().trim().min(2).max(60).transform((value) => value.toUpperCase());
const centsSchema = z.coerce.number().int().min(0).max(999_999_999_999);
const basisPointsSchema = z.coerce.number().int().min(0).max(10_000);

export const paymentAcquirerCreateSchema = z.object({
  branchId: uuidSchema.optional(),
  name: z.string().trim().min(2).max(120),
  code: financialCodeSchema,
  isActive: z.boolean().default(true),
}).strict();

export const paymentAcquirerUpdateSchema = paymentAcquirerCreateSchema.partial().strict();

export const paymentFeeRuleCreateSchema = z.object({
  acquirerId: uuidSchema,
  paymentMethod: z.string().trim().min(2).max(60),
  brand: z.string().trim().min(2).max(60).transform((value) => value.toLowerCase()).optional(),
  installmentFrom: z.coerce.number().int().min(1).max(120).default(1),
  installmentTo: z.coerce.number().int().min(1).max(120).default(1),
  percentageBasisPoints: basisPointsSchema.default(0),
  fixedFeeCents: centsSchema.default(0),
  anticipationBasisPoints: basisPointsSchema.default(0),
  settlementDays: z.coerce.number().int().min(0).max(3650).default(0),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime().optional(),
}).strict().refine((value) => value.installmentTo >= value.installmentFrom, {
  message: "A parcela final deve ser maior ou igual à inicial.",
  path: ["installmentTo"],
}).refine((value) => !value.validUntil || value.validUntil >= value.validFrom, {
  message: "A vigência final deve ser posterior à inicial.",
  path: ["validUntil"],
});

export const paymentFeeRuleDeactivateSchema = z.object({
  reason: z.string().trim().min(3).max(240),
}).strict();

export const financialForecastListQuerySchema = paginationQuerySchema.extend({
  branchId: uuidSchema.optional(),
  acquirerId: uuidSchema.optional(),
  paymentMethod: z.string().trim().min(2).max(60).optional(),
  status: z.enum(["pending", "partially_settled", "settled", "diverged", "cancelled"]).optional(),
  expectedFrom: z.string().date().optional(),
  expectedTo: z.string().date().optional(),
  sortBy: z.enum(["expectedSettlementDate", "grossAmount", "netAmount", "createdAt"]).default("expectedSettlementDate"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
});

export const paymentSnapshotResolveSchema = z.object({
  branchId: uuidSchema,
  acquirerId: uuidSchema.optional(),
  paymentMethod: z.string().trim().min(2).max(60),
  brand: z.string().trim().min(2).max(60).transform((value) => value.toLowerCase()).optional(),
  installments: z.coerce.number().int().min(1).max(120).default(1),
  grossAmountCents: centsSchema.refine((value) => value > 0, "O valor bruto deve ser maior que zero."),
  occurredAt: z.string().datetime(),
}).strict();

export const paymentSettlementCreateSchema = z.object({
  paymentId: uuidSchema,
  receivableId: uuidSchema.optional(),
  settledAmountCents: centsSchema.refine((value) => value > 0, "O valor liquidado deve ser maior que zero."),
  effectiveAt: z.string().datetime(),
  externalReference: z.string().trim().min(3).max(180),
  status: z.literal("posted").default("posted"),
  notes: z.string().trim().max(500).optional(),
}).strict();

export const paymentSettlementReverseSchema = z.object({
  reason: z.string().trim().min(3).max(240),
  externalReference: z.string().trim().min(3).max(180),
}).strict();

export const paymentSnapshotsResolveSchema = z.object({
  payments: z.array(paymentSnapshotResolveSchema).min(1).max(10),
}).strict();

export const paymentSettlementBatchSchema = z.object({
  settlements: z.array(paymentSettlementCreateSchema).min(1).max(500),
}).strict();

const reconciliationItemSchema = z.object({
  paymentId: uuidSchema,
  actualAmountCents: centsSchema,
  externalReference: z.string().trim().min(3).max(180),
  effectiveAt: z.string().datetime().optional(),
}).strict();

export const reconciliationBatchCreateSchema = z.object({
  branchId: uuidSchema,
  acquirerId: uuidSchema,
  externalReference: z.string().trim().min(3).max(180),
  statementDate: z.string().date().optional(),
  items: z.array(reconciliationItemSchema).min(1).max(2000),
}).strict().superRefine((value, context) => {
  const paymentIds = new Set<string>();
  const references = new Set<string>();
  value.items.forEach((item, index) => {
    if (paymentIds.has(item.paymentId)) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "paymentId"],
        message: "Um pagamento não pode aparecer mais de uma vez no lote.",
      });
    }
    if (references.has(item.externalReference)) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "externalReference"],
        message: "A referência de um item não pode se repetir no lote.",
      });
    }
    paymentIds.add(item.paymentId);
    references.add(item.externalReference);
  });
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
export const branchIntegrationOverrideSchema = z.object({
  branchId: uuidSchema,
  provider: z.enum(["asaas_business", "smtp", "whatsapp_meta", "fiscal"]),
  enabled: z.boolean().default(true),
  settings: z.record(z.string(), z.string().max(500)).default({}),
});

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
export type BulkStatusUpdateInput = z.infer<typeof bulkStatusUpdateSchema>;
export type MembershipBulkStatusUpdateInput = z.infer<typeof membershipBulkStatusUpdateSchema>;
export type SalesListQuery = z.infer<typeof salesListQuerySchema>;
export type CommercialDocumentCreateInput = z.infer<typeof commercialDocumentCreateSchema>;
export type CommercialDocumentTransitionInput = z.infer<typeof commercialDocumentTransitionSchema>;
export type CommercialDocumentListQuery = z.infer<typeof commercialDocumentListQuerySchema>;
export type StockListQuery = z.infer<typeof stockListQuerySchema>;
export type StockMovementListQuery = z.infer<typeof stockMovementListQuerySchema>;
export type FinancialListQuery = z.infer<typeof financialListQuerySchema>;
export type MembershipListQuery = z.infer<typeof membershipListQuerySchema>;
export type InviteListQuery = z.infer<typeof inviteListQuerySchema>;
export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;
export type ReportFilters = z.infer<typeof reportFiltersSchema>;
export type OnboardingStateInput = z.infer<typeof onboardingStateSchema>;
export type BranchCreateInput = z.infer<typeof branchCreateSchema>;
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductFiscalInput = z.infer<typeof productFiscalSchema>;
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type CustomerSegmentCreateInput = z.infer<typeof customerSegmentCreateSchema>;
export type PricePolicyCreateInput = z.infer<typeof pricePolicyCreateSchema>;
export type PricePolicyListQuery = z.infer<typeof pricePolicyListQuerySchema>;
export type PricePolicyResolveQuery = z.infer<typeof pricePolicyResolveQuerySchema>;
export type PricingApprovalRequestInput = z.infer<typeof pricingApprovalRequestSchema>;
export type PricingApprovalDecisionInput = z.infer<typeof pricingApprovalDecisionSchema>;
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
export type AccountantPortalAccessCreateInput = z.infer<typeof accountantPortalAccessCreateSchema>;
export type AccountantPortalTokenInput = z.infer<typeof accountantPortalTokenSchema>;
export type AccountantPortalLoginRequestInput = z.infer<typeof accountantPortalLoginRequestSchema>;
export type AccountantPortalLoginVerifyInput = z.infer<typeof accountantPortalLoginVerifySchema>;
export type AccountantPortalExportQueryInput = z.infer<typeof accountantPortalExportQuerySchema>;
export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
export type FinancialCategoryInput = z.infer<typeof financialCategorySchema>;
export type FinancialMarkPaidInput = z.infer<typeof financialMarkPaidSchema>;
export type FinancialReconcileInput = z.infer<typeof financialReconcileSchema>;
export type PaymentAcquirerCreateInput = z.infer<typeof paymentAcquirerCreateSchema>;
export type PaymentAcquirerUpdateInput = z.infer<typeof paymentAcquirerUpdateSchema>;
export type PaymentFeeRuleCreateInput = z.infer<typeof paymentFeeRuleCreateSchema>;
export type PaymentFeeRuleDeactivateInput = z.infer<typeof paymentFeeRuleDeactivateSchema>;
export type FinancialForecastListQuery = z.infer<typeof financialForecastListQuerySchema>;
export type PaymentSnapshotResolveInput = z.infer<typeof paymentSnapshotResolveSchema>;
export type PaymentSettlementCreateInput = z.infer<typeof paymentSettlementCreateSchema>;
export type PaymentSettlementReverseInput = z.infer<typeof paymentSettlementReverseSchema>;
export type PaymentSnapshotsResolveInput = z.infer<typeof paymentSnapshotsResolveSchema>;
export type PaymentSettlementBatchInput = z.infer<typeof paymentSettlementBatchSchema>;
export type ReconciliationBatchCreateInput = z.infer<typeof reconciliationBatchCreateSchema>;
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
