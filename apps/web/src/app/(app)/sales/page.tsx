"use client";

import { Autocomplete, Badge, Button, Card, CardContent, DataTable, EmptyState, Input, PageHeader, Select } from "@sgc/ui";
import { Ban, ChevronDown, CircleDollarSign, Package2, Plus, RefreshCw, ShoppingCart, Wallet, type LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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

interface ProductRow {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  salePrice?: string;
}

interface CustomerRow {
  id: string;
  name: string;
  email?: string;
}

interface DraftItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}

interface SaleRow {
  id: string;
  status: string;
  totalAmount: string;
  paidAmount: string;
  openAmount: string;
  itemCount: number;
  branchName: string;
  customerName?: string;
  createdAt: string;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
  notes?: string | null;
  fiscalStatus?: string | null;
  fiscalExternalId?: string | null;
}

interface SaleHistory {
  payments: Array<{ id: string; method: string; amount: string; status: string; paidAt?: string | null }>;
  movements: Array<{ id: string; movementType: string; quantity: string; reason: string; createdAt: string }>;
  receivables: Array<{ id: string; amount: string; dueDate: string; status: string }>;
  audit: Array<{ action: string; createdAt: string }>;
}
interface FiscalDocument {
  id: string;
  provider?: string;
  environment?: string;
  status: string;
  externalId?: string | null;
  attemptCount: number;
  lastError?: string | null;
  requestedAt?: string | null;
  issuedAt?: string | null;
  createdAt: string;
}

