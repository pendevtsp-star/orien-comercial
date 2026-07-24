type SentryConfig = {
  SENTRY_DSN?: string;
  SENTRY_DSN_API?: string;
  SENTRY_ENVIRONMENT: string;
};

type SentryEvent = {
  event_id: string;
  timestamp: number;
  level: "error" | "info";
  platform: "node";
  environment: string;
  tags: Record<string, string>;
  contexts?: Record<string, Record<string, string>>;
  exception?: { values: Array<{ type: string; value: string; stacktrace?: { frames: Array<{ filename?: string; function?: string; lineno?: number; colno?: number }> } }> };
  message?: string;
};

let endpoint: string | undefined;
let environment = "local";

type ApiExceptionContext = {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
};

export function initializeSentry(config: SentryConfig) {
  if (endpoint) return;
  const dsn = config.SENTRY_DSN_API ?? config.SENTRY_DSN;
  if (!dsn) return;
  endpoint = sentryEnvelopeEndpoint(dsn);
  environment = config.SENTRY_ENVIRONMENT;
}

export function captureApiException(exception: unknown, context: ApiExceptionContext) {
  send(exceptionEvent(exception, {
    request_id: context.requestId,
    "http.method": context.method,
    "http.status_code": String(context.statusCode),
  }, { request: { path: sanitizePath(context.path) } }));
}

export function captureWorkerException(exception: unknown) {
  send(exceptionEvent(exception, { process: "worker" }));
}

export function captureSentryTest() {
  if (!endpoint) return false;
  send({
    event_id: crypto.randomUUID().replaceAll("-", ""),
    timestamp: Date.now() / 1000,
    level: "info",
    platform: "node",
    environment,
    tags: { source: "platform_controlled_test" },
    message: "Teste controlado de observabilidade Orien",
  });
  return true;
}

function exceptionEvent(exception: unknown, tags: Record<string, string>, contexts?: Record<string, Record<string, string>>): SentryEvent {
  const normalized = exception instanceof Error ? exception : new Error("Erro não identificado");
  return {
    event_id: crypto.randomUUID().replaceAll("-", ""),
    timestamp: Date.now() / 1000,
    level: "error",
    platform: "node",
    environment,
    tags,
    contexts,
    exception: {
      values: [{
        type: normalized.name || "Error",
        value: normalized.message.slice(0, 1_000),
        ...(stacktrace(normalized.stack) ? { stacktrace: stacktrace(normalized.stack) } : {}),
      }],
    },
  };
}

function stacktrace(stack: string | undefined) {
  if (!stack) return undefined;
  const frames = stack
    .split("\n")
    .slice(1, 31)
    .map((line) => {
      const location = line.match(/\(?(.+):(\d+):(\d+)\)?$/);
      if (!location) return { function: line.trim().slice(0, 500) };
      return {
        filename: location[1]?.trim(),
        lineno: Number(location[2]),
        colno: Number(location[3]),
      };
    })
    .reverse();
  return frames.length ? { frames } : undefined;
}

function sanitizePath(path: string) {
  const queryIndex = path.indexOf("?");
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

export function sentryEnvelopeEndpoint(dsn: string) {
  const parsed = new URL(dsn);
  const projectId = parsed.pathname.replaceAll("/", "");
  if (!parsed.username || !projectId) throw new Error("DSN do Sentry inválida.");
  return `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/?sentry_version=7&sentry_key=${encodeURIComponent(parsed.username)}&sentry_client=orien-api`;
}

function send(event: SentryEvent) {
  if (!endpoint) return;
  const body = sentryEnvelope(event);
  void fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-sentry-envelope" },
    body,
  }).catch(() => undefined);
}

export function sentryEnvelope(event: SentryEvent) {
  return `${JSON.stringify({ sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event", content_type: "application/json" })}\n${JSON.stringify(event)}`;
}
