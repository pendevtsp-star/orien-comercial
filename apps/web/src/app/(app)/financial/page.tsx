"use client";

import { Badge, Button, Card, CardContent, DataTable, EmptyState, Input, PageHeader, Select, Tabs } from "@sgc/ui";
import { CircleDollarSign, Landmark, Plus, RefreshCw, Receipt, Wallet, type LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, openApiDocument } from "../../../lib/api";
import { PaginationFooter } from "../../../components/pagination-footer";

interface ListResponse<T> {
  data: T[];
  pagination?: { total: number; page: number; pageSize: number };
}

interface BranchRow {
  id: string;
  name: string;
}

interface CategoryRow {
  id: string;
  name: string;
  type: string;
}

interface EntryRow {
  id: string;
  amount: string;
  dueDate: string;
  status: string;
  description?: string;
  paymentMethod?: string | null;
  installmentNumber?: number;
  installmentTotal?: number;
  reconciliationStatus?: string;
  sourceType?: string;
  sourceDocumentId?: string;
}

type EntryFilters = { search: string; branchId: string; paymentMethod: string; dueDateFrom: string; dueDateTo: string };

interface CashflowSummary {
  receivableOpen: number;
  payableOpen: number;
  paidIn: number;
  paidOut: number;
  projectedBalance: number;
  byStatus: Array<{ source: string; status: string; total: string }>;
}

