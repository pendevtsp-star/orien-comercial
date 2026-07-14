"use client";

import { Badge, Button, Card, CardContent, DataTable, EmptyState, Input, PageHeader, Select, Tabs } from "@sgc/ui";
import { AlertTriangle, ArrowRightLeft, Boxes, CheckCircle2, ClipboardCheck, Download, Eye, FileCheck2, Plus, Printer, RefreshCw, Search, Warehouse, type LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, downloadApiFile, openApiDocument } from "../../../lib/api";
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

interface SupplierRow {
  id: string;
  name: string;
  document?: string;
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

type PreviewItem = {
  sourceIndex: number;
  name: string;
  quantity: number;
  unitCost: number;
  salePrice?: number;
  match?: { productId: string; name: string; costPrice?: number } | null;
  suggestedAction: "link" | "create";
};

type ReceivingChoice = {
  action: "link" | "create" | "ignore";
  productId?: string;
  name: string;
  quantity: number;
  unitCost: number;
  salePrice?: number;
};

type ReceivingFilter = "all" | "alerts" | "linked" | "create" | "ignored";

type PurchasePreview = {
  fiscalDocumentId: string;
  requiresManifestation?: boolean;
  document: { key: string; number: string; series?: string; issuedAt?: string; totalAmount: number };
  supplier: { name: string; document?: string; match?: { id: string; name: string } | null };
  purchaseOrders?: Array<{ id: string; status: string; expectedAt?: string | null; pendingItems: number }>;
  items: Array<
    PreviewItem & {
      barcode?: string;
      supplierCode?: string;
      ncm?: string;
      cfop?: string;
      divergences?: string[];
    }
  >;
};

type InboundDetail = {
  document: {
    id: string;
    branchName: string;
    accessKey: string;
    documentNumber: string;
    series?: string | null;
    status: string;
    issuerName: string;
    issuerDocument?: string | null;
    issuedAt?: string | null;
    totalAmount: number;
    manifestationStatus: string;
    manifestationProtocol?: string | null;
    receivedAt?: string | null;
  };
  summary: { itemCount: number; linked: number; created: number; ignored: number; withDivergence: number };
  items: Array<{
    id: string;
    lineNumber: number;
    supplierCode?: string | null;
    barcode?: string | null;
    description: string;
    unit?: string | null;
    quantity: string;
    unitCost: string;
    totalAmount: string;
    ncm?: string | null;
    cest?: string | null;
    cfop?: string | null;
    suggestedSalePrice?: string | null;
    resolution: string;
    divergences: string[];
    productId?: string | null;
    productName?: string | null;
    productSku?: string | null;
  }>;
};

function makeReceivingChoice(item: PreviewItem): ReceivingChoice {
  return {
    action: item.suggestedAction,
    productId: item.match?.productId,
    name: item.name,
    quantity: item.quantity,
    unitCost: item.unitCost,
    salePrice: item.salePrice ?? suggestedSalePrice(item.unitCost),
  };
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
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
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

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && ["saldos", "operacoes", "notas", "relatorios", "movimentos"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  const branchOptions = useMemo(() => branches.map((branch) => ({ label: branch.name, value: branch.id })), [branches]);
  const productOptions = useMemo(
    () => products.map((product) => ({ label: `${product.name}${product.sku ? ` · ${product.sku}` : ""}`, value: product.id })),
    [products]
  );
  const supplierOptions = useMemo(
    () => suppliers.map((supplier) => ({ label: `${supplier.name}${supplier.document ? ` · ${supplier.document}` : ""}`, value: supplier.id })),
    [suppliers]
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
      const [stockResponse, movementResponse, reportResponse, branchesResponse, productsResponse, suppliersResponse] = await Promise.all([
        apiFetch<ListResponse<StockRow>>(`/stock?${stockQuery.toString()}`),
        apiFetch<ListResponse<MovementRow>>(`/stock/movements?${movementQuery.toString()}`),
        apiFetch<{ lowStock: StockReportRow[]; slowMoving: StockReportRow[] }>("/stock/reports"),
        apiFetch<ListResponse<BranchRow>>("/branches?pageSize=100"),
        apiFetch<ListResponse<ProductRow>>("/products?pageSize=100"),
        apiFetch<ListResponse<SupplierRow>>("/suppliers?pageSize=100&isActive=true")
      ]);
      const mappedStock = stockResponse.data.map((row) => ({ ...row, id: `${row.productId}-${row.branchName}` }));
      setStock(mappedStock);
      setMovements(movementResponse.data);
      setStockPagination(stockResponse.pagination ?? { total: mappedStock.length, page: stockPage, pageSize: 10 });
      setMovementPagination(movementResponse.pagination ?? { total: movementResponse.data.length, page: movementPage, pageSize: 10 });
      setReports(reportResponse);
      setBranches(branchesResponse.data);
      setProducts(productsResponse.data);
      setSuppliers(suppliersResponse.data);
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
          <div className="flex flex-wrap gap-2">
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
                <Card variant="brand" className="overflow-hidden shadow-[0_28px_64px_rgba(11,29,61,0.18)]">
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
                  supplierId: form.get("supplierId"),
                  documentNumber: form.get("documentNumber") || undefined,
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
                  <Select name="supplierId" label="Fornecedor" options={supplierOptions} required />
                  <Input name="documentNumber" label="Número da nota ou pedido" />
                  <Select name="purchaseProductId" label="Produto" options={productOptions} required />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input name="purchaseQuantity" label="Quantidade" type="number" step="0.001" required />
                    <Input name="unitCost" label="Custo unitario" type="number" step="0.01" required />
                  </div>
                  <Input name="purchaseNotes" label="Observacoes" />
                </StockFormCard>

                <PurchaseXmlImporter
                  branches={branchOptions}
                  suppliers={supplierOptions}
                  products={productOptions}
                  onCompleted={() => void load()}
                />
              </div>
            )
          },
          {
            value: "notas",
            label: "Notas recebidas",
            content: <InboundFiscalHistory branches={branchOptions} products={productOptions} onCompleted={() => void load()} />
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

function PurchaseXmlImporter({
  branches,
  suppliers,
  products,
  onCompleted,
}: {
  branches: Array<{ label: string; value: string }>;
  suppliers: Array<{ label: string; value: string }>;
  products: Array<{ label: string; value: string }>;
  onCompleted: () => void;
}) {
  const [branchId, setBranchId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [createSupplier, setCreateSupplier] = useState(true);
  const [accessKey, setAccessKey] = useState("");
  const [source, setSource] = useState<"xml_upload" | "focus_key">("xml_upload");
  const [xml, setXml] = useState("");
  const [preview, setPreview] = useState<PurchasePreview | null>(null);
  const [choices, setChoices] = useState<Record<number, ReceivingChoice>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReceivingFilter>("all");
  const reviewStats = useMemo(() => {
    if (!preview) return null;
    return preview.items.reduce(
      (acc, item) => {
        const action = choices[item.sourceIndex]?.action ?? item.suggestedAction;
        if (action === "link") acc.linked += 1;
        if (action === "create") acc.created += 1;
        if (action === "ignore") acc.ignored += 1;
        if (item.divergences?.length) acc.withDivergence += 1;
        acc.divergences += item.divergences?.length ?? 0;
        return acc;
      },
      { linked: 0, created: 0, ignored: 0, withDivergence: 0, divergences: 0 },
    );
  }, [choices, preview]);
  const receivingTotal = useMemo(() => {
    if (!preview) return 0;
    return preview.items.reduce((sum, item) => {
      const choice = choices[item.sourceIndex] ?? makeReceivingChoice(item);
      if (choice.action === "ignore") return sum;
      return sum + choice.quantity * choice.unitCost;
    }, 0);
  }, [choices, preview]);
  const filteredPreviewItems = useMemo(() => {
    if (!preview) return [];
    return preview.items.filter((item) => {
      const choice = choices[item.sourceIndex] ?? makeReceivingChoice(item);
      if (reviewFilter === "alerts") return Boolean(item.divergences?.length);
      if (reviewFilter === "linked") return choice.action === "link";
      if (reviewFilter === "create") return choice.action === "create";
      if (reviewFilter === "ignored") return choice.action === "ignore";
      return true;
    });
  }, [choices, preview, reviewFilter]);
  function setAllMatchedToLink() {
    if (!preview) return;
    setChoices((current) =>
      Object.fromEntries(
        preview.items.map((item) => {
          const choice = current[item.sourceIndex] ?? makeReceivingChoice(item);
          return [item.sourceIndex, item.match?.productId ? { ...choice, action: "link" as const, productId: item.match.productId } : choice];
        }),
      ),
    );
  }
  function ignoreAlertedItems() {
    if (!preview) return;
    setChoices((current) => ({
      ...current,
      ...Object.fromEntries(
        preview.items
          .filter((item) => item.divergences?.length)
          .map((item) => [item.sourceIndex, { ...(current[item.sourceIndex] ?? makeReceivingChoice(item)), action: "ignore" as const }]),
      ),
    }));
  }

  async function previewXml(file: File) {
    if (!branchId) return setError("Escolha a loja antes de importar o XML.");
    setError(null);
    const text = await file.text();
    setXml(text);
    try {
      const result = await apiFetch<typeof preview>("/stock/purchase-imports/xml/preview", { method: "POST", body: JSON.stringify({ branchId, xml: text }) });
      setPreview(result);
      setChoices(Object.fromEntries((result?.items ?? []).map((item) => [item.sourceIndex, makeReceivingChoice(item)])));
      const divergences = (result?.items ?? []).reduce((total, item) => total + (item.divergences?.length ?? 0), 0);
      setMessage(divergences ? `XML lido com ${divergences} ponto(s) para conferência.` : "XML lido sem divergências críticas. Revise os vínculos antes de confirmar a entrada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ler o XML da nota.");
    }
  }
  async function previewKey() {
    if (!branchId) return setError("Escolha a loja antes de consultar a chave.");
    if (!/^\d{44}$/.test(accessKey.replace(/\D/g, ""))) return setError("Informe os 44 dígitos da chave da NF-e.");
    setError(null);
    setSource("focus_key");
    try {
      const result = await apiFetch<typeof preview>("/stock/purchase-imports/key/preview", {
        method: "POST",
        body: JSON.stringify({ branchId, accessKey: accessKey.replace(/\D/g, "") }),
      });
      setPreview(result);
      setXml("");
      setChoices(Object.fromEntries((result?.items ?? []).map((item) => [item.sourceIndex, makeReceivingChoice(item)])));
      setMessage("NF-e consultada. Confira os vínculos e divergências antes de receber.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar a NF-e pela chave.");
    }
  }
  async function commit() {
    if (!preview || !branchId) return;
    if (source === "xml_upload" && !xml) return;
    setError(null);
    try {
      const result = await apiFetch<{ id: string; fiscalDocumentId: string; itemCount: number; totalAmount: number }>("/stock/purchase-imports/xml/commit", {
        method: "POST",
        body: JSON.stringify({
          branchId,
          supplierId: supplierId || undefined,
          supplierName: supplierId ? undefined : preview.supplier.name,
          createSupplier: !supplierId && createSupplier,
          purchaseOrderId: purchaseOrderId || undefined,
          documentKey: preview.document.key,
          documentNumber: preview.document.number,
          source,
          xml: source === "xml_upload" ? xml : undefined,
          items: preview.items.map((item) => ({
            sourceIndex: item.sourceIndex,
            action: choices[item.sourceIndex]?.action ?? "create",
            productId: choices[item.sourceIndex]?.productId,
            name: choices[item.sourceIndex]?.name ?? item.name,
            barcode: item.barcode,
            sku: item.supplierCode,
            quantity: choices[item.sourceIndex]?.quantity ?? item.quantity,
            unitCost: choices[item.sourceIndex]?.unitCost ?? item.unitCost,
            salePrice: choices[item.sourceIndex]?.salePrice ?? item.salePrice,
          })),
        }),
      });
      setMessage(`Entrada confirmada: ${result.itemCount} item(ns), total ${result.totalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Estoque e custos foram atualizados com trilha de auditoria.`);
      setPreview(null);
      setXml("");
      setAccessKey("");
      setPurchaseOrderId("");
      onCompleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A entrada não foi concluída.");
    }
  }
  async function acknowledgeAndReload() {
    if (!preview) return;
    setError(null);
    try {
      await apiFetch(`/fiscal/inbound/${preview.fiscalDocumentId}/manifest`, { method: "POST", body: JSON.stringify({ type: "ciencia" }) });
      setMessage("Ciência registrada. Buscando os itens completos disponibilizados pelo provedor...");
      await previewKey();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar a ciência da NF-e."); }
  }
  return (
    <Card>
      <CardContent className="grid gap-3">
        <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--brand-secondary)]">Recebimento fiscal assistido</p><h2 className="mt-1 font-semibold text-[var(--brand-primary)]">Ler nota de compra</h2><p className="mt-1 text-sm leading-5 text-slate-500">Envie o XML ou consulte a chave. O Orien compara produtos, custos, quantidades e dados fiscais antes de atualizar o estoque.</p></div>
        <div className="grid gap-3 md:grid-cols-2">
          <Select label="Loja" value={branchId} onChange={(event) => setBranchId(event.target.value)} options={branches} />
          <Select label="Fornecedor" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} options={[{ label: "Usar fornecedor do XML", value: "" }, ...suppliers]} />
        </div>
        <div className="grid gap-3 rounded-md border border-[var(--brand-border)] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <Input label="Chave de acesso da NF-e" value={accessKey} inputMode="numeric" maxLength={44} placeholder="Digite ou leia os 44 dígitos" onChange={(event) => setAccessKey(event.target.value.replace(/\D/g, "").slice(0, 44))} />
          <Button variant="secondary" icon={<Search size={16} />} onClick={() => void previewKey()}>Consultar chave</Button>
        </div>
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-slate-400"><span className="h-px flex-1 bg-[var(--brand-border)]" />ou envie o arquivo<span className="h-px flex-1 bg-[var(--brand-border)]" /></div>
        <Input label="Arquivo XML da NF-e" type="file" accept=".xml,text/xml,application/xml" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setSource("xml_upload"); void previewXml(file); } }} />
        {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
        {preview ? <div className="grid gap-3 rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">NF-e {preview.document.number}{preview.document.series ? ` · série ${preview.document.series}` : ""} · {preview.supplier.name}</p><p className="text-xs text-slate-500">Total R$ {preview.document.totalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · chave {preview.document.key}</p></div><Badge className={preview.supplier.match ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}>{preview.supplier.match ? `Fornecedor vinculado: ${preview.supplier.match.name}` : "Fornecedor ainda não cadastrado"}</Badge></div>
          {reviewStats ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ReviewMetric label="Vinculados" value={reviewStats.linked} tone="ok" />
            <ReviewMetric label="Novos produtos" value={reviewStats.created} tone={reviewStats.created ? "warn" : "ok"} />
            <ReviewMetric label="Com alerta" value={reviewStats.withDivergence} tone={reviewStats.withDivergence ? "warn" : "ok"} />
            <ReviewMetric label="Ignorados" value={reviewStats.ignored} tone={reviewStats.ignored ? "muted" : "ok"} />
          </div> : null}
          <div className="rounded-md border border-[var(--brand-border)] bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-500">Total que será lançado no estoque</span>
              <strong className="text-lg text-[var(--brand-primary)]">{receivingTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
            </div>
            {reviewStats?.divergences ? <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">Revise os alertas antes de confirmar. O estoque só será movimentado para itens vinculados ou cadastrados.</p> : null}
          </div>
          {!preview.supplier.match ? <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={createSupplier} onChange={(event) => setCreateSupplier(event.target.checked)} />Cadastrar o fornecedor automaticamente ao confirmar</label> : null}
          {preview.requiresManifestation ? <div className="grid gap-3 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><div><strong>Os itens completos ainda não foram liberados.</strong><p className="mt-1 text-blue-800">A SEFAZ exige a ciência da operação antes de disponibilizar o conteúdo integral desta NF-e.</p></div><Button variant="secondary" onClick={() => void acknowledgeAndReload()}>Dar ciência e carregar itens</Button></div> : null}
          {preview.purchaseOrders?.length ? <Select label="Vincular a pedido de compra" value={purchaseOrderId} onChange={(event) => setPurchaseOrderId(event.target.value)} options={[{ label: "Receber sem vincular a pedido", value: "" }, ...preview.purchaseOrders.map((order) => ({ label: `Pedido ${order.id.slice(0, 8)} · ${order.pendingItems} item(ns) pendente(s)`, value: order.id }))]} /> : null}
          <div className="grid gap-3 rounded-md border border-[var(--brand-border)] bg-white p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <Select
              label="Filtrar conferência"
              value={reviewFilter}
              onChange={(event) => setReviewFilter(event.target.value as ReceivingFilter)}
              options={[
                { label: `Todos os itens (${preview.items.length})`, value: "all" },
                { label: `Com alerta (${reviewStats?.withDivergence ?? 0})`, value: "alerts" },
                { label: `Vinculados (${reviewStats?.linked ?? 0})`, value: "linked" },
                { label: `Cadastrar produto (${reviewStats?.created ?? 0})`, value: "create" },
                { label: `Ignorados (${reviewStats?.ignored ?? 0})`, value: "ignored" },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={setAllMatchedToLink}>Vincular encontrados</Button>
              <Button variant="ghost" onClick={ignoreAlertedItems}>Ignorar itens com alerta</Button>
            </div>
          </div>
          {filteredPreviewItems.length ? filteredPreviewItems.map((item) => {
            const choice = choices[item.sourceIndex] ?? makeReceivingChoice(item);
            return (
              <div key={item.sourceIndex} className="grid gap-3 rounded-md border border-[var(--brand-border)] bg-white p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_220px]">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.barcode || item.supplierCode || "Sem código"} · NF-e: {item.quantity} un · R$ {item.unitCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}{item.ncm ? ` · NCM ${item.ncm}` : ""}</p>
                    {item.divergences?.length ? <div className="mt-2 flex flex-wrap gap-1">{item.divergences.map((divergence) => <Badge key={divergence} className="border-amber-200 bg-amber-50 text-amber-800">{divergence}</Badge>)}</div> : <span className="mt-2 inline-block text-xs text-emerald-700">Sem divergência relevante.</span>}
                  </div>
                  <Select aria-label={`Ação para ${item.name}`} value={choice.action} onChange={(event) => setChoices((current) => ({ ...current, [item.sourceIndex]: { ...choice, action: event.target.value as typeof choice.action } }))} options={[{ label: "Vincular", value: "link" }, { label: "Cadastrar produto", value: "create" }, { label: "Ignorar", value: "ignore" }]} />
                  {choice.action === "link" ? <Select aria-label={`Produto de ${item.name}`} value={choice.productId ?? ""} onChange={(event) => setChoices((current) => ({ ...current, [item.sourceIndex]: { ...choice, productId: event.target.value } }))} options={[{ label: item.match?.name ?? "Selecione o produto", value: "" }, ...products]} /> : <p className="self-center text-xs text-slate-500">{choice.action === "create" ? "Será criado com custo e saldo conferidos." : "Item não entrará no estoque."}</p>}
                </div>
                {choice.action !== "ignore" ? (
                  <div className="grid gap-3 md:grid-cols-4">
                    <Input label="Nome para cadastro" value={choice.name} disabled={choice.action !== "create"} onChange={(event) => setChoices((current) => ({ ...current, [item.sourceIndex]: { ...choice, name: event.target.value } }))} />
                    <Input label="Qtd recebida" type="number" min={0.001} step="0.001" value={choice.quantity} onChange={(event) => setChoices((current) => ({ ...current, [item.sourceIndex]: { ...choice, quantity: Math.max(0.001, Number(event.target.value || item.quantity)) } }))} />
                    <Input label="Custo confirmado" type="number" min={0} step="0.01" value={choice.unitCost} onChange={(event) => setChoices((current) => ({ ...current, [item.sourceIndex]: { ...choice, unitCost: Math.max(0, Number(event.target.value || 0)) } }))} />
                    <Input label="Preço sugerido" type="number" min={0} step="0.01" disabled={choice.action !== "create"} value={choice.salePrice ?? suggestedSalePrice(choice.unitCost)} onChange={(event) => setChoices((current) => ({ ...current, [item.sourceIndex]: { ...choice, salePrice: Math.max(0, Number(event.target.value || 0)) } }))} />
                  </div>
                ) : null}
              </div>
            );
          }) : <EmptyState eyebrow="Conferência" title="Nenhum item neste filtro." description="Altere o filtro para revisar os demais itens da nota." icon={<FileCheck2 size={20} />} />}{preview.items.length ? <Button onClick={() => void commit()}>Confirmar recebimento e atualizar estoque</Button> : null}</div> : null}
      </CardContent>
    </Card>
  );
}

function InboundFiscalHistory({
  branches,
  products,
  onCompleted,
}: {
  branches: Array<{ label: string; value: string }>;
  products: Array<{ label: string; value: string }>;
  onCompleted: () => void;
}) {
  type Row = { id: string; branchName: string; accessKey: string; documentNumber: string; issuerName: string; issuedAt?: string; totalAmount: string; status: string; manifestationStatus: string; itemCount: number; divergenceCount: number };
  const [rows, setRows] = useState<Row[]>([]);
  const [branchId, setBranchId] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<InboundDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  async function loadHistory() {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: "1", pageSize: "100", period });
      if (branchId) query.set("branchId", branchId);
      const result = await apiFetch<ListResponse<Row>>(`/fiscal/inbound?${query.toString()}`);
      setRows(result.data);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as notas recebidas."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadHistory(); }, [branchId, period]);
  async function manifest(id: string, type: "ciencia" | "confirmacao" | "desconhecimento" | "nao_realizada") {
    const justification = type === "nao_realizada" ? window.prompt("Explique por que a operação não foi realizada:") : undefined;
    if (type === "nao_realizada" && (!justification || justification.length < 15)) return;
    try {
      await apiFetch(`/fiscal/inbound/${id}/manifest`, { method: "POST", body: JSON.stringify({ type, justification }) });
      await loadHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar a manifestação."); }
  }
  async function loadDetail(id: string) {
    setDetailLoading(true);
    try {
      setDetail(await apiFetch<InboundDetail>(`/fiscal/inbound/${id}`));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os itens da NF-e.");
    } finally {
      setDetailLoading(false);
    }
  }
  return <div className="grid gap-4">
    <Card><CardContent className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px_auto] md:items-end"><Select label="Loja" value={branchId} onChange={(event) => setBranchId(event.target.value)} options={[{ label: "Todas as lojas", value: "" }, ...branches]} /><Input label="Competência" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /><Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void loadHistory()}>Atualizar</Button></CardContent></Card>
    {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    <DataTable rows={rows} empty={loading ? "Carregando..." : <EmptyState eyebrow="NF-e de entrada" title="Nenhuma nota recebida nesta competência." description="Importe o XML ou consulte a chave na aba Operações para iniciar o recebimento fiscal." icon={<FileCheck2 size={20} />} />} columns={[
      { key: "document", header: "Nota", render: (row) => <div><strong>NF-e {row.documentNumber}</strong><p className="text-xs text-slate-500">{row.issuerName} · {row.branchName}</p></div> },
      { key: "issued", header: "Emissão", render: (row) => row.issuedAt ? new Date(row.issuedAt).toLocaleDateString("pt-BR") : "-" },
      { key: "total", header: "Total", render: (row) => Number(row.totalAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
      { key: "status", header: "Conferência", render: (row) => <div className="flex flex-wrap gap-1"><Badge>{row.status === "received" ? "Recebida" : row.status === "review_pending" ? "Revisar" : "Pronta"}</Badge>{row.divergenceCount ? <Badge className="border-amber-200 bg-amber-50 text-amber-800">{row.divergenceCount} divergência(s)</Badge> : null}</div> },
      { key: "manifest", header: "Manifestação", render: (row) => <div className="flex flex-wrap gap-1">{row.manifestationStatus === "pending" || row.manifestationStatus === "ciencia" ? <><Button variant="ghost" onClick={() => void manifest(row.id, "ciencia")}>Dar ciência</Button><Button variant="ghost" onClick={() => void manifest(row.id, "confirmacao")}>Confirmar</Button><Button variant="ghost" onClick={() => void manifest(row.id, "desconhecimento")}>Não reconheço</Button><Button variant="ghost" onClick={() => void manifest(row.id, "nao_realizada")}>Não realizada</Button></> : <Badge>{row.manifestationStatus === "confirmacao" ? "Operação confirmada" : row.manifestationStatus === "desconhecimento" ? "Não reconhecida" : "Não realizada"}</Badge>}</div> },
      { key: "detail", header: "Itens", render: (row) => <Button variant="secondary" icon={<Eye size={14} />} onClick={() => void loadDetail(row.id)}>{detailLoading ? "Carregando..." : "Ver itens"}</Button> },
    ]} />
    {detail ? (
      <InboundFiscalDetail
        detail={detail}
        products={products}
        onClose={() => setDetail(null)}
        onUpdated={setDetail}
        onCompleted={() => {
          setDetail(null);
          void loadHistory();
          onCompleted();
        }}
      />
    ) : null}
  </div>;
}

function InboundFiscalDetail({
  detail,
  products,
  onClose,
  onUpdated,
  onCompleted,
}: {
  detail: InboundDetail;
  products: Array<{ label: string; value: string }>;
  onClose: () => void;
  onUpdated: (detail: InboundDetail) => void;
  onCompleted: () => void;
}) {
  const pendingItems = detail.items.filter((item) => item.resolution === "pending").length;
  const linkedItems = detail.items.filter((item) => item.productName).length;
  const receivedValue = detail.items
    .filter((item) => item.resolution !== "ignored")
    .reduce((sum, item) => sum + Number(item.totalAmount), 0);
  const [choices, setChoices] = useState(() => Object.fromEntries(detail.items.map((item) => [item.id, makeDetailChoice(item)])));
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checklist = [
    {
      label: "Produtos vinculados ou tratados",
      done: pendingItems === 0,
      detail: pendingItems ? `${pendingItems} item(ns) ainda pendente(s)` : "Todos os itens têm decisão registrada",
    },
    {
      label: "Alertas revisados",
      done: detail.summary.withDivergence === 0 || detail.document.status === "received",
      detail: detail.summary.withDivergence ? `${detail.summary.withDivergence} item(ns) com alerta` : "Sem divergência relevante",
    },
    {
      label: "Entrada de estoque",
      done: detail.document.status === "received",
      detail: detail.document.status === "received" ? "Estoque atualizado" : "Aguardando confirmação de recebimento",
    },
  ];
  async function saveItem(item: InboundDetail["items"][number]) {
    const choice = choices[item.id] ?? makeDetailChoice(item);
    setSavingItemId(item.id);
    setError(null);
    try {
      const updated = await apiFetch<InboundDetail>(`/fiscal/inbound/${detail.document.id}/items/${item.id}`, {
        method: "PUT",
        body: JSON.stringify(choice),
      });
      onUpdated(updated);
      setChoices(Object.fromEntries(updated.items.map((row) => [row.id, makeDetailChoice(row)])));
      setMessage(`Item #${item.lineNumber} atualizado.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o item.");
    } finally {
      setSavingItemId(null);
    }
  }
  async function receiveDocument() {
    if (pendingItems) return setError("Resolva todos os itens pendentes antes de receber a NF-e.");
    setReceiving(true);
    setError(null);
    try {
      await apiFetch(`/fiscal/inbound/${detail.document.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ supplierName: detail.document.issuerName, createSupplier: true }),
      });
      setMessage("NF-e recebida. Estoque, custos e auditoria foram atualizados.");
      onCompleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível receber a NF-e.");
    } finally {
      setReceiving(false);
    }
  }
  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--brand-secondary)]">Detalhe da NF-e</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--brand-primary)]">NF-e {detail.document.documentNumber} · {detail.document.issuerName}</h2>
            <p className="mt-1 break-all text-sm text-slate-500">Chave {detail.document.accessKey}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Printer size={14} />} onClick={() => void openApiDocument(`/fiscal/inbound/${detail.document.id}/report`, true)}>
              Imprimir conferência
            </Button>
            <Button variant="secondary" icon={<Download size={14} />} onClick={() => void downloadApiFile(`/fiscal/inbound/${detail.document.id}/export`, `orien-conferencia-nfe-${detail.document.documentNumber}.csv`)}>
              Baixar CSV
            </Button>
            {detail.document.status !== "received" ? (
              <Button onClick={() => void receiveDocument()} disabled={Boolean(pendingItems) || receiving}>
                {receiving ? "Recebendo..." : "Receber NF-e"}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onClose}>Fechar detalhe</Button>
          </div>
        </div>
        {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <ReviewMetric label="Itens" value={detail.summary.itemCount} tone="muted" />
          <ReviewMetric label="Vinculados" value={detail.summary.linked} tone="ok" />
          <ReviewMetric label="Criados" value={detail.summary.created} tone={detail.summary.created ? "warn" : "ok"} />
          <ReviewMetric label="Ignorados" value={detail.summary.ignored} tone={detail.summary.ignored ? "muted" : "ok"} />
          <ReviewMetric label="Com alerta" value={detail.summary.withDivergence} tone={detail.summary.withDivergence ? "warn" : "ok"} />
        </div>
        <div className="grid gap-3 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-secondary)]">Checklist de conferência</p>
            <div className="mt-3 grid gap-2">
              {checklist.map((item) => (
                <div key={item.label} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 size={18} className={item.done ? "mt-0.5 text-emerald-600" : "mt-0.5 text-amber-600"} />
                  <div>
                    <p className="font-medium text-[var(--brand-primary)]">{item.label}</p>
                    <p className="text-slate-500">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--brand-border)] bg-white p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Valor conferido</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--brand-primary)]">{receivedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
            <p className="mt-2 text-xs text-slate-500">{linkedItems} item(ns) com produto vinculado.</p>
          </div>
        </div>
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <InfoLine label="Loja" value={detail.document.branchName} />
          <InfoLine label="Emissão" value={detail.document.issuedAt ? new Date(detail.document.issuedAt).toLocaleDateString("pt-BR") : "-"} />
          <InfoLine label="Total da nota" value={detail.document.totalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
        </div>
        <DataTable
          rows={detail.items}
          empty="Nenhum item registrado nesta NF-e."
          columns={[
            { key: "line", header: "Item", render: (row) => `#${row.lineNumber}` },
            { key: "description", header: "Produto NF-e", render: (row) => <div><strong>{row.description}</strong><p className="text-xs text-slate-500">{row.barcode || row.supplierCode || "Sem código"}{row.ncm ? ` · NCM ${row.ncm}` : ""}</p></div> },
            { key: "match", header: "Vínculo", render: (row) => detail.document.status === "received" ? (row.productName ? <div><strong>{row.productName}</strong><p className="text-xs text-slate-500">{row.productSku || row.resolution}</p></div> : <Badge>{resolutionLabel(row.resolution)}</Badge>) : <ItemResolutionEditor row={row} products={products} choice={choices[row.id] ?? makeDetailChoice(row)} onChange={(choice) => setChoices((current) => ({ ...current, [row.id]: choice }))} /> },
            { key: "quantity", header: "Qtd", render: (row) => Number(row.quantity).toLocaleString("pt-BR") },
            { key: "cost", header: "Custo", render: (row) => Number(row.unitCost).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
            { key: "alerts", header: "Alertas", render: (row) => row.divergences.length ? <div className="flex flex-wrap gap-1">{row.divergences.map((item) => <Badge key={item} className="border-amber-200 bg-amber-50 text-amber-800">{item}</Badge>)}</div> : <span className="text-emerald-700">Sem alerta</span> },
            { key: "save", header: "Ação", render: (row) => detail.document.status === "received" ? <Badge>{resolutionLabel(row.resolution)}</Badge> : <Button variant="secondary" onClick={() => void saveItem(row)} disabled={savingItemId === row.id}>{savingItemId === row.id ? "Salvando..." : "Salvar"}</Button> },
          ]}
        />
      </CardContent>
    </Card>
  );
}

type DetailChoice = {
  action: "link" | "create" | "ignore";
  productId?: string;
  name?: string;
  sku?: string;
  quantity?: number;
  unitCost?: number;
  salePrice?: number;
};

function makeDetailChoice(item: InboundDetail["items"][number]): DetailChoice {
  return {
    action: item.resolution === "ignored" ? "ignore" : item.resolution === "created" ? "create" : "link",
    productId: item.productId ?? undefined,
    name: item.description,
    sku: item.supplierCode ?? undefined,
    quantity: Number(item.quantity),
    unitCost: Number(item.unitCost),
    salePrice: Number(item.suggestedSalePrice ?? suggestedSalePrice(Number(item.unitCost))),
  };
}

function ItemResolutionEditor({
  row,
  products,
  choice,
  onChange,
}: {
  row: InboundDetail["items"][number];
  products: Array<{ label: string; value: string }>;
  choice: DetailChoice;
  onChange: (choice: DetailChoice) => void;
}) {
  return (
    <div className="grid min-w-[280px] gap-2">
      <Select
        aria-label={`Ação do item ${row.lineNumber}`}
        value={choice.action}
        onChange={(event) => onChange({ ...choice, action: event.target.value as DetailChoice["action"] })}
        options={[
          { label: "Vincular produto", value: "link" },
          { label: "Cadastrar no recebimento", value: "create" },
          { label: "Ignorar item", value: "ignore" },
        ]}
      />
      {choice.action === "link" ? (
        <Select
          aria-label={`Produto vinculado ao item ${row.lineNumber}`}
          value={choice.productId ?? ""}
          onChange={(event) => onChange({ ...choice, productId: event.target.value })}
          options={[{ label: "Selecione o produto", value: "" }, ...products]}
        />
      ) : null}
      {choice.action === "create" ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Input aria-label={`Nome do novo produto ${row.lineNumber}`} value={choice.name ?? ""} onChange={(event) => onChange({ ...choice, name: event.target.value })} />
          <Input aria-label={`SKU do novo produto ${row.lineNumber}`} value={choice.sku ?? ""} onChange={(event) => onChange({ ...choice, sku: event.target.value })} />
          <Input aria-label={`Preço de venda sugerido ${row.lineNumber}`} type="number" min={0} step="0.01" value={choice.salePrice ?? suggestedSalePrice(choice.unitCost ?? Number(row.unitCost))} onChange={(event) => onChange({ ...choice, salePrice: Number(event.target.value || 0) })} />
        </div>
      ) : null}
      {choice.action !== "ignore" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input aria-label={`Quantidade do item ${row.lineNumber}`} type="number" min={0.001} step="0.001" value={choice.quantity ?? Number(row.quantity)} onChange={(event) => onChange({ ...choice, quantity: Number(event.target.value || row.quantity) })} />
          <Input aria-label={`Custo do item ${row.lineNumber}`} type="number" min={0} step="0.01" value={choice.unitCost ?? Number(row.unitCost)} onChange={(event) => onChange({ ...choice, unitCost: Number(event.target.value || 0) })} />
        </div>
      ) : null}
      {choice.action === "create" ? (
        <p className="text-xs text-slate-500">O produto será criado com custo conferido e preço sugerido. Revise margem, NCM e tributação depois no cadastro.</p>
      ) : null}
    </div>
  );
}

function suggestedSalePrice(unitCost: number) {
  if (!Number.isFinite(unitCost) || unitCost <= 0) return 0;
  return Math.round(unitCost * 1.35 * 100) / 100;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--brand-border)] bg-white p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-[var(--brand-primary)]">{value}</p>
    </div>
  );
}

function resolutionLabel(value: string) {
  return (
    {
      pending: "Pendente",
      linked: "Vinculado",
      created: "Produto criado",
      ignored: "Ignorado",
    } as Record<string, string>
  )[value] ?? value;
}

function ReviewMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "muted";
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "muted"
        ? "border-slate-200 bg-slate-50 text-slate-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.14em] opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
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
