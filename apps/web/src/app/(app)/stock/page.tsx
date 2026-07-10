"use client";

import { Badge, Button, Card, CardContent, DataTable, EmptyState, Input, PageHeader, Select, Tabs } from "@sgc/ui";
import { AlertTriangle, ArrowRightLeft, Boxes, ClipboardCheck, Plus, RefreshCw, Warehouse, type LucideIcon } from "lucide-react";
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

interface ProductRow {
  id: string;
  name: string;
  sku?: string;
}

interface StockRow {
  id: string;
  productId: string;
  productName: string;
  sku?: string;
  branchName?: string;
  quantity: string;
  minStock: string;
}

interface MovementRow {
  id: string;
  movementType: string;
  quantity: string;
  reason: string;
  productName: string;
  branchName: string;
  createdAt: string;
}

interface StockReportRow {
  productId: string;
  productName: string;
  branchName: string;
  quantity: string;
  minStock?: string;
  lastMovementAt?: string;
}

export default function StockPage() {
  const [activeTab, setActiveTab] = useState("saldos");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [reports, setReports] = useState<{ lowStock: StockReportRow[]; slowMoving: StockReportRow[] }>({
    lowStock: [],
    slowMoving: []
  });
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stockSearch, setStockSearch] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [stockPage, setStockPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [movementTypeFilter, setMovementTypeFilter] = useState("all");
  const [stockPagination, setStockPagination] = useState({ total: 0, page: 1, pageSize: 10 });
  const [movementPagination, setMovementPagination] = useState({ total: 0, page: 1, pageSize: 10 });

  const branchOptions = useMemo(() => branches.map((branch) => ({ label: branch.name, value: branch.id })), [branches]);
  const productOptions = useMemo(
    () => products.map((product) => ({ label: `${product.name}${product.sku ? ` · ${product.sku}` : ""}`, value: product.id })),
    [products]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const stockQuery = new URLSearchParams({ page: String(stockPage), pageSize: "10" });
      if (stockSearch) stockQuery.set("search", stockSearch);
      if (stockStatusFilter !== "all") stockQuery.set("stockStatus", stockStatusFilter);
      const movementQuery = new URLSearchParams({ page: String(movementPage), pageSize: "10" });
      if (movementSearch) movementQuery.set("search", movementSearch);
      if (movementTypeFilter !== "all") movementQuery.set("movementType", movementTypeFilter);
      const [stockResponse, movementResponse, reportResponse, branchesResponse, productsResponse] = await Promise.all([
        apiFetch<ListResponse<StockRow>>(`/stock?${stockQuery.toString()}`),
        apiFetch<ListResponse<MovementRow>>(`/stock/movements?${movementQuery.toString()}`),
        apiFetch<{ lowStock: StockReportRow[]; slowMoving: StockReportRow[] }>("/stock/reports"),
        apiFetch<ListResponse<BranchRow>>("/branches?pageSize=100"),
        apiFetch<ListResponse<ProductRow>>("/products?pageSize=100")
      ]);
      const mappedStock = stockResponse.data.map((row) => ({ ...row, id: `${row.productId}-${row.branchName}` }));
      setStock(mappedStock);
      setMovements(movementResponse.data);
      setStockPagination(stockResponse.pagination ?? { total: mappedStock.length, page: stockPage, pageSize: 10 });
      setMovementPagination(movementResponse.pagination ?? { total: movementResponse.data.length, page: movementPage, pageSize: 10 });
      setReports(reportResponse);
      setBranches(branchesResponse.data);
      setProducts(productsResponse.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar estoque.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [movementPage, movementSearch, movementTypeFilter, stockPage, stockSearch, stockStatusFilter]);

  async function submit(event: FormEvent<HTMLFormElement>, path: string, buildBody: (form: FormData) => unknown) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      await apiFetch(path, {
        method: "POST",
        body: JSON.stringify(buildBody(form))
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar operacao de estoque.");
    }
  }

  const totalUnits = stock.reduce((sum, row) => sum + Number(row.quantity), 0);
  const lowStockCount = reports.lowStock.length;
  const slowMovingCount = reports.slowMoving.length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Estoque"
        description="Transferencias, inventario, entradas por compra e monitoramento de estoque baixo ou parado."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void openApiDocument("/stock/reports/document?kind=low-stock")}>
              Exportar estoque baixo
            </Button>
            <Button variant="secondary" onClick={() => void openApiDocument("/stock/reports/document?kind=slow-moving")}>
              Exportar estoque parado
            </Button>
            <Button variant="secondary" onClick={() => void load()} icon={<RefreshCw size={16} />}>
              Atualizar dados
            </Button>
          </div>
        }
      />
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StockMetric title="Posicoes de estoque" value={stock.length} detail="Produtos por loja monitorados" icon={Warehouse} />
        <StockMetric title="Unidades em saldo" value={totalUnits} detail="Soma dos saldos carregados" icon={Boxes} />
        <StockMetric title="Reposicao urgente" value={lowStockCount} detail="Itens abaixo do minimo" icon={AlertTriangle} accent />
        <StockMetric title="Sem giro recente" value={slowMovingCount} detail="Itens parados no periodo" icon={ClipboardCheck} />
      </section>

      <Tabs
        defaultValue="saldos"
        value={activeTab}
        onValueChange={setActiveTab}
        tabs={[
          {
            value: "saldos",
            label: "Saldos",
            content: (
              <div className="grid gap-4">
                <Card className="overflow-hidden border-[#11284f] bg-[var(--brand-primary)] text-white shadow-[0_28px_64px_rgba(11,29,61,0.18)]">
                  <CardContent className="grid gap-4 p-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <div>
                      <Badge className="border-white/10 bg-white/10 text-white">Controle de estoque</Badge>
                      <h2 data-brand-display="true" className="mt-4 text-3xl font-semibold text-white">
                        Saldos por loja com leitura rapida de risco e reposicao.
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
                        A tela centraliza disponibilidade, criticidade e proximidade do estoque minimo sem tirar a operacao do fluxo.
                      </p>
                    </div>
                    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/6 p-4">
                      <QuickStockFigure label="Saldos mapeados" value={stock.length} />
                      <QuickStockFigure label="Itens com reposicao" value={lowStockCount} accent />
                      <QuickStockFigure label="Itens sem giro" value={slowMovingCount} />
                    </div>
                  </CardContent>
                </Card>

                <DataTable
                  rows={stock}
                  empty={
                    loading ? (
                      "Carregando..."
                    ) : (
                      <EmptyState
                        eyebrow="Saldo por loja"
                        title="Nenhum saldo encontrado no momento."
                        description="Os saldos aparecerao aqui assim que produtos forem movimentados, ajustados ou recebidos por compra."
                        icon={<Warehouse size={20} />}
                      />
                    )
                  }
                  columns={[
                    { key: "product", header: "Produto", render: (row) => row.productName },
                    { key: "branch", header: "Loja", render: (row) => row.branchName ?? "-" },
                    { key: "quantity", header: "Saldo", render: (row) => Number(row.quantity).toLocaleString("pt-BR") },
                    {
                      key: "status",
                      header: "Status",
                      render: (row) => <Badge>{Number(row.quantity) <= Number(row.minStock) ? "Reposicao" : "Ok"}</Badge>
                    }
                  ]}
                />
                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    aria-label="Buscar saldos"
                    placeholder="Buscar por produto ou SKU"
                    value={stockSearch}
                    onChange={(event) => {
                      setStockSearch(event.target.value);
                      setStockPage(1);
                    }}
                  />
                  <Select
                    aria-label="Status do saldo"
                    options={[
                      { label: "Todos os saldos", value: "all" },
                      { label: "Somente criticos", value: "critical" },
                      { label: "Somente saudaveis", value: "healthy" }
                    ]}
                    value={stockStatusFilter}
                    onChange={(event) => {
                      setStockStatusFilter(event.target.value);
                      setStockPage(1);
                    }}
                  />
                  <div className="flex items-center">
                    <Badge>{stockPagination.total} posicoes monitoradas</Badge>
                  </div>
                </div>
                <PaginationFooter
                  page={stockPagination.page}
                  pageSize={stockPagination.pageSize}
                  total={stockPagination.total}
                  onPrevious={() => setStockPage((current) => Math.max(1, current - 1))}
                  onNext={() => setStockPage((current) => current + 1)}
                />
              </div>
            )
          },
          {
            value: "operacoes",
            label: "Operacoes",
            content: (
              <div className="grid gap-4 lg:grid-cols-2">
                <StockFormCard title="Ajuste manual" onSubmit={(event) => void submit(event, "/stock/adjustments", (form) => ({
                  branchId: form.get("branchId"),
                  productId: form.get("productId"),
                  quantityDelta: Number(form.get("quantityDelta") || 0),
                  reason: form.get("reason")
                }))}>
                  <Select name="branchId" label="Loja" options={branchOptions} required />
                  <Select name="productId" label="Produto" options={productOptions} required />
                  <Input name="quantityDelta" label="Quantidade" type="number" step="0.001" required />
                  <Input name="reason" label="Motivo" required />
                </StockFormCard>

                <StockFormCard title="Transferencia entre lojas" onSubmit={(event) => void submit(event, "/stock/transfers", (form) => ({
                  sourceBranchId: form.get("sourceBranchId"),
                  targetBranchId: form.get("targetBranchId"),
                  items: [
                    {
                      productId: form.get("transferProductId"),
                      quantity: Number(form.get("transferQuantity") || 0)
                    }
                  ]
                }))}>
                  <Select name="sourceBranchId" label="Origem" options={branchOptions} required />
                  <Select name="targetBranchId" label="Destino" options={branchOptions} required />
                  <Select name="transferProductId" label="Produto" options={productOptions} required />
                  <Input name="transferQuantity" label="Quantidade" type="number" step="0.001" required />
                </StockFormCard>

                <StockFormCard title="Inventario" onSubmit={(event) => void submit(event, "/stock/inventory-counts", (form) => ({
                  branchId: form.get("inventoryBranchId"),
                  notes: form.get("notes") || undefined,
                  items: [
                    {
                      productId: form.get("inventoryProductId"),
                      countedQuantity: Number(form.get("countedQuantity") || 0)
                    }
                  ]
                }))}>
                  <Select name="inventoryBranchId" label="Loja" options={branchOptions} required />
                  <Select name="inventoryProductId" label="Produto" options={productOptions} required />
                  <Input name="countedQuantity" label="Quantidade contada" type="number" step="0.001" required />
                  <Input name="notes" label="Observacoes" />
                </StockFormCard>

                <StockFormCard title="Entrada por compra" onSubmit={(event) => void submit(event, "/stock/purchase-entries", (form) => ({
                  branchId: form.get("purchaseBranchId"),
                  supplierName: form.get("supplierName"),
                  notes: form.get("purchaseNotes") || undefined,
                  items: [
                    {
                      productId: form.get("purchaseProductId"),
                      quantity: Number(form.get("purchaseQuantity") || 0),
                      unitCost: Number(form.get("unitCost") || 0)
                    }
                  ]
                }))}>
                  <Select name="purchaseBranchId" label="Loja" options={branchOptions} required />
                  <Input name="supplierName" label="Fornecedor" required />
                  <Select name="purchaseProductId" label="Produto" options={productOptions} required />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input name="purchaseQuantity" label="Quantidade" type="number" step="0.001" required />
                    <Input name="unitCost" label="Custo unitario" type="number" step="0.01" required />
                  </div>
                  <Input name="purchaseNotes" label="Observacoes" />
                </StockFormCard>
              </div>
            )
          },
          {
            value: "relatorios",
            label: "Relatorios",
            content: (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardContent className="grid gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-950">Estoque baixo</h2>
                      <p className="text-sm text-slate-500">Produtos em reposicao imediata.</p>
                    </div>
                    <DataTable
                      rows={reports.lowStock.map((row) => ({ ...row, id: `${row.productId}-${row.branchName}` }))}
                      empty={
                        <EmptyState
                          eyebrow="Reposicao"
                          title="Nenhum item em estoque baixo."
                          description="Boa noticia: nao ha produtos abaixo do minimo nas lojas monitoradas."
                          icon={<AlertTriangle size={20} />}
                        />
                      }
                      columns={[
                        { key: "product", header: "Produto", render: (row) => row.productName },
                        { key: "branch", header: "Loja", render: (row) => row.branchName },
                        { key: "quantity", header: "Saldo", render: (row) => row.quantity },
                        { key: "min", header: "Minimo", render: (row) => row.minStock ?? "-" }
                      ]}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="grid gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-950">Estoque parado</h2>
                      <p className="text-sm text-slate-500">Produtos sem movimentacao recente.</p>
                    </div>
                    <DataTable
                      rows={reports.slowMoving.map((row) => ({ ...row, id: `${row.productId}-${row.branchName}` }))}
                      empty={
                        <EmptyState
                          eyebrow="Giro de estoque"
                          title="Nenhum item parado no periodo."
                          description="Os produtos acompanhados tiveram movimentacao recente dentro da janela analisada."
                          icon={<ClipboardCheck size={20} />}
                        />
                      }
                      columns={[
                        { key: "product", header: "Produto", render: (row) => row.productName },
                        { key: "branch", header: "Loja", render: (row) => row.branchName },
                        { key: "quantity", header: "Saldo", render: (row) => row.quantity },
                        {
                          key: "last",
                          header: "Ultima mov.",
                          render: (row) => (row.lastMovementAt ? new Date(row.lastMovementAt).toLocaleDateString("pt-BR") : "-")
                        }
                      ]}
                    />
                  </CardContent>
                </Card>
              </div>
            )
          },
          {
            value: "historico",
            label: "Historico",
            content: (
              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    aria-label="Buscar historico de estoque"
                    placeholder="Buscar por produto ou motivo"
                    value={movementSearch}
                    onChange={(event) => {
                      setMovementSearch(event.target.value);
                      setMovementPage(1);
                    }}
                  />
                  <Select
                    aria-label="Tipo de movimento"
                    options={[
                      { label: "Todos os tipos", value: "all" },
                      { label: "Transferencia entrada", value: "transfer_in" },
                      { label: "Transferencia saida", value: "transfer_out" },
                      { label: "Ajuste entrada", value: "manual_in" },
                      { label: "Ajuste saida", value: "manual_out" }
                    ]}
                    value={movementTypeFilter}
                    onChange={(event) => {
                      setMovementTypeFilter(event.target.value);
                      setMovementPage(1);
                    }}
                  />
                  <div className="flex items-center">
                    <Badge>{movementPagination.total} movimentos na leitura atual</Badge>
                  </div>
                </div>
                <DataTable
                  rows={movements}
                  empty={
                    <EmptyState
                      eyebrow="Historico operacional"
                      title="Nenhuma movimentacao encontrada."
                      description="Quando houver ajustes, transferencias, inventarios ou entradas por compra, o historico aparecera aqui."
                      icon={<ArrowRightLeft size={20} />}
                    />
                  }
                  columns={[
                    { key: "date", header: "Data", render: (row) => new Date(row.createdAt).toLocaleString("pt-BR") },
                    { key: "product", header: "Produto", render: (row) => row.productName },
                    { key: "branch", header: "Loja", render: (row) => row.branchName },
                    { key: "type", header: "Tipo", render: (row) => <Badge>{row.movementType}</Badge> },
                    { key: "quantity", header: "Quantidade", render: (row) => row.quantity },
                    { key: "reason", header: "Motivo", render: (row) => row.reason }
                  ]}
                />
                <PaginationFooter
                  page={movementPagination.page}
                  pageSize={movementPagination.pageSize}
                  total={movementPagination.total}
                  onPrevious={() => setMovementPage((current) => Math.max(1, current - 1))}
                  onNext={() => setMovementPage((current) => current + 1)}
                />
              </div>
            )
          }
        ]}
      />
    </div>
  );
}

function StockFormCard({
  title,
  children,
  onSubmit
}: {
  title: string;
  children: React.ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Card>
      <CardContent>
        <form className="grid gap-3" onSubmit={onSubmit}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(19,58,124,0.10)] text-[var(--brand-secondary)]">
              <ArrowRightLeft size={18} />
            </div>
            <h2 className="text-base font-semibold text-[var(--brand-primary)]">{title}</h2>
          </div>
          {children}
          <Button type="submit" icon={<Plus size={16} />}>
            Registrar operacao
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StockMetric({
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
          <p className="mt-2 text-2xl font-semibold text-[var(--brand-primary)]">{value.toLocaleString("pt-BR")}</p>
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

function QuickStockFigure({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/8 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/68">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent ? "text-[var(--brand-accent)]" : "text-white"}`}>{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}
