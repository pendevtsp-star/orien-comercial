import { describe, expect, it } from "vitest";
import { sentryEnvelope, sentryEnvelopeEndpoint } from "./sentry";

describe("observabilidade Sentry", () => {
  it("cria endpoint de envelope sem expor a senha inexistente do DSN", () => {
    expect(sentryEnvelopeEndpoint("https://public-key@o0.ingest.sentry.io/123")).toBe(
      "https://o0.ingest.sentry.io/api/123/envelope/?sentry_version=7&sentry_key=public-key&sentry_client=orien-api",
    );
  });

  it("envia apenas o evento estruturado no envelope", () => {
    const envelope = sentryEnvelope({
      event_id: "event-id",
      timestamp: 1,
      level: "info",
      platform: "node",
      environment: "test",
      tags: { source: "test" },
      message: "Teste controlado",
    });

    expect(envelope).toContain('"type":"event"');
    expect(envelope).toContain('"message":"Teste controlado"');
    expect(envelope).not.toContain("authorization");
  });
});
