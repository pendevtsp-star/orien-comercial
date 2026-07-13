"use client";

import { Badge, Button, Card, CardContent, EmptyState, Input, PageHeader, Select } from "@sgc/ui";
import { Headset, MessageSquare, Plus, RefreshCw, Send } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type Ticket = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  branchName?: string;
  openedByName?: string;
  messageCount: number;
  slaDueAt?: string;
  slaState?: string;
  metadata?: { attachmentUrls?: string[] };
  createdAt: string;
  updatedAt: string;
};
type TicketDetail = {
  ticket: Ticket & { description: string; pageUrl?: string; requestId?: string };
  messages: Array<{
    id: string;
    authorKind: string;
    authorName: string;
    body: string;
    createdAt: string;
  }>;
};

const statuses = [
  { label: "Abertos", value: "open" },
  { label: "Com suporte", value: "waiting_support" },
  { label: "Aguardando cliente", value: "waiting_customer" },
  { label: "Resolvidos", value: "resolved" },
  { label: "Fechados", value: "closed" },
  { label: "Todos", value: "all" },
];
const categories = [
  { label: "Geral", value: "general" },
  { label: "Cobrança", value: "billing" },
  { label: "Técnico", value: "technical" },
  { label: "Operação", value: "operation" },
  { label: "Integração", value: "integration" },
  { label: "Erro", value: "bug" },
  { label: "Sugestão", value: "suggestion" },
];

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const params = new URLSearchParams({ pageSize: "50" });
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      const response = await apiFetch<{ data: Ticket[] }>(`/support?${params.toString()}`);
      setTickets(response.data);
      setError(null);
      if (!selectedId && response.data[0]) setSelectedId(response.data[0].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar chamados.");
    }
  }

  async function loadDetail(id: string) {
    try {
      setDetail(await apiFetch<TicketDetail>(`/support/${id}`));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao abrir chamado.");
    }
  }

  useEffect(() => {
    void load();
  }, [status]);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const attachmentEntry = data.get("attachmentUrl");
    const attachmentUrl = typeof attachmentEntry === "string" ? attachmentEntry.trim() : "";
    try {
      const response = await apiFetch<{ id: string }>("/support", {
        method: "POST",
        body: JSON.stringify({
          subject: data.get("subject"),
          description: data.get("description"),
          category: data.get("category"),
          priority: data.get("priority"),
          pageUrl: window.location.href,
          requestId: data.get("requestId") || undefined,
          attachmentUrls: attachmentUrl ? [attachmentUrl] : [],
        }),
      });
      form.reset();
      setSelectedId(response.id);
      await load();
      await loadDetail(response.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao abrir chamado.");
    }
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await apiFetch(`/support/${selectedId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: data.get("body") }),
      });
      form.reset();
      await load();
      await loadDetail(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao responder chamado.");
    }
  }

  async function closeTicket(nextStatus: "resolved" | "closed" | "open") {
    if (!selectedId) return;
    await apiFetch(`/support/${selectedId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
    await load();
    await loadDetail(selectedId);
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Central de Suporte"
        description="Abra chamados, acompanhe respostas e mantenha o histórico de atendimento da sua empresa."
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
      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Card>
            <CardContent>
              <form className="grid gap-3" onSubmit={(event) => void create(event)}>
                <h2 className="font-semibold text-[var(--brand-primary)]">Novo chamado</h2>
                <Input
                  name="subject"
                  label="Assunto"
                  required
                  placeholder="Ex.: Dúvida no fechamento de caixa"
                />
                <label className="grid gap-1 text-sm font-medium text-[var(--brand-primary)]">
                  Descrição
                  <textarea
                    name="description"
                    required
                    rows={5}
                    className="rounded-md border border-[var(--brand-border)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-secondary)]"
                    placeholder="Conte o que aconteceu, em qual tela e qual resultado esperado."
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <Select name="category" label="Categoria" options={categories} />
                  <Select
                    name="priority"
                    label="Prioridade"
                    options={[
                      { label: "Normal", value: "normal" },
                      { label: "Alta", value: "high" },
                      { label: "Crítica", value: "critical" },
                      { label: "Baixa", value: "low" },
                    ]}
                  />
                </div>
                <Input
                  name="attachmentUrl"
                  label="Link do print/anexo"
                  placeholder="Cole a URL do print, vídeo ou arquivo"
                />
                <Input
                  name="requestId"
                  label="ID do erro"
                  placeholder="Opcional: código exibido no erro"
                />
                <Button type="submit" icon={<Plus size={16} />}>
                  Abrir chamado
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-3">
              <div className="grid grid-cols-[1fr_150px] gap-3">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar chamados"
                  aria-label="Buscar chamados"
                />
                <Button variant="secondary" onClick={() => void load()}>
                  Buscar
                </Button>
              </div>
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                options={statuses}
                aria-label="Status"
              />
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card>
            <CardContent className="grid gap-2">
              {tickets.length ? (
                tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    className={`rounded-md border p-3 text-left transition hover:bg-[var(--brand-surface)] ${selectedId === ticket.id ? "border-[var(--brand-secondary)] bg-[var(--brand-surface)]" : "border-[var(--brand-border)]"}`}
                    onClick={() => setSelectedId(ticket.id)}
                  >
                    <div className="flex flex-wrap gap-2">
                      <Badge>{ticket.status}</Badge>
                      <Badge>{ticket.priority}</Badge>
                    </div>
                    <strong className="mt-2 block text-sm text-[var(--brand-primary)]">
                      {ticket.subject}
                    </strong>
                    <span className="text-xs text-slate-500">
                      {ticket.messageCount} mensagem(ns) · {slaText(ticket)} ·{" "}
                      {new Date(ticket.updatedAt).toLocaleString("pt-BR")}
                    </span>
                  </button>
                ))
              ) : (
                <EmptyState
                  icon={<Headset size={18} />}
                  title="Nenhum chamado neste filtro."
                  description="Abra um chamado quando precisar de ajuda operacional ou técnica."
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              {detail ? (
                <div className="grid gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Badge>{detail.ticket.status}</Badge>
                        <Badge>{detail.ticket.category}</Badge>
                      </div>
                      <h2 className="mt-2 text-xl font-semibold text-[var(--brand-primary)]">
                        {detail.ticket.subject}
                      </h2>
                      <p className="text-sm text-slate-500">
                        Aberto por {detail.ticket.openedByName ?? "usuário"} ·{" "}
                        {new Date(detail.ticket.createdAt).toLocaleString("pt-BR")}
                      </p>
                      <p className="text-sm text-slate-500">{slaText(detail.ticket)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => void closeTicket("open")}>
                        Reabrir
                      </Button>
                      <Button variant="secondary" onClick={() => void closeTicket("resolved")}>
                        Resolver
                      </Button>
                      <Button variant="secondary" onClick={() => void closeTicket("closed")}>
                        Fechar
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {detail.ticket.requestId ||
                    detail.ticket.pageUrl ||
                    attachmentUrls(detail.ticket).length ? (
                      <div className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 text-sm text-[var(--brand-primary)]">
                        {detail.ticket.requestId ? (
                          <p>
                            <strong>ID do erro:</strong> {detail.ticket.requestId}
                          </p>
                        ) : null}
                        {detail.ticket.pageUrl ? (
                          <p>
                            <strong>Tela de origem:</strong> {detail.ticket.pageUrl}
                          </p>
                        ) : null}
                        {attachmentUrls(detail.ticket).map((url) => (
                          <p key={url}>
                            <strong>Anexo:</strong>{" "}
                            <a className="underline" href={url} target="_blank" rel="noreferrer">
                              {url}
                            </a>
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {detail.messages.map((message) => (
                      <article
                        key={message.id}
                        className={`rounded-md border p-3 ${message.authorKind === "platform_user" ? "border-blue-100 bg-blue-50" : "border-[var(--brand-border)] bg-white"}`}
                      >
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <MessageSquare size={14} />
                          {message.authorName} ·{" "}
                          {new Date(message.createdAt).toLocaleString("pt-BR")}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--brand-primary)]">
                          {message.body}
                        </p>
                      </article>
                    ))}
                  </div>
                  {detail.ticket.status !== "closed" ? (
                    <form
                      className="grid gap-3 border-t border-[var(--brand-border)] pt-4"
                      onSubmit={(event) => void reply(event)}
                    >
                      <label className="grid gap-1 text-sm font-medium text-[var(--brand-primary)]">
                        Responder
                        <textarea
                          name="body"
                          required
                          rows={4}
                          className="rounded-md border border-[var(--brand-border)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-secondary)]"
                        />
                      </label>
                      <Button type="submit" icon={<Send size={16} />}>
                        Enviar resposta
                      </Button>
                    </form>
                  ) : null}
                </div>
              ) : (
                <EmptyState
                  icon={<Headset size={18} />}
                  title="Selecione um chamado"
                  description="O histórico e as respostas aparecem aqui."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function slaText(ticket: Pick<Ticket, "slaDueAt" | "slaState">) {
  if (!ticket.slaDueAt) return "SLA não calculado";
  const date = new Date(ticket.slaDueAt).toLocaleString("pt-BR");
  const labels: Record<string, string> = {
    ok: "SLA em dia",
    due_soon: "SLA próximo",
    overdue: "SLA vencido",
    resolved: "SLA encerrado",
  };
  return `${labels[ticket.slaState ?? "ok"] ?? "SLA"} até ${date}`;
}

function attachmentUrls(ticket: { metadata?: { attachmentUrls?: unknown } }) {
  return Array.isArray(ticket.metadata?.attachmentUrls)
    ? ticket.metadata.attachmentUrls.filter((url): url is string => typeof url === "string")
    : [];
}
