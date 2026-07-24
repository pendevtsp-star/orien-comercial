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
import { RefreshCw, RotateCcw, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { useCurrentPermissions } from "../../../lib/current-permissions";
import {
  CommercialDocumentsPanel,
  PricingOperationsPanel,
} from "../../../components/commercial-workflows-panel";
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
type Credit = {
  id: string;
  customerId: string;
  name: string;
  creditLimit: string;
  exposure: string;
  storeCredit: string;
  blocked: boolean;
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedSection = searchParams.get("section");
  const validSections = ["returns", "pricing", "quotes", "credit"];
  const [section, setSection] = useState(validSections.includes(requestedSection ?? "") ? requestedSection! : "returns");
  const [branches, setBranches] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const { permissions } = useCurrentPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    try {
      const [b, p, c, r, cr] = await Promise.all([
        apiFetch<List<Option>>("/branches?pageSize=100&isActive=true"),
        apiFetch<List<Option>>("/products?pageSize=100&isActive=true"),
        apiFetch<List<Option>>("/customers?pageSize=100&isActive=true"),
        apiFetch<List<ReturnRow>>("/operations/returns"),
        apiFetch<List<Credit>>("/operations/credit"),
      ]);
      setBranches(b.data);
      setProducts(p.data);
      setCustomers(c.data);
      setReturns(r.data);
      setCredits(cr.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar operacoes.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    setSection(validSections.includes(requestedSection ?? "") ? requestedSection! : "returns");
  }, [requestedSection]);
  const options = (rows: Option[]) => rows.map((x) => ({ label: x.name, value: x.id }));
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
  const sectionMeta = {
    returns: { title: "Trocas e devoluções", description: "Registre devoluções, estornos e crédito de cliente com rastreabilidade da venda." },
    pricing: { title: "Promoções e preços", description: "Defina preços por loja, período, quantidade e grupo de clientes." },
    quotes: { title: "Orçamentos e pedidos", description: "Crie propostas, reserve estoque quando necessário e converta a negociação em venda." },
    credit: { title: "Crediário", description: "Acompanhe limites, exposição, bloqueios e renegociações por cliente." },
  }[section] ?? { title: "Operações comerciais", description: "Fluxos comerciais protegidos e auditáveis." };
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        title={sectionMeta.title}
        description={sectionMeta.description}
        actions={
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void load()}>
            Atualizar
          </Button>
        }
      />
      {feedback}
      <Tabs
        defaultValue="returns"
        value={section}
        onValueChange={(value) => {
          setSection(value);
          router.replace(`/operations?section=${value}`);
        }}
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
            label: "Promoções e preços",
            content: (
              <PricingOperationsPanel
                branches={branches}
                products={products}
                permissions={permissions}
              />
            ),
          },
          {
            value: "quotes",
            label: "Orçamentos e pedidos",
            content: (
              <CommercialDocumentsPanel
                branches={branches}
                products={products}
                customers={customers}
                permissions={permissions}
              />
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
        ]}
      />
    </div>
  );
}
