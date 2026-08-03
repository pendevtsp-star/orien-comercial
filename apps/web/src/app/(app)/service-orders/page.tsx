"use client";

import { Badge, Button, Card, CardContent, DataTable, Input, PageHeader, Select } from "@sgc/ui";
import { ClipboardList, RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type Option = { id: string; name: string };
type ServiceOrder = {
  id: string;
  status: string;
  description: string;
  dueAt?: string;
  createdAt: string;
  branchName: string;
  customerName?: string;
  serviceName?: string;
  responsibleName?: string;
};
type List<T> = { data: T[] };

const statusLabels: Record<string, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  waiting: "Aguardando",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export default function ServiceOrdersPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [services, setServices] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    try {
      const [orderList, branchList, customerList, serviceList] = await Promise.all([
        apiFetch<List<ServiceOrder>>("/operations/service-orders"),
        apiFetch<List<Option>>("/branches?pageSize=100&isActive=true"),
        apiFetch<List<Option>>("/customers?pageSize=100&isActive=true"),
        apiFetch<List<Option>>("/services?pageSize=100&isActive=true"),
      ]);
      setOrders(orderList.data);
      setBranches(branchList.data);
      setCustomers(customerList.data);
      setServices(serviceList.data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível carregar as ordens de serviço.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dueAt = form.get("dueAt");
    try {
      await apiFetch("/operations/service-orders", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          customerId: form.get("customerId") || undefined,
          serviceId: form.get("serviceId") || undefined,
          description: form.get("description"),
          dueAt: typeof dueAt === "string" && dueAt ? new Date(dueAt).toISOString() : undefined,
        }),
      });
      event.currentTarget.reset();
      setMessage("Ordem de serviço criada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a ordem de serviço.");
    }
  }
  async function changeStatus(id: string, status: string) {
    try {
      await apiFetch(`/operations/service-orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage("Status atualizado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o status.");
    }
  }
  const options = (rows: Option[]) => rows.map((row) => ({ label: row.name, value: row.id }));
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        title="Ordens de serviço"
        description="Registre o atendimento, responsável, prazo e status sem perder o vínculo com cliente e serviço."
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
              <ClipboardList size={18} />
              <h2 className="font-semibold">Nova ordem</h2>
            </div>
            <Select name="branchId" label="Filial" options={options(branches)} required />
            <Select
              name="customerId"
              label="Cliente"
              options={[{ label: "Sem cliente", value: "" }, ...options(customers)]}
            />
            <Select
              name="serviceId"
              label="Serviço"
              options={[{ label: "Selecionar depois", value: "" }, ...options(services)]}
            />
            <Input name="dueAt" label="Prazo" type="datetime-local" />
            <Input name="description" label="Descrição do atendimento" required />
            <div className="md:col-span-2">
              <Button type="submit">Criar ordem</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <DataTable
            rows={orders}
            empty="Nenhuma ordem de serviço cadastrada."
            columns={[
              {
                key: "description",
                header: "Atendimento",
                render: (row) => <span className="font-medium">{row.description}</span>,
              },
              { key: "customer", header: "Cliente", render: (row) => row.customerName ?? "-" },
              { key: "service", header: "Serviço", render: (row) => row.serviceName ?? "-" },
              {
                key: "due",
                header: "Prazo",
                render: (row) => (row.dueAt ? new Date(row.dueAt).toLocaleString("pt-BR") : "-"),
              },
              {
                key: "status",
                header: "Status",
                render: (row) => (
                  <Select
                    aria-label={`Status da ordem ${row.description}`}
                    value={row.status}
                    onChange={(event) => void changeStatus(row.id, event.target.value)}
                    options={Object.entries(statusLabels).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                  />
                ),
              },
              {
                key: "badge",
                header: "",
                render: (row) => <Badge>{statusLabels[row.status] ?? row.status}</Badge>,
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
