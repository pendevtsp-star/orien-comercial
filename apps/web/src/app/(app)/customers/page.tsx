"use client";

import { Badge, Button, Dialog } from "@sgc/ui";
import { Building2, ContactRound, History, MailCheck, Smartphone } from "lucide-react";
import { useState } from "react";
import { ResourcePage } from "../../../components/resource-page";
import { apiFetch } from "../../../lib/api";

interface CustomerRow {
  id: string;
  name: string;
  document?: string;
  email?: string;
  whatsapp?: string;
  communicationOptIn: boolean;
  isActive: boolean;
}

export default function CustomersPage() {
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function loadHistory(id: string) {
    setHistoryError(null);
    try { setHistory(await apiFetch<CustomerHistory>(`/customers/${id}/history`)); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : "Não foi possível carregar o histórico."); }
  }

  return (
    <ResourcePage<CustomerRow>
      title="Clientes"
      description="Base de consumidores e empresas com consentimento de comunicacao."
      endpoint="/customers"
      bulkStatus={{ itemLabel: "clientes" }}
      searchPlaceholder="Buscar por nome, documento, e-mail ou WhatsApp"
      heroBadge="Relacionamento comercial"
      heroTitle="Clientes organizados para venda, recorrencia e contato responsavel."
      heroDescription="Consolide a base comercial com leitura rapida de contato, documentacao e canais disponiveis para relacionamento."
      insights={[
        { label: "Clientes cadastrados", value: (rows) => rows.length, detail: "Base total do tenant", icon: ContactRound },
        { label: "Com e-mail", value: (rows) => rows.filter((row) => row.email).length, detail: "Canal pronto para comunicacao", icon: MailCheck },
        { label: "Com WhatsApp", value: (rows) => rows.filter((row) => row.whatsapp).length, detail: "Contato direto disponivel", icon: Smartphone },
        {
          label: "Com documento",
          value: (rows) => rows.filter((row) => row.document).length,
          detail: "Base mais preparada para faturamento",
          icon: Building2,
          accent: true
        }
      ]}
      sortOptions={[
        { label: "Nome", value: "name" },
        { label: "Documento", value: "document" },
        { label: "E-mail", value: "email" },
        { label: "Cadastro", value: "createdAt" }
      ]}
      fields={[
        { name: "name", label: "Nome", required: true },
        { name: "document", label: "CPF/CNPJ" },
        { name: "email", label: "E-mail", type: "email" },
        { name: "whatsapp", label: "WhatsApp" }
      ]}
      transform={(form) => ({
        name: form.get("name"),
        document: form.get("document") || undefined,
        email: form.get("email") || undefined,
        whatsapp: form.get("whatsapp") || undefined,
        type: "individual",
        tags: [],
        communicationOptIn: false,
        isActive: true
      })}
      columns={[
        { key: "name", header: "Nome", render: (row) => row.name },
        { key: "document", header: "Documento", render: (row) => row.document ?? "-" },
        { key: "email", header: "E-mail", render: (row) => row.email ?? "-" },
        { key: "whatsapp", header: "WhatsApp", render: (row) => row.whatsapp ?? "-" },
        {
          key: "optin",
          header: "Comunicação",
          render: (row) => <Badge>{row.communicationOptIn ? "Opt-in" : "Sem opt-in"}</Badge>
        }
      ]}
      rowActions={(row) => (
        <Dialog title={`Histórico de ${row.name}`} trigger={<Button type="button" variant="secondary" icon={<History size={14} />} onClick={() => void loadHistory(row.id)}>Histórico</Button>}>
          {historyError ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{historyError}</p> : null}
          {!history && !historyError ? <p className="text-sm text-slate-500">Carregando visão do cliente...</p> : null}
          {history ? <CustomerHistoryView history={history} /> : null}
        </Dialog>
      )}
    />
  );
}

interface CustomerHistory { sales: Array<{ id:string; status:string; totalAmount:string; createdAt:string; branchName:string }>; receivables: Array<{ id:string; amount:string; dueDate:string; status:string }>; loyalty: { pointsBalance:number; balance:string } | null; credits: Array<{ amount:string; balance:string; status:string; expiresAt?:string }>; audit: Array<{ action:string; actorName?:string; createdAt:string; metadata:Record<string, unknown> }> }

function CustomerHistoryView({ history }: { history: CustomerHistory }) {
  return <div className="mt-4 grid gap-5 text-sm">
    <div className="grid grid-cols-2 gap-3"><HistoryStat label="Pontos" value={String(history.loyalty?.pointsBalance ?? 0)} /><HistoryStat label="Crédito disponível" value={money(history.credits.filter((credit) => credit.status === "available").reduce((sum, credit) => sum + Number(credit.balance), 0))} /></div>
    <HistoryList title="Compras recentes" empty="Nenhuma compra vinculada." rows={history.sales.map((sale) => `${new Date(sale.createdAt).toLocaleDateString("pt-BR")} · ${sale.branchName} · ${money(sale.totalAmount)} · ${sale.status}`)} />
    <HistoryList title="Crediário" empty="Nenhuma conta a receber." rows={history.receivables.map((item) => `Vence ${new Date(item.dueDate).toLocaleDateString("pt-BR")} · ${money(item.amount)} · ${item.status}`)} />
    <HistoryList title="Linha do tempo" empty="Nenhuma ação auditada para este cliente." rows={history.audit.map((entry) => `${new Date(entry.createdAt).toLocaleString("pt-BR")} · ${entry.action.replaceAll(".", " ")} · ${entry.actorName ?? "Sistema"}`)} />
  </div>;
}
function HistoryStat({ label, value }: { label:string; value:string }) { return <div className="rounded-md bg-[var(--brand-surface)] p-3"><p className="text-xs text-slate-500">{label}</p><strong className="mt-1 block text-[var(--brand-primary)]">{value}</strong></div>; }
function HistoryList({ title, empty, rows }: { title:string; empty:string; rows:string[] }) { return <section><h3 className="font-semibold text-[var(--brand-primary)]">{title}</h3><div className="mt-2 grid divide-y divide-[var(--brand-border)] rounded-md border border-[var(--brand-border)]">{rows.length ? rows.map((row, index) => <p key={`${row}-${index}`} className="px-3 py-2 text-slate-600">{row}</p>) : <p className="p-3 text-slate-500">{empty}</p>}</div></section>; }
function money(value:string|number) { return Number(value).toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); }
