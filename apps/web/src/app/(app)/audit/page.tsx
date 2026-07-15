"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from "@sgc/ui";
import { History, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { PaginationFooter } from "../../../components/pagination-footer";
import { apiFetch } from "../../../lib/api";

interface AuditRow {
  id: string;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface ListResponse<T> {
  data: T[];
  pagination?: { page: number; pageSize: number; total: number };
}

const labels: Record<string, string> = {
  "product.created": "criou um produto",
  "product.updated": "alterou um produto",
  "product.deleted": "removeu um produto",
  "sale.created": "registrou uma venda",
  "sale.cancelled": "cancelou uma venda",
  "sale.returned": "registrou uma devolução",
  "sale.discount.approved": "autorizou um desconto",
  "sale.discount.denied": "recusou um desconto",
  "cash_register.opened": "abriu o caixa",
  "cash_register.closed": "fechou o caixa",
  "cash_register.supply": "registrou suprimento",
  "cash_register.withdrawal": "registrou sangria",
  "purchase_order.created": "criou um pedido de compra",
  "purchase_order.approved": "aprovou uma compra",
  "purchase_order.received": "recebeu uma compra",
  "stock.adjustment.created": "ajustou o estoque",
  "stock.transfer.created": "transferiu estoque",
  "fiscal.document.received": "recebeu um documento fiscal",
  "fiscal.document.authorized": "autorizou uma nota fiscal",
  "fiscal.document.cancelled": "cancelou uma nota fiscal",
  "financial.receivable.received": "baixou uma conta a receber",
  "financial.payable.paid": "baixou uma conta a pagar",
  "membership.updated": "alterou um acesso",
  "invite.created": "convidou um usuário",
  "tenant.branding.updated": "alterou a identidade documental",
  "import.completed": "concluiu uma importação",
};

const entityLabels: Record<string, string> = {
  product: "Produto",
  sale: "Venda",
  sale_return: "Devolução",
  cash_register: "Caixa",
  purchase_order: "Compra",
  stock_movement: "Estoque",
  membership: "Membro",
  invite: "Convite",
  tenant_settings: "Configuração",
  import_job: "Importação",
  customer: "Cliente",
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("all");
  const [entityId, setEntityId] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: "15" });
      if (search) query.set("search", search);
      if (entity !== "all") query.set("entityType", entity);
      if (entityId) query.set("entityId", entityId);
      if (actorUserId) query.set("actorUserId", actorUserId);
      if (startDate) query.set("startDate", startDate);
      if (endDate) query.set("endDate", endDate);
      const result = await apiFetch<ListResponse<AuditRow>>(`/audit-logs?${query.toString()}`);
      setRows(result.data);
      setPagination(result.pagination ?? { page, pageSize: 15, total: result.data.length });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a auditoria.");
    }
  }

  useEffect(() => {
    void load();
  }, [page, search, entity, entityId, actorUserId, startDate, endDate]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Auditoria visual"
        description="Linha do tempo humana para preço, desconto, cancelamento, estoque e acessos."
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
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <Input
              aria-label="Buscar auditoria"
              placeholder="Buscar por ação, entidade ou ID"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              aria-label="Tipo auditado"
              value={entity}
              onChange={(event) => {
                setEntity(event.target.value);
                setPage(1);
              }}
              options={[
                { label: "Todos os tipos", value: "all" },
                { label: "Venda", value: "sale" },
                { label: "Produto", value: "product" },
                { label: "Cliente", value: "customer" },
                { label: "Estoque", value: "stock_movement" },
                { label: "Compra", value: "purchase_order" },
                { label: "Caixa", value: "cash_register" },
                { label: "Usuário", value: "membership" },
                { label: "Configuração", value: "tenant_settings" },
              ]}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              label="ID da venda/produto"
              placeholder="Cole o ID auditado"
              value={entityId}
              onChange={(event) => {
                setEntityId(event.target.value.trim());
                setPage(1);
              }}
            />
            <Input
              label="ID do usuário"
              placeholder="Autor da ação"
              value={actorUserId}
              onChange={(event) => {
                setActorUserId(event.target.value.trim());
                setPage(1);
              }}
            />
            <Input
              label="Início"
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
            />
            <Input
              label="Fim"
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Search size={16} />} onClick={() => void load()}>
              Filtrar auditoria
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setEntity("all");
                setEntityId("");
                setActorUserId("");
                setStartDate("");
                setEndDate("");
                setPage(1);
              }}
            >
              Limpar filtros
            </Button>
          </div>
          <DataTable
            rows={rows}
            empty={
              <EmptyState
                eyebrow="Rastreabilidade"
                title="Nenhuma ação auditada."
                description="Ações críticas aparecerão aqui em linguagem simples para suporte e conferência."
                icon={<History size={20} />}
              />
            }
            columns={[
              {
                key: "timeline",
                header: "Linha do tempo",
                render: (row) => (
                  <div className="grid gap-1">
                    <strong className="text-[var(--brand-primary)]">
                      {row.actorName ?? "Sistema"} {humanAction(row.action)}
                    </strong>
                    <span className="text-xs text-slate-500">
                      {new Date(row.createdAt).toLocaleString("pt-BR")} ·{" "}
                      {entityLabels[row.entityType] ?? row.entityType}
                    </span>
                    <span className="text-sm text-slate-600">{metadataSummary(row.metadata)}</span>
                  </div>
                ),
              },
              {
                key: "entity",
                header: "Entidade",
                render: (row) => <Badge>{entityLabels[row.entityType] ?? row.entityType}</Badge>,
              },
              { key: "action", header: "Evento técnico", render: (row) => row.action },
            ]}
          />
          <PaginationFooter
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => current + 1)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function humanAction(action: string) {
  return labels[action] ?? action.replaceAll(".", " ");
}

function metadataSummary(metadata?: Record<string, unknown>) {
  if (!metadata || !Object.keys(metadata).length) return "Sem detalhes adicionais registrados.";
  const before = metadata.before as Record<string, unknown> | undefined;
  const after = metadata.after as Record<string, unknown> | undefined;
  if (before && after) {
    const changes = Object.keys(after)
      .filter((key) => before[key] !== after[key])
      .slice(0, 3)
      .map(
        (key) => `${labelize(key)} de ${formatValue(before[key])} para ${formatValue(after[key])}`,
      );
    if (changes.length) return changes.join(" · ");
  }
  const entries = Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${labelize(key)}: ${formatValue(value)}`);
  return entries.length ? entries.join(" · ") : "Sem detalhes adicionais registrados.";
}

function labelize(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value: unknown) {
  if (typeof value === "number" && /price|amount|total|cost/i.test(`${value}`))
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (typeof value === "number") return value.toLocaleString("pt-BR");
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (value == null) return "-";
  if (typeof value === "object") return "detalhes registrados";
  if (typeof value === "string") return value;
  return "valor registrado";
}
