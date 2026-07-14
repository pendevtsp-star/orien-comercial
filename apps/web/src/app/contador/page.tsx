"use client";

import { Badge, Button, Card, CardContent, EmptyState, Input } from "@sgc/ui";
import { Download, FileCheck2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { API_URL, ApiError } from "../../lib/api";

type PortalOverview = {
  tenant: { name: string; branchName?: string | null };
  accountant: { name: string; email: string; expiresAt: string };
  period: string;
  documents: Array<{ documentType: string; status: string; total: number }>;
  inbound: Array<{ status: string; total: number; amount: string }>;
  financial: Array<{ origin: string; status: string; total: number; amount: string }>;
  lowStock: Array<{ productName: string; branchName: string; quantity: string; minStock: string }>;
};

export default function AccountantPortalPage() {
  const [token, setToken] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [overview, setOverview] = useState<PortalOverview | null>(null);
  const [error, setError] = useState("");
  const totalDocuments = useMemo(
    () => overview?.documents.reduce((sum, row) => sum + Number(row.total), 0) ?? 0,
    [overview],
  );
  const attention = useMemo(
    () => overview?.documents.filter((row) => ["rejected", "error", "retry_pending"].includes(row.status)).reduce((sum, row) => sum + Number(row.total), 0) ?? 0,
    [overview],
  );

  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get("token");
    if (urlToken) {
      setToken(urlToken);
      void load(urlToken, period);
    }
  }, [period]);

  async function load(currentToken = token, currentPeriod = period) {
    if (!currentToken.trim()) {
      setError("Informe o token recebido pelo escritório contábil.");
      return;
    }
    try {
      setError("");
      const query = new URLSearchParams({ token: currentToken.trim(), period: currentPeriod });
      const response = await fetch(`${API_URL}/accountant-portal/overview?${query.toString()}`, {
        headers: { "x-request-id": crypto.randomUUID() },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new ApiError(payload?.message ?? "Não foi possível acessar o portal do contador.", response.status);
      }
      setOverview((await response.json()) as PortalOverview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível acessar o portal do contador.");
      setOverview(null);
    }
  }

  async function downloadCsv() {
    const query = new URLSearchParams({ token: token.trim(), period });
    const response = await fetch(`${API_URL}/accountant-portal/export?${query.toString()}`);
    if (!response.ok) {
      setError("Não foi possível baixar o arquivo contábil.");
      return;
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `orien-contador-${period}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  }

  return (
    <main className="min-h-screen bg-[var(--brand-bg)] px-4 py-8 text-[var(--brand-primary)]">
      <div className="mx-auto grid max-w-6xl gap-6">
        <section className="rounded-2xl bg-[var(--brand-primary)] p-6 text-white shadow-[0_24px_70px_rgba(11,29,61,0.22)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-accent)]">Orien Contábil</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold">Portal externo do contador</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
            Consulte documentos fiscais, entradas, financeiro e alertas de estoque com acesso separado do painel operacional da loja.
          </p>
        </section>

        <Card>
          <CardContent className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto_auto] lg:items-end">
            <Input label="Token de acesso" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Cole o token ou abra pelo link recebido" />
            <Input label="Competência" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
            <Button icon={<RefreshCw size={16} />} onClick={() => void load()}>Atualizar</Button>
            <Button variant="secondary" icon={<Download size={16} />} disabled={!overview} onClick={() => void downloadCsv()}>Baixar CSV</Button>
          </CardContent>
        </Card>

        {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

        {overview ? (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Empresa" value={overview.tenant.name} />
              <Metric label="Loja" value={overview.tenant.branchName ?? "Todas as lojas"} />
              <Metric label="Documentos fiscais" value={String(totalDocuments)} />
              <Metric label="Atenção fiscal" value={String(attention)} danger={attention > 0} />
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardContent>
                  <h2 className="text-lg font-semibold">Documentos fiscais</h2>
                  <div className="mt-4 grid gap-2">
                    {overview.documents.map((row) => (
                      <Line key={`${row.documentType}-${row.status}`} left={`${row.documentType.toUpperCase()} · ${label(row.status)}`} right={`${row.total}`} />
                    ))}
                    {!overview.documents.length ? <EmptyState eyebrow="Fiscal" title="Nenhum documento no período." description="Quando houver NFC-e/NF-e emitida, os totais aparecerão aqui." icon={<FileCheck2 size={20} />} /> : null}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <h2 className="text-lg font-semibold">Entradas e financeiro</h2>
                  <div className="mt-4 grid gap-2">
                    {overview.inbound.map((row) => (
                      <Line key={`in-${row.status}`} left={`Entradas · ${label(row.status)}`} right={money(row.amount)} />
                    ))}
                    {overview.financial.map((row) => (
                      <Line key={`fin-${row.origin}-${row.status}`} left={`${row.origin} · ${label(row.status)}`} right={money(row.amount)} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Estoque abaixo do mínimo</h2>
                  <Badge>{overview.lowStock.length} item(ns)</Badge>
                </div>
                <div className="mt-4 grid gap-2">
                  {overview.lowStock.map((row) => (
                    <Line key={`${row.productName}-${row.branchName}`} left={`${row.productName} · ${row.branchName}`} right={`${Number(row.quantity).toLocaleString("pt-BR")} / mín. ${Number(row.minStock).toLocaleString("pt-BR")}`} />
                  ))}
                  {!overview.lowStock.length ? <p className="text-sm text-slate-500">Nenhum item abaixo do mínimo no escopo liberado.</p> : null}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--brand-secondary)]">{label}</p>
        <p className={`mt-2 text-xl font-semibold ${danger ? "text-rose-700" : "text-[var(--brand-primary)]"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Line({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--brand-border)] px-3 py-2 text-sm">
      <span>{left}</span>
      <strong>{right}</strong>
    </div>
  );
}

function label(status: string) {
  return (
    {
      authorized: "autorizado",
      cancelled: "cancelado",
      rejected: "rejeitado",
      error: "erro",
      retry_pending: "pendente",
      received: "recebida",
      ready: "pronta",
      review_pending: "revisar",
      open: "aberto",
      paid: "pago",
    } as Record<string, string>
  )[status] ?? status;
}

function money(value: string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
