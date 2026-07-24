"use client";

import * as Sentry from "@sentry/browser";
import { useEffect } from "react";

let initialized = false;

export function SentryClient() {
  useEffect(() => {
    void initialize();
  }, []);

  return null;
}

export async function captureSentryException(error: unknown, tags?: Record<string, string>) {
  await initialize();
  if (initialized) Sentry.captureException(error, { tags });
}

async function initialize() {
  if (initialized) return;
  try {
    const response = await fetch("/api/observability", { cache: "no-store" });
    if (!response.ok) return;
    const config = (await response.json()) as { dsn?: string; environment?: string; tracesSampleRate?: number };
    if (!config.dsn) return;

    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      tracesSampleRate: config.tracesSampleRate ?? 0.1,
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies;
          delete event.request.data;
          delete event.request.headers;
        }
        event.user = undefined;
        return event;
      },
    });
    initialized = true;
  } catch {
    // Observability must never interfere with the application startup.
  }
}
