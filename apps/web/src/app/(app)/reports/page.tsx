"use client";

import { Badge, Button, Card, CardContent, EmptyState, PageHeader } from "@sgc/ui";
import { BarChart3, Download, FileText, Landmark, PackageCheck, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, openApiDocument } from "../../../lib/api";

type Tab = "overview" | "sales" | "financial" | "stock";
const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Resumo gerencial", icon: BarChart3 },
  { id: "sales", label: "Vendas", icon: ShoppingCart },
  { id: "financial", label: "Financeiro", icon: Landmark },
  { id: "stock", label: "Estoque", icon: PackageCheck },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const query = useMemo(() => `?startDate=${startDate}&endDate=${endDate}`, [startDate, endDate]);

  async function load() {
    setLoading(true); setError(null);
    try { setData(await apiFetch<Record<string, unknown>>(`/reports/${tab}${tab === "stock" ? "" : query}`)); }
    catch (reason) { setData(null); setError(reason instanceof Error ? reason.message : "Não foi possível emitir o relatório."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [tab, query]);
  function exportCsv() {
    const rows = arrayRows(data);
    const header = rows[0] ? Object.keys(rows[0]) : [];
    const csv = [header.join(";"), ...rows.map((row) => header.map((key) => String(row[key] ?? "").replaceAll(";", ",")).join(";"))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `orien-${tab}-${startDate}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  const overview = data as { salesCount?: number; grossRevenue?: string; averageTicket?: string; discounts?: string; customers?: number } | null;
  const rows = arrayRows(data);
  return <div className="grid gap-6">
    <PageHeader title="Relatórios" description="Emita leituras simples e gerenciais de vendas, financeiro e estoque." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" icon={<FileText size={16} />} onClick={() => void openApiDocument(`/reports/overview/document${query}`)}>Emitir PDF</Button><Button variant="secondary" icon={<Download size={16} />} onClick={exportCsv}>Exportar CSV</Button></div>} />
    <Card><CardContent className="grid gap-4"><div className="flex flex-wrap gap-2" role="tablist">{tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium ${tab === item.id ? "bg-[var(--brand-primary)] text-white shadow-sm" : "border border-[var(--brand-border)] bg-white text-[var(--brand-primary)]"}`}><item.icon size={16}/>{item.label}</button>)}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="grid gap-1 text-sm font-medium">Início<input className="h-10 rounded-md border border-[var(--brand-border)] px-3" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="grid gap-1 text-sm font-medium">Fim<input className="h-10 rounded-md border border-[var(--brand-border)] px-3" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><div className="flex items-end"><Button onClick={() => void load()} icon={<FileText size={16}/>}>Emitir relatório</Button></div></div></CardContent></Card>
    {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    {loading ? <p className="py-12 text-center text-sm text-slate-500">Preparando relatório...</p> : null}
    {!loading && tab === "overview" && overview ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Vendas", overview.salesCount ?? 0], ["Receita", money(overview.grossRevenue)], ["Ticket médio", money(overview.averageTicket)], ["Clientes", overview.customers ?? 0]].map(([label, value]) => <Card key={String(label)}><CardContent><p className="text-sm text-slate-500">{label}</p><strong className="mt-2 block text-2xl text-[var(--brand-primary)]">{value}</strong></CardContent></Card>)}</section> : null}
    {!loading && tab !== "overview" ? <Card><CardContent>{rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr>{Object.keys(rows[0]!).map((key) => <th className="border-b p-3 text-xs uppercase tracking-[.12em] text-slate-500" key={key}>{label(key)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{Object.entries(row).map(([key, value]) => <td className="border-b p-3" key={key}>{key.includes("amount") || key.includes("revenue") || key.includes("stockValue") ? money(value) : String(value ?? "-")}</td>)}</tr>)}</tbody></table></div> : <EmptyState title="Nenhum dado no período" description="Altere o período ou registre movimentações para emitir este relatório." />}</CardContent></Card> : null}
  </div>;
}
function arrayRows(data: Record<string, unknown> | null): Array<Record<string, unknown>> { if (!data) return []; for (const value of Object.values(data)) if (Array.isArray(value)) return value as Array<Record<string, unknown>>; return []; }
function money(value: unknown) { return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function label(key: string) { return key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase()); }
