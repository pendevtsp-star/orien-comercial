"use client";

import { Button, Card, CardContent, EmptyState, PageHeader } from "@sgc/ui";
import { BarChart3, Calendar, Clock, DollarSign, Download, FileCheck2, FileText, Landmark, PackageCheck, ShoppingCart, Users, Filter, ChevronDown, ChevronUp, PieChart, TrendingUp, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, downloadApiFile, openApiDocument } from "../../../lib/api";

type Tab = "executive-dashboard" | "overview" | "sales" | "financial" | "stock" | "billing" | "commission-by-payment" | "reconciliation-defasaged" | "seller-performance" | "monthly-consolidated" | "product-analysis" | "customer-analysis" | "cash-flow";
const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
  { id: "executive-dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "overview", label: "Resumo gerencial", icon: TrendingUp },
  { id: "sales", label: "Vendas", icon: ShoppingCart },
  { id: "financial", label: "Financeiro", icon: Landmark },
  { id: "stock", label: "Estoque", icon: PackageCheck },
  { id: "product-analysis", label: "Produtos", icon: PackageCheck },
  { id: "customer-analysis", label: "Clientes", icon: UserCheck },
  { id: "cash-flow", label: "Fluxo Caixa", icon: DollarSign },
  { id: "billing", label: "Faturamento", icon: FileCheck2 },
  { id: "commission-by-payment", label: "Comissões", icon: DollarSign },
  { id: "reconciliation-defasaged", label: "Conciliação", icon: Clock },
  { id: "seller-performance", label: "Vendedores", icon: Users },
  { id: "monthly-consolidated", label: "Consolidado", icon: Calendar },
];

type Branch = { id: string; name: string };
type Seller = { id: string; name: string };
type Customer = { id: string; name: string };
type Product = { id: string; name: string };

type DatePreset = { label: string; startDate: string; endDate: string };

