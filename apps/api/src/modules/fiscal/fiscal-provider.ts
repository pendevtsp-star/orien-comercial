export type FiscalDocumentType = "nfce" | "nfe";
export type FiscalEnvironment = "homologation" | "production";
export type FiscalNormalizedStatus =
  "queued" | "transmitting" | "authorized" | "cancelled" | "rejected" | "contingency";

export interface FiscalProviderResult {
  status: FiscalNormalizedStatus;
  externalId?: string;
  accessKey?: string;
  protocol?: string;
  rejectionCode?: string;
  rejectionReason?: string;
  xmlUrl?: string;
  pdfUrl?: string;
  providerStatus?: string;
}

export interface FiscalNumberVoidRequest {
  documentType: "nfce";
  taxId: string;
  series: number;
  numberStart: number;
  numberEnd: number;
  justification: string;
}

export interface FiscalNumberVoidResult {
  status: "processed" | "failed";
  protocol?: string;
  providerCode?: string;
  providerMessage?: string;
  providerPayload?: Record<string, unknown>;
}

export interface FiscalIssueRequest {
  reference: string;
  documentType: FiscalDocumentType;
  payload: Record<string, unknown>;
  contingency?: boolean;
}

export interface FiscalProvider {
  readonly name: string;
  issue(request: FiscalIssueRequest): Promise<FiscalProviderResult>;
  get(documentType: FiscalDocumentType, reference: string): Promise<FiscalProviderResult>;
  cancel(
    documentType: FiscalDocumentType,
    reference: string,
    justification: string,
  ): Promise<FiscalProviderResult>;
  voidNumbers(request: FiscalNumberVoidRequest): Promise<FiscalNumberVoidResult>;
  downloadArtifact(url: string): Promise<{ content: Buffer; contentType: string }>;
}

export type FiscalProviderKey = "focus_nfe" | "spedy";

export const fiscalProviderCatalog: Record<
  FiscalProviderKey,
  { label: string; supportsInboundNfe: boolean; status: "available" | "planned" }
> = {
  focus_nfe: { label: "Focus NFe", supportsInboundNfe: true, status: "available" },
  spedy: { label: "Spedy", supportsInboundNfe: false, status: "planned" },
};

export class FiscalProviderError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "FiscalProviderError";
  }
}
