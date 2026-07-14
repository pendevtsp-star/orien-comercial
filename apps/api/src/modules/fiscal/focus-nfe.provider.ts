import {
  FiscalProviderError,
  type FiscalDocumentType,
  type FiscalEnvironment,
  type FiscalIssueRequest,
  type FiscalProvider,
  type FiscalProviderResult,
} from "./fiscal-provider";

type Fetcher = typeof fetch;
type FocusResponse = Record<string, unknown>;

export class FocusNfeProvider implements FiscalProvider {
  readonly name = "focus_nfe";
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(
    token: string,
    environment: FiscalEnvironment,
    private readonly fetcher: Fetcher = fetch,
  ) {
    this.baseUrl =
      environment === "production"
        ? "https://api.focusnfe.com.br"
        : "https://homologacao.focusnfe.com.br";
    this.authorization = `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
  }

  async issue(request: FiscalIssueRequest): Promise<FiscalProviderResult> {
    const params = new URLSearchParams({ ref: request.reference, completa: "1" });
    if (request.contingency) params.set("forma_emissao", "offline");
    const payload = await this.request(`/v2/${request.documentType}?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify(request.payload),
    });
    return normalizeFocusResponse(payload, request.reference);
  }

  async get(documentType: FiscalDocumentType, reference: string) {
    const payload = await this.request(
      `/v2/${documentType}/${encodeURIComponent(reference)}?completa=1`,
      { method: "GET" },
    );
    return normalizeFocusResponse(payload, reference);
  }

  async cancel(documentType: FiscalDocumentType, reference: string, justification: string) {
    const payload = await this.request(`/v2/${documentType}/${encodeURIComponent(reference)}`, {
      method: "DELETE",
      body: JSON.stringify({ justificativa: justification }),
    });
    return normalizeFocusResponse(payload, reference);
  }

  async downloadArtifact(url: string) {
    const target = new URL(url, this.baseUrl);
    if (target.origin !== new URL(this.baseUrl).origin) {
      throw new FiscalProviderError("O provedor retornou um endereço de artefato inválido.", "invalid_artifact_url");
    }
    let response: Response;
    try {
      response = await this.fetcher(target, {
        method: "GET",
        signal: AbortSignal.timeout(20_000),
        headers: { Authorization: this.authorization, Accept: "application/xml,application/pdf" },
      });
    } catch {
      throw new FiscalProviderError(
        "O artefato fiscal está temporariamente indisponível.",
        "artifact_unavailable",
        true,
      );
    }
    if (!response.ok) {
      throw new FiscalProviderError(
        "O provedor não disponibilizou o artefato fiscal.",
        `artifact_${response.status}`,
        response.status >= 500 || response.status === 429,
      );
    }
    const content = Buffer.from(await response.arrayBuffer());
    if (!content.length || content.length > 10 * 1024 * 1024) {
      throw new FiscalProviderError("O artefato fiscal possui tamanho inválido.", "invalid_artifact_size");
    }
    return {
      content,
      contentType: response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream",
    };
  }

  private async request(path: string, init: RequestInit): Promise<FocusResponse> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: this.authorization,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
    } catch {
      throw new FiscalProviderError(
        "O provedor fiscal está temporariamente indisponível. A solicitação ficou na fila.",
        "provider_unavailable",
        true,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as FocusResponse;
    if (!response.ok) {
      const code = stringValue(
        payload.codigo ?? payload.codigo_status_sefaz ?? payload.status_sefaz ?? response.status,
      );
      const message =
        stringValue(payload.mensagem ?? payload.mensagem_sefaz ?? payload.erros) ||
        "O provedor fiscal recusou a solicitação.";
      throw new FiscalProviderError(
        message,
        code,
        response.status >= 500 || response.status === 429,
      );
    }
    return payload;
  }
}

export function normalizeFocusResponse(
  payload: FocusResponse,
  reference?: string,
): FiscalProviderResult {
  const providerStatus = stringValue(payload.status).toLowerCase();
  const status = providerStatus.includes("cancel")
    ? "cancelled"
    : providerStatus.includes("autoriz")
      ? "authorized"
      : providerStatus.includes("conting")
        ? "contingency"
        : providerStatus.includes("process") || providerStatus.includes("fila")
          ? "transmitting"
          : providerStatus.includes("erro") || providerStatus.includes("rejeit")
            ? "rejected"
            : "queued";
  return {
    status,
    externalId: stringValue(payload.id ?? payload.ref ?? reference) || undefined,
    accessKey: stringValue(payload.chave_nfe ?? payload.chave_nfce ?? payload.chave) || undefined,
    protocol: stringValue(payload.protocolo ?? payload.numero_protocolo) || undefined,
    rejectionCode:
      stringValue(payload.codigo_status_sefaz ?? payload.codigo ?? payload.status_sefaz) ||
      undefined,
    rejectionReason:
      stringValue(payload.mensagem_sefaz ?? payload.mensagem ?? payload.erros) || undefined,
    xmlUrl:
      stringValue(payload.caminho_xml_nota_fiscal ?? payload.caminho_xml ?? payload.url_xml) ||
      undefined,
    pdfUrl:
      stringValue(payload.caminho_danfe ?? payload.caminho_danfe_nfce ?? payload.url_danfe) ||
      undefined,
    providerStatus: providerStatus || undefined,
  };
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object" || !("mensagem" in item)) return "";
        return stringValue((item as Record<string, unknown>).mensagem);
      })
      .filter(Boolean)
      .join("; ");
  }
  return "";
}
