"use client";

import { Badge, Button, Card, CardContent, DataTable, Input, PageHeader, Select } from "@sgc/ui";
import { BellRing, Play, RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface Rule {
  id: string;
  type: string;
  recipient: string;
  isActive: boolean;
  createdAt: string;
}
interface Event {
  id: string;
  type: string;
  recipient: string;
  status: string;
  payload: { count?: number };
  sentAt?: string;
  failureReason?: string;
  createdAt: string;
}
export default function AlertsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function load() {
    try {
      const [r, e] = await Promise.all([
        apiFetch<{ data: Rule[] }>("/alerts/rules"),
        apiFetch<{ data: Event[] }>("/alerts/events"),
      ]);
      setRules(r.data);
      setEvents(e.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar alertas.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/alerts/rules", {
        method: "POST",
        body: JSON.stringify({
          type: form.get("type"),
          channel: "email",
          recipient: form.get("recipient"),
          isActive: true,
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar regra.");
    }
  }
  async function run() {
    try {
      const result = await apiFetch<{
        created: number;
        sent: number;
        pending: number;
        providerConfigured: boolean;
      }>("/alerts/run", { method: "POST", body: "{}" });
      setMessage(
        result.providerConfigured
          ? `${result.sent} alerta(s) enviado(s).`
          : `${result.pending} alerta(s) detectado(s) e pendente(s). Configure RESEND_API_KEY para envio.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar alertas.");
    }
  }
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        title="Alertas operacionais"
        description="Regras de estoque, recebíveis vencidos e cancelamentos com entrega rastreável por e-mail."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void load()}>
              Atualizar
            </Button>
            <Button icon={<Play size={16} />} onClick={() => void run()}>
              Processar agora
            </Button>
          </div>
        }
      />
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          {message}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-4 2xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardContent>
            <form className="grid gap-3" onSubmit={(event) => void create(event)}>
              <BellRing size={24} />
              <h2 className="font-semibold">Nova regra</h2>
              <Select
                name="type"
                label="Evento"
                options={[
                  { label: "Estoque mínimo", value: "low_stock" },
                  { label: "Contas vencidas", value: "overdue_receivables" },
                  { label: "Vendas canceladas", value: "cancelled_sales" },
                ]}
                required
              />
              <Input name="recipient" type="email" label="E-mail destinatário" required />
              <Button type="submit">Criar regra</Button>
            </form>
            <div className="mt-5 grid gap-2">
              {rules.map((rule) => (
                <div key={rule.id} className="rounded-md bg-[var(--brand-surface)] p-3 text-sm">
                  <p className="font-medium">{typeLabel(rule.type)}</p>
                  <p className="truncate text-slate-500">{rule.recipient}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <DataTable
              rows={events}
              empty="Nenhum alerta processado."
              columns={[
                {
                  key: "date",
                  header: "Data",
                  render: (row) => new Date(row.createdAt).toLocaleString("pt-BR"),
                },
                { key: "type", header: "Tipo", render: (row) => typeLabel(row.type) },
                { key: "recipient", header: "Destinatário", render: (row) => row.recipient },
                { key: "count", header: "Ocorrências", render: (row) => row.payload?.count ?? 0 },
                {
                  key: "status",
                  header: "Status",
                  render: (row) => <Badge>{row.status === "sent" ? "Enviado" : "Pendente"}</Badge>,
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
function typeLabel(type: string) {
  return (
    (
      {
        low_stock: "Estoque mínimo",
        overdue_receivables: "Contas vencidas",
        cancelled_sales: "Vendas canceladas",
      } as Record<string, string>
    )[type] ?? type
  );
}
