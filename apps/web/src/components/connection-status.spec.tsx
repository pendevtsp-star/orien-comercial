import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectionStatus, getConnectionStatus } from "./connection-status";

describe("ConnectionStatus", () => {
  it("announces an unavailable connection without interrupting the current task", () => {
    expect(getConnectionStatus(false)).toEqual({
      label: "Conexão indisponível",
      message: "As alterações serão enviadas quando a conexão voltar.",
    });

    const markup = renderToStaticMarkup(createElement(ConnectionStatus, { online: false }));

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Conexão indisponível");
  });

  it("stays out of the interface while the connection is available", () => {
    expect(getConnectionStatus(true)).toBeNull();
    expect(renderToStaticMarkup(createElement(ConnectionStatus, { online: true }))).toBe("");
  });
});
