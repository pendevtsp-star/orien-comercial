"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  PermissionGate,
  Select,
} from "@sgc/ui";
import { FileCheck2, FilePlus2, Plus, RefreshCw, ShieldCheck, Tags, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, openApiDocument } from "../lib/api";
import {
  type CommercialDocumentAction,
  type CommercialDocumentStatus,
  type CommercialDocumentType,
  commercialDocumentActions,
  commercialDocumentStatusLabel,
  commercialDocumentTypeLabel,
} from "../lib/operational-workflows";

type Option = { id: string; name: string; salePrice?: string };
type List<T> = { data: T[]; pagination?: { page: number; pageSize: number; total: number } };
type Segment = { id: string; name: string; code: string; isActive: boolean };
type Policy = {
  id: string;
  productName: string;
  branchName?: string | null;
  customerSegmentName?: string | null;
  minQuantity: string;
  referencePrice: string;
  minPrice: string;
  maxPrice: string;
  minMarginPercent?: string | null;
  marginMode: "warn" | "block" | "approval_required";
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
  version: number;
};
type PricingApproval = {
  id: string;
  productName: string;
  branchName: string;
  requestedByName: string;
  requestedUnitPrice: string;
  requestedDiscountAmount: string;
  requestedMarginPercent?: string | null;
  quantity: string;
  reason: string;
  expiresAt: string;
};
type CommercialDocument = {
  id: string;
  type: CommercialDocumentType;
  number: number;
  status: CommercialDocumentStatus;
  totalAmount: string;
  validUntil: string;
  createdAt: string;
  branchName: string;
  customerName?: string | null;
  convertedSaleId?: string | null;
};
type DraftItem = { productId: string; quantity: number; unitPrice: number; discountAmount: number };

const marginLabels = {
  warn: "Avisar",
  block: "Bloquear",
  approval_required: "Exigir aprovação",
};
const actionLabels: Record<CommercialDocumentAction, string> = {
  send: "Enviar",
  approve: "Aprovar",
  reserve: "Reservar estoque",
  convert: "Converter em venda",
  expire: "Marcar como vencido",
  cancel: "Cancelar",
};

