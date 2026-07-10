"use client";

import { Badge, Button, Card, CardContent, DataTable, PageHeader } from "@sgc/ui";
import { Laptop, LogOut, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface Session {
  id: string;
  userAgent?: string;
  isPersistent: boolean;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    try {
      const result = await apiFetch<{ data: Session[] }>("/auth/sessions");
      setSessions(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar sessões.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function revoke(id: string) {
    try {
      await apiFetch(`/auth/sessions/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao encerrar sessão.");
    }
  }
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        title="Dispositivos conectados"
        description="Revise os acessos ativos e encerre sessões que você não reconhece."
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
      <Card>
        <CardContent>
          <DataTable
            rows={sessions}
            empty="Nenhuma sessão ativa."
            columns={[
              {
                key: "device",
                header: "Dispositivo",
                render: (row) => (
                  <div className="flex items-center gap-2">
                    <Laptop size={17} />
                    <span className="max-w-xl truncate">{deviceName(row.userAgent)}</span>
                  </div>
                ),
              },
              {
                key: "created",
                header: "Conectado em",
                render: (row) => new Date(row.createdAt).toLocaleString("pt-BR"),
              },
              {
                key: "expiry",
                header: "Expira em",
                render: (row) => new Date(row.expiresAt).toLocaleString("pt-BR"),
              },
              {
                key: "mode",
                header: "Tipo",
                render: (row) => <Badge>{row.isPersistent ? "Persistente" : "Temporária"}</Badge>,
              },
              {
                key: "action",
                header: "Ação",
                render: (row) =>
                  row.isCurrent ? (
                    <Badge>Sessão atual</Badge>
                  ) : (
                    <Button
                      variant="danger"
                      icon={<LogOut size={14} />}
                      onClick={() => void revoke(row.id)}
                    >
                      Encerrar
                    </Button>
                  ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
function deviceName(userAgent?: string) {
  if (!userAgent) return "Dispositivo não identificado";
  const browser = userAgent.includes("Edg/")
    ? "Edge"
    : userAgent.includes("Chrome/")
      ? "Chrome"
      : userAgent.includes("Firefox/")
        ? "Firefox"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Navegador";
  const system = userAgent.includes("Windows")
    ? "Windows"
    : userAgent.includes("Android")
      ? "Android"
      : userAgent.includes("iPhone")
        ? "iPhone"
        : userAgent.includes("Mac OS")
          ? "macOS"
          : "Sistema desconhecido";
  return `${browser} em ${system}`;
}
