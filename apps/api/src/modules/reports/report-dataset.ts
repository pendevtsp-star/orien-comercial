import type { DocumentRenderInput, DocumentRow, TenantBranding } from "@sgc/documents";

export type ReportCell = string | number | boolean | null | undefined;
export type ReportCellFormat =
  | "text"
  | "integer"
  | "decimal"
  | "money"
  | "money-optional"
  | "date"
  | "datetime"
  | "datetime-optional"
  | "status";

export interface ReportColumn {
  key: string;
  label: string;
  format: ReportCellFormat;
}

export interface ReportMetric {
  label: string;
  value: ReportCell;
  format: ReportCellFormat;
}

export interface ReportDataset {
  kind: "commercial-documents" | "financial-net" | "billing" | "commission-by-payment" | "reconciliation-defasaged" | "seller-performance" | "monthly-consolidated" | "executive-dashboard" | "product-analysis" | "customer-analysis" | "cash-flow";
  title: string;
  subtitle: string;
  generatedAt: string;
  timezone: string;
  period: { startDate: string; endDate: string };
  scopeLabel: string;
  columns: ReportColumn[];
  rows: Array<Record<string, ReportCell>>;
  summary: ReportMetric[];
  warnings: string[];
}

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  approved: "Aprovado",
  reserved: "Reservado",
  converted: "Convertido",
  expired: "Vencido",
  cancelled: "Cancelado",
  pending: "Pendente",
  paid: "Pago",
  refunded: "Estornado",
};

export function datasetToCsv(dataset: ReportDataset) {
  const lines = [
    dataset.columns.map((column) => csvCell(column.label)).join(";"),
    ...dataset.rows.map((row) =>
      dataset.columns
        .map((column) => csvCell(formatReportCell(row[column.key], column.format, dataset.timezone)))
        .join(";"),
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function datasetToDocumentInput(
  dataset: ReportDataset,
  branding: TenantBranding,
): DocumentRenderInput {
  const rows: DocumentRow[] = dataset.rows.map((row) =>
    Object.fromEntries(
      dataset.columns.map((column) => [
        column.key,
        formatReportCell(row[column.key], column.format, dataset.timezone),
      ]),
    ),
  );
  return {
    title: dataset.title,
    subtitle: dataset.subtitle,
    badge: "Orien Relatórios",
    branding,
    meta: [
      { label: "Período", value: `${formatDate(dataset.period.startDate)} a ${formatDate(dataset.period.endDate)}` },
      { label: "Escopo", value: dataset.scopeLabel },
      { label: "Emitido em", value: formatDateTime(dataset.generatedAt, dataset.timezone) },
      { label: "Registros", value: String(dataset.rows.length) },
    ],
    sections: [
      {
        title: dataset.title,
        table: {
          columns: dataset.columns.map(({ key, label }) => ({ key, label })),
          rows,
        },
      },
      {
        title: "Resumo",
        subtitle: dataset.warnings.join(" ") || undefined,
        metrics: dataset.summary.map((metric) => ({
          label: metric.label,
          value: formatReportCell(metric.value, metric.format, dataset.timezone),
        })),
      },
    ],
  };
}

export function formatReportCell(
  value: ReportCell,
  format: ReportCellFormat,
  timezone = "America/Sao_Paulo",
): string {
  if (value === null || value === undefined || value === "") {
    return format === "money-optional" ? "Não informado" : "-";
  }
  if (format === "money" || format === "money-optional") {
    return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (format === "integer") return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  if (format === "decimal") return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  if (format === "date") return formatDate(String(value));
  if (format === "datetime") return formatDateTime(String(value), timezone);
  if (format === "datetime-optional") return value ? formatDateTime(String(value), timezone) : "-";
  if (format === "status") return statusLabels[String(value)] ?? String(value);
  return String(value);
}

function csvCell(value: string) {
  return /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDateTime(value: string, timezone: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { timeZone: timezone });
}
