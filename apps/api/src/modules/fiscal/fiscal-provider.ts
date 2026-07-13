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
}

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
