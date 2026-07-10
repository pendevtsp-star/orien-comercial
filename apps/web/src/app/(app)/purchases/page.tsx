"use client";

import { Badge, Button, Card, CardContent, DataTable, Input, PageHeader, Select } from "@sgc/ui";
import { Check, PackageCheck, Plus, RefreshCw, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface List<T> {
  data: T[];
}
interface OptionRow {
  id: string;
  name: string;
  sku?: string;
  document?: string;
}
interface DraftItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
}
interface Order {
  id: string;
  branchName: string;
  supplierName: string;
  status: string;
  totalAmount: string;
  orderedQuantity: string;
  receivedQuantity: string;
  expectedAt?: string;
  createdAt: string;
}
interface OrderDetail extends Order {
  items: Array<{
    productId: string;
    productName: string;
    quantity: string;
    receivedQuantity: string;
  }>;
}

export default function PurchasesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [branches, setBranches] = useState<OptionRow[]>([]);
  const [suppliers, setSuppliers] = useState<OptionRow[]>([]);
  const [products, setProducts] = useState<OptionRow[]>([]);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const branchOptions = useMemo(
    () => branches.map((row) => ({ label: row.name, value: row.id })),
    [branches],
  );
  const supplierOptions = useMemo(
    () =>
      suppliers.map((row) => ({
        label: `${row.name}${row.document ? ` · ${row.document}` : ""}`,
        value: row.id,
      })),
    [suppliers],
  );
  const productOptions = useMemo(
    () =>
      products.map((row) => ({
        label: `${row.name}${row.sku ? ` · ${row.sku}` : ""}`,
        value: row.id,
      })),
    [products],
  );
  async function load() {
    try {
      const [o, b, s, p] = await Promise.all([
        apiFetch<List<Order>>("/purchases?pageSize=50&sortBy=createdAt&sortDirection=desc"),
        apiFetch<List<OptionRow>>("/branches?pageSize=100&isActive=true"),
        apiFetch<List<OptionRow>>("/suppliers?pageSize=100&isActive=true"),
        apiFetch<List<OptionRow>>("/products?pageSize=100&isActive=true"),
      ]);
      setOrders(o.data);
      setBranches(b.data);
      setSuppliers(s.data);
      setProducts(p.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar compras.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const productId = String(form.get("productId") || "");
    const product = products.find((row) => row.id === productId);
    if (!product) return;
    const quantity = Number(form.get("quantity") || 0);
    const unitCost = Number(form.get("unitCost") || 0);
    setItems((current) => [
      ...current,
      { productId, productName: product.name, quantity, unitCost },
    ]);
    event.currentTarget.reset();
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!items.length) {
      setError("Adicione ao menos um item ao pedido.");
      return;
    }
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/purchases", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          supplierId: form.get("supplierId"),
          expectedAt: form.get("expectedAt") || undefined,
          notes: form.get("notes") || undefined,
          items,
        }),
      });
      setItems([]);
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar pedido.");
    }
  }
  async function approve(id: string) {
    try {
      await apiFetch(`/purchases/${id}/approve`, { method: "POST", body: "{}" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aprovar pedido.");
    }
  }
  async function receive(id: string) {
    try {
      const order = await apiFetch<OrderDetail>(`/purchases/${id}`);
      const pending: Array<{ productId: string; quantity: number }> = [];
      for (const item of order.items) {
        const remaining = Number(item.quantity) - Number(item.receivedQuantity);
        if (remaining <= 0) continue;
        const answer = window.prompt(
          `Quantidade recebida de ${item.productName}:`,
          String(remaining),
        );
        if (answer === null) return;
        const quantity = Number(answer);
        if (quantity > 0) pending.push({ productId: item.productId, quantity });
      }
      if (!pending.length) return;
      const documentNumber =
        window.prompt("Número da nota ou documento de recebimento:") ?? undefined;
      if (documentNumber === undefined) return;
      await apiFetch(`/purchases/${id}/receive`, {
        method: "POST",
        body: JSON.stringify({ documentNumber: documentNumber || undefined, items: pending }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao receber pedido.");
    }
  }
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        title="Compras"
        description="Pedidos aprováveis, recebimentos parciais e entrada de estoque vinculada ao fornecedor."
        actions={
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void load()}>
            Atualizar
          </Button>
        }
      />
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0">
          <CardContent className="grid gap-4">
            <DataTable
              rows={orders}
              empty="Nenhum pedido de compra cadastrado."
              columns={[
                {
                  key: "created",
                  header: "Cadastro",
                  render: (row) => new Date(row.createdAt).toLocaleDateString("pt-BR"),
                },
                { key: "supplier", header: "Fornecedor", render: (row) => row.supplierName },
                { key: "branch", header: "Loja", render: (row) => row.branchName },
                {
                  key: "status",
                  header: "Status",
                  render: (row) => <Badge>{statusLabel(row.status)}</Badge>,
                },
                {
                  key: "progress",
                  header: "Recebido",
                  render: (row) => `${row.receivedQuantity} / ${row.orderedQuantity}`,
                },
                {
                  key: "total",
                  header: "Total",
                  render: (row) =>
                    Number(row.totalAmount).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }),
                },
                {
                  key: "actions",
                  header: "Ações",
                  render: (row) => (
                    <div className="flex flex-wrap gap-2">
                      {row.status === "draft" ? (
                        <Button
                          variant="secondary"
                          icon={<Check size={14} />}
                          onClick={() => void approve(row.id)}
                        >
                          Aprovar
                        </Button>
                      ) : null}
                      {["approved", "partial"].includes(row.status) ? (
                        <Button
                          icon={<PackageCheck size={14} />}
                          onClick={() => void receive(row.id)}
                        >
                          Receber saldo
                        </Button>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
        <div className="grid h-fit gap-4">
          <Card>
            <CardContent>
              <form className="grid gap-3" onSubmit={addItem}>
                <h2 className="text-base font-semibold">Itens do pedido</h2>
                <Select name="productId" label="Produto" options={productOptions} required />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input name="quantity" label="Quantidade" type="number" step="0.001" required />
                  <Input
                    name="unitCost"
                    label="Custo unitário"
                    type="number"
                    step="0.01"
                    required
                  />
                </div>
                <Button type="submit" variant="secondary" icon={<Plus size={15} />}>
                  Adicionar item
                </Button>
                {items.map((item, index) => (
                  <div
                    key={`${item.productId}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-[var(--brand-surface)] p-3 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {item.productName} · {item.quantity}
                    </span>
                      <Button
                        type="button"
                        variant="ghost"
                      className="h-8 w-8 px-0"
                      onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <form className="grid gap-3" onSubmit={(event) => void create(event)}>
                <h2 className="text-base font-semibold">Novo pedido</h2>
                <Select name="branchId" label="Loja" options={branchOptions} required />
                <Select name="supplierId" label="Fornecedor" options={supplierOptions} required />
                <Input name="expectedAt" label="Previsão de entrega" type="date" />
                <Input name="notes" label="Observações" />
                <Button type="submit" disabled={!items.length}>
                  Criar pedido com {items.length} item(ns)
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: string) {
  return (
    (
      {
        draft: "Rascunho",
        approved: "Aprovado",
        partial: "Recebido parcialmente",
        received: "Recebido",
        cancelled: "Cancelado",
      } as Record<string, string>
    )[status] ?? status
  );
}
