import { describe, expect, it, vi } from "vitest";
import { IntegrationsService } from "./integrations.service";
import type { TenantContext } from "../../shared/request-context";

const encryptionKey = "integration-test-key-with-at-least-thirty-two-characters";
const context = { tenantId: "tenant-1", branchId: null } as never;

function service(tenantQuery = vi.fn()) {
  return new IntegrationsService(
    { tenantQuery } as never,
    { INTEGRATIONS_ENCRYPTION_KEY: encryptionKey } as never,
  );
}

describe("Integrações - SMTP", () => {
  it("rejeita remetente que não é um e-mail válido", () => {
    const target = service() as never as {
      validateSmtpSettings: (settings: Record<string, string>) => void;
    };

    expect(() =>
      target.validateSmtpSettings({
        from: "remetente-invalido",
        host: "smtp.exemplo.com",
        port: "587",
        security: "starttls",
      }),
    ).toThrow("Informe um e-mail válido para enviar mensagens.");
  });

  it("rejeita portas SMTP incompatíveis com a segurança escolhida", () => {
    const target = service() as never as {
      validateSmtpSettings: (settings: Record<string, string>) => void;
    };

    expect(() =>
      target.validateSmtpSettings({
        from: "contato@empresa.com.br",
        host: "smtp.empresa.com.br",
        port: "25",
        security: "starttls",
      }),
    ).toThrow("Use uma porta SMTP segura compatível com a conexão escolhida.");
  });

  it("sanitiza falha de teste SMTP e registra o último resultado", async () => {
    const tenantQuery = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            encrypted_payload: "ignored",
            settings: {
              from: "contato@empresa.com.br",
              testRecipient: "gestor@empresa.com.br",
              host: "smtp.empresa.com.br",
              port: "587",
              security: "starttls",
            },
            status: "configured",
            last_test_ok: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const target = service(tenantQuery) as never as {
      decrypt: (value: string) => string;
      smtpTransport: () => { verify: () => Promise<void>; sendMail: () => Promise<void> };
      test: (context: TenantContext, provider: string) => Promise<{ ok: boolean; message: string }>;
    };
    target.decrypt = () => JSON.stringify({ username: "contato@empresa.com.br", password: "segredo" });
    target.smtpTransport = () => ({
      verify: () => Promise.reject(new Error("ECONNREFUSED smtp.empresa.com.br com segredo")),
      sendMail: () => Promise.resolve(),
    });

    const result = await target.test(context, "smtp");

    expect(result).toEqual({
      ok: false,
      message: "Não foi possível conectar ao serviço agora. Revise os dados e tente novamente.",
    });
    expect(tenantQuery).toHaveBeenLastCalledWith(
      "tenant-1",
      expect.stringContaining("settings=COALESCE"),
      expect.arrayContaining([
        expect.stringContaining('"lastTestOk":false'),
        "error",
      ]),
    );
  });
});
