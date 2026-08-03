"use client";

import { Badge, Button, Card, CardContent, DataTable, Input, PageHeader, Select } from "@sgc/ui";
import { MessageCircle, RefreshCw, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type Lead = {
  id: string;
  name: string;
  whatsapp?: string;
  status: string;
  nextAction?: string;
  customerId?: string;
};
type Option = { id: string; name: string };
type List<T> = { data: T[] };

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    try {
      const [leadList, branchList] = await Promise.all([
        apiFetch<List<Lead>>("/leads?pageSize=100"),
        apiFetch<List<Option>>("/branches?pageSize=100&isActive=true"),
      ]);
      setLeads(leadList.data);
      setBranches(branchList.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os leads.");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/leads", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          name: form.get("name"),
          whatsapp: form.get("whatsapp") || undefined,
          nextAction: form.get("nextAction") || undefined,
        }),
      });
      event.currentTarget.reset();
      setMessage("Lead criado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o lead.");
    }
  }
  async function convert(id: string) {
    try {
      await apiFetch(`/leads/${id}/convert`, { method: "POST", body: "{}" });
      setMessage("Lead convertido em cliente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível converter o lead.");
    }
  }
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        title="Leads"
        description="Acompanhe contatos comerciais e converta explicitamente uma oportunidade em cliente."
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
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      <Card>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void create(event)}>
            <div className="md:col-span-2 flex items-center gap-2">
              <UserPlus size={18} />
              <h2 className="font-semibold">Novo lead</h2>
            </div>
            <Select
              name="branchId"
              label="Filial"
              options={branches.map((branch) => ({ label: branch.name, value: branch.id }))}
              required
            />
            <Input name="name" label="Nome" required />
            <Input name="whatsapp" label="WhatsApp" />
            <Input name="nextAction" label="Próxima ação" />
            <div className="md:col-span-2">
              <Button type="submit">Salvar lead</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <DataTable
            rows={leads}
            empty="Nenhum lead cadastrado."
            columns={[
              {
                key: "name",
                header: "Lead",
                render: (row) => <span className="font-medium">{row.name}</span>,
              },
              {
                key: "whatsapp",
                header: "WhatsApp",
                render: (row) =>
                  row.whatsapp ? (
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle size={14} />
                      {row.whatsapp}
                    </span>
                  ) : (
                    "-"
                  ),
              },
              { key: "nextAction", header: "Próxima ação", render: (row) => row.nextAction ?? "-" },
              {
                key: "status",
                header: "Status",
                render: (row) => (
                  <Badge>{row.status === "converted" ? "Convertido" : "Aberto"}</Badge>
                ),
              },
              {
                key: "action",
                header: "Ação",
                render: (row) =>
                  row.customerId ? (
                    <span className="text-sm text-slate-500">Cliente vinculado</span>
                  ) : (
                    <Button type="button" variant="secondary" onClick={() => void convert(row.id)}>
                      Converter
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