export default function FinancialPage() {
  const [activeTab, setActiveTab] = useState("receber");
  const [receivables, setReceivables] = useState<EntryRow[]>([]);
  const [payables, setPayables] = useState<EntryRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [cashflow, setCashflow] = useState<CashflowSummary | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [receivablePage, setReceivablePage] = useState(1);
  const [payablePage, setPayablePage] = useState(1);
  const [receivableStatus, setReceivableStatus] = useState("all");
  const [payableStatus, setPayableStatus] = useState("all");
  const [receivableFilters, setReceivableFilters] = useState<EntryFilters>({ search: "", branchId: "", paymentMethod: "", dueDateFrom: "", dueDateTo: "" });
  const [payableFilters, setPayableFilters] = useState<EntryFilters>({ search: "", branchId: "", paymentMethod: "", dueDateFrom: "", dueDateTo: "" });
  const [receivablePagination, setReceivablePagination] = useState({ total: 0, page: 1, pageSize: 10 });
  const [payablePagination, setPayablePagination] = useState({ total: 0, page: 1, pageSize: 10 });
  const [selectedReceivables, setSelectedReceivables] = useState<string[]>([]);
  const [selectedPayables, setSelectedPayables] = useState<string[]>([]);

  const branchOptions = useMemo(
    () => [{ label: "Sem filial", value: "" }, ...branches.map((branch) => ({ label: branch.name, value: branch.id }))],
    [branches]
  );
  const incomeCategories = useMemo(
    () => [{ label: "Sem categoria", value: "" }, ...categories.filter((item) => item.type === "income").map((item) => ({ label: item.name, value: item.id }))],
    [categories]
  );
  const expenseCategories = useMemo(
    () => [{ label: "Sem categoria", value: "" }, ...categories.filter((item) => item.type === "expense").map((item) => ({ label: item.name, value: item.id }))],
    [categories]
  );

  async function load() {
    setError(null);
    try {
      const [branchesResponse, categoriesResponse, cashflowResponse] = await Promise.all([
        apiFetch<ListResponse<BranchRow>>("/branches?pageSize=100"),
        apiFetch<ListResponse<CategoryRow>>("/financial/categories"),
        apiFetch<CashflowSummary>("/financial/cashflow")
      ]);
      setBranches(branchesResponse.data);
      setCategories(categoriesResponse.data);
      setCashflow(cashflowResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar financeiro.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void loadEntries("receivables", receivablePage, receivableStatus, receivableFilters, setReceivables, setReceivablePagination, setSelectedReceivables);
  }, [receivablePage, receivableStatus, receivableFilters]);

  useEffect(() => {
    void loadEntries("payables", payablePage, payableStatus, payableFilters, setPayables, setPayablePagination, setSelectedPayables);
  }, [payablePage, payableStatus, payableFilters]);

  async function loadEntries(
    kind: "receivables" | "payables",
    page: number,
    status: string,
    filters: EntryFilters,
    setRows: (rows: EntryRow[]) => void,
    setPagination: (pagination: { total: number; page: number; pageSize: number }) => void,
    clearSelection: (value: string[]) => void
  ) {
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: "10" });
      if (status !== "all") query.set("status", status);
      if (filters.search.trim()) query.set("search", filters.search.trim());
      if (filters.branchId) query.set("branchId", filters.branchId);
      if (filters.paymentMethod) query.set("paymentMethod", filters.paymentMethod);
      if (filters.dueDateFrom) query.set("dueDateFrom", filters.dueDateFrom);
      if (filters.dueDateTo) query.set("dueDateTo", filters.dueDateTo);
      const response = await apiFetch<ListResponse<EntryRow>>(`/financial/${kind}?${query.toString()}`);
      setRows(response.data);
      setPagination(response.pagination ?? { total: response.data.length, page, pageSize: 10 });
      clearSelection([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar lancamentos.");
    }
  }

  async function createEntry(event: FormEvent<HTMLFormElement>, kind: "receivables" | "payables") {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch(`/financial/${kind}`, {
        method: "POST",
        body: JSON.stringify({
          branchId: form.get("branchId") || undefined,
          amount: Number(form.get("amount") || 0),
          dueDate: form.get("dueDate"),
          status: "open",
          description: form.get("description") || undefined,
          categoryId: form.get("categoryId") || undefined,
          installmentCount: Number(form.get("installmentCount") || 1),
          paymentMethod: form.get("paymentMethod") || undefined
        })
      });
      event.currentTarget.reset();
      await Promise.all([
        load(),
        loadEntries("receivables", receivablePage, receivableStatus, receivableFilters, setReceivables, setReceivablePagination, setSelectedReceivables),
        loadEntries("payables", payablePage, payableStatus, payableFilters, setPayables, setPayablePagination, setSelectedPayables)
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar lancamento.");
    }
  }

  async function markPaid(kind: "receivables" | "payables", id: string) {
    const paymentMethod = window.prompt("Forma de pagamento:");
    if (!paymentMethod) return;
    try {
      await apiFetch(`/financial/${kind}/${id}/pay`, {
        method: "PATCH",
        body: JSON.stringify({ paymentMethod })
      });
      await Promise.all([
        load(),
        loadEntries(
          kind,
          kind === "receivables" ? receivablePage : payablePage,
          kind === "receivables" ? receivableStatus : payableStatus,
          kind === "receivables" ? receivableFilters : payableFilters,
          kind === "receivables" ? setReceivables : setPayables,
          kind === "receivables" ? setReceivablePagination : setPayablePagination,
          kind === "receivables" ? setSelectedReceivables : setSelectedPayables
        )
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao dar baixa.");
    }
  }

  async function reconcile(kind: "receivables" | "payables", id: string, reconciliationStatus: "reconciled" | "diverged") {
    try {
      await apiFetch(`/financial/${kind}/${id}/reconcile`, {
        method: "PATCH",
        body: JSON.stringify({ reconciliationStatus })
      });
      await Promise.all([
        load(),
        loadEntries(
          kind,
          kind === "receivables" ? receivablePage : payablePage,
          kind === "receivables" ? receivableStatus : payableStatus,
          kind === "receivables" ? receivableFilters : payableFilters,
          kind === "receivables" ? setReceivables : setPayables,
          kind === "receivables" ? setReceivablePagination : setPayablePagination,
          kind === "receivables" ? setSelectedReceivables : setSelectedPayables
        )
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reconciliar lancamento.");
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/financial/categories", {
        method: "POST",
        body: JSON.stringify({ name: form.get("name"), type: form.get("type") })
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar categoria.");
    }
  }

  async function bulkMarkPaid(kind: "receivables" | "payables", ids: string[]) {
    const paymentMethod = window.prompt("Forma de pagamento para os selecionados:");
    if (!paymentMethod || !ids.length) return;
    try {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/financial/${kind}/${id}/pay`, {
            method: "PATCH",
            body: JSON.stringify({ paymentMethod })
          })
        )
      );
      await Promise.all([
        load(),
        loadEntries(
          kind,
          kind === "receivables" ? receivablePage : payablePage,
          kind === "receivables" ? receivableStatus : payableStatus,
          kind === "receivables" ? receivableFilters : payableFilters,
          kind === "receivables" ? setReceivables : setPayables,
          kind === "receivables" ? setReceivablePagination : setPayablePagination,
          kind === "receivables" ? setSelectedReceivables : setSelectedPayables
        )
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao baixar lancamentos selecionados.");
    }
  }

  async function bulkReconcile(kind: "receivables" | "payables", ids: string[], reconciliationStatus: "reconciled" | "diverged") {
    if (!ids.length) return;
    try {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/financial/${kind}/${id}/reconcile`, {
            method: "PATCH",
            body: JSON.stringify({ reconciliationStatus })
          })
        )
      );
      await Promise.all([
        load(),
        loadEntries(
          kind,
          kind === "receivables" ? receivablePage : payablePage,
          kind === "receivables" ? receivableStatus : payableStatus,
          kind === "receivables" ? receivableFilters : payableFilters,
          kind === "receivables" ? setReceivables : setPayables,
          kind === "receivables" ? setReceivablePagination : setPayablePagination,
          kind === "receivables" ? setSelectedReceivables : setSelectedPayables
        )
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reconciliar lancamentos selecionados.");
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Financeiro"
        description="Baixa manual, parcelamento, categorias, fluxo de caixa e conciliacao inicial."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void openApiDocument("/financial/cashflow/document")}>
              Exportar fluxo de caixa
            </Button>
            <Button variant="secondary" onClick={() => void load()} icon={<RefreshCw size={16} />}>
              Atualizar dados
            </Button>
          </div>
        }
      />
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="A receber aberto" value={cashflow?.receivableOpen ?? 0} detail="Carteira pendente" icon={Wallet} />
        <MetricCard title="A pagar aberto" value={cashflow?.payableOpen ?? 0} detail="Compromissos em aberto" icon={Receipt} />
        <MetricCard title="Entradas pagas" value={cashflow?.paidIn ?? 0} detail="Receitas liquidadas" icon={CircleDollarSign} />
        <MetricCard title="Saldo projetado" value={cashflow?.projectedBalance ?? 0} detail="Receitas menos despesas" icon={Landmark} accent />
      </div>

      <Tabs
        defaultValue="receber"
        value={activeTab}
        onValueChange={setActiveTab}
        tabs={[
          {
            value: "receber",
            label: "A receber",
            content: (
              <div className="grid gap-4">
                <FinancialHero
                  title="Contas a receber com foco em previsibilidade."
                  description="Registre receitas avulsas ou parceladas, acompanhe baixas e deixe o status de conciliacao visivel para a operacao."
                  primaryValue={cashflow?.receivableOpen ?? 0}
                  secondaryValue={cashflow?.paidIn ?? 0}
                  primaryLabel="Aberto"
                  secondaryLabel="Ja recebido"
                />
                <FinancialColumn
                  title="Contas a receber"
                  rows={receivables}
                  branches={branchOptions}
                  categories={incomeCategories}
                  onSubmit={(event) => void createEntry(event, "receivables")}
                  onMarkPaid={(id) => void markPaid("receivables", id)}
                  onReconcile={(id, status) => void reconcile("receivables", id, status)}
                  selectedIds={selectedReceivables}
                  setSelectedIds={setSelectedReceivables}
                  statusFilter={receivableStatus}
                  filters={receivableFilters}
                  setFilters={setReceivableFilters}
                  setStatusFilter={(status) => {
                    setReceivableStatus(status);
                    setReceivablePage(1);
                  }}
                  onBulkMarkPaid={() => void bulkMarkPaid("receivables", selectedReceivables)}
                  onBulkReconcile={(status) => void bulkReconcile("receivables", selectedReceivables, status)}
                  pagination={receivablePagination}
                  onPreviousPage={() => setReceivablePage((current) => Math.max(1, current - 1))}
                  onNextPage={() => setReceivablePage((current) => current + 1)}
                />
              </div>
            )
          },
          {
            value: "pagar",
            label: "A pagar",
            content: (
              <div className="grid gap-4">
                <FinancialHero
                  title="Contas a pagar com visao de caixa e disciplina operacional."
                  description="Cadastre despesas por categoria, parcelamento e loja para manter vencimento, baixa e conciliacao no mesmo lugar."
                  primaryValue={cashflow?.payableOpen ?? 0}
                  secondaryValue={cashflow?.paidOut ?? 0}
                  primaryLabel="Aberto"
                  secondaryLabel="Ja pago"
                />
                <FinancialColumn
                  title="Contas a pagar"
                  rows={payables}
                  branches={branchOptions}
                  categories={expenseCategories}
                  onSubmit={(event) => void createEntry(event, "payables")}
                  onMarkPaid={(id) => void markPaid("payables", id)}
                  onReconcile={(id, status) => void reconcile("payables", id, status)}
                  selectedIds={selectedPayables}
                  setSelectedIds={setSelectedPayables}
                  statusFilter={payableStatus}
                  filters={payableFilters}
                  setFilters={setPayableFilters}
                  setStatusFilter={(status) => {
                    setPayableStatus(status);
                    setPayablePage(1);
                  }}
                  onBulkMarkPaid={() => void bulkMarkPaid("payables", selectedPayables)}
                  onBulkReconcile={(status) => void bulkReconcile("payables", selectedPayables, status)}
                  pagination={payablePagination}
                  onPreviousPage={() => setPayablePage((current) => Math.max(1, current - 1))}
                  onNextPage={() => setPayablePage((current) => current + 1)}
                />
              </div>
            )
          },
          {
            value: "categorias",
            label: "Categorias",
            content: (
              <div className="grid min-w-0 gap-4 2xl:grid-cols-[360px_minmax(0,1fr)]">
                <Card>
                  <CardContent>
                    <form className="grid gap-3" onSubmit={(event) => void createCategory(event)}>
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Classificacao</p>
                      <h2 className="text-base font-semibold text-[var(--brand-primary)]">Nova categoria</h2>
                      <Input name="name" label="Nome" required />
                      <Select
                        name="type"
                        label="Tipo"
                        options={[
                          { label: "Receita", value: "income" },
                          { label: "Despesa", value: "expense" }
                        ]}
                        required
                      />
                      <Button type="submit" icon={<Plus size={16} />}>
                        Criar categoria
                      </Button>
                    </form>
                  </CardContent>
                </Card>
                <DataTable
                  rows={categories}
                  empty={
                    <EmptyState
                      eyebrow="Classificacao financeira"
                      title="Nenhuma categoria criada."
                      description="Crie categorias para separar melhor receitas e despesas antes de ampliar os lancamentos."
                      icon={<Receipt size={20} />}
                    />
                  }
                  columns={[
                    { key: "name", header: "Categoria", render: (row) => row.name },
                    { key: "type", header: "Tipo", render: (row) => <Badge>{row.type}</Badge> }
                  ]}
                />
              </div>
            )
          },
          {
            value: "conciliacao",
            label: "Conciliacao",
            content: (
              <Card>
                <CardContent className="grid gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Conferencia</p>
                  <h2 className="text-base font-semibold text-[var(--brand-primary)]">Visao por status</h2>
                  <DataTable
                    rows={(cashflow?.byStatus ?? []).map((row, index) => ({ ...row, id: `${row.source}-${row.status}-${index}` }))}
                    empty={
                      <EmptyState
                        eyebrow="Conferencia"
                        title="Sem dados para conciliacao."
                        description="Assim que houver lancamentos com status financeiros diferentes, esta leitura aparecera aqui."
                        icon={<Landmark size={20} />}
                      />
                    }
                    columns={[
                      { key: "source", header: "Origem", render: (row) => row.source },
                      { key: "status", header: "Status", render: (row) => <Badge>{row.status}</Badge> },
                      {
                        key: "total",
                        header: "Total",
                        render: (row) => Number(row.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            )
          }
        ]}
      />
    </div>
  );
}

function FinancialColumn({
  title,
  rows,
  branches,
  categories,
  onSubmit,
  onMarkPaid,
  onReconcile,
  selectedIds,
  setSelectedIds,
  statusFilter,
  filters,
  setFilters,
  setStatusFilter,
  onBulkMarkPaid,
  onBulkReconcile,
  pagination,
  onPreviousPage,
  onNextPage
}: {
  title: string;
  rows: EntryRow[];
  branches: Array<{ label: string; value: string }>;
  categories: Array<{ label: string; value: string }>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onMarkPaid: (id: string) => void;
  onReconcile: (id: string, status: "reconciled" | "diverged") => void;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  statusFilter: string;
  filters: EntryFilters;
  setFilters: (filters: EntryFilters) => void;
  setStatusFilter: (status: string) => void;
  onBulkMarkPaid: () => void;
  onBulkReconcile: (status: "reconciled" | "diverged") => void;
  pagination: { total: number; page: number; pageSize: number };
  onPreviousPage: () => void;
  onNextPage: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="2xl:order-2 2xl:sticky 2xl:top-20 2xl:self-start">
        <CardContent className="grid gap-4">
          <form className="grid gap-3" onSubmit={onSubmit}>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Lancamento manual</p>
              <h2 className="mt-2 text-base font-semibold text-[var(--brand-primary)]">{title}</h2>
            </div>
            <Select name="branchId" label="Loja" options={branches} />
            <Select name="categoryId" label="Categoria" options={categories} />
            <Input name="description" label="Descricao" />
            <Input name="amount" label="Valor" type="number" step="0.01" required />
            <Input name="dueDate" label="Vencimento" type="date" required />
            <Input name="installmentCount" label="Parcelas" type="number" min="1" max="24" defaultValue="1" />
            <Input name="paymentMethod" label="Forma padrao" defaultValue="pix" />
            <Button type="submit" icon={<Plus size={16} />}>
              Registrar lancamento
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-3 lg:order-1">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white p-3">
          <Input
            aria-label="Buscar lançamentos"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            placeholder="Buscar descrição"
            className="min-w-[180px] flex-1"
          />
          <Select
            aria-label="Filtrar por loja"
            value={filters.branchId}
            onChange={(event) => setFilters({ ...filters, branchId: event.target.value })}
            options={branches}
          />
          <Select
            aria-label="Filtrar por forma de pagamento"
            value={filters.paymentMethod}
            onChange={(event) => setFilters({ ...filters, paymentMethod: event.target.value })}
            options={[
              { label: "Todas as formas", value: "" },
              { label: "Pix", value: "pix" },
              { label: "Boleto", value: "boleto" },
              { label: "Cartão de crédito", value: "credit_card" },
              { label: "Cartão de débito", value: "debit_card" },
              { label: "Dinheiro", value: "cash" },
              { label: "Transferência", value: "bank_transfer" },
            ]}
          />
          <Input aria-label="Vencimento inicial" type="date" value={filters.dueDateFrom} onChange={(event) => setFilters({ ...filters, dueDateFrom: event.target.value })} />
          <Input aria-label="Vencimento final" type="date" value={filters.dueDateTo} onChange={(event) => setFilters({ ...filters, dueDateTo: event.target.value })} />
          <Select
            aria-label="Status dos lancamentos"
            options={[
              { label: "Todos os status", value: "all" },
              { label: "Somente abertos", value: "open" },
              { label: "Somente pagos", value: "paid" },
              { label: "Somente cancelados", value: "cancelled" }
            ]}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          />
          {selectedIds.length ? (
            <>
              <Badge>{selectedIds.length} selecionado(s)</Badge>
              <Button variant="secondary" onClick={onBulkMarkPaid}>Baixar</Button>
              <Button variant="secondary" onClick={() => onBulkReconcile("reconciled")}>Conciliar</Button>
              <Button variant="secondary" onClick={() => onBulkReconcile("diverged")}>Marcar divergência</Button>
            </>
          ) : (
            <p className="text-sm text-slate-500">Selecione lançamentos na tabela para realizar ações em lote.</p>
          )}
        </div>
        <DataTable
          rows={rows}
          empty={
            <EmptyState
              eyebrow="Fluxo financeiro"
              title="Nenhum lancamento encontrado."
              description="Cadastre o primeiro recebivel ou pagavel para iniciar o acompanhamento de caixa e conciliacao."
              icon={<Wallet size={20} />}
            />
          }
          columns={[
            {
              key: "select",
              header: "Selecionar",
              render: (row) => (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(row.id)}
                  onChange={(event) => {
                    setSelectedIds(
                      event.target.checked ? [...selectedIds, row.id] : selectedIds.filter((selectedId) => selectedId !== row.id)
                    );
                  }}
                />
              )
            },
            { key: "dueDate", header: "Vencimento", render: (row) => new Date(`${row.dueDate}T00:00:00`).toLocaleDateString("pt-BR") },
            {
              key: "amount",
              header: "Valor",
              render: (row) => Number(row.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            },
            { key: "parcel", header: "Parcela", render: (row) => `${row.installmentNumber ?? 1}/${row.installmentTotal ?? 1}` },
            { key: "origin", header: "Origem", render: (row) => row.sourceType === "purchase_fiscal_document" ? <Badge>NF-e de compra</Badge> : <span className="text-slate-500">Manual</span> },
            { key: "status", header: "Status", render: (row) => <Badge>{row.status}</Badge> },
            { key: "reconcile", header: "Conciliacao", render: (row) => <Badge>{row.reconciliationStatus ?? "pending"}</Badge> },
            {
              key: "actions",
              header: "Acoes",
              render: (row) => (
                <div className="flex gap-2">
                  {row.status !== "paid" ? (
                    <Button variant="secondary" onClick={() => onMarkPaid(row.id)}>
                      Baixar
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={() => onReconcile(row.id, "reconciled")}>
                    Conciliar
                  </Button>
                  <Button variant="secondary" onClick={() => onReconcile(row.id, "diverged")}>
                    Divergente
                  </Button>
                </div>
              )
            }
          ]}
        />
        <PaginationFooter
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPrevious={onPreviousPage}
          onNext={onNextPage}
        />
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  accent = false,
  icon: Icon
}: {
  title: string;
  value: number;
  detail: string;
  accent?: boolean;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--brand-primary)]">
            {value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
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

function FinancialHero({
  title,
  description,
  primaryValue,
  secondaryValue,
  primaryLabel,
  secondaryLabel
}: {
  title: string;
  description: string;
  primaryValue: number;
  secondaryValue: number;
  primaryLabel: string;
  secondaryLabel: string;
}) {
  return (
    <Card variant="brand" className="overflow-hidden shadow-[0_28px_64px_rgba(11,29,61,0.18)]">
      <CardContent className="grid gap-4 p-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <Badge className="border-white/10 bg-white/10 text-white">Fluxo de caixa</Badge>
          <h2 data-brand-display="true" className="mt-4 text-3xl font-semibold text-white">
            {title}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">{description}</p>
        </div>
        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
          <FinanceFigure label={primaryLabel} value={primaryValue} />
          <FinanceFigure label={secondaryLabel} value={secondaryValue} accent />
        </div>
      </CardContent>
    </Card>
  );
}

function FinanceFigure({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.08] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/68">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent ? "text-[var(--brand-accent)]" : "text-white"}`}>
        {value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </p>
    </div>
  );
}
