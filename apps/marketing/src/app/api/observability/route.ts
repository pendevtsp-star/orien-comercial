export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      dsn: process.env.SENTRY_DSN_MARKETING,
      environment: process.env.SENTRY_ENVIRONMENT ?? "local",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
