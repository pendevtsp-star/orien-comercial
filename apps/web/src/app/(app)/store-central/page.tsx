"use client";

import { Badge, Button, Card, CardContent, EmptyState, PageHeader } from "@sgc/ui";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  CalendarCheck2,
  ClipboardList,
  RefreshCw,
  Store,
  UsersRound,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface OperationalStatus {
  counts: {
    branches: number;
    products: number;
    customers: number;
    operators: number;
    openCash: number;
    criticalStock: number;
    overdueReceivables: number;
    pendingTasks: number;
    integrationErrors: number;
  };
  checklist: Array<{ key: string; label: string; done: boolean; href: string }>;
  progressPercent: number;
  nextAction: { label: string; href: string } | null;
}

interface Summary {
  salesToday: number;
  accountsReceivableOpen: number;
  accountsPayableOpen: number;
  cashForecast: number;
  health: { purchaseSuggestions: Array<{ name: string; suggestedQuantity: string }> };
}

export default function StoreCentralPage() {
  const [status, setStatus] = useState<OperationalStatus | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [statusResult, summaryResult] = await Promise.all([
        apiFetch<OperationalStatus>("/dashboard/operational-status"),
        apiFetch<Summary>("/dashboard/summary"),
      ]);
      setStatus(statusResult);
      setSummary(summaryResult);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a central.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const blockers = [
    {
      title: "Caixa",
      value: status?.counts.openCash ?? 0,
      detail: "caixa(s) aberto(s)",
      href: "/pos",
      icon: Banknote,
    },
    {
      title: "Estoque crítico",
      value: status?.counts.criticalStock ?? 0,
      detail: "produto(s) abaixo do mínimo",
      href: "/stock",
      icon: AlertTriangle,
    },
    {
      title: "Contas vencendo",
      value: status?.counts.overdueReceivables ?? 0,
      detail: "recebível(is) vencido(s)",
      href: "/financial",
      icon: CalendarCheck2,
    },
    {
      title: "Tarefas",
      value: status?.counts.pendingTasks ?? 0,
      detail: "pendência(s) operacionais",
      href: "/tasks",
      icon: ClipboardList,
    },
    {
      title: "Integrações",
      value: status?.counts.integrationErrors ?? 0,
      detail: "conector(es) com erro",
      href: "/integrations",
      icon: ShieldAlert,
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Operação de hoje"
        description="Acompanhe a rotina da loja: caixa, vendas do dia, estoque crítico e pendências que pedem ação."
        actions={
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void load()}>
            Atualizar central
          </Button>
        }
      />
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4">
        <Card variant="brand">
          <CardContent className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <Badge className="w-fit border-white/10 bg-white/10 text-white">
              Rotina do gerente
            </Badge>
            <div>
              <h2 data-brand-display="true" className="text-2xl font-semibold text-white">
                Resolva o que impacta a loja agora.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
                Comece pelo caixa, resolva rupturas, confira contas abertas e conclua tarefas antes
                de encerrar a operação da loja.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[480px]">
              <Figure label="Vendas hoje" value={summary?.salesToday ?? 0} loading={loading} />
              <Figure
                label="A receber"
                value={(summary?.accountsReceivableOpen ?? 0).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
                loading={loading}
              />
              <Figure
                label="Previsão"
                value={(summary?.cashForecast ?? 0).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
                loading={loading}
                accent
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {blockers.map((item) => {
          const Icon = item.icon;
          return (
            <Link href={item.href} key={item.title}>
              <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-lg">
                <CardContent className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-500">{item.title}</p>
                    <p className="mt-2 text-3xl font-semibold text-[var(--brand-primary)]">
                      {loading ? "..." : item.value}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{item.detail}</p>
                  </div>
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--brand-surface)] text-[var(--brand-secondary)]">
                    <Icon size={20} />
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-3">
              <Store className="text-[var(--brand-secondary)]" size={22} />
              <h2 className="font-semibold text-[var(--brand-primary)]">Base operacional</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat label="Lojas" value={status?.counts.branches ?? 0} icon={Store} />
              <MiniStat label="Produtos" value={status?.counts.products ?? 0} icon={Boxes} />
              <MiniStat label="Clientes" value={status?.counts.customers ?? 0} icon={UsersRound} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <h2 className="font-semibold text-[var(--brand-primary)]">Sugestões de compra</h2>
            <div className="mt-4 grid gap-2">
              {summary?.health.purchaseSuggestions.length ? (
                summary.health.purchaseSuggestions.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-3 rounded-md bg-[var(--brand-surface)] p-3 text-sm"
                  >
                    <strong className="truncate">{item.name}</strong>
                    <span className="shrink-0 text-slate-500">
                      sugerir {Number(item.suggestedQuantity).toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))
              ) : (
                <EmptyState
                  eyebrow="Reposição"
                  title="Nenhuma compra sugerida."
                  description="Produtos abaixo do mínimo aparecerão aqui para orientar o gerente."
                  icon={<Boxes size={20} />}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
  loading,
  accent,
}: {
  label: string;
  value: string | number;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.08] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/68">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent ? "text-[var(--brand-accent)]" : "text-white"}`}>
        {loading ? "..." : value}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Store;
}) {
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
      <Icon size={18} className="text-[var(--brand-secondary)]" />
      <p className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-[var(--brand-primary)]">{value}</p>
    </div>
  );
}
