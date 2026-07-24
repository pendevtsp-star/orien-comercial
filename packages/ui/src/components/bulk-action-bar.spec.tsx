import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "./bulk-action-bar";

describe("BulkActionBar", () => {
  it("shows a clear selection summary and explicit commands", () => {
    const markup = renderToStaticMarkup(
      createElement(BulkActionBar, {
        selectedCount: 3,
        itemLabel: "produtos",
        onRequestAction: vi.fn(),
        onClear: vi.fn(),
      }),
    );

    expect(markup).toContain("3 produtos selecionados");
    expect(markup).toContain("Ativar selecionados");
    expect(markup).toContain("Desativar selecionados");
    expect(markup).toContain('aria-live="polite"');
  });

  it("requires a second confirmation step and exposes feedback", () => {
    const markup = renderToStaticMarkup(
      createElement(BulkActionBar, {
        selectedCount: 2,
        itemLabel: "clientes",
        pendingAction: "deactivate",
        feedback: "2 clientes foram desativados.",
        onRequestAction: vi.fn(),
        onClear: vi.fn(),
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      }),
    );

    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain("Confirmar desativação");
    expect(markup).toContain("2 clientes foram desativados.");
  });
});
