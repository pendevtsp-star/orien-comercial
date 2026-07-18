import { describe, expect, it } from "vitest";
import { IntegrationsService } from "./integrations.service";

const encryptionKey = "integration-test-key-with-at-least-thirty-two-characters";

function service() {
  return new IntegrationsService(
    {} as never,
    {
      INTEGRATIONS_ENCRYPTION_KEY: encryptionKey,
    } as never,
  );
}

describe("Integrações - credenciais cifradas", () => {
  it("decifra um valor autenticado", () => {
    const target = service() as never as {
      encrypt: (value: string) => string;
      decrypt: (value: string) => string;
    };
    const encrypted = target.encrypt("senha-de-integracao");

    expect(target.decrypt(encrypted)).toBe("senha-de-integracao");
  });

  it("rejeita uma tag de autenticacao alterada", () => {
    const target = service() as never as {
      encrypt: (value: string) => string;
      decrypt: (value: string) => string;
    };
    const payload = Buffer.from(target.encrypt("senha-de-integracao"), "base64");
    payload[12] ^= 1;

    expect(() => target.decrypt(payload.toString("base64"))).toThrow();
  });
});
