"use client";

import { Badge, Button, Card, CardContent, EmptyState, PageHeader } from "@sgc/ui";
import { BellRing, CheckCheck, Newspaper, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  summary: string;
  changes: string[];
  publishedAt: string;
  readAt: string | null;
}

export default function UpdatesPage() {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const result = await apiFetch<{ data: ReleaseNote[]; unread: number }>("/updates");
      setNotes(result.data);
      setUnread(result.unread);
      window.dispatchEvent(
        new CustomEvent("sgc:updates-changed", { detail: { unread: result.unread } }),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as novidades.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function markRead(id: string) {
    await apiFetch(`/updates/${id}/read`, { method: "PATCH", body: "{}" });
    setNotes((current) =>
      current.map((note) =>
        note.id === id ? { ...note, readAt: new Date().toISOString() } : note,
      ),
    );
    setUnread((current) => {
      const next = Math.max(0, current - 1);
      window.dispatchEvent(new CustomEvent("sgc:updates-changed", { detail: { unread: next } }));
      return next;
    });
  }

  async function markAllRead() {
    await apiFetch("/updates/read-all", { method: "POST", body: "{}" });
    const readAt = new Date().toISOString();
    setNotes((current) => current.map((note) => ({ ...note, readAt: note.readAt ?? readAt })));
    setUnread(0);
    window.dispatchEvent(new CustomEvent("sgc:updates-changed", { detail: { unread: 0 } }));
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Novidades da Orien"
        description="Evoluções, correções e orientações importantes para sua operação."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void load()}>
              Atualizar
            </Button>
            {unread ? (
              <Button icon={<CheckCheck size={16} />} onClick={() => void markAllRead()}>
                Marcar todas como lidas
              </Button>
            ) : null}
          </div>
        }
      />
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <Card className="orien-product-communication border-[var(--brand-border)]">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="orien-product-communication-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">
              Comunicação do produto
            </p>
            <h2 className="orien-product-communication-title mt-2 text-2xl font-semibold">
              {unread ? `${unread} atualização(ões) aguardando leitura` : "Você está em dia"}
            </h2>
            <p className="orien-product-communication-copy mt-2 text-sm">
              Avisos operacionais continuam separados das novidades do sistema.
            </p>
          </div>
          <Link
            href="/alerts"
            className="orien-product-communication-link inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium"
          >
            <BellRing size={16} /> Ver alertas operacionais
          </Link>
        </CardContent>
      </Card>
      <section className="grid gap-4">
        {notes.map((note) => (
          <Card
            key={note.id}
            className={
              note.readAt
                ? ""
                : "border-[var(--brand-accent)] shadow-[0_12px_30px_rgba(11,29,61,0.08)]"
            }
          >
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>Versão {note.version}</Badge>
                    {note.readAt ? (
                      <Badge>Lida</Badge>
                    ) : (
                      <Badge className="bg-[var(--brand-accent)] text-[var(--brand-primary)]">
                        Nova
                      </Badge>
                    )}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-[var(--brand-primary)]">
                    {note.title}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{note.summary}</p>
                </div>
                <time className="text-xs text-slate-500">
                  {new Date(note.publishedAt).toLocaleDateString("pt-BR")}
                </time>
              </div>
              <ul className="grid gap-2 text-sm text-slate-700">
                {note.changes.map((change) => (
                  <li key={change} className="flex gap-2">
                    <CheckCheck className="mt-0.5 shrink-0 text-emerald-600" size={16} />
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
              {!note.readAt ? (
                <div>
                  <Button variant="secondary" onClick={() => void markRead(note.id)}>
                    Marcar como lida
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {!loading && !notes.length ? (
          <EmptyState
            eyebrow="Histórico"
            title="Nenhuma novidade publicada ainda."
            description="As próximas versões da Orien aparecerão aqui com explicações objetivas para sua equipe."
            icon={<Newspaper size={20} />}
          />
        ) : null}
        {loading ? <p className="text-sm text-slate-500">Carregando novidades...</p> : null}
      </section>
    </div>
  );
}
