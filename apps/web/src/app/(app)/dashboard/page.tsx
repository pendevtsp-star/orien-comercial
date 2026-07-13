"use client";

import { Badge, Button, Card, CardContent, EmptyState, Input, PageHeader, Select } from "@sgc/ui";
import {
  AlertCircle,
  ArrowUpRight,
  Banknote,
  Boxes,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ShoppingCart,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
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
  roleFocus: string;
  sellerCommission: number;
  health: {
    grossMargin: number;
    stockTurnover: number;
    overdueReceivables: number;
    stockoutRisk: number;
    purchaseSuggestions: Array<{ name: string; quantity: string; minStock: string; suggestedQuantity: string }>;
  };
  salesHistory: Array<{ date: string; total: string }>;
  branchGoals: Array<{ branchId: string; name: string; target: string; sales: string }>;
}

interface OperationalStatus {
  counts: {
    openCash: number;
    criticalStock: number;
    overdueReceivables: number;
    pendingTasks: number;
  };
  checklist: Array<{ key: string; label: string; done: boolean; autoDone?: boolean; href: string }>;
  progressPercent: number;
  nextAction: { label: string; href: string } | null;
  onboarding?: { dismissed: boolean; completedKeys: string[] };
}

interface AbcItem {
  id: string;
  name: string;
  revenue: string;
  class: "A" | "B" | "C";
  suggestion: string;
}

type ChecklistItem = { key: string; label: string; done: boolean; autoDone?: boolean; href: string };

const onboardingFallback: ChecklistItem[] = [
  { key: "branch", label: "Cadastrar loja", done: false, href: "/branches" },
  { key: "products", label: "Cadastrar produtos", done: false, href: "/products" },
  { key: "customers", label: "Cadastrar clientes", done: false, href: "/customers" },
  { key: "operator", label: "Convidar operador", done: false, href: "/team" },
  { key: "stock", label: "Informar estoque inicial", done: false, href: "/stock" },
  { key: "sale", label: "Realizar venda teste", done: false, href: "/pos" },
];