function getDatePresets(): DatePreset[] {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const startOfQuarter = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  
  const lastWeekStart = new Date(today);
  lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
  const lastWeekEnd = new Date(today);
  lastWeekEnd.setDate(today.getDate() - today.getDay() - 1);
  
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  return [
    { label: "Hoje", startDate: todayStr, endDate: todayStr },
    { label: "Ontem", startDate: yesterday.toISOString().slice(0, 10), endDate: yesterday.toISOString().slice(0, 10) },
    { label: "Esta semana", startDate: startOfWeek.toISOString().slice(0, 10), endDate: todayStr },
    { label: "Semana passada", startDate: lastWeekStart.toISOString().slice(0, 10), endDate: lastWeekEnd.toISOString().slice(0, 10) },
    { label: "Este mês", startDate: startOfMonth.toISOString().slice(0, 10), endDate: todayStr },
    { label: "Mês passado", startDate: lastMonthStart.toISOString().slice(0, 10), endDate: lastMonthEnd.toISOString().slice(0, 10) },
    { label: "Este trimestre", startDate: startOfQuarter.toISOString().slice(0, 10), endDate: todayStr },
    { label: "Este ano", startDate: startOfYear.toISOString().slice(0, 10), endDate: todayStr },
    { label: "Últimos 30 dias", startDate: new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10), endDate: todayStr },
    { label: "Últimos 90 dias", startDate: new Date(today.getTime() - 89 * 86400000).toISOString().slice(0, 10), endDate: todayStr },
  ];
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedSeller, setSelectedSeller] = useState<string>("");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [activePreset, setActivePreset] = useState<string>("Últimos 30 dias");

  const datePresets = useMemo(() => getDatePresets(), []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ startDate, endDate });
    if (selectedBranch) params.set("branchId", selectedBranch);
    if (selectedSeller) params.set("sellerId", selectedSeller);
    if (selectedCustomer) params.set("customerId", selectedCustomer);
    if (selectedProduct) params.set("productId", selectedProduct);
    if (selectedStatus) params.set("status", selectedStatus);
    if (selectedPaymentMethod) params.set("paymentMethod", selectedPaymentMethod);
    return `?${params.toString()}`;
  }, [startDate, endDate, selectedBranch, selectedSeller, selectedCustomer, selectedProduct, selectedStatus, selectedPaymentMethod]);

  useEffect(() => {
    void apiFetch<{ data: Branch[] }>("/branches?pageSize=100")
      .then((res) => setBranches(res.data ?? []))
      .catch(() => {});
    void apiFetch<{ data: Array<{ id: string; name: string }> }>("/users?pageSize=100")
      .then((res) => setSellers(res.data ?? []))
      .catch(() => {});
    void apiFetch<{ data: Array<{ id: string; name: string }> }>("/customers?pageSize=100")
      .then((res) => setCustomers(res.data ?? []))
      .catch(() => {});
    void apiFetch<{ data: Array<{ id: string; name: string }> }>("/products?pageSize=100")
      .then((res) => setProducts(res.data ?? []))
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(
        await apiFetch<Record<string, unknown>>(`/reports/${tab}${tab === "stock" ? "" : query}`),
      );
    } catch (reason) {
      setData(null);
      setError(reason instanceof Error ? reason.message : "Não foi possível emitir o relatório.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [tab, query]);

  function applyPreset(preset: DatePreset) {
    setStartDate(preset.startDate);
    setEndDate(preset.endDate);
    setActivePreset(preset.label);
  }

  function exportCsv() {
    const rows = arrayRows(data);
    const header = rows[0] ? Object.keys(rows[0]) : [];
    const csv = [
      header.map((key) => label(key)).join(";"),
      ...rows.map((row) =>
        header.map((key) => formatCell(row[key]).replaceAll(";", ",")).join(";"),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `orien-${tab}-${startDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const overview = data as Record<string, unknown> | null;
  const rows = arrayRows(data);
  const summary = data?.summary as Array<{ label: string; value: unknown; format?: string }> | undefined;
  const warnings = data?.warnings as string[] | undefined;

  const statusOptions = [
    { label: "Todas as situações", value: "" },
    { label: "Pendente", value: "pending" },
    { label: "Pago", value: "paid" },
    { label: "Cancelado", value: "cancelled" },
    { label: "Aprovado", value: "approved" },
    { label: "Convertido", value: "converted" },
    { label: "Reconciliado", value: "reconciled" },
  ];

  const paymentMethodOptions = [
    { label: "Todas as formas", value: "" },
    { label: "Pix", value: "pix" },
    { label: "Cartão de crédito", value: "credit_card" },
    { label: "Cartão de débito", value: "debit_card" },
    { label: "Dinheiro", value: "cash" },
    { label: "Boleto", value: "boleto" },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Relatórios"
        description="Emita leituras simples e gerenciais de vendas, financeiro e estoque."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<FileText size={16} />}
              onClick={() =>
                void downloadApiFile(
                  `/reports/${tab}/pdf${tab === "stock" ? "" : query}`,
                  `orien-relatorio-${tab}-${startDate}.pdf`,
                )
              }
            >
              Baixar PDF
            </Button>
            <Button
              variant="secondary"
              icon={<FileText size={16} />}
              onClick={() =>
                void openApiDocument(
                  `/reports/${tab}/document${tab === "stock" ? "" : query}`,
                  true,
                )
              }
            >
              Visualizar
            </Button>
            <Button variant="secondary" icon={<Download size={16} />} onClick={exportCsv}>
              Exportar CSV
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2" role="tablist">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${tab === item.id ? "bg-[var(--brand-primary)] text-white shadow-sm" : "border border-[var(--brand-border)] bg-white text-[var(--brand-primary)] hover:bg-slate-50"}`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
          </div>

          {/* Date Presets */}
          <div className="flex flex-wrap gap-2">
            {datePresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${activePreset === preset.label ? "bg-[var(--brand-primary)] text-white" : "border border-[var(--brand-border)] bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Date Inputs and Actions */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium">
              Início
              <input
                className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                type="date"
                value={startDate}
                onChange={(event) => { setStartDate(event.target.value); setActivePreset(""); }}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Fim
              <input
                className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                type="date"
                value={endDate}
                onChange={(event) => { setEndDate(event.target.value); setActivePreset(""); }}
              />
            </label>
            <div className="flex items-end gap-2">
              <Button onClick={() => void load()} icon={<FileText size={16} />}>
                Emitir relatório
              </Button>
              <Button
                variant="secondary"
                icon={showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                onClick={() => setShowFilters(!showFilters)}
              >
                Filtros
              </Button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t border-[var(--brand-border)] pt-3">
              <label className="grid gap-1 text-sm font-medium">
                Filial
                <select
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                >
                  <option value="">Todas as filiais</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Vendedor
                <select
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                  value={selectedSeller}
                  onChange={(e) => setSelectedSeller(e.target.value)}
                >
                  <option value="">Todos os vendedores</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Cliente
                <select
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                >
                  <option value="">Todos os clientes</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Situação
                <select
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  {statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Forma de Pagamento
                <select
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                  value={selectedPaymentMethod}
                  onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                >
                  {paymentMethodOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Produto
                <select
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                >
                  <option value="">Todos os produtos</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {/* Loading */}
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500">Preparando relatório...</p>
      ) : null}

      {/* Warnings */}
      {warnings && warnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      ) : null}

      {/* Summary Cards */}
      {!loading && summary && summary.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summary.map((item) => (
            <Card key={item.label}>
              <CardContent>
                <p className="text-sm text-slate-500">{item.label}</p>
                <strong className="mt-2 block text-2xl text-[var(--brand-primary)]">
                  {formatSummaryValue(item.value, item.format)}
                </strong>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {/* Overview Cards */}
      {!loading && tab === "overview" && overview ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {([
            ["Vendas", String(overview.salesCount ?? 0)],
            ["Receita", money(overview.grossRevenue)],
            ["Ticket médio", money(overview.averageTicket)],
            ["Clientes", String(overview.customers ?? 0)],
            ["Margem bruta", money(overview.grossMargin)],
            ["Inadimplência", money(overview.overdueReceivables)],
            ["Estoque crítico", String(overview.lowStockProducts ?? 0)],
            ["Descontos", money(overview.discounts)],
          ] as [string, string][]).map(([lbl, value]) => (
            <Card key={lbl}>
              <CardContent>
                <p className="text-sm text-slate-500">{lbl}</p>
                <strong className="mt-2 block text-2xl text-[var(--brand-primary)]">{value}</strong>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {/* Data Table with independent scroll */}
      {!loading && tab !== "overview" ? (
        <Card>
          <CardContent className="p-0">
            {rows.length ? (
              <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white' }}>
                    <tr>
                      {Object.keys(rows[0]!).map((key) => (
                        <th
                          className="border-b border-[var(--brand-border)] p-3 text-xs uppercase tracking-[.12em] text-slate-500 bg-slate-50"
                          key={key}
                        >
                          {label(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index} className="hover:bg-slate-50">
                        {Object.entries(row).map(([key, value]) => (
                          <td className="border-b border-[var(--brand-border)] p-3" key={key}>
                            {isMoneyField(key) ? money(value) : formatCell(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Nenhum dado no período"
                description="Altere o período ou registre movimentações para emitir este relatório."
              />
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function arrayRows(data: Record<string, unknown> | null): Array<Record<string, unknown>> {
  if (!data) return [];
  if (data.rows && Array.isArray(data.rows)) return data.rows as Array<Record<string, unknown>>;
  for (const value of Object.values(data))
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  return [];
}

function money(value: unknown) {
  const num = Number(value ?? 0);
  if (isNaN(num)) return "-";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isMoneyField(key: string): boolean {
  const moneyFields = [
    "amount", "Amount", "revenue", "stockValue", "Sales", "sales",
    "Target", "target", "Ticket", "ticket", "Plan", "plan",
    "gross", "fee", "net", "difference", "Difference", "Value", "value",
  ];
  return moneyFields.some((f) => key.includes(f));
}

function formatCell(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return new Date(value).toLocaleString("pt-BR");
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function formatSummaryValue(value: unknown, format?: string) {
  if (format === "money" || format === "money-optional") return money(value);
  if (format === "integer") return Number(value ?? 0).toLocaleString("pt-BR");
  if (value === null || value === undefined) return "-";
  return String(value);
}

function label(key: string): string {
  const labels: Record<string, string> = {
    // Common
    productName: "Produto",
    branchName: "Loja",
    quantity: "Quantidade",
    minStock: "Estoque mínimo",
    stockValue: "Valor em estoque",
    revenue: "Receita",
    amount: "Valor",
    count: "Lançamentos",
    type: "Tipo",
    status: "Situação",
    // Overview
    grossRevenue: "Receita bruta",
    customers: "Clientes",
    grossMargin: "Margem bruta",
    overdueReceivables: "Inadimplência",
    lowStockProducts: "Estoque crítico",
    discounts: "Descontos",
    // Sales
    totalAmount: "Valor total",
    // Billing
    documentNumber: "Número",
    documentType: "Tipo documento",
    billingStatus: "Status faturamento",
    customerName: "Cliente",
    sellerName: "Vendedor",
    saleAmount: "Valor venda",
    validUntil: "Validade",
    convertedAt: "Data conversão",
    createdAt: "Data criação",
    // Commission
    paymentMethod: "Forma de pagamento",
    installments: "Parcelas",
    totalSalesAmount: "Valor vendas",
    totalCommissionAmount: "Comissão total",
    averageCommissionRate: "Taxa média",
    // Reconciliation
    paymentId: "Pagamento",
    paymentAmount: "Valor pagamento",
    paymentDate: "Data pagamento",
    settlementDate: "Data liquidação",
    reconciliationDate: "Data conciliação",
    defasagemDays: "Dias defasados",
    reconciliationStatus: "Status conciliação",
    settlementStatus: "Status liquidação",
    // Seller performance
    totalSales: "Valor total vendas",
    salesCount: "Qtd vendas",
    itemsCount: "Qtd itens",
    averageTicket: "Ticket médio",
    salesTarget: "Meta",
    targetPercentage: "% da meta",
    targetDifference: "Diferença meta",
    customersCount: "Clientes atendidos",
    newCustomersCount: "Clientes novos",
    dailyPlan: "Plano diário",
    // Monthly consolidated
    saleDate: "Data",
    saleNumber: "NF",
    categoryName: "Categoria",
    unitPrice: "Preço unitário",
    saleTotal: "Valor total",
    commissionRate: "% Comissão",
    commissionValue: "Valor comissão",
    // Executive dashboard
    metric: "Métrica",
    value: "Valor",
    trend: "Tendência",
    // Product analysis
    sku: "SKU",
    totalQuantity: "Qtd Vendida",
    averagePrice: "Preço Médio",
    currentStock: "Estoque Atual",
    stockStatus: "Status Estoque",
    // Customer analysis
    customerDocument: "Documento",
    totalPurchases: "Total Compras",
    lastPurchaseDate: "Última Compra",
    customerStatus: "Status Cliente",
    // Cash flow
    description: "Descrição",
    // Trend labels
    positive: "↑ Positivo",
    negative: "↓ Negativo",
    neutral: "→ Neutro",
    warning: "⚠ Atenção",
    // Payment methods
    pix: "Pix",
    credit_card: "Cartão de crédito",
    debit_card: "Cartão de débito",
    cash: "Dinheiro",
    boleto: "Boleto",
    // Status
    pending: "Pendente",
    paid: "Pago",
    cancelled: "Cancelado",
    approved: "Aprovado",
    converted: "Convertido",
    reconciled: "Reconciliado",
    diverged: "Com divergência",
    settled: "Liquidado",
    // Document types
    quote: "Orçamento",
    order: "Pedido",
    dav: "DAV",
  };
  return labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (v) => v.toUpperCase());
}
