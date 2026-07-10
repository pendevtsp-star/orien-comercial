"use client";

import { Badge, Button, Card, CardContent, DataTable, EmptyState, Input, PageHeader, Select } from "@sgc/ui";
import { CircleDollarSign, CreditCard, Receipt, RefreshCw, ShieldCheck, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface SubscriptionResponse {
  subscription: {
    id: string;
    status: string;
    checkoutUrl?: string | null;
    currentPeriodEndsAt?: string | null;
    planSlug?: string | null;
    planName?: string | null;
    priceCents?: number | null;
  } | null;
  plans: Array<{ id: string; slug: string; name: string; priceCents: number }>;
  invoices: Array<{ id: string; amount: string; dueDate?: string | null; status: string; invoiceUrl?: string | null }>;
  provider: { env: string };
}

export default function SubscriptionPage() {
  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("all");

  async function load() {
    setError(null);
    setLoading(true);
    try {
      setData(await apiFetch<SubscriptionResponse>("/subscriptions/current"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar assinatura.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredInvoices = useMemo(() => {
    return (data?.invoices ?? []).filter((invoice) => {
      const matchesStatus = invoiceStatus === "all" ? true : invoice.status === invoiceStatus;
      const matchesSearch = invoiceSearch
        ? `${invoice.id} ${invoice.status}`.toLowerCase().includes(invoiceSearch.toLowerCase())
        : true;
      return matchesStatus && matchesSearch;
    });
  }, [data?.invoices, invoiceSearch, invoiceStatus]);

  async function startCheckout(planSlug: string) {
    try {
      const response = await apiFetch<{ checkoutUrl?: string }>("/subscriptions/checkout", {
        method: "POST",
        body: JSON.stringify({ planSlug, billingType: "PIX" })
      });
      await load();
      if (response.checkoutUrl) {
        window.open(response.checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao iniciar checkout.");
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Minha assinatura"
        description="Assinatura SaaS via Asaas sandbox, checkout inicial e historico de cobranca."
        actions={
          <Button variant="secondary" onClick={() => void load()} icon={<RefreshCw size={16} />}>
            Atualizar dados
          </Button>
        }
      />
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SubscriptionMetric title="Plano atual" value={loading ? "..." : data?.subscription?.planName ?? "Trial"} detail="Camada contratada no momento" icon={CreditCard} />
        <SubscriptionMetric title="Status" value={loading ? "..." : data?.subscription?.status ?? "trial"} detail="Estado atual da assinatura" icon={ShieldCheck} />
        <SubscriptionMetric
          title="Mensalidade"
          value={
            loading
              ? "..."
              : data?.subscription?.priceCents
              ? (data.subscription.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : "R$ 0,00"
          }
          detail="Preco atual da recorrencia"
          icon={CircleDollarSign}
        />
        <SubscriptionMetric title="Cobrancas" value={(data?.invoices ?? []).length} detail="Historico carregado do tenant" icon={Receipt} accent />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card variant="brand" className="overflow-hidden shadow-[0_28px_64px_rgba(11,29,61,0.18)]">
          <CardContent className="grid gap-4 p-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="flex items-center justify-between">
              <div>
                <Badge className="border-white/10 bg-white/10 text-white">Minha assinatura</Badge>
                <h2 data-brand-display="true" className="mt-4 text-3xl font-semibold text-white">
                  Controle da recorrencia SaaS com checkout e historico no mesmo fluxo.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
                  A tela acompanha ambiente, plano, proxima renovacao e cobrancas em uma leitura unica para o tenant.
                </p>
              </div>
              <Badge className="border-white/10 bg-white/10 text-white">{loading ? "carregando" : data?.subscription?.status ?? "trial"}</Badge>
            </div>
            <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/6 p-4 text-sm text-white/78">
              <p>
                Ambiente do provedor: <span className="font-medium text-white">{data?.provider.env ?? "sandbox"}</span>
              </p>
              <p>
                Plano atual: <span className="font-medium text-white">{data?.subscription?.planName ?? "Trial"}</span>
              </p>
              <p>
                Renovacao:{" "}
                <span className="font-medium text-white">
                  {data?.subscription?.currentPeriodEndsAt
                    ? new Date(data.subscription.currentPeriodEndsAt).toLocaleDateString("pt-BR")
                    : "nao definida"}
                </span>
              </p>
              {data?.subscription?.checkoutUrl ? (
                <a className="text-sm font-medium text-[var(--brand-accent)] underline" href={data.subscription.checkoutUrl} target="_blank" rel="noreferrer">
                  Abrir checkout atual
                </a>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="text-[var(--brand-accent)]" size={18} />
              <h2 className="text-base font-semibold text-[var(--brand-primary)]">Planos disponiveis</h2>
            </div>
            {(data?.plans ?? []).map((plan) => {
              const isCurrentPlan = data?.subscription?.planSlug === plan.slug;
              return (
              <div key={plan.id} className="flex flex-col gap-3 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--brand-primary)]">{plan.name}</p>
                  <p className="text-sm text-slate-500">
                    {(plan.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mes
                  </p>
                </div>
                <Button className="w-full sm:w-auto" disabled={loading || isCurrentPlan} onClick={() => void startCheckout(plan.slug)}>
                  {isCurrentPlan ? "Plano atual" : "Iniciar checkout"}
                </Button>
              </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Historico financeiro</p>
              <h2 className="text-base font-semibold text-[var(--brand-primary)]">Cobrancas</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
              <Input
                aria-label="Buscar cobrancas"
                placeholder="Buscar por id ou status"
                value={invoiceSearch}
                onChange={(event) => setInvoiceSearch(event.target.value)}
              />
              <Select
                aria-label="Filtrar cobrancas por status"
                value={invoiceStatus}
                onChange={(event) => setInvoiceStatus(event.target.value)}
                options={[
                  { label: "Todos os status", value: "all" },
                  { label: "Pendentes", value: "pending" },
                  { label: "Pagas", value: "paid" },
                  { label: "Vencidas", value: "overdue" },
                  { label: "Canceladas", value: "cancelled" }
                ]}
              />
            </div>
          </div>
          <DataTable
            rows={filteredInvoices.map((invoice) => ({ ...invoice, id: invoice.id }))}
            empty={
              <EmptyState
                eyebrow="Historico de cobranca"
                title="Nenhuma cobranca registrada."
                description="Quando a assinatura gerar cobrancas no provedor, elas aparecerao aqui com vencimento, status e link."
                icon={<Receipt size={20} />}
              />
            }
            columns={[
              { key: "dueDate", header: "Vencimento", render: (row) => (row.dueDate ? new Date(`${row.dueDate}T00:00:00`).toLocaleDateString("pt-BR") : "-") },
              {
                key: "amount",
                header: "Valor",
                render: (row) => Number(row.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              },
              { key: "status", header: "Status", render: (row) => <Badge>{row.status}</Badge> },
              {
                key: "link",
                header: "Link",
                render: (row) => (row.invoiceUrl ? <a className="underline" href={row.invoiceUrl} target="_blank" rel="noreferrer">Fatura</a> : "-")
              }
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SubscriptionMetric({
  title,
  value,
  detail,
  icon: Icon,
  accent = false
}: {
  title: string;
  value: number | string;
  detail: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--brand-primary)]">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{detail}</p>
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            accent ? "bg-[rgba(245,195,74,0.18)] text-[#c78b07]" : "bg-[rgba(19,58,124,0.10)] text-[var(--brand-secondary)]"
          }`}
        >
          <Icon size={20} />
        </div>
      </CardContent>
    </Card>
  );
}
