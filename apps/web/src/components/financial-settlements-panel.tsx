"use client";

import { Alert, Badge, Button, Card, CardContent, DataTable, EmptyState, Input, LoadingState, PermissionGate, Select, Tabs } from "@sgc/ui";
import { Landmark, Plus, RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { basisPointsToPercent, moneyToCents, settlementStatusLabel } from "../lib/operational-workflows";

type List<T> = { data: T[]; pagination?: { total: number } };
type Branch = { id: string; name: string };
type Acquirer = { id: string; branchId?: string | null; name: string; code: string; isActive: boolean };
type FeeRule = { id: string; acquirerId: string; acquirerName: string; paymentMethod: string; brand?: string | null; installmentFrom: number; installmentTo: number; percentageBasisPoints: number; fixedFee: string; anticipationBasisPoints: number; settlementDays: number; validFrom: string; validUntil?: string | null; isActive: boolean; version: number };
type Forecast = { id: string; branchId: string; saleId: string; method: string; brand?: string | null; installments: number; grossAmount: string; feeAmount: string; netAmount: string; expectedSettlementDate: string; settlementStatus: string; settledAmount: string };

export function FinancialSettlementsPanel({ permissions }: { permissions: string[] }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [acquirers, setAcquirers] = useState<Acquirer[]>([]);
  const [rules, setRules] = useState<FeeRule[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [filters, setFilters] = useState({ acquirerId: "", status: "", expectedFrom: "", expectedTo: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canReconcile = permissions.includes("financial.reconcile");
  const summary = useMemo(() => forecasts.reduce((total, item) => ({ gross: total.gross + Number(item.grossAmount), fees: total.fees + Number(item.feeAmount), net: total.net + Number(item.netAmount) }), { gross: 0, fees: 0, net: 0 }), [forecasts]);

  async function load() {
    setLoading(true); setError(null);
    const query = new URLSearchParams({ page: "1", pageSize: "100" });
    Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
    try {
      const [branchResponse, acquirerResponse, ruleResponse, forecastResponse] = await Promise.all([
        apiFetch<List<Branch>>("/branches?pageSize=100&isActive=true"),
        apiFetch<List<Acquirer>>("/financial/acquirers"),
        apiFetch<List<FeeRule>>("/financial/fee-rules"),
        apiFetch<List<Forecast>>(`/financial/settlement-forecasts?${query}`),
      ]);
      setBranches(branchResponse.data); setAcquirers(acquirerResponse.data); setRules(ruleResponse.data); setForecasts(forecastResponse.data);
      setSelected((current) => current.filter((id) => forecastResponse.data.some((item) => item.id === id)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar os recebimentos."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [filters.acquirerId, filters.status, filters.expectedFrom, filters.expectedTo]);

  async function submit(path: string, body: unknown, success: string) {
    setBusy(true); setError(null); setMessage(null);
    try { await apiFetch(path, { method: "POST", body: JSON.stringify(body) }); setMessage(success); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "A operação financeira não pôde ser concluída."); }
    finally { setBusy(false); }
  }
  async function createAcquirer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await submit("/financial/acquirers", { name: form.get("name"), code: form.get("code"), branchId: form.get("branchId") || undefined, isActive: true }, "Operadora cadastrada."); event.currentTarget.reset();
  }
  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const fixedFee = formText(form, "fixedFee") || "0";
    const validFrom = formText(form, "validFrom");
    const validUntil = formText(form, "validUntil");
    await submit("/financial/fee-rules", {
      acquirerId: form.get("acquirerId"), paymentMethod: form.get("paymentMethod"), brand: form.get("brand") || undefined,
      installmentFrom: Number(form.get("installmentFrom")), installmentTo: Number(form.get("installmentTo")),
      percentageBasisPoints: Math.round(Number(form.get("percentage")) * 100), fixedFeeCents: moneyToCents(fixedFee),
      anticipationBasisPoints: Math.round(Number(form.get("anticipation")) * 100), settlementDays: Number(form.get("settlementDays")),
      validFrom: new Date(validFrom).toISOString(), validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
    }, "Regra de recebimento ativada."); event.currentTarget.reset();
  }
  async function settle(row: Forecast) {
    const pending = Math.max(0, Number(row.netAmount) - Number(row.settledAmount));
    const typed = window.prompt("Valor recebido", pending.toFixed(2)); if (!typed) return;
    await submit("/financial/settlements", { paymentId: row.id, settledAmountCents: moneyToCents(typed), effectiveAt: new Date().toISOString(), externalReference: `manual-${row.id.slice(0, 8)}-${Date.now()}` }, "Recebimento registrado.");
  }
  async function reconcileSelected() {
    const rows = forecasts.filter((item) => selected.includes(item.id)); const acquirerId = filters.acquirerId;
    if (!rows.length || !acquirerId) { setError("Selecione uma operadora e ao menos um recebimento para conciliar."); return; }
    const branchId = rows[0]!.branchId;
    if (rows.some((item) => item.branchId !== branchId)) { setError("Concilie uma loja por vez."); return; }
    await submit("/financial/reconciliation-batches", { branchId, acquirerId, externalReference: `manual-${Date.now()}`, statementDate: new Date().toISOString().slice(0, 10), items: rows.map((item) => ({ paymentId: item.id, actualAmountCents: moneyToCents(item.netAmount), externalReference: `payment-${item.id}` })) }, "Conciliação processada."); setSelected([]);
  }

  if (loading) return <LoadingState label="Carregando recebimentos líquidos" />;
  return <div className="grid gap-4">
    {error ? <Alert className="border-rose-200 bg-rose-50 text-rose-700">{error}</Alert> : null}
    {message ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
    <div className="grid gap-3 sm:grid-cols-3">{[["Vendas processadas", summary.gross], ["Custos previstos", summary.fees], ["Valor líquido previsto", summary.net]].map(([label, value]) => <Card key={String(label)}><CardContent><p className="text-sm text-slate-500">{label}</p><strong className="mt-2 block text-2xl text-[var(--brand-primary)]">{money(Number(value))}</strong></CardContent></Card>)}</div>
    <PermissionGate granted={permissions} required={["financial.reconcile"]}>
      <Tabs defaultValue="operators" tabs={[
        { value: "operators", label: "Operadoras", content: <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]"><Card><CardContent><form className="grid gap-3" onSubmit={(event) => void createAcquirer(event)}><h3 className="font-semibold">Nova operadora</h3><Input name="name" label="Nome" required /><Input name="code" label="Código interno" required /><Select name="branchId" label="Loja" options={[{ label: "Todas as lojas", value: "" }, ...branches.map((item) => ({ label: item.name, value: item.id }))]} /><Button type="submit" disabled={busy} icon={<Plus size={16} />}>Cadastrar</Button></form></CardContent></Card><DataTable rows={acquirers} empty="Nenhuma operadora cadastrada." columns={[{ key: "name", header: "Operadora", render: (row) => row.name }, { key: "code", header: "Código", render: (row) => row.code }, { key: "scope", header: "Escopo", render: (row) => branches.find((item) => item.id === row.branchId)?.name ?? "Todas as lojas" }, { key: "status", header: "Situação", render: (row) => <Badge>{row.isActive ? "Ativa" : "Inativa"}</Badge> }]} /></div> },
        { value: "rules", label: "Regras de recebimento", content: <div className="grid gap-4"><Card><CardContent><form className="grid gap-3" onSubmit={(event) => void createRule(event)}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Select name="acquirerId" label="Operadora" options={acquirers.filter((item) => item.isActive).map((item) => ({ label: item.name, value: item.id }))} required /><Select name="paymentMethod" label="Forma de pagamento" options={[{ label: "Cartão de crédito", value: "credit_card" }, { label: "Cartão de débito", value: "debit_card" }, { label: "Pix", value: "pix" }]} /><Input name="brand" label="Bandeira (opcional)" /><Input name="percentage" label="Taxa (%)" type="number" min="0" max="100" step="0.01" defaultValue="0" /><Input name="fixedFee" label="Tarifa fixa (R$)" type="number" min="0" step="0.01" defaultValue="0" /><Input name="anticipation" label="Antecipação (%)" type="number" min="0" max="100" step="0.01" defaultValue="0" /><Input name="installmentFrom" label="Parcela inicial" type="number" min="1" defaultValue="1" /><Input name="installmentTo" label="Parcela final" type="number" min="1" defaultValue="1" /><Input name="settlementDays" label="Prazo para receber (dias)" type="number" min="0" defaultValue="0" /><Input name="validFrom" label="Vigência inicial" type="datetime-local" required /><Input name="validUntil" label="Vigência final" type="datetime-local" /></div><Button type="submit" disabled={busy}>Ativar regra</Button></form></CardContent></Card><DataTable rows={rules} empty="Nenhuma regra cadastrada." columns={[{ key: "operator", header: "Operadora", render: (row) => row.acquirerName }, { key: "condition", header: "Condição", render: (row) => `${row.paymentMethod}${row.brand ? ` · ${row.brand}` : ""} · ${row.installmentFrom} a ${row.installmentTo}x` }, { key: "fees", header: "Custos", render: (row) => `${basisPointsToPercent(row.percentageBasisPoints)} + ${money(Number(row.fixedFee))}` }, { key: "settlement", header: "Recebimento", render: (row) => `${row.settlementDays} dia(s)` }, { key: "status", header: "Situação", render: (row) => <Badge>{row.isActive ? `Ativa · v${row.version}` : "Inativa"}</Badge> }]} /></div> },
      ]} />
    </PermissionGate>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Select label="Operadora" value={filters.acquirerId} onChange={(event) => setFilters((current) => ({ ...current, acquirerId: event.target.value }))} options={[{ label: "Todas", value: "" }, ...acquirers.map((item) => ({ label: item.name, value: item.id }))]} /><Select label="Situação" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} options={[{ label: "Todas", value: "" }, { label: "Pendente", value: "pending" }, { label: "Liquidado parcialmente", value: "partially_settled" }, { label: "Liquidado", value: "settled" }, { label: "Com divergência", value: "diverged" }]} /><Input label="Previsto a partir de" type="date" value={filters.expectedFrom} onChange={(event) => setFilters((current) => ({ ...current, expectedFrom: event.target.value }))} /><Input label="Previsto até" type="date" value={filters.expectedTo} onChange={(event) => setFilters((current) => ({ ...current, expectedTo: event.target.value }))} /><div className="flex items-end"><Button variant="secondary" onClick={() => void load()} icon={<RefreshCw size={16} />}>Atualizar</Button></div></div>
    {canReconcile && selected.length ? <div className="flex items-center justify-between rounded-md border border-[var(--brand-border)] bg-white p-3"><span>{selected.length} recebimento(s) selecionado(s)</span><Button disabled={busy} onClick={() => void reconcileSelected()}>Conciliar selecionados</Button></div> : null}
    <DataTable rows={forecasts} empty={<EmptyState title="Nenhum recebimento previsto" description="A previsão aparecerá depois que pagamentos tiverem suas condições registradas." icon={<Landmark size={20} />} />} columns={[
      { key: "select", header: "", render: (row) => canReconcile ? <input aria-label={`Selecionar recebimento ${row.id}`} type="checkbox" checked={selected.includes(row.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} /> : null },
      { key: "payment", header: "Pagamento", render: (row) => <><strong>{row.method}</strong><span className="block text-xs text-slate-500">Venda {row.saleId.slice(0, 8)}{row.brand ? ` · ${row.brand}` : ""}</span></> },
      { key: "values", header: "Valores", render: (row) => <><span>Bruto {money(Number(row.grossAmount))}</span><span className="block text-xs text-slate-500">Custos {money(Number(row.feeAmount))} · Líquido {money(Number(row.netAmount))}</span></> },
      { key: "date", header: "Previsão", render: (row) => new Date(`${row.expectedSettlementDate}T12:00:00`).toLocaleDateString("pt-BR") },
      { key: "status", header: "Situação", render: (row) => <Badge>{settlementStatusLabel(row.settlementStatus)}</Badge> },
      { key: "action", header: "Ação", render: (row) => canReconcile && row.settlementStatus !== "settled" ? <Button variant="secondary" disabled={busy} onClick={() => void settle(row)}>Registrar recebimento</Button> : null },
    ]} />
  </div>;
}

function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function money(value: number) { return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