const cards = [
  { key: "branches", label: "Lojas ativas", icon: Building2, tone: "secondary", href: "/branches" },
  { key: "products", label: "Produtos", icon: Boxes, tone: "primary", href: "/products" },
  { key: "customers", label: "Clientes", icon: UsersRound, tone: "highlight", href: "/customers" },
  { key: "lowStockProducts", label: "Alerta de estoque", icon: AlertCircle, tone: "accent", href: "/stock" },
] as const;

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<OperationalStatus | null>(null);
  const [abc, setAbc] = useState<AbcItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(today);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSummary(
        await apiFetch<Summary>(`/dashboard/summary?startDate=${startDate}&endDate=${endDate}`),
      );
      void apiFetch<{ data: AbcItem[] }>("/operations/analytics/abc")
        .then((result) => setAbc(result.data))
        .catch(() => setAbc([]));
      void apiFetch<OperationalStatus>("/dashboard/operational-status")
        .then(setStatus)
        .catch(() => {
          setStatus({
            counts: { openCash: 0, criticalStock: 0, overdueReceivables: 0, pendingTasks: 0 },
            checklist: onboardingFallback,
            progressPercent: 0,
            nextAction: onboardingFallback[0] ?? null,
          });
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void apiFetch<{ data: Array<{ id: string; name: string }> }>(
      "/branches?pageSize=100&isActive=true",
    ).then((result) => setBranches(result.data));
  }, []);

  useEffect(() => {
    if (!status || status.progressPercent >= 100) return;
    if (!status.onboarding?.dismissed) setShowSetupWizard(true);
  }, [status]);

  async function saveOnboarding(input: { dismissed?: boolean; completedKeys?: string[] }) {
    const result = await apiFetch<OperationalStatus>("/dashboard/onboarding", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    setStatus(result);
    return result;
  }

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/dashboard/goals", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          periodStart: startDate,
          periodEnd: endDate,
          salesTarget: Number(form.get("salesTarget") || 0),
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar meta.");
    }
  }

  return (
    <div className="grid gap-6">
      {showSetupWizard ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
          <section className="w-full max-w-2xl rounded-2xl border border-[var(--brand-border)] bg-white p-6 shadow-2xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">
                  Primeiro acesso
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-primary)]">
                  Vamos deixar a operação pronta para vender.
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Complete os passos principais. A Orien libera o painel aos poucos, mas este
                  roteiro evita loja sem produto, produto sem estoque ou venda sem operador.
                </p>
              </div>
              <Badge>{status?.progressPercent ?? 0}% concluído</Badge>
            </div>
            <div className="mt-5 grid gap-2">
              {(status?.checklist?.length ? status.checklist : onboardingFallback).map((item) => (
                <div
                  key={item.key}
                  className="flex flex-col gap-3 rounded-md border border-[var(--brand-border)] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-[var(--brand-primary)]">{item.label}</span>
                    <p className="text-xs text-slate-500">
                      {item.autoDone ? "Concluído pelos dados do tenant." : item.done ? "Marcado como concluído." : "Pendente para operação real."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{item.done ? "feito" : "pendente"}</Badge>
                    {!item.done ? (
                      <Button
                        variant="ghost"
                        onClick={() => void saveOnboarding({ completedKeys: [item.key] })}
                      >
                        Marcar feito
                      </Button>
                    ) : null}
                    <Link
                      href={item.href}
                      className="inline-flex min-h-9 items-center rounded-md border border-[var(--brand-border)] px-3 text-xs font-medium text-[var(--brand-primary)]"
                      onClick={() => setShowSetupWizard(false)}
                    >
                      Abrir
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  void saveOnboarding({ dismissed: true }).then(() => setShowSetupWizard(false));
                }}
              >
                Continuar depois
              </Button>
              <Button
                onClick={() => {
                  const next = status?.nextAction ?? onboardingFallback.find((item) => !item.done);
                  if (next) window.location.href = next.href;
                }}
              >
                Começar próxima etapa
              </Button>
            </div>
          </section>
        </div>
      ) : null}
      <PageHeader
        title="Visão estratégica"
        description="Acompanhe crescimento, margem, metas e decisões de compra sem misturar a rotina do caixa."
        actions={
          <div className="grid gap-2 sm:grid-cols-[150px_150px_auto]">
            <Input
              aria-label="Data inicial"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
            <Input
              aria-label="Data final"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
            <Button variant="secondary" onClick={() => void load()}>
              Aplicar período
            </Button>
          </div>
        }
      />
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {!loading && !summary && !error ? (
        <EmptyState
          eyebrow="Resumo executivo"
          title="Sem dados suficientes para o dashboard."
          description="Assim que vendas, financeiro e estoque tiverem movimentacao, os indicadores principais aparecerao aqui."
          icon={<AlertCircle size={20} />}
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card
          data-dashboard-widget="executive"
          variant="brand"
          className="overflow-hidden"
        >
          <CardContent className="relative grid gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="relative">
              <Badge className="border-white/10 bg-white/10 text-white">Leitura executiva</Badge>
              <h2 data-brand-display="true" className="mt-3 text-2xl font-semibold text-white">
                Decisões melhores a partir do que sua operação já registrou.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/72">
                Compare períodos, acompanhe metas e identifique o que merece atenção estratégica.
              </p>
            </div>
            <div className="relative grid gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
              <ExecutiveMetric
                label="Vendas hoje"
                value={summary?.salesToday ?? 0}
                icon={ShoppingCart}
                loading={loading}
              />
              <ExecutiveMetric
                label="Ticket medio"
                value={summary?.averageTicket ?? 0}
                money
                icon={CircleDollarSign}
                loading={loading}
              />
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

        <Card data-dashboard-widget="financial">
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">
                  Resumo financeiro
                </p>
                <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">
                  Posicao aberta
                </h2>
              </div>
              <Banknote className="text-[var(--brand-accent)]" size={22} />
            </div>
            <div className="grid gap-3">
              <Metric
                label="A receber"
                value={summary?.accountsReceivableOpen ?? 0}
                money
                loading={loading}
              />
              <Metric
                label="A pagar"
                value={summary?.accountsPayableOpen ?? 0}
                money
                loading={loading}
              />
              <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-secondary)]">
                  Resultado projetado
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--brand-primary)]">
                  {loading
                    ? "..."
                    : (
                        (summary?.accountsReceivableOpen ?? 0) - (summary?.accountsPayableOpen ?? 0)
                      ).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardContent className="grid gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">
                  Onboarding guiado
                </p>
                <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">
                  Implantação da operação
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Checklist mínimo para deixar o tenant pronto para uma venda real.
                </p>
              </div>
              <Badge>{status?.progressPercent ?? 0}% concluído</Badge>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--brand-surface)]">
              <div
                className="h-full rounded-full bg-[var(--brand-highlight)] transition-all"
                style={{ width: `${status?.progressPercent ?? 0}%` }}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(status?.checklist?.length ? status.checklist : onboardingFallback).map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    item.done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-[var(--brand-border)] bg-white text-[var(--brand-primary)] hover:bg-[var(--brand-surface)]"
                  }`}
                >
                  <CheckCircle2
                    size={16}
                    className={item.done ? "text-emerald-700" : "text-slate-400"}
                  />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  <span className="text-xs font-medium">
                    {item.done ? "feito" : "pendente"}
                  </span>
                </Link>
              ))}
            </div>
            {(status?.nextAction ?? onboardingFallback.find((item) => !item.done)) ? (
              <Link
                href={(status?.nextAction ?? onboardingFallback.find((item) => !item.done))!.href}
                className="inline-flex min-h-10 w-fit items-center rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white"
              >
                Próxima ação: {(status?.nextAction ?? onboardingFallback.find((item) => !item.done))!.label}
              </Link>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">
                Curva ABC
              </p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">
                Produtos que sustentam o faturamento
              </h2>
            </div>
            <div className="grid gap-2">
              {abc.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--brand-border)] px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-medium text-[var(--brand-primary)]">{item.name}</span>
                  <span className="flex shrink-0 items-center gap-2"><Badge>Classe {item.class}</Badge><strong>{Number(item.revenue).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></span>
                </div>
              ))}
              {!abc.length ? <p className="text-sm text-slate-500">Registre vendas para classificar os produtos por relevância.</p> : null}
            </div>
            <Link href="/stock" className="text-sm font-medium text-[var(--brand-secondary)]">Abrir análise de estoque</Link>
          </CardContent>
        </Card>
      </section>

      <div data-dashboard-widget="indicators" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.key} href={card.href} className="block">
              <Card className="transition hover:-translate-y-0.5 hover:shadow-lg">
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
            </Link>
          );
        })}
      </div>
      <section data-dashboard-widget="performance" className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">
                  Performance comercial
                </p>
                <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">
                  Ritmo de vendas do tenant
                </h2>
                <p className="text-sm text-slate-500">
                  Indicadores centrais para acompanhar o desempenho da operacao.
                </p>
              </div>
              <Badge>Fase 1</Badge>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Metric label="Vendas hoje" value={summary?.salesToday ?? 0} loading={loading} />
              <Metric label="Vendas mes" value={summary?.salesMonth ?? 0} loading={loading} />
              <Metric
                label="Ticket medio"
                value={summary?.averageTicket ?? 0}
                money
                loading={loading}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center gap-3">
              <Banknote className="text-[var(--brand-accent)]" size={22} />
              <h2 className="text-base font-semibold text-[var(--brand-primary)]">
                Exposicao financeira
              </h2>
            </div>
            <div className="mt-6 grid gap-3">
              <Metric
                label="A receber"
                value={summary?.accountsReceivableOpen ?? 0}
                money
                loading={loading}
              />
              <Metric
                label="A pagar"
                value={summary?.accountsPayableOpen ?? 0}
                money
                loading={loading}
              />
            </div>
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card data-dashboard-widget="role-focus">
          <CardContent className="grid gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Seu foco hoje</p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">{roleFocus(summary?.roleFocus)}</h2>
              <p className="mt-1 text-sm text-slate-500">{roleDescription(summary?.roleFocus)}</p>
            </div>
            {summary?.roleFocus === "seller" || summary?.roleFocus === "sales" ? <Metric label="Comissão no período" value={summary.sellerCommission} money loading={loading} /> : null}
            {summary?.roleFocus === "manager" ? <Metric label="Estoque crítico na loja" value={summary.health.stockoutRisk} loading={loading} /> : null}
            {summary?.roleFocus === "owner" || summary?.roleFocus === "admin" ? <Metric label="Margem bruta no período" value={summary.health.grossMargin} money loading={loading} /> : null}
          </CardContent>
        </Card>
        <Card data-dashboard-widget="health">
          <CardContent className="grid gap-4">
            <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Saúde operacional</p><h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">Risco e sugestão de compra</h2></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Margem" value={summary?.health.grossMargin ?? 0} money loading={loading} />
              <Metric label="Giro de estoque" value={`${(summary?.health.stockTurnover ?? 0).toFixed(2)}x`} loading={loading} />
              <Metric label="Inadimplência" value={summary?.health.overdueReceivables ?? 0} money loading={loading} />
            </div>
            <div className="grid divide-y divide-[var(--brand-border)] rounded-md border border-[var(--brand-border)]">
              {summary?.health.purchaseSuggestions.length ? summary.health.purchaseSuggestions.map((item) => <div className="flex items-center justify-between gap-3 p-3 text-sm" key={item.name}><span className="truncate font-medium">{item.name}</span><span className="shrink-0 text-slate-500">Sugerir {Number(item.suggestedQuantity).toLocaleString("pt-BR")}</span></div>) : <p className="p-3 text-sm text-slate-500">Nenhum produto em ponto de reposição.</p>}
            </div>
          </CardContent>
        </Card>
      </section>
      <section data-dashboard-widget="performance" className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card><CardContent><div><p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Histórico do período</p><h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">Vendas dia a dia</h2></div><div className="mt-5 flex h-40 items-end gap-1.5">{(summary?.salesHistory ?? []).map((point) => { const max=Math.max(1,...(summary?.salesHistory ?? []).map((item)=>Number(item.total))); const height=Math.max(4,(Number(point.total)/max)*100); return <div key={point.date} title={`${new Date(`${point.date}T00:00:00`).toLocaleDateString("pt-BR")}: ${Number(point.total).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}`} className="group flex min-w-0 flex-1 flex-col justify-end"><div className="rounded-t bg-[var(--brand-highlight)] transition group-hover:bg-[var(--brand-accent)]" style={{height:`${height}%`}}/><span className="mt-2 truncate text-center text-[10px] text-slate-500">{point.date.slice(8)}</span></div>})}</div></CardContent></Card>
        <Card><CardContent><p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Metas por loja</p><h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">Acompanhamento das filiais</h2><div className="mt-4 grid gap-3">{(summary?.branchGoals ?? []).map((goal)=>{const percent=Number(goal.target)>0?Math.min(100,(Number(goal.sales)/Number(goal.target))*100):0;return <div key={goal.branchId}><div className="flex justify-between gap-2 text-sm"><span className="truncate">{goal.name}</span><span>{Number(goal.sales).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--brand-surface)]"><div className="h-full rounded-full bg-[var(--brand-highlight)]" style={{width:`${percent}%`}}/></div><p className="mt-1 text-xs text-slate-500">Meta {Number(goal.target).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</p></div>})}</div></CardContent></Card>
      </section>
      <section data-dashboard-widget="period" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent>
            <Metric
              label="Vendas no período"
              value={summary?.periodSales ?? 0}
              money
              loading={loading}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Metric
              label="Comparação anterior"
              value={summary?.salesVariationPercent ?? 0}
              loading={loading}
            />
            <p className="mt-2 text-xs text-slate-500">
              {summary?.salesVariationPercent == null
                ? "Sem base no período anterior"
                : "Variação percentual"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Metric
              label="Previsão de caixa"
              value={summary?.cashForecast ?? 0}
              money
              loading={loading}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Metric
              label="Meta atingida"
              value={summary?.goalProgressPercent ?? 0}
              loading={loading}
            />
            <p className="mt-2 text-xs text-slate-500">
              Meta{" "}
              {Number(summary?.salesGoal ?? 0).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
          </CardContent>
        </Card>
      </section>
      <Card data-dashboard-widget="goals">
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto] md:items-end"
            onSubmit={(event) => void saveGoal(event)}
          >
            <Select
              name="branchId"
              label="Loja da meta"
              options={branches.map((branch) => ({ label: branch.name, value: branch.id }))}
              required
            />
            <Input
              name="salesTarget"
              label="Meta de vendas do período"
              type="number"
              step="0.01"
              required
            />
            <Button type="submit">Salvar meta</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  money = false,
  loading = false,
}: {
  label: string;
  value: number | string;
  money?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-secondary)]">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">
        {loading
          ? "..."
          : money
            ? Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : value}
      </p>
    </div>
  );
}

function ExecutiveMetric({
  label,
  value,
  money = false,
  icon: Icon,
  loading = false,
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
        {loading
          ? "..."
          : money
            ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : value}
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

function roleFocus(role?: string) {
  if (role === "seller" || role === "sales") return "Metas e comissão";
  if (role === "manager") return "Loja, caixa e estoque";
  return "Visão consolidada do negócio";
}

function roleDescription(role?: string) {
  if (role === "seller" || role === "sales") return "Acompanhe seu ritmo de vendas, ticket e comissão do período.";
  if (role === "manager") return "Priorize divergências de caixa, reposição e operação da filial autorizada.";
  return "Leia margem, inadimplência, giro e reposição para orientar decisões de gestão.";
}
