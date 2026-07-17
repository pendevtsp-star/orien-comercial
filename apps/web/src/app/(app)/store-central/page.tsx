"use client";

import { Badge, Button, Card, CardContent, DataTable, EmptyState, PageHeader } from "@sgc/ui";
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
import { apiFetch, setBranchScopeId } from "../../../lib/api";

interface OperationalStatus {
  counts: {
    branches: number;
    products: number;
    customers: number;
    operators: number;
    activeOperators: number;
    openCash: number;
    criticalStock: number;
    overdueReceivables: number;
    pendingTasks: number;
    integrationErrors: number;
    lowMarginProducts: number;
  };
  checklist: Array<{ key: string; label: string; done: boolean; href: string }>;
  progressPercent: number;
  nextAction: { label: string; href: string } | null;
  actionItems: Array<{ severity: "info" | "warning"; title: string; detail: string; href: string }>;
}

interface Summary {
  salesToday: number;
  accountsReceivableOpen: number;
  accountsPayableOpen: number;
  cashForecast: number;
  health: {
    purchaseSuggestions: Array<{
      name: string;
      suggestedQuantity: string;
      estimatedInvestment: string;
      marginPercent: string;
    }>;
  };
}

interface BranchOverview {
  id: string;
  branchId: string;
  name: string;
  salesToday: string;
  openCash: string;
  criticalStock: string;
  overdueReceivables: string;
  pendingTasks: string;
  activeOperators: string;
  monthlyMargin: string;
}
interface OperationalTask {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "normal" | "high" | "critical";
  status: string;
  branchName: string | null;
  assigneeName: string | null;
  dueAt: string | null;
}

