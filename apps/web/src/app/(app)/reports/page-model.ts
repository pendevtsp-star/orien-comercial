export type ReportId =
  | "executive-dashboard"
  | "overview"
  | "sales"
  | "financial"
  | "stock"
  | "billing"
  | "commission-by-payment"
  | "reconciliation-defasaged"
  | "seller-performance"
  | "monthly-consolidated"
  | "product-analysis"
  | "customer-analysis"
  | "cash-flow";

interface ReportGroup {
  label: string;
  reports: Array<{ id: ReportId; label: string }>;
}

export const reportGroups: ReportGroup[] = [
  {
    label: "Visão geral",
    reports: [
      { id: "overview", label: "Resumo gerencial" },
      { id: "executive-dashboard", label: "Dashboard executivo" },
    ],
  },
  {
    label: "Comercial",
    reports: [
      { id: "sales", label: "Vendas" },
      { id: "billing", label: "Faturamento" },
      { id: "seller-performance", label: "Desempenho de vendedores" },
      { id: "product-analysis", label: "Análise de produtos" },
      { id: "customer-analysis", label: "Análise de clientes" },
      { id: "monthly-consolidated", label: "Consolidado mensal" },
    ],
  },
  {
    label: "Financeiro",
    reports: [
      { id: "financial", label: "Financeiro" },
      { id: "cash-flow", label: "Fluxo de caixa" },
      { id: "commission-by-payment", label: "Comissões por pagamento" },
      { id: "reconciliation-defasaged", label: "Conciliação" },
    ],
  },
  {
    label: "Estoque",
    reports: [{ id: "stock", label: "Posição de estoque" }],
  },
];

export const primaryPresetLabels = ["Hoje", "Este mês", "Últimos 30 dias", "Este ano"];

const documentExportReports = new Set<ReportId>([
  "overview",
  "sales",
  "financial",
  "stock",
  "billing",
  "commission-by-payment",
  "reconciliation-defasaged",
  "seller-performance",
  "monthly-consolidated",
]);

export function supportsDocumentExport(report: ReportId) {
  return documentExportReports.has(report);
}

export function getReportLabel(report: ReportId) {
  return (
    reportGroups.flatMap((group) => group.reports).find((item) => item.id === report)?.label ??
    report
  );
}