export function PricingOperationsPanel({
  branches,
  products,
  permissions,
}: {
  branches: Option[];
  products: Option[];
  permissions: string[];
}) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [approvals, setApprovals] = useState<PricingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canManage = permissions.includes("pricing.manage");
  const canAuthorize = permissions.includes("pricing.exceptions.authorize");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [segmentResponse, policyResponse, approvalResponse] = await Promise.all([
        apiFetch<List<Segment>>("/pricing/segments"),
        canManage
          ? apiFetch<List<Policy>>("/pricing/policies?page=1&pageSize=100")
          : Promise.resolve({ data: [] } as List<Policy>),
        canAuthorize
          ? apiFetch<List<PricingApproval>>("/pricing/approvals")
          : Promise.resolve({ data: [] } as List<PricingApproval>),
      ]);
      setSegments(segmentResponse.data);
      setPolicies(policyResponse.data);
      setApprovals(approvalResponse.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar preços e promoções.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [canAuthorize, canManage]);

  async function submit(path: string, body: unknown, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      setMessage(success);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A operação não pôde ser concluída.");
    } finally {
      setBusy(false);
    }
  }

  async function createSegment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit("/pricing/segments", {
      name: form.get("name"),
      code: form.get("code"),
      isActive: true,
    }, "Segmento salvo.");
    event.currentTarget.reset();
  }

  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsAt = localDateTimeToIso(form.get("startsAt"));
    const endsAt = localDateTimeToIso(form.get("endsAt"));
    await submit("/pricing/policies", {
      productId: form.get("productId"),
      branchId: form.get("branchId") || undefined,
      customerSegmentId: form.get("customerSegmentId") || undefined,
      startsAt,
      endsAt,
      minQuantity: Number(form.get("minQuantity")),
      referencePrice: Number(form.get("referencePrice")),
      minPrice: Number(form.get("minPrice")),
      maxPrice: Number(form.get("maxPrice")),
      minMarginPercent: form.get("minMarginPercent") ? Number(form.get("minMarginPercent")) : undefined,
      marginMode: form.get("marginMode"),
      priority: Number(form.get("priority") || 0),
    }, "Política de preço ativada.");
    event.currentTarget.reset();
  }

  async function decideApproval(approval: PricingApproval, decision: "approve" | "reject") {
    const reason = window.prompt(
      decision === "approve" ? "Informe o motivo da aprovação:" : "Informe o motivo da recusa:",
    );
    if (!reason?.trim()) return;
    if (reason.trim().length < 10) {
      setError("O motivo deve ter ao menos 10 caracteres.");
      return;
    }
    await submit(
      `/pricing/approvals/${approval.id}/decision`,
      { approved: decision === "approve", reason: reason.trim() },
      decision === "approve" ? "Exceção aprovada." : "Exceção recusada.",
    );
  }

  if (loading) return <LoadingState label="Carregando preços e segmentos" />;

  return (
    <div className="grid gap-4">
      {error ? <Alert className="border-rose-200 bg-rose-50 text-rose-700">{error}</Alert> : null}
      {message ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      <div className="flex justify-end">
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void load()} disabled={busy}>Atualizar</Button>
      </div>
      <PermissionGate granted={permissions} required={["pricing.manage"]}>
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardContent>
              <form className="grid gap-3" onSubmit={(event) => void createSegment(event)}>
                <Tags size={20} />
                <h2 className="font-semibold text-[var(--brand-primary)]">Novo segmento de clientes</h2>
                <p className="text-sm text-slate-500">Use segmentos para aplicar condições comerciais a grupos cadastrados.</p>
                <Input name="name" label="Nome" placeholder="Ex.: Atacado" required minLength={2} />
                <Input name="code" label="Código interno" placeholder="ATACADO" required minLength={2} pattern="[A-Za-z0-9_-]+" />
                <Button type="submit" disabled={busy} icon={<Plus size={16} />}>Salvar segmento</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <form className="grid gap-3" onSubmit={(event) => void createPolicy(event)}>
                <h2 className="font-semibold text-[var(--brand-primary)]">Nova política de preço</h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <Select name="productId" label="Produto" options={toOptions(products)} required />
                  <Select name="branchId" label="Loja" options={[{ label: "Todas as lojas", value: "" }, ...toOptions(branches)]} />
                  <Select name="customerSegmentId" label="Segmento" options={[{ label: "Todos os clientes", value: "" }, ...segments.filter((item) => item.isActive).map((item) => ({ label: item.name, value: item.id }))]} />
                  <Input name="minQuantity" label="Quantidade mínima" type="number" min="0.001" step="0.001" defaultValue="1" required />
                  <Input name="referencePrice" label="Preço de referência" type="number" min="0" step="0.01" required />
                  <Input name="minPrice" label="Menor preço permitido" type="number" min="0" step="0.01" required />
                  <Input name="maxPrice" label="Maior preço permitido" type="number" min="0" step="0.01" required />
                  <Input name="minMarginPercent" label="Margem mínima (%)" type="number" step="0.01" />
                  <Select name="marginMode" label="Ao atingir a margem mínima" options={[
                    { label: "Avisar o operador", value: "warn" },
                    { label: "Bloquear a venda", value: "block" },
                    { label: "Exigir aprovação", value: "approval_required" },
                  ]} />
                  <Input name="startsAt" label="Início da vigência" type="datetime-local" />
                  <Input name="endsAt" label="Fim da vigência" type="datetime-local" />
                  <Input name="priority" label="Prioridade" type="number" min="0" max="1000" defaultValue="0" />
                </div>
                <Button type="submit" disabled={busy}>Ativar política</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </PermissionGate>
      <DataTable
        rows={policies}
        empty={<EmptyState eyebrow="Políticas comerciais" title="Nenhuma política cadastrada" description={canManage ? "Crie uma política para controlar preço, margem e vigência." : "Seu perfil pode consultar segmentos, mas não gerencia políticas de preço."} icon={<Tags size={20} />} />}
        columns={[
          { key: "product", header: "Produto", render: (row) => <><strong>{row.productName}</strong><span className="block text-xs text-slate-500">Versão {row.version}</span></> },
          { key: "scope", header: "Aplicação", render: (row) => <><span>{row.branchName ?? "Todas as lojas"}</span><span className="block text-xs text-slate-500">{row.customerSegmentName ?? "Todos os clientes"}</span></> },
          { key: "limits", header: "Faixa de preço", render: (row) => <><span>{money(row.minPrice)} a {money(row.maxPrice)}</span><span className="block text-xs text-slate-500">Referência {money(row.referencePrice)} · Qtd. mín. {row.minQuantity}</span></> },
          { key: "margin", header: "Margem", render: (row) => <><Badge>{marginLabels[row.marginMode]}</Badge><span className="mt-1 block text-xs text-slate-500">Mínima {row.minMarginPercent ?? "não definida"}%</span></> },
          { key: "validity", header: "Vigência", render: (row) => formatValidity(row.startsAt, row.endsAt) },
          { key: "status", header: "Situação", render: (row) => <Badge>{row.isActive ? "Ativa" : "Inativa"}</Badge> },
          { key: "actions", header: "Ações", render: (row) => canManage && row.isActive ? <Button variant="danger" disabled={busy} onClick={() => void submit(`/pricing/policies/${row.id}/deactivate`, {}, "Política desativada.")} icon={<X size={15} />}>Desativar</Button> : null },
        ]}
      />
      {canAuthorize ? (
        <Card>
          <CardContent>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 text-[var(--brand-secondary)]" size={20} />
              <div>
                <h2 className="font-semibold text-[var(--brand-primary)]">Aprovações por segundo responsável</h2>
                <p className="mt-1 text-sm text-slate-500">A decisão exige outro usuário autorizado e nunca pode ser feita pelo solicitante.</p>
              </div>
            </div>
            <div className="mt-4">
              <DataTable
                rows={approvals}
                empty="Nenhuma exceção pendente."
                columns={[
                  { key: "product", header: "Produto", render: (row) => <><strong>{row.productName}</strong><span className="block text-xs text-slate-500">{row.branchName} · {row.quantity} un.</span></> },
                  { key: "requester", header: "Solicitante", render: (row) => <><span>{row.requestedByName}</span><span className="block text-xs text-slate-500">{row.reason}</span></> },
                  { key: "price", header: "Condição", render: (row) => <><span>{money(row.requestedUnitPrice)}</span><span className="block text-xs text-slate-500">Desconto {money(row.requestedDiscountAmount)} · margem {row.requestedMarginPercent ?? "-"}%</span></> },
                  { key: "expiry", header: "Expira", render: (row) => new Date(row.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) },
                  { key: "actions", header: "Decisão", render: (row) => <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void decideApproval(row, "approve")}>Aprovar</Button><Button variant="danger" disabled={busy} onClick={() => void decideApproval(row, "reject")}>Recusar</Button></div> },
                ]}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function CommercialDocumentsPanel({
  branches,
  products,
  customers,
  permissions,
}: {
  branches: Option[];
  products: Option[];
  customers: Option[];
  permissions: string[];
}) {
  const [documents, setDocuments] = useState<CommercialDocument[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [filters, setFilters] = useState({ type: "", status: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canCreate = permissions.includes("sales.create");
  const total = useMemo(() => draftItems.reduce((sum, item) => sum + item.quantity * item.unitPrice - item.discountAmount, 0), [draftItems]);

  async function load() {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page: "1", pageSize: "100" });
    if (filters.type) query.set("type", filters.type);
    if (filters.status) query.set("status", filters.status);
    try {
      const response = await apiFetch<List<CommercialDocument>>(`/operations/commercial-documents?${query}`);
      setDocuments(response.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os documentos comerciais.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [filters.type, filters.status]);

  async function command(path: string, init: RequestInit, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(path, init);
      setMessage(success);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A operação não pôde ser concluída.");
    } finally {
      setBusy(false);
    }
  }

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const product = products.find((item) => item.id === form.get("productId"));
    if (!product) return;
    setDraftItems((current) => [...current, {
      productId: product.id,
      quantity: Number(form.get("quantity")),
      unitPrice: Number(form.get("unitPrice") || product.salePrice || 0),
      discountAmount: Number(form.get("discountAmount") || 0),
    }]);
    event.currentTarget.reset();
  }

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await command("/operations/commercial-documents", {
      method: "POST",
      body: JSON.stringify({
        type: form.get("type"),
        branchId: form.get("branchId"),
        customerId: form.get("customerId") || undefined,
        validUntil: form.get("validUntil"),
        notes: form.get("notes") || undefined,
        reserveStock: form.get("reserveStock") === "on",
        items: draftItems,
      }),
    }, "Documento comercial criado.");
    setDraftItems([]);
    event.currentTarget.reset();
  }

  async function transition(row: CommercialDocument, action: CommercialDocumentAction) {
    if (action === "convert") {
      await command(`/operations/commercial-documents/${row.id}/convert`, {
        method: "POST",
        headers: { "Idempotency-Key": createIdempotencyKey(row.id) },
        body: "{}",
      }, "Documento convertido em venda.");
      return;
    }
    const reason = action === "cancel" ? window.prompt("Informe o motivo do cancelamento:") : undefined;
    if (action === "cancel" && !reason?.trim()) return;
    await command(`/operations/commercial-documents/${row.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason: reason?.trim() || undefined }),
    }, `Documento atualizado: ${actionLabels[action].toLowerCase()}.`);
  }

  return (
    <div className="grid gap-4">
      {error ? <Alert className="border-rose-200 bg-rose-50 text-rose-700">{error}</Alert> : null}
      {message ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      <PermissionGate granted={permissions} required={["sales.create"]}>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardContent>
              <form className="grid gap-3" onSubmit={addItem}>
                <FilePlus2 size={20} />
                <h2 className="font-semibold text-[var(--brand-primary)]">Itens do documento</h2>
                <Select name="productId" label="Produto" options={toOptions(products)} required />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input name="quantity" label="Quantidade" type="number" min="0.001" step="0.001" defaultValue="1" required />
                  <Input name="unitPrice" label="Preço unitário" type="number" min="0" step="0.01" />
                  <Input name="discountAmount" label="Desconto total" type="number" min="0" step="0.01" defaultValue="0" />
                </div>
                <Button type="submit" variant="secondary" icon={<Plus size={16} />}>Adicionar item</Button>
              </form>
              <div className="mt-4 grid gap-2">
                {draftItems.map((item, index) => (
                  <div key={`${item.productId}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-[var(--brand-surface)] p-3 text-sm">
                    <span>{products.find((product) => product.id === item.productId)?.name} · {item.quantity} un.</span>
                    <div className="flex items-center gap-2"><strong>{money(item.quantity * item.unitPrice - item.discountAmount)}</strong><button type="button" aria-label="Remover item" onClick={() => setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button></div>
                  </div>
                ))}
                <strong>Total: {money(total)}</strong>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <form className="grid gap-3" onSubmit={(event) => void createDocument(event)}>
                <h2 className="font-semibold text-[var(--brand-primary)]">Dados comerciais</h2>
                <Select name="type" label="Tipo" options={[
                  { label: "Orçamento", value: "quote" },
                  { label: "Pedido", value: "order" },
                  { label: "Documento auxiliar de venda (DAV)", value: "dav" },
                ]} required />
                <Select name="branchId" label="Loja" options={toOptions(branches)} required />
                <Select name="customerId" label="Cliente" options={[{ label: "Consumidor não identificado", value: "" }, ...toOptions(customers)]} />
                <Input name="validUntil" label="Validade" type="date" min={new Date().toISOString().slice(0, 10)} required />
                <Input name="notes" label="Observações" maxLength={500} />
                <label className="flex items-start gap-2 text-sm text-slate-700"><input name="reserveStock" type="checkbox" className="mt-1" /><span>Reservar estoque até a validade. A reserva não baixa o estoque antes da venda.</span></label>
                <Button type="submit" disabled={busy || !draftItems.length} icon={<FileCheck2 size={16} />}>Salvar documento</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </PermissionGate>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[220px_220px_auto]">
        <Select label="Tipo" value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))} options={[{ label: "Todos os tipos", value: "" }, { label: "Orçamentos", value: "quote" }, { label: "Pedidos", value: "order" }, { label: "DAV", value: "dav" }]} />
        <Select label="Situação" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} options={[{ label: "Todas as situações", value: "" }, ...(["draft", "sent", "approved", "reserved", "converted", "expired", "cancelled"] as CommercialDocumentStatus[]).map((status) => ({ label: commercialDocumentStatusLabel(status), value: status }))]} />
        <div className="flex items-end"><Button variant="secondary" onClick={() => void load()} icon={<RefreshCw size={16} />}>Atualizar</Button></div>
      </div>
      {loading ? <LoadingState label="Carregando documentos comerciais" /> : (
        <DataTable
          rows={documents}
          empty={<EmptyState eyebrow="Negociação comercial" title="Nenhum documento encontrado" description="Crie um orçamento, pedido ou DAV, ou altere os filtros selecionados." icon={<FileCheck2 size={20} />} />}
          columns={[
            { key: "document", header: "Documento", render: (row) => <><strong>{commercialDocumentTypeLabel(row.type)} #{row.number}</strong><span className="block text-xs text-slate-500">{row.branchName}</span></> },
            { key: "customer", header: "Cliente", render: (row) => row.customerName ?? "Consumidor não identificado" },
            { key: "validity", header: "Validade", render: (row) => new Date(`${row.validUntil}T12:00:00`).toLocaleDateString("pt-BR") },
            { key: "total", header: "Total", render: (row) => money(row.totalAmount) },
            { key: "status", header: "Situação", render: (row) => <Badge>{commercialDocumentStatusLabel(row.status)}</Badge> },
            { key: "actions", header: "Ações", render: (row) => <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void openApiDocument(`/operations/quotes/${row.id}/document`)}>Visualizar</Button>{canCreate ? commercialDocumentActions(row.type, row.status).map((action) => <Button key={action} variant={action === "cancel" ? "danger" : "secondary"} disabled={busy} onClick={() => void transition(row, action)}>{actionLabels[action]}</Button>) : null}</div> },
          ]}
        />
      )}
    </div>
  );
}

function toOptions(rows: Option[]) {
  return rows.map((item) => ({ label: item.name, value: item.id }));
}

function money(value: string | number) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatValidity(startsAt?: string | null, endsAt?: string | null) {
  if (!startsAt && !endsAt) return "Sem prazo definido";
  const start = startsAt ? new Date(startsAt).toLocaleDateString("pt-BR") : "agora";
  const end = endsAt ? new Date(endsAt).toLocaleDateString("pt-BR") : "sem término";
  return `${start} a ${end}`;
}

function localDateTimeToIso(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function createIdempotencyKey(documentId: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `commercial-${documentId.slice(0, 8)}-${random}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 128);
}