export default function StoreCentralPage() {
  const [status, setStatus] = useState<OperationalStatus | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [branchesOverview, setBranchesOverview] = useState<BranchOverview[]>([]);
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [statusResult, summaryResult, branchesResult, tasksResult] = await Promise.all([
        apiFetch<OperationalStatus>("/dashboard/operational-status"),
        apiFetch<Summary>("/dashboard/summary"),
        apiFetch<{ data: BranchOverview[] }>("/dashboard/branch-overview", {
          headers: { "x-orien-branch-scope": "all" },
        }),
        apiFetch<{ data: OperationalTask[] }>("/tasks?status=open"),
      ]);
      setStatus(statusResult);
      setSummary(summaryResult);
      setBranchesOverview(
        branchesResult.data.map((branch) => ({ ...branch, id: branch.branchId })),
      );
      setTasks(tasksResult.data.slice(0, 6));
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
    {
      title: "Margem sob revisão",
      value: status?.counts.lowMarginProducts ?? 0,
      detail: "produto(s) sem margem positiva",
      href: "/products",
      icon: AlertTriangle,
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
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

      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--brand-secondary)]">
                Visão multi-loja
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--brand-primary)]">
                Compare a saúde de cada unidade antes de decidir.
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Vendas, caixa, ruptura, recebíveis e margem do mês em uma única leitura.
              </p>
            </div>
            <Badge>{branchesOverview.length} loja(s) acompanhada(s)</Badge>
          </div>
          <DataTable
            rows={branchesOverview}
            empty="Cadastre a primeira loja para liberar a comparação operacional."
            columns={[
              { key: "name", header: "Loja", render: (row) => <strong>{row.name}</strong> },
              {
                key: "salesToday",
                header: "Vendas hoje",
                render: (row) =>
                  Number(row.salesToday).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }),
              },
              {
                key: "cash",
                header: "Caixa",
                render: (row) =>
                  Number(row.openCash) ? <Badge>Aberto</Badge> : <Badge>Fechado</Badge>,
              },
              {
                key: "attention",
                header: "Atenção",
                render: (row) => {
                  const count =
                    Number(row.criticalStock) +
                    Number(row.overdueReceivables) +
                    Number(row.pendingTasks);
                  return count ? (
                    <Badge>{count} pendência(s)</Badge>
                  ) : (
                    <span className="text-sm text-emerald-700">Em dia</span>
                  );
                },
              },
              {
                key: "margin",
                header: "Margem no mês",
                render: (row) =>
                  Number(row.monthlyMargin).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }),
              },
              { key: "operators", header: "Operadores", render: (row) => row.activeOperators },
              {
                key: "action",
                header: "Ação",
                render: (row) => (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setBranchScopeId(row.branchId);
                      window.location.reload();
                    }}
                  >
                    Ver operação
                  </Button>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--brand-secondary)]">Execução</p>
              <h2 className="mt-1 font-semibold text-[var(--brand-primary)]">Pendências com responsável e prazo</h2>
              <p className="mt-1 text-sm text-slate-500">Alertas críticos viram tarefas rastreáveis para que o gerente não dependa de memória ou mensagens dispersas.</p>
            </div>
            <Link href="/tasks"><Button variant="secondary">Abrir centro de tarefas</Button></Link>
          </div>
          {tasks.length ? (
            <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <strong className="text-sm text-[var(--brand-primary)]">{task.title}</strong>
                    <Badge>{task.priority === "critical" ? "Crítica" : task.priority === "high" ? "Alta" : "Normal"}</Badge>
                  </div>
                  {task.description ? <p className="mt-2 text-xs leading-5 text-slate-500">{task.description}</p> : null}
                  <p className="mt-3 text-xs text-slate-500">{task.branchName ?? "Empresa toda"} · {task.assigneeName ?? "Sem responsável"}{task.dueAt ? ` · vence ${new Date(task.dueAt).toLocaleDateString("pt-BR")}` : ""}</p>
                </div>
              ))}
            </div>
          ) : <p className="rounded-md border border-dashed border-[var(--brand-border)] p-4 text-sm text-slate-500">Nenhuma pendência aberta. As ações geradas por alertas aparecerão aqui com prioridade, loja e responsável.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--brand-secondary)]">
                Próximas ações
              </p>
              <h2 className="mt-1 font-semibold text-[var(--brand-primary)]">
                O que pede decisão agora
              </h2>
            </div>
            <Badge>{status?.actionItems.length ?? 0} prioridade(s)</Badge>
          </div>
          {status?.actionItems.length ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {status.actionItems.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className={`rounded-md border p-3 transition hover:-translate-y-0.5 ${item.severity === "warning" ? "border-amber-200 bg-amber-50" : "border-[var(--brand-border)] bg-[var(--brand-surface)]"}`}
                >
                  <strong className="block text-sm text-[var(--brand-primary)]">
                    {item.title}
                  </strong>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">{item.detail}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              eyebrow="Rotina em dia"
              title="Nenhuma ação crítica agora."
              description="A Central avisará quando caixa, estoque, contas ou compras pedirem atenção."
              icon={<ClipboardList size={20} />}
            />
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-3">
              <Store className="text-[var(--brand-secondary)]" size={22} />
              <h2 className="font-semibold text-[var(--brand-primary)]">Base operacional</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <MiniStat label="Lojas" value={status?.counts.branches ?? 0} icon={Store} />
              <MiniStat label="Produtos" value={status?.counts.products ?? 0} icon={Boxes} />
              <MiniStat label="Clientes" value={status?.counts.customers ?? 0} icon={UsersRound} />
              <MiniStat
                label="Operadores ativos"
                value={status?.counts.activeOperators ?? 0}
                icon={UsersRound}
              />
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
                    <span className="shrink-0 text-right text-xs text-slate-500">
                      <span className="block">
                        repor {Number(item.suggestedQuantity).toLocaleString("pt-BR")}
                      </span>
                      <span className="block">
                        investir{" "}
                        {Number(item.estimatedInvestment).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </span>
                      <span className="block">margem {Number(item.marginPercent).toFixed(1)}%</span>
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
      <p
        className={`mt-2 text-2xl font-semibold ${accent ? "text-[var(--brand-accent)]" : "text-white"}`}
      >
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
      <p className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--brand-primary)]">{value}</p>
    </div>
  );
}
