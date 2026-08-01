import { describe, expect, it } from "vitest";
import {
  getReportLabel,
  primaryPresetLabels,
  reportGroups,
  supportsDocumentExport,
} from "./page-model";

describe("report page model", () => {
  it("organizes every report once into task-oriented groups", () => {
    const reportIds = reportGroups.flatMap((group) => group.reports.map((report) => report.id));

    expect(reportGroups.map((group) => group.label)).toEqual([
      "Visão geral",
      "Comercial",
      "Financeiro",
      "Estoque",
    ]);
    expect(reportIds).toHaveLength(13);
    expect(new Set(reportIds).size).toBe(13);
  });

  it("keeps only the most common periods immediately visible", () => {
    expect(primaryPresetLabels).toEqual(["Hoje", "Este mês", "Últimos 30 dias", "Este ano"]);
  });

  it("does not offer unavailable document exports", () => {
    expect(supportsDocumentExport("overview")).toBe(true);
    expect(supportsDocumentExport("monthly-consolidated")).toBe(true);
    expect(supportsDocumentExport("executive-dashboard")).toBe(false);
    expect(supportsDocumentExport("product-analysis")).toBe(false);
  });

  it("resolves the selected report label for export context", () => {
    expect(getReportLabel("overview")).toBe("Resumo gerencial");
    expect(getReportLabel("cash-flow")).toBe("Fluxo de caixa");
  });
});
