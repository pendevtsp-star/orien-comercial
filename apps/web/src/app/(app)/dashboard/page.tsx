"use client";

import { Badge, Button, Card, CardContent, EmptyState, Input, PageHeader, Select } from "@sgc/ui";
import { AlertCircle, ArrowUpRight, Banknote, Boxes, Building2, CircleDollarSign, ShoppingCart, UsersRound, type LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface Summary {
  branches: number;
  products: number;
  customers: number;
  lowStockProducts: number;
  accountsReceivableOpen: number;
  accountsPayableOpen: number;
  salesToday: number;
  salesMonth: number;
  averageTicket: number;
  periodSales: number;
  periodSalesCount: number;
  periodAverageTicket: number;
  previousPeriodSales: number;
  salesVariationPercent: number | null;
  cashForecast: number;
  salesGoal: number;
  goalProgressPercent: number | null;
}

const cards = [
  { key: "branches", label: "Lojas ativas", icon: Building2, tone: "secondary" },
  { key: "products", label: "Produtos", icon: Boxes, tone: "primary" },
  { key: "customers", label: "Clientes", icon: UsersRound, tone: "highlight" },
  { key: "lowStockProducts", label: "Alerta de estoque", icon: AlertCircle, tone: "accent" }
] as const;

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(today);
  const [branches, setBranches] = useState<Array<{id:string;name:string}>>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSummary(await apiFetch<Summary>(`/dashboard/summary?startDate=${startDate}&endDate=${endDate}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void apiFetch<{data:Array<{id:string;name:string}>}>("/branches?pageSize=100&isActive=true").then((result)=>setBranches(result.data));
  }, []);

  async function saveGoal(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);try{await apiFetch("/dashboard/goals",{method:"POST",body:JSON.stringify({branchId:form.get("branchId"),periodStart:startDate,periodEnd:endDate,salesTarget:Number(form.get("salesTarget")||0)})});await load();}catch(err){setError(err instanceof Error?err.message:"Falha ao salvar meta.");}}

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Dashboard"
        description="Indicadores iniciais do tenant e alertas de operacao."
        actions={
          <div className="grid gap-2 sm:grid-cols-[150px_150px_auto]"><Input aria-label="Data inicial" type="date" value={startDate} onChange={(event)=>setStartDate(event.target.value)}/><Input aria-label="Data final" type="date" value={endDate} onChange={(event)=>setEndDate(event.target.value)}/><Button variant="secondary" onClick={() => void load()}>Aplicar período</Button></div>
        }
      />
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {!loading && !summary && !error ? (
        <EmptyState
          eyebrow="Resumo executivo"
          title="Sem dados suficientes para o dashboard."
          description="Assim que vendas, financeiro e estoque tiverem movimentacao, os indicadores principais aparecerao aqui."
          icon={<AlertCircle size={20} />}
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card variant="brand" className="overflow-hidden shadow-[0_30px_70px_rgba(11,29,61,0.18)]">
          <CardContent className="relative grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(245,195,74,0.16),transparent_42%)] lg:block" />
            <div className="relative">
              <Badge className="border-white/10 bg-white/10 text-white">Visao geral Orien</Badge>
              <h2 data-brand-display="true" className="mt-4 text-4xl font-semibold text-white">
                Operacao comercial, estoque e caixa em uma leitura so.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/72">
                Este painel prioriza o que exige acao rapida: vendas do periodo, exposicao financeira e pontos de reposicao por loja.
              </p>
            </div>
            <div className="relative grid gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                <ExecutiveMetric label="Vendas hoje" value={summary?.salesToday ?? 0} icon={ShoppingCart} loading={loading} />
                <ExecutiveMetric label="Ticket medio" value={summary?.averageTicket ?? 0} money icon={CircleDollarSign} loading={loading} />
                <ExecutiveMetric
                  label="Saldo projetado"
                  value={(summary?.accountsReceivableOpen ?? 0) - (summary?.accountsPayableOpen ?? 0)}
                  money
                  icon={ArrowUpRight}
                  loading={loading}
                />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Resumo financeiro</p>
                <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">Posicao aberta</h2>
              </div>
              <Banknote className="text-[var(--brand-accent)]" size={22} />
            </div>
            <div className="grid gap-3">
                  <Metric label="A receber" value={summary?.accountsReceivableOpen ?? 0} money loading={loading} />
                  <Metric label="A pagar" value={summary?.accountsPayableOpen ?? 0} money loading={loading} />
              <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-secondary)]">Resultado projetado</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--brand-primary)]">
                  {loading
                    ? "..."
                    : ((summary?.accountsReceivableOpen ?? 0) - (summary?.accountsPayableOpen ?? 0)).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL"
                      })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.key}>
              <CardContent className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-[var(--brand-primary)]">
                    {loading ? "..." : summary ? summary[card.key] : 0}
                  </p>
                </div>
                <div className={iconToneClass(card.tone)}>
                  <Icon size={22} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Performance comercial</p>
                <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">Ritmo de vendas do tenant</h2>
                <p className="text-sm text-slate-500">Indicadores centrais para acompanhar o desempenho da operacao.</p>
              </div>
              <Badge>Fase 1</Badge>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Metric label="Vendas hoje" value={summary?.salesToday ?? 0} loading={loading} />
              <Metric label="Vendas mes" value={summary?.salesMonth ?? 0} loading={loading} />
              <Metric label="Ticket medio" value={summary?.averageTicket ?? 0} money loading={loading} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center gap-3">
              <Banknote className="text-[var(--brand-accent)]" size={22} />
              <h2 className="text-base font-semibold text-[var(--brand-primary)]">Exposicao financeira</h2>
            </div>
            <div className="mt-6 grid gap-3">
              <Metric label="A receber" value={summary?.accountsReceivableOpen ?? 0} money loading={loading} />
              <Metric label="A pagar" value={summary?.accountsPayableOpen ?? 0} money loading={loading} />
            </div>
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent><Metric label="Vendas no período" value={summary?.periodSales ?? 0} money loading={loading}/></CardContent></Card>
        <Card><CardContent><Metric label="Comparação anterior" value={summary?.salesVariationPercent ?? 0} loading={loading}/><p className="mt-2 text-xs text-slate-500">{summary?.salesVariationPercent==null?"Sem base no período anterior":"Variação percentual"}</p></CardContent></Card>
        <Card><CardContent><Metric label="Previsão de caixa" value={summary?.cashForecast ?? 0} money loading={loading}/></CardContent></Card>
        <Card><CardContent><Metric label="Meta atingida" value={summary?.goalProgressPercent ?? 0} loading={loading}/><p className="mt-2 text-xs text-slate-500">Meta {Number(summary?.salesGoal??0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</p></CardContent></Card>
      </section>
      <Card><CardContent><form className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto] md:items-end" onSubmit={(event)=>void saveGoal(event)}><Select name="branchId" label="Loja da meta" options={branches.map((branch)=>({label:branch.name,value:branch.id}))} required/><Input name="salesTarget" label="Meta de vendas do período" type="number" step="0.01" required/><Button type="submit">Salvar meta</Button></form></CardContent></Card>
    </div>
  );
}

function Metric({ label, value, money = false, loading = false }: { label: string; value: number; money?: boolean; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-secondary)]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">
        {loading ? "..." : money ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : value}
      </p>
    </div>
  );
}

function ExecutiveMetric({
  label,
  value,
  money = false,
  icon: Icon,
  loading = false
}: {
  label: string;
  value: number;
  money?: boolean;
  icon: LucideIcon;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.08] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/68">{label}</p>
        <Icon size={16} className="text-[var(--brand-accent)]" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">
        {loading ? "..." : money ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : value}
      </p>
    </div>
  );
}

function iconToneClass(tone: "primary" | "secondary" | "highlight" | "accent") {
  const base = "flex h-11 w-11 items-center justify-center rounded-xl";
  switch (tone) {
    case "secondary":
      return `${base} bg-[rgba(19,58,124,0.10)] text-[var(--brand-secondary)]`;
    case "highlight":
      return `${base} bg-[rgba(37,99,235,0.10)] text-[var(--brand-highlight)]`;
    case "accent":
      return `${base} bg-[rgba(245,195,74,0.18)] text-[#c78b07]`;
    default:
      return `${base} bg-[rgba(11,29,61,0.08)] text-[var(--brand-primary)]`;
  }
}
