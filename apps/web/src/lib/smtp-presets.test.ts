import { describe, expect, it } from "vitest";
import { applySmtpPreset, smtpPresetById } from "./smtp-presets";

describe("predefinições SMTP", () => {
  it("preenche a configuração segura recomendada para Locaweb", () => {
    expect(applySmtpPreset("locaweb", {})).toMatchObject({
      providerName: "locaweb",
      host: "smtp.locaweb.com.br",
      port: "587",
      security: "starttls",
    });
  });

  it("mantém dados operacionais que não pertencem ao preset", () => {
    expect(
      applySmtpPreset("google_workspace", {
        from: "contato@empresa.com.br",
        testRecipient: "gestor@empresa.com.br",
      }),
    ).toMatchObject({
      from: "contato@empresa.com.br",
      testRecipient: "gestor@empresa.com.br",
      host: "smtp.gmail.com",
      port: "587",
    });
  });

  it("expõe a opção manual sem host ou porta pré-definidos", () => {
    expect(smtpPresetById.manual).toMatchObject({
      id: "manual",
      host: "",
      port: "",
    });
  });
});
