"use client";

import { Badge, Button, Card, CardContent, EmptyState, Input } from "@sgc/ui";
import { Download, FileArchive, FileCheck2, FileText, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { API_URL, ApiError } from "../../lib/api";

type PortalOverview = {
  access: { allowedPeriodStart?: string | null; allowedPeriodEnd?: string | null };
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
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [overview, setOverview] = useState<PortalOverview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const totalDocuments = useMemo(
    () => overview?.documents.reduce((sum, row) => sum + Number(row.total), 0) ?? 0,
    [overview],
  );
  const attention = useMemo(
    () => overview?.documents.filter((row) => ["rejected", "error", "retry_pending"].includes(row.status)).reduce((sum, row) => sum + Number(row.total), 0) ?? 0,
    [overview],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token") ?? "";
    const storedSession = sessionStorage.getItem("orien_accountant_session") ?? "";
    if (urlToken) setToken(urlToken);
    if (storedSession) {
      setSessionToken(storedSession);
      void load(storedSession, period);
    }
  }, [period]);

  async function requestCode() {
    if (!token.trim() || !email.trim()) {
      setError("Informe o e-mail autorizado para receber o código de acesso.");
      return;
    }
    setLoading(true);
    try {
      setError("");
      setNotice("");
      const response = await fetch(`${API_URL}/accountant-portal/login/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-request-id": crypto.randomUUID() },
        body: JSON.stringify({ token: token.trim(), email: email.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; sent?: boolean; devCode?: string } | null;
      if (!response.ok) throw new ApiError(payload?.message ?? "Não foi possível enviar o código.", response.status);
      setNotice(payload?.sent ? "Código enviado para o e-mail autorizado." : `Código gerado para ambiente sem e-mail: ${payload?.devCode ?? "verifique o servidor"}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o código.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (!token.trim() || !email.trim() || !code.trim()) {
      setError("Informe e-mail e código de 6 dígitos.");
      return;
    }
    setLoading(true);
    try {
      setError("");
      const response = await fetch(`${API_URL}/accountant-portal/login/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-request-id": crypto.randomUUID() },
        body: JSON.stringify({ token: token.trim(), email: email.trim(), code: code.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; sessionToken?: string } | null;
      if (!response.ok || !payload?.sessionToken) throw new ApiError(payload?.message ?? "Código inválido.", response.status);
      sessionStorage.setItem("orien_accountant_session", payload.sessionToken);
      setSessionToken(payload.sessionToken);
      setNotice("Acesso confirmado. Sessão contábil aberta com auditoria ativa.");
      await load(payload.sessionToken, period);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível confirmar o código.");
    } finally {
      setLoading(false);
    }
  }

  async function load(currentSession = sessionToken, currentPeriod = period) {
    if (!currentSession.trim()) return;
    try {
      setError("");
      const query = new URLSearchParams({ sessionToken: currentSession.trim(), period: currentPeriod });
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
      sessionStorage.removeItem("orien_accountant_session");
      setSessionToken("");
    }
  }

  async function download(format: "csv" | "pdf" | "xml") {
    const query = new URLSearchParams({ sessionToken: sessionToken.trim(), period, format });
    const response = await fetch(`${API_URL}/accountant-portal/export?${query.toString()}`);
    if (!response.ok) {
      setError("Não foi possível baixar o arquivo contábil.");
      return;
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `orien-contador-${period}.${format === "xml" ? "zip" : format}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  }

  function leave() {
    sessionStorage.removeItem("orien_accountant_session");
    setSessionToken("");
    setOverview(null);
    setNotice("Sessão encerrada neste dispositivo.");
  }

  return (
    <main className="min-h-screen bg-[var(--brand-bg)] px-4 py-8 text-[var(--brand-primary)]">
      <div className="mx-auto grid max-w-6xl gap-6">
        <section className="rounded-2xl bg-[var(--brand-primary)] p-6 text-white shadow-[0_24px_70px_rgba(11,29,61,0.22)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-accent)]">Orien Contábil</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold">Portal externo do contador</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
            Acesse documentos fiscais, entradas, financeiro e alertas com login próprio por código. Cada consulta e download fica auditado.
          </p>
        </section>

        {!sessionToken ? (
          <Card>
            <CardContent className="grid gap-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-800"><ShieldCheck size={20} /></span>
                <div>
                  <h2 className="font-semibold">Confirmar acesso contábil</h2>
                  <p className="text-sm text-slate-500">Use o e-mail autorizado pelo lojista. O código chega no e-mail e vale por 10 minutos.</p>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                <Input label="Token do link" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Preenchido automaticamente pelo link" />
                <Input label="E-mail do contador" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contador@escritorio.com.br" />
                <Button icon={<KeyRound size={16} />} onClick={() => void requestCode()} disabled={loading}>Enviar código</Button>
              </div>
              <div className="grid gap-3 lg:grid-cols-[220px_auto] lg:items-end">
                <Input label="Código recebido" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
                <Button onClick={() => void verifyCode()} disabled={loading}>Entrar no portal</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto_auto_auto_auto] lg:items-end">
              <Input label="Competência" type="month" min={overview?.access.allowedPeriodStart ?? undefined} max={overview?.access.allowedPeriodEnd ?? undefined} value={period} onChange={(event) => setPeriod(event.target.value)} />
              <Button icon={<RefreshCw size={16} />} onClick={() => void load()}>Atualizar</Button>
              <Button variant="secondary" icon={<FileText size={16} />} disabled={!overview} onClick={() => void download("csv")}>CSV</Button>
              <Button variant="secondary" icon={<Download size={16} />} disabled={!overview} onClick={() => void download("pdf")}>PDF</Button>
              <Button variant="secondary" icon={<FileArchive size={16} />} disabled={!overview} onClick={() => void download("xml")}>XML</Button>
              <Button variant="ghost" onClick={leave}>Sair</Button>
            </CardContent>
          </Card>
        )}

        {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        {notice ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}

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
