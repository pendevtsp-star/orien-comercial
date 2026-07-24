export type CommercialDocumentType = "quote" | "order" | "dav";
export type CommercialDocumentStatus =
  | "draft"
  | "sent"
  | "approved"
  | "reserved"
  | "converted"
  | "expired"
  | "cancelled";
export type CommercialDocumentAction = "send" | "approve" | "reserve" | "convert" | "expire" | "cancel";

const documentTypeLabels: Record<CommercialDocumentType, string> = {
  quote: "Orçamento",
  order: "Pedido",
  dav: "Documento auxiliar de venda",
};

const documentStatusLabels: Record<CommercialDocumentStatus, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  approved: "Aprovado",
  reserved: "Reservado",
  converted: "Convertido",
  expired: "Vencido",
  cancelled: "Cancelado",
};

const settlementStatusLabels: Record<string, string> = {
  pending: "Pendente",
  partially_settled: "Liquidado parcialmente",
  settled: "Liquidado",
  diverged: "Com divergência",
  cancelled: "Cancelado",
};

export function commercialDocumentTypeLabel(type: CommercialDocumentType) {
  return documentTypeLabels[type];
}

export function commercialDocumentStatusLabel(status: CommercialDocumentStatus) {
  return documentStatusLabels[status];
}

export function commercialDocumentActions(
  type: CommercialDocumentType,
  status: CommercialDocumentStatus,
): CommercialDocumentAction[] {
  if (status === "draft") return ["send", "cancel"];
  if (status === "sent") return ["approve", "cancel"];
  if (status === "approved") return type === "quote" ? ["reserve", "convert", "cancel"] : ["reserve", "convert", "cancel"];
  if (status === "reserved") return ["convert", "cancel"];
  return [];
}

export function settlementStatusLabel(status: string) {
  return settlementStatusLabels[status] ?? status;
}

export function basisPointsToPercent(value: number) {
  return (value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + "%";
}

export function moneyToCents(value: string | number) {
  const normalized = typeof value === "number"
    ? value
    : Number(value.trim().replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(normalized)) return 0;
  return Math.round(normalized * 100);
}

export function centsToMoney(value: number) {
  return (value / 100).toFixed(2);
}

export function buildReportQuery(filters: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}
