"use client";

import { useEffect } from "react";
import { captureSentryException } from "../components/sentry-client";

export default function GlobalError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    void captureSentryException(error, { boundary: "global" });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">Orien</p>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-[var(--brand-primary)]">Não foi possível carregar esta tela.</h1>
          <p className="mt-3 text-[var(--brand-muted)]">Nossa equipe foi avisada. Tente novamente em alguns instantes.</p>
          <button className="mt-6 rounded-md bg-[var(--brand-primary)] px-5 py-3 font-semibold text-white" onClick={reset}>
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
