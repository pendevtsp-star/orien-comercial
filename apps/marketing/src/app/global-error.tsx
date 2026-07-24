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
          <p>Orien</p>
          <h1>Não foi possível carregar esta página.</h1>
          <p>Nossa equipe foi avisada. Tente novamente em alguns instantes.</p>
          <button onClick={reset}>Tentar novamente</button>
        </main>
      </body>
    </html>
  );
}
