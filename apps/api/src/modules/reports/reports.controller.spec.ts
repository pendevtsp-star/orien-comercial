import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "../../shared/request-context";
import { ReportsController } from "./reports.controller";

const context: TenantContext = {
  tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  branchId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  membershipId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  roleSlug: "manager",
  permissions: ["sales.read", "financial.read"],
};

function responseDouble() {
  return {
    type: vi.fn(),
    setHeader: vi.fn(),
    send: vi.fn(),
  };
}

describe("ReportsController exports", () => {
  it("serves commercial CSV from the backend with the same parsed filter input", async () => {
    const dataset = { kind: "commercial-documents", rows: [{ id: "1" }] };
    const reports = {
      dataset: vi.fn().mockResolvedValue(dataset),
      csv: vi.fn().mockReturnValue("\uFEFFNúmero;Tipo\r\n42;DAV\r\n"),
    };
    const controller = new ReportsController(reports as never);
    const response = responseDouble();
    const query = { startDate: "2026-07-01", endDate: "2026-07-31", documentType: "dav" };

    await controller.commercialDocumentsCsv(context, query, response as never);

    expect(reports.dataset).toHaveBeenCalledWith(context, "commercial-documents", query);
    expect(reports.csv).toHaveBeenCalledWith(dataset);
    expect(response.type).toHaveBeenCalledWith("text/csv; charset=utf-8");
    expect(response.setHeader).toHaveBeenCalledWith(
      "content-disposition",
      'attachment; filename="orien-documentos-comerciais.csv"',
    );
    expect(response.send).toHaveBeenCalledWith(expect.stringContaining("Número;Tipo"));
  });

  it("serves financial PDF with tenant branding and no second dataset query", async () => {
    const dataset = { kind: "financial-net", rows: [{ paymentId: "1" }] };
    const branding = { companyName: "Empresa", primaryColor: "#0B1D3D", accentColor: "#F5C34A" };
    const reports = {
      dataset: vi.fn().mockResolvedValue(dataset),
      branding: vi.fn().mockResolvedValue(branding),
      pdf: vi.fn().mockReturnValue(new Uint8Array([37, 80, 68, 70])),
    };
    const controller = new ReportsController(reports as never);
    const response = responseDouble();
    const query = { startDate: "2026-07-01", endDate: "2026-07-31", status: "paid" };

    await controller.financialNetPdf(context, query, response as never);

    expect(reports.dataset).toHaveBeenCalledTimes(1);
    expect(reports.pdf).toHaveBeenCalledWith(dataset, branding);
    expect(response.type).toHaveBeenCalledWith("application/pdf");
    expect(response.send).toHaveBeenCalledWith(expect.any(Uint8Array));
  });
});