export default function SalesPage() {
  const searchParams = useSearchParams();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [history, setHistory] = useState<Record<string, SaleHistory>>({});
  const [fiscalHistory, setFiscalHistory] = useState<Record<string, FiscalDocument[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scannerCode, setScannerCode] = useState("");
  const [draftProductId, setDraftProductId] = useState("");
  const [draftProductSearch, setDraftProductSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [manualSaleOpen, setManualSaleOpen] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: 10 });
  const scannerInputRef = useRef<HTMLInputElement>(null);

  const branchOptions = useMemo(() => branches.map((branch) => ({ label: branch.name, value: branch.id })), [branches]);
  const productSuggestions = useMemo(() => {
    const search = draftProductSearch.trim().toLowerCase();
    if (search.length < 2) return [];
    return products
      .filter((product) =>
        product.name.toLowerCase().includes(search) ||
        product.sku?.toLowerCase().includes(search) ||
        product.barcode?.toLowerCase().includes(search),
      )
      .slice(0, 8);
  }, [draftProductSearch, products]);
  const customerOptions = useMemo(
    () => [{ label: "Sem cliente", value: "" }, ...customers.map((customer) => ({ label: customer.name, value: customer.id }))],
    [customers]
  );

  async function load() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const salesQuery = new URLSearchParams({ page: String(page), pageSize: "10" });
      if (search) salesQuery.set("search", search);
      if (statusFilter !== "all") salesQuery.set("status", statusFilter);
      const [salesResponse, branchesResponse, productsResponse, customersResponse] = await Promise.all([
        apiFetch<ListResponse<SaleRow>>(`/sales?${salesQuery.toString()}`),
        apiFetch<ListResponse<BranchRow>>("/branches?pageSize=100"),
        apiFetch<ListResponse<ProductRow>>("/products?pageSize=100"),
        apiFetch<ListResponse<CustomerRow>>("/customers?pageSize=100")
      ]);
      setSales(salesResponse.data);
      setPagination(salesResponse.pagination ?? { total: salesResponse.data.length, page, pageSize: 10 });
      setBranches(branchesResponse.data);
      setProducts(productsResponse.data);
      setCustomers(customersResponse.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar vendas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, search, statusFilter]);

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus) return;
    void Promise.all([apiFetch<SaleRow>(`/sales/${focus}`), apiFetch<SaleHistory>(`/sales/${focus}/history`)])
      .then(([sale, detail]) => { setSales((current) => current.some((item) => item.id === sale.id) ? current : [sale, ...current]); setHistory((current) => ({ ...current, [sale.id]: detail })); })
      .catch(() => setError("A venda selecionada não está disponível no seu escopo."));
  }, [searchParams]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === "F2") {
        event.preventDefault();
        scannerInputRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === scannerInputRef.current) {
        setScannerCode("");
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const product = products.find((item) => item.id === draftProductId);
    if (!product) return;

    setDraftItems((current) => [
      ...current,
      {
        productId: product.id,
        productName: product.name,
        quantity: Number(form.get("quantity") || 1),
        unitPrice: Number(form.get("unitPrice") || product.salePrice || 0),
        discountAmount: Number(form.get("discountAmount") || 0)
      }
    ]);
    event.currentTarget.reset();
    setDraftProductId("");
    setDraftProductSearch("");
  }

  function addScannedProduct() {
    const code = scannerCode.trim();
    if (!code) return;
    const product = products.find((item) => item.barcode === code || item.sku === code);
    if (!product) {
      setError(`Nenhum produto encontrado para o código ${code}.`);
      return;
    }
    setDraftItems((current) => {
      const existingIndex = current.findIndex((item) => item.productId === product.id);
      if (existingIndex < 0) {
        return [...current, { productId: product.id, productName: product.name, quantity: 1, unitPrice: Number(product.salePrice ?? 0), discountAmount: 0 }];
      }
      return current.map((item, index) => (index === existingIndex ? { ...item, quantity: item.quantity + 1 } : item));
    });
    setScannerCode("");
    setError(null);
  }

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftItems.length) {
      setError("Adicione pelo menos um item antes de registrar a venda.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const paidAmount = Number(form.get("paidAmount") || 0);

    try {
      await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          customerId: form.get("customerId") || undefined,
          notes: form.get("notes") || undefined,
          items: draftItems,
          payments:
            paidAmount > 0
              ? [{ method: form.get("paymentMethod") || "pix", amount: paidAmount, status: "paid" }]
              : []
        })
      });
      setDraftItems([]);
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao registrar venda.");
    }
  }

  async function cancelSale(id: string) {
    const reason = window.prompt("Motivo do cancelamento:");
    if (!reason) return;
    try {
      await apiFetch(`/sales/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cancelar venda.");
    }
  }

  async function issueFiscal(id: string) {
    try {
      const result = await apiFetch<{ message: string }>(`/sales/${id}/fiscal/issue`, {
        method: "POST",
        body: "{}",
      });
      setNotice(result.message);
      await loadFiscal(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível solicitar a emissão fiscal.");
    }
  }

  async function toggleHistory(id: string) {
    if (history[id]) {
      setHistory((current) => {
        const copy = { ...current };
        delete copy[id];
        return copy;
      });
      return;
    }

    try {
      const response = await apiFetch<SaleHistory>(`/sales/${id}/history`);
      setHistory((current) => ({ ...current, [id]: response }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar historico.");
    }
  }

  async function loadFiscal(id: string) {
    try {
      const response = await apiFetch<{ data: FiscalDocument[] }>(`/sales/${id}/fiscal`);
      setFiscalHistory((current) => ({ ...current, [id]: response.data }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o histórico fiscal.");
    }
  }

  const totalDraft = draftItems.reduce((sum, item) => sum + item.quantity * item.unitPrice - item.discountAmount, 0);
  const openSales = sales.filter((sale) => sale.status !== "cancelled");
  const paidTotal = openSales.reduce((sum, sale) => sum + Number(sale.paidAmount), 0);
  const openTotal = openSales.reduce((sum, sale) => sum + Number(sale.openAmount), 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Vendas"
        description="Gerencie vendas, recebimentos, orçamentos e pós-venda. Para balcão e scanner, use o PDV rápido."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/pos" className="inline-flex min-h-10 items-center rounded-md bg-[var(--brand-primary)] px-4 text-sm font-medium text-white">Abrir PDV</Link>
            <Button variant="secondary" onClick={() => setManualSaleOpen((value) => !value)}>{manualSaleOpen ? "Fechar venda administrativa" : "Nova venda administrativa"}</Button>
            <Button variant="secondary" onClick={() => void load()} icon={<RefreshCw size={16} />}>Atualizar dados</Button>
          </div>
        }
      />
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {notice ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InsightCard title="Vendas registradas" value={sales.length} detail="Historico do periodo carregado" icon={ShoppingCart} />
        <InsightCard title="Itens no rascunho" value={draftItems.length} detail="Montagem da venda atual" icon={Package2} />
        <InsightCard title="Recebido" value={paidTotal} detail="Valor pago nas vendas abertas" icon={Wallet} money />
        <InsightCard title="Em aberto" value={openTotal} detail="Saldo a receber das vendas" icon={CircleDollarSign} money accent />
      </section>

      <section className={`grid min-w-0 gap-4 ${manualSaleOpen ? "2xl:grid-cols-[minmax(0,1fr)_400px]" : ""}`}>
        {manualSaleOpen ? <div className="grid min-w-0 gap-4 2xl:order-2 2xl:sticky 2xl:top-20 2xl:self-start">
          <Card>
            <CardContent className="grid gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Composicao da venda</p>
                <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">Montar itens</h2>
                <p className="text-sm text-slate-500">Adicione os produtos, ajuste preco e desconto e acompanhe o total parcial em tempo real.</p>
              </div>
              <Input
                ref={scannerInputRef}
                label="Leitor de código de barras"
                placeholder="Aponte o leitor e pressione Enter"
                value={scannerCode}
                onChange={(event) => setScannerCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addScannedProduct();
                  }
                }}
              />
              <p className="-mt-2 text-xs text-slate-500">Leitores USB ou Bluetooth em modo teclado adicionam o item automaticamente. F2 posiciona o cursor no leitor.</p>
              <form className="grid gap-3" onSubmit={addItem}>
                <Autocomplete
                  label="Produto"
                  value={draftProductSearch}
                  placeholder="Digite nome, SKU ou código"
                  options={productSuggestions.map((product) => ({
                    value: product.id,
                    label: product.name,
                    detail: `${[product.sku, product.barcode].filter(Boolean).join(" · ") || "Sem código"} · ${Number(product.salePrice ?? 0).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}`,
                  }))}
                  emptyText="Nenhum produto encontrado."
                  onValueChange={(value) => {
                    setDraftProductSearch(value);
                    setDraftProductId("");
                  }}
                  onOptionSelect={(option) => {
                    const product = products.find((item) => item.id === option.value);
                    if (!product) return;
                    setDraftProductId(product.id);
                    setDraftProductSearch(product.name);
                  }}
                  required
                />
                <div className="grid gap-3 md:grid-cols-3">
                  <Input name="quantity" label="Qtd" type="number" step="0.001" defaultValue="1" required />
                  <Input name="unitPrice" label="Preco" type="number" step="0.01" required />
                  <Input name="discountAmount" label="Desconto" type="number" step="0.01" defaultValue="0" />
                </div>
                <Button type="submit" icon={<Plus size={16} />}>
                  Adicionar item
                </Button>
              </form>
              <div className="grid gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
                {draftItems.length ? (
                  draftItems.map((item, index) => (
                    <div key={`${item.productId}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-white bg-white/80 p-3 text-sm">
                      <div>
                        <p className="font-medium text-[var(--brand-primary)]">{item.productName}</p>
                        <p className="text-slate-500">
                          {item.quantity} x {item.unitPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-medium text-[var(--brand-secondary)]"
                        onClick={() => setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        Remover
                      </button>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    eyebrow="Venda em montagem"
                    title="Nenhum item adicionado ainda."
                    description="Selecione um produto, quantidade e preco para iniciar a composicao desta venda."
                    icon={<Package2 size={20} />}
                  />
                )}
                <p className="border-t border-[var(--brand-border)] pt-3 text-sm font-semibold text-[var(--brand-primary)]">
                  Total parcial {totalDraft.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <form className="grid gap-3" onSubmit={(event) => void submitSale(event)}>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Finalizacao</p>
                  <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">Fechar venda</h2>
                  <p className="text-sm text-slate-500">O valor pago agora baixa no ato e o saldo restante vira conta a receber automaticamente.</p>
                </div>
                <Select name="branchId" label="Loja" options={branchOptions} required />
                <Select name="customerId" label="Cliente" options={customerOptions} />
                <Input name="notes" label="Observacoes" />
                <div className="grid gap-3 md:grid-cols-2">
                  <Input name="paidAmount" label="Valor pago agora" type="number" step="0.01" defaultValue="0" />
                  <Select
                    name="paymentMethod"
                    label="Forma de pagamento"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    options={paymentOptions}
                  />
                </div>
                <Button type="submit">Registrar venda</Button>
              </form>
            </CardContent>
          </Card>
        </div> : null}

        <div className="grid min-w-0 gap-4 2xl:order-1">
          <Card className="border-[var(--brand-border)] bg-[var(--brand-surface)]">
            <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Gestão de vendas</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--brand-primary)]">Histórico, recebimentos e pós-venda em um só lugar.</h2>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <QuickFigure label="Em aberto" value={paidTotal + openTotal} money />
                <QuickFigure label="Ticket médio" value={openSales.length ? (paidTotal + openTotal) / openSales.length : 0} money />
                <QuickFigure label="Pendente" value={openTotal} money accent />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-3">
            <Input
              aria-label="Buscar vendas"
              placeholder="Buscar por cliente, loja ou observacao"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              aria-label="Status da venda"
              options={[
                { label: "Todos os status", value: "all" },
                { label: "Vendidas", value: "sold" },
                { label: "Canceladas", value: "cancelled" }
              ]}
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            />
            <div className="flex items-center">
              <Badge>{pagination.total} registros na leitura atual</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={statusFilter === "all" ? "primary" : "secondary"} onClick={() => { setStatusFilter("all"); setPage(1); }}>Todas</Button>
            <Button variant={statusFilter === "sold" ? "primary" : "secondary"} onClick={() => { setStatusFilter("sold"); setPage(1); }}>Concluídas</Button>
            <Button variant={statusFilter === "cancelled" ? "primary" : "secondary"} onClick={() => { setStatusFilter("cancelled"); setPage(1); }}>Canceladas</Button>
            <Link href="/operations?section=quotes" className="inline-flex min-h-10 items-center rounded-md border border-[var(--brand-border)] px-4 text-sm font-medium text-[var(--brand-primary)]">Orçamentos e pedidos</Link>
          </div>

          <DataTable
            rows={sales}
            empty={
              loading ? (
                "Carregando..."
              ) : (
                <EmptyState
                  eyebrow="Operacao comercial"
                  title="Nenhuma venda registrada por enquanto."
                  description="Assim que a primeira venda for concluida, ela aparecera aqui com pagamentos, saldo em aberto e historico."
                  icon={<ShoppingCart size={20} />}
                />
              )
            }
            columns={[
              { key: "date", header: "Data", render: (row) => new Date(row.createdAt).toLocaleString("pt-BR") },
              { key: "branch", header: "Loja", render: (row) => row.branchName },
              { key: "customer", header: "Cliente", render: (row) => row.customerName ?? "-" },
              { key: "items", header: "Itens", render: (row) => row.itemCount },
              {
                key: "total",
                header: "Total",
                render: (row) => Number(row.totalAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              },
              {
                key: "payments",
                header: "Pago / Aberto",
                render: (row) => (
                  <div className="text-xs">
                    <p>{Number(row.paidAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                    <p className="text-slate-500">
                      {Number(row.openAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                  </div>
                )
              },
              { key: "status", header: "Status", render: (row) => <Badge>{saleStatusLabel(row.status)}</Badge> },
              {
                key: "fiscal",
                header: "Fiscal",
                render: (row) => <Badge>{fiscalLabel(row.fiscalStatus)}</Badge>,
              },
              {
                key: "actions",
                header: "Acoes",
                render: (row) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" onClick={() => void toggleHistory(row.id)}>
                      {history[row.id] ? "Fechar" : "Ver venda"}
                    </Button>
                    <details className="relative">
                      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-[var(--brand-border)] px-3 text-sm font-medium text-[var(--brand-primary)]">
                        Mais ações <ChevronDown size={15} />
                      </summary>
                      <div className="absolute right-0 z-20 mt-2 grid min-w-52 gap-1 rounded-md border border-[var(--brand-border)] bg-white p-2 shadow-xl">
                        <button className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--brand-surface)]" onClick={() => void openApiDocument(`/sales/${row.id}/document`)}>Ver comprovante</button>
                        <button className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--brand-surface)]" onClick={() => void openApiDocument(`/sales/${row.id}/document`, true)}>Imprimir relatório</button>
                        <button className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--brand-surface)]" onClick={() => void openApiDocument(`/sales/${row.id}/receipt`, true)}>Imprimir térmico</button>
                        <button className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--brand-surface)]" onClick={() => void issueFiscal(row.id)}>Emitir NFC-e</button>
                        <button className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--brand-surface)]" onClick={() => void loadFiscal(row.id)}>Consultar fiscal</button>
                        <a className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--brand-surface)]" href={`/operations?sale=${row.id}`}>Troca ou devolução</a>
                      </div>
                    </details>
                    {row.status !== "cancelled" ? <Button variant="danger" icon={<Ban size={14} />} onClick={() => void cancelSale(row.id)}>Cancelar</Button> : null}
                  </div>
                )
              }
            ]}
          />
          <PaginationFooter
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => current + 1)}
          />

          {sales.map((sale) => {
            const saleHistory = history[sale.id];
            const docs = fiscalHistory[sale.id];
            return saleHistory ? (
              <Card key={sale.id}>
                <CardContent className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--brand-primary)]">Historico da venda {sale.id.slice(0, 8)}</h3>
                      <p className="text-xs text-slate-500">{sale.notes || "Sem observacoes registradas."}</p>
                    </div>
                    {sale.cancelledReason ? <Badge>{sale.cancelledReason}</Badge> : null}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-4">
                    <HistoryList title="Pagamentos" items={saleHistory.payments.map((item) => `${paymentMethodLabel(item.method)} · ${paymentStatusLabel(item.status)} · ${Number(item.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`)} />
                    <HistoryList title="Recebiveis" items={saleHistory.receivables.map((item) => `${item.status} · ${new Date(`${item.dueDate}T00:00:00`).toLocaleDateString("pt-BR")} · ${Number(item.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`)} />
                    <HistoryList title="Estoque" items={saleHistory.movements.map((item) => `${item.movementType} · ${item.quantity}`)} />
                    <HistoryList title="Auditoria" items={saleHistory.audit.map((item) => `${item.action} · ${new Date(item.createdAt).toLocaleString("pt-BR")}`)} />
                  </div>
                  <div className="rounded-md border-l-2 border-[var(--brand-highlight)] bg-[var(--brand-surface)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-secondary)]">Linha do tempo</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700">
                      {saleHistory.audit.length ? saleHistory.audit.map((item, index) => <p key={`${item.action}-${index}`}>{new Date(item.createdAt).toLocaleString("pt-BR")} · {auditLabel(item.action)}</p>) : <p className="text-slate-500">Nenhuma alteração adicional registrada.</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : docs ? (
              <Card key={`${sale.id}-fiscal`}>
                <CardContent className="grid gap-3">
                  <h3 className="text-sm font-semibold text-[var(--brand-primary)]">Fiscal da venda {sale.id.slice(0, 8)}</h3>
                  {docs.length ? docs.map((doc) => (
                    <div key={doc.id} className="grid gap-1 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>NFC-e · {fiscalLabel(doc.status)}</strong>
                        <Badge>{doc.provider || "provedor pendente"} · {doc.environment || "homologação"}</Badge>
                      </div>
                      <p className="text-slate-600">Tentativas: {doc.attemptCount} · Criada em {new Date(doc.createdAt).toLocaleString("pt-BR")}</p>
                      {doc.externalId ? <p className="text-slate-600">ID externo: {doc.externalId}</p> : null}
                      {doc.lastError ? <p className="text-rose-700">{doc.lastError}</p> : null}
                    </div>
                  )) : <p className="text-sm text-slate-500">Nenhuma solicitação fiscal registrada para esta venda.</p>}
                </CardContent>
              </Card>
            ) : null;
          })}
        </div>
      </section>
    </div>
  );
}

function HistoryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-secondary)]">{title}</p>
      <div className="mt-2 grid gap-2 text-sm text-slate-700">
        {items.length ? items.map((item) => <p key={item}>{item}</p>) : <p className="text-slate-400">Sem eventos.</p>}
      </div>
    </div>
  );
}

function fiscalLabel(status?: string | null) {
  if (!status) return "Não solicitada";
  const labels: Record<string, string> = {
    queued: "Na fila",
    pending_provider: "Aguardando provedor",
    processing: "Processando",
    issued: "Emitida",
    error: "Erro",
    cancelled: "Cancelada",
  };
  return labels[status] ?? status;
}

const paymentOptions = [
  { label: "Pix", value: "pix" },
  { label: "Dinheiro", value: "cash" },
  { label: "Cartão de crédito", value: "credit_card" },
  { label: "Cartão de débito", value: "debit_card" },
  { label: "Boleto", value: "bank_slip" },
  { label: "Crediário da loja", value: "store_credit" },
  { label: "Transferência", value: "bank_transfer" },
  { label: "Outro", value: "other" },
];

function paymentMethodLabel(method?: string | null) {
  return paymentOptions.find((option) => option.value === method)?.label ?? method ?? "Não informado";
}

function paymentStatusLabel(status?: string | null) {
  const labels: Record<string, string> = { paid: "Pago", pending: "Pendente", cancelled: "Cancelado", refunded: "Estornado" };
  return labels[status ?? ""] ?? status ?? "Não informado";
}

function saleStatusLabel(status: string) {
  const labels: Record<string, string> = { sold: "Concluída", cancelled: "Cancelada", draft: "Rascunho", open: "Em aberto" };
  return labels[status] ?? status;
}

function auditLabel(action: string) {
  const labels: Record<string, string> = {
    "sale.created": "Venda registrada",
    "sale.cancelled": "Venda cancelada",
    "sale.returned": "Devolução concluída",
    "payment.created": "Pagamento registrado",
    "fiscal.requested": "Emissão fiscal solicitada",
  };
  return labels[action] ?? action;
}

function InsightCard({
  title,
  value,
  detail,
  money = false,
  accent = false,
  icon: Icon
}: {
  title: string;
  value: number;
  detail: string;
  money?: boolean;
  accent?: boolean;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--brand-primary)]">
            {money ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : value}
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

function QuickFigure({ label, value, money = false, accent = false }: { label: string; value: number; money?: boolean; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/8 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/68">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent ? "text-[var(--brand-accent)]" : "text-white"}`}>
        {money ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : value}
      </p>
    </div>
  );
}
