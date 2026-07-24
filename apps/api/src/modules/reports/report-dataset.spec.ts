import { describe, expect, it } from "vitest";
import type { TenantBranding } from "@sgc/documents";
import {
  datasetToCsv,
  datasetToDocumentInput,
  type ReportDataset,
} from "./report-dataset";

const branding: TenantBranding = {
  companyName: "Comércio São José",
  primaryColor: "#0B1D3D",
  accentColor: "#F5C34A",
};

const dataset: ReportDataset = {
  kind: "financial-net",
  title: "Financeiro bruto, taxas e líquido",
  subtitle: "Valores registrados por recebimento.",
  generatedAt: "2026-07-21T15:00:00.000Z",
  timezone: "America/Manaus",
  period: { startDate: "2026-07-01", endDate: "2026-07-31" },
  scopeLabel: "Loja Centro",
  columns: [
    { key: "method", label: "Forma de pagamento", format: "text" },
    { key: "grossAmount", label: "Bruto", format: "money" },
    { key: "feeAmount", label: "Taxa", format: "money-optional" },
    { key: "netAmount", label: "Líquido", format: "money-optional" },
  ],
  rows: [
    { method: "Cartão; crédito", grossAmount: "1234.56", feeAmount: "34.56", netAmount: "1200" },
    { method: "Pix", grossAmount: "50", feeAmount: null, netAmount: null },
  ],
  summary: [
    { label: "Bruto", value: "1284.56", format: "money" },
    { label: "Taxas registradas", value: "34.56", format: "money" },
  ],
  warnings: ["Taxa e líquido aparecem somente quando existe snapshot financeiro."],
};

describe("report dataset exporters", () => {
  it("generates an Excel-compatible UTF-8 CSV with BOM, semicolon and PT-BR values", () => {
    const csv = datasetToCsv(dataset);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Forma de pagamento;Bruto;Taxa;Líquido");
    expect(csv).toContain('"Cartão; crédito";R$ 1.234,56;R$ 34,56;R$ 1.200,00');
    expect(csv).toContain("Pix;R$ 50,00;Não informado;Não informado");
  });

  it("uses the exact same rows and columns in the PDF/HTML document input", () => {
    const document = datasetToDocumentInput(dataset, branding);
    const table = document.sections[0]?.table;

    expect(table?.columns).toEqual(dataset.columns.map(({ key, label }) => ({ key, label })));
    expect(table?.rows).toHaveLength(dataset.rows.length);
    expect(table?.rows[0]).toMatchObject({
      method: "Cartão; crédito",
      grossAmount: "R$ 1.234,56",
      feeAmount: "R$ 34,56",
      netAmount: "R$ 1.200,00",
    });
    expect(table?.rows[1]).toMatchObject({ feeAmount: "Não informado", netAmount: "Não informado" });
  });

  it("formats document timestamps in the tenant timezone", () => {
    const document = datasetToDocumentInput(
      { ...dataset, generatedAt: "2026-07-21T03:00:00.000Z", timezone: "America/Manaus" },
      branding,
    );

    const emittedAt = document.meta?.find((item) => item.label === "Emitido em");
    expect(emittedAt?.value).toContain("20/07/2026");
  });

  it("never emits an empty CSV for a non-empty managerial dataset", () => {
    expect(new TextEncoder().encode(datasetToCsv(dataset)).byteLength).toBeGreaterThan(100);
  });
});
