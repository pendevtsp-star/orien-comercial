"use client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  Input,
  PageHeader,
  Select,
  Tabs,
} from "@sgc/ui";
import { BellRing, FileText, RefreshCw, RotateCcw, Tags, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, openApiDocument } from "../../../lib/api";
type List<T> = { data: T[] };
type Option = { id: string; name: string; salePrice?: string };
type ReturnRow = {
  id: string;
  saleId: string;
  reason: string;
  refundMethod: string;
  totalAmount: string;
  createdAt: string;
};
type PriceRow = {
  id: string;
  name: string;
  productName: string;
  branchName?: string;
  minQuantity: string;
  fixedPrice?: string;
  discountPercent?: string;
};
type Quote = {
  id: string;
  status: string;
  totalAmount: string;
  validUntil: string;
  branchName: string;
  customerName?: string;
  itemCount: number;
};
type Credit = {
  customerId: string;
  name: string;
  creditLimit: string;
  exposure: string;
  storeCredit: string;
  blocked: boolean;
};
type Abc = {
  id: string;
  name: string;
  sku?: string;
  quantity: string;
  revenue: string;
  margin: string;
  stock: string;
  class: string;
  suggestion: string;
};
type Notification = {
  id: string;
  title: string;
  message: string;
  severity: string;
  readAt?: string;
  createdAt: string;
};
type SaleItem = {
  id: string;
  description: string;
  quantity: string;
  returnedQuantity: string;
  unitPrice: string;
};
const money = (value: string | number) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function OperationsPage() {
  const [branches, setBranches] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [abc, setAbc] = useState<Abc[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [quoteItems, setQuoteItems] = useState<
    Array<{ productId: string; quantity: number; unitPrice: number; discountAmount: number }>
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    try {
      const [b, p, c, r, pr, q, cr, a, n] = await Promise.all([
        apiFetch<List<Option>>("/branches?pageSize=100&isActive=true"),
        apiFetch<List<Option>>("/products?pageSize=100&isActive=true"),
        apiFetch<List<Option>>("/customers?pageSize=100&isActive=true"),
        apiFetch<List<ReturnRow>>("/operations/returns"),
        apiFetch<List<PriceRow>>("/operations/prices"),
        apiFetch<List<Quote>>("/operations/quotes"),
        apiFetch<List<Credit>>("/operations/credit"),
        apiFetch<List<Abc>>("/operations/analytics/abc"),
        apiFetch<List<Notification>>("/operations/notifications"),
      ]);
      setBranches(b.data);
      setProducts(p.data);
      setCustomers(c.data);
      setReturns(r.data);
      setPrices(pr.data);
      setQuotes(q.data);
      setCredits(cr.data);
      setAbc(a.data);
      setNotifications(n.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar operacoes.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const options = (rows: Option[]) => rows.map((x) => ({ label: x.name, value: x.id }));
  const total = useMemo(
    () => quoteItems.reduce((s, x) => s + x.quantity * x.unitPrice - x.discountAmount, 0),
    [quoteItems],
  );
  async function submit(path: string, body: unknown, success: string) {
    try {
      await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      setMessage(success);
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operacao recusada.");
    }
  }
  async function loadSaleItems(id: string) {
    if (!id) return;
    try {
      const r = await apiFetch<List<SaleItem>>(`/operations/sales/${id}/items`);
      setSaleItems(r.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Venda nao encontrada.");
    }
  }
  async function createReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const items = saleItems
      .map((x) => ({ saleItemId: x.id, quantity: Number(f.get(`qty-${x.id}`) || 0) }))
      .filter((x) => x.quantity > 0);
    await submit(
      "/operations/returns",
      {
        saleId: f.get("saleId"),
        reason: f.get("reason"),
        refundMethod: f.get("refundMethod"),
        items,
      },
      "Devolucao concluida e estoque atualizado.",
    );
    setSaleItems([]);
  }
  async function createPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await submit(
      "/operations/prices",
      {
        name: f.get("name"),
        branchId: f.get("branchId") || undefined,
        customerGroup: f.get("customerGroup") || undefined,
        startsAt: f.get("startsAt") || undefined,
        endsAt: f.get("endsAt") || undefined,
        productId: f.get("productId"),
        minQuantity: Number(f.get("minQuantity")),
        fixedPrice: f.get("fixedPrice") ? Number(f.get("fixedPrice")) : undefined,
        discountPercent: f.get("discountPercent") ? Number(f.get("discountPercent")) : undefined,
      },
      "Regra de preco ativada.",
    );
  }
  function addQuoteItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const product = products.find((x) => x.id === f.get("productId"));
    if (!product) return;
    setQuoteItems((x) => [
      ...x,
      {
        productId: product.id,
        quantity: Number(f.get("quantity")),
        unitPrice: Number(f.get("unitPrice") || product.salePrice || 0),
        discountAmount: Number(f.get("discountAmount") || 0),
      },
    ]);
    event.currentTarget.reset();
  }
  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await submit(
      "/operations/quotes",
      {
        branchId: f.get("branchId"),
        customerId: f.get("customerId") || undefined,
        validUntil: f.get("validUntil"),
        notes: f.get("notes") || undefined,
        reserveStock: f.get("reserveStock") === "on",
        items: quoteItems,
      },
      "Orcamento criado.",
    );
    setQuoteItems([]);
  }
  async function saveCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await submit(
      "/operations/credit",
      {
        customerId: f.get("customerId"),
        creditLimit: Number(f.get("creditLimit")),
        blocked: f.get("blocked") === "on",
        blockReason: f.get("blockReason") || undefined,
      },
      "Limite atualizado.",
    );
  }
  async function renegotiate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await submit(
      "/operations/credit/renegotiate",
      {
        customerId: f.get("customerId"),
        originalAmount: Number(f.get("originalAmount")),
        negotiatedAmount: Number(f.get("negotiatedAmount")),
        installments: Number(f.get("installments")),
        firstDueDate: f.get("firstDueDate"),
      },
      "Divida renegociada e parcelas geradas.",
    );
  }
  const feedback = (
    <>
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
    </>
  );
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        title="Operacoes avancadas"
        description="Devolucoes, precos, orcamentos, crediario, rentabilidade e notificacoes em fluxos auditaveis."
        actions={
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void load()}>
            Atualizar
          </Button>
        }
      />
      {feedback}
      <Tabs
        defaultValue="returns"
        tabs={[
          {
            value: "returns",
            label: "Trocas e devolucoes",
            content: (
              <div className="grid gap-4 2xl:grid-cols-[380px_minmax(0,1fr)]">
                <Card>
                  <CardContent>
                    <form className="grid gap-3" onSubmit={(e) => void createReturn(e)}>
                      <RotateCcw />
                      <h2 className="font-semibold">Registrar devolucao</h2>
                      <Input
                        name="saleId"
                        label="ID completo da venda"
                        onBlur={(e) => void loadSaleItems(e.target.value)}
                        required
                      />
                      <Select
                        name="refundMethod"
                        label="Destino do valor"
                        options={[
                          { label: "Forma original", value: "original" },
                          { label: "Dinheiro", value: "cash" },
                          { label: "Credito para cliente", value: "customer_credit" },
                        ]}
                      />
                      <Input name="reason" label="Motivo" required />
                      {saleItems.map((x) => (
                        <Input
                          key={x.id}
                          name={`qty-${x.id}`}
                          type="number"
                          step="0.001"
                          min="0"
                          max={Number(x.quantity) - Number(x.returnedQuantity)}
                          label={`${x.description} (disponivel ${Number(x.quantity) - Number(x.returnedQuantity)})`}
                        />
                      ))}
                      <Button type="submit" disabled={!saleItems.length}>
                        Concluir devolucao
                      </Button>
                    </form>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <DataTable
                      rows={returns}
                      empty="Nenhuma devolucao registrada."
                      columns={[
                        {
                          key: "date",
                          header: "Data",
                          render: (r) => new Date(r.createdAt).toLocaleString("pt-BR"),
                        },
                        { key: "sale", header: "Venda", render: (r) => r.saleId.slice(0, 8) },
                        { key: "reason", header: "Motivo", render: (r) => r.reason },
                        {
                          key: "method",
                          header: "Destino",
                          render: (r) => <Badge>{r.refundMethod}</Badge>,
                        },
                        { key: "total", header: "Total", render: (r) => money(r.totalAmount) },
                      ]}
                    />
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            value: "pricing",
            label: "Promocoes e precos",
            content: (
              <div className="grid gap-4 2xl:grid-cols-[380px_minmax(0,1fr)]">
                <Card>
                  <CardContent>
                    <form className="grid gap-3" onSubmit={(e) => void createPrice(e)}>
                      <Tags />
                      <h2 className="font-semibold">Nova regra de preco</h2>
                      <Input name="name" label="Nome da tabela/promocao" required />
                      <Select
                        name="branchId"
                        label="Loja"
                        options={[{ label: "Todas", value: "" }, ...options(branches)]}
                      />
                      <Input name="customerGroup" label="Grupo de clientes (opcional)" />
                      <Select
                        name="productId"
                        label="Produto"
                        options={options(products)}
                        required
                      />
                      <Input
                        name="minQuantity"
                        label="Quantidade minima"
                        type="number"
                        defaultValue="1"
                        required
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input name="fixedPrice" label="Preco fixo" type="number" step="0.01" />
                        <Input
                          name="discountPercent"
                          label="Desconto %"
                          type="number"
                          step="0.01"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input name="startsAt" label="Inicio" type="datetime-local" />
                        <Input name="endsAt" label="Fim" type="datetime-local" />
                      </div>
                      <Button type="submit">Ativar regra</Button>
                    </form>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <DataTable
                      rows={prices}
                      empty="Nenhuma tabela criada."
                      columns={[
                        { key: "name", header: "Tabela", render: (r) => r.name },
                        { key: "product", header: "Produto", render: (r) => r.productName },
                        { key: "branch", header: "Loja", render: (r) => r.branchName ?? "Todas" },
                        { key: "qty", header: "Qtd minima", render: (r) => r.minQuantity },
                        {
                          key: "value",
                          header: "Condicao",
                          render: (r) =>
                            r.fixedPrice ? money(r.fixedPrice) : `${r.discountPercent}%`,
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            value: "quotes",
            label: "Orcamentos",
            content: (
              <div className="grid gap-4">
                <div className="grid gap-4 2xl:grid-cols-2">
                  <Card>
                    <CardContent>
                      <form className="grid gap-3" onSubmit={addQuoteItem}>
                        <FileText />
                        <h2 className="font-semibold">Itens do orcamento</h2>
                        <Select
                          name="productId"
                          label="Produto"
                          options={options(products)}
                          required
                        />
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Input
                            name="quantity"
                            label="Quantidade"
                            type="number"
                            defaultValue="1"
                            required
                          />
                          <Input name="unitPrice" label="Preco" type="number" step="0.01" />
                          <Input
                            name="discountAmount"
                            label="Desconto"
                            type="number"
                            step="0.01"
                            defaultValue="0"
                          />
                        </div>
                        <Button type="submit" variant="secondary">
                          Adicionar item
                        </Button>
                      </form>
                      <div className="mt-4 grid gap-2">
                        {quoteItems.map((x, i) => (
                          <div
                            key={i}
                            className="flex justify-between rounded-md bg-[var(--brand-surface)] p-3 text-sm"
                          >
                            <span>
                              {products.find((p) => p.id === x.productId)?.name} x {x.quantity}
                            </span>
                            <strong>{money(x.quantity * x.unitPrice - x.discountAmount)}</strong>
                          </div>
                        ))}
                        <strong>Total {money(total)}</strong>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <form className="grid gap-3" onSubmit={(e) => void createQuote(e)}>
                        <h2 className="font-semibold">Dados da proposta</h2>
                        <Select name="branchId" label="Loja" options={options(branches)} required />
                        <Select
                          name="customerId"
                          label="Cliente"
                          options={[{ label: "Sem cliente", value: "" }, ...options(customers)]}
                        />
                        <Input name="validUntil" label="Validade" type="date" required />
                        <Input name="notes" label="Observacoes" />
                        <label className="flex gap-2 text-sm">
                          <input name="reserveStock" type="checkbox" />
                          Reservar estoque ate a validade
                        </label>
                        <Button type="submit" disabled={!quoteItems.length}>
                          Salvar orcamento
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardContent>
                    <DataTable
                      rows={quotes}
                      empty="Nenhum orcamento."
                      columns={[
                        {
                          key: "date",
                          header: "Validade",
                          render: (r) => new Date(r.validUntil).toLocaleDateString("pt-BR"),
                        },
                        {
                          key: "customer",
                          header: "Cliente",
                          render: (r) => r.customerName ?? "Consumidor",
                        },
                        {
                          key: "status",
                          header: "Status",
                          render: (r) => <Badge>{r.status}</Badge>,
                        },
                        { key: "total", header: "Total", render: (r) => money(r.totalAmount) },
                        {
                          key: "actions",
                          header: "Acoes",
                          render: (r) => (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="secondary"
                                onClick={() =>
                                  void openApiDocument(`/operations/quotes/${r.id}/document`)
                                }
                              >
                                PDF/Imprimir
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() =>
                                  window.open(
                                    `https://wa.me/?text=${encodeURIComponent(`Orcamento Orien ${r.id.slice(0, 8)} no valor de ${money(r.totalAmount)}. Valido ate ${new Date(r.validUntil).toLocaleDateString("pt-BR")}.`)}`,
                                    "_blank",
                                  )
                                }
                              >
                                WhatsApp
                              </Button>
                              <Button
                                disabled={r.status === "converted"}
                                onClick={() =>
                                  void submit(
                                    `/operations/quotes/${r.id}/convert`,
                                    {},
                                    "Orcamento convertido em venda.",
                                  )
                                }
                              >
                                Converter
                              </Button>
                            </div>
                          ),
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            value: "credit",
            label: "Crediario",
            content: (
              <div className="grid gap-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardContent>
                      <form className="grid gap-3" onSubmit={(e) => void saveCredit(e)}>
                        <WalletCards />
                        <h2 className="font-semibold">Limite e bloqueio</h2>
                        <Select
                          name="customerId"
                          label="Cliente"
                          options={options(customers)}
                          required
                        />
                        <Input
                          name="creditLimit"
                          label="Limite"
                          type="number"
                          step="0.01"
                          required
                        />
                        <label className="flex gap-2 text-sm">
                          <input name="blocked" type="checkbox" />
                          Bloquear novas vendas a prazo
                        </label>
                        <Input name="blockReason" label="Motivo do bloqueio" />
                        <Button type="submit">Salvar politica</Button>
                      </form>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <form className="grid gap-3" onSubmit={(e) => void renegotiate(e)}>
                        <h2 className="font-semibold">Renegociar saldo</h2>
                        <Select
                          name="customerId"
                          label="Cliente"
                          options={options(customers)}
                          required
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            name="originalAmount"
                            label="Saldo original"
                            type="number"
                            step="0.01"
                            required
                          />
                          <Input
                            name="negotiatedAmount"
                            label="Novo total"
                            type="number"
                            step="0.01"
                            required
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            name="installments"
                            label="Parcelas"
                            type="number"
                            min="1"
                            max="48"
                            required
                          />
                          <Input
                            name="firstDueDate"
                            label="Primeiro vencimento"
                            type="date"
                            required
                          />
                        </div>
                        <Button type="submit">Gerar acordo</Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardContent>
                    <DataTable
                      rows={credits}
                      empty="Nenhum cliente."
                      columns={[
                        { key: "name", header: "Cliente", render: (r) => r.name },
                        { key: "limit", header: "Limite", render: (r) => money(r.creditLimit) },
                        { key: "exposure", header: "Em aberto", render: (r) => money(r.exposure) },
                        {
                          key: "credit",
                          header: "Credito em loja",
                          render: (r) => money(r.storeCredit),
                        },
                        {
                          key: "status",
                          header: "Status",
                          render: (r) => <Badge>{r.blocked ? "Bloqueado" : "Liberado"}</Badge>,
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            value: "abc",
            label: "Curva ABC",
            content: (
              <Card>
                <CardContent>
                  <DataTable
                    rows={abc}
                    empty="Sem movimentacao para classificar."
                    columns={[
                      { key: "class", header: "Classe", render: (r) => <Badge>{r.class}</Badge> },
                      { key: "product", header: "Produto", render: (r) => r.name },
                      { key: "qty", header: "Qtd vendida", render: (r) => r.quantity },
                      { key: "revenue", header: "Receita", render: (r) => money(r.revenue) },
                      { key: "margin", header: "Margem", render: (r) => money(r.margin) },
                      { key: "stock", header: "Estoque", render: (r) => r.stock },
                      {
                        key: "suggestion",
                        header: "Acao",
                        render: (r) => <Badge>{r.suggestion}</Badge>,
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            value: "notifications",
            label: "Notificacoes",
            content: (
              <Card>
                <CardContent className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <BellRing />
                      <h2 className="font-semibold">Central interna</h2>
                    </div>
                    <Button
                      onClick={() =>
                        void submit(
                          "/operations/notifications/refresh",
                          {},
                          "Notificacoes atualizadas.",
                        )
                      }
                    >
                      Verificar agora
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        className={`grid gap-1 rounded-md border p-4 text-left ${n.readAt ? "bg-white opacity-65" : "bg-[var(--brand-surface)]"}`}
                        onClick={() =>
                          void apiFetch(`/operations/notifications/${n.id}/read`, {
                            method: "PATCH",
                            body: "{}",
                          }).then(load)
                        }
                      >
                        <span className="flex justify-between gap-3">
                          <strong>{n.title}</strong>
                          <Badge>{n.severity}</Badge>
                        </span>
                        <span className="text-sm text-slate-600">{n.message}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
