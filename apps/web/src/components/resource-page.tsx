"use client";

import { Badge, Button, Card, CardContent, ConfirmDialog, DataTable, EmptyState, Input, PageHeader, Select } from "@sgc/ui";
import { ChevronLeft, ChevronRight, FolderSearch, Pencil, Plus, RefreshCw, Trash2, type LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

interface ApiList<T> {
  data: T[];
  pagination: { total: number; page: number; pageSize: number };
}

interface ResourcePageProps<T extends { id: string; isActive?: boolean | null }> {
  title: string;
  description: string;
  endpoint: string;
  columns: Array<{ key: string; header: string; render: (row: T) => React.ReactNode }>;
  fields: Array<{ name: string; label: string; type?: string; required?: boolean }>;
  transform?: (form: FormData) => Record<string, unknown>;
  searchPlaceholder?: string;
  heroTitle?: string;
  heroDescription?: string;
  heroBadge?: string;
  insights?: Array<{ label: string; value: (rows: T[]) => number | string; detail: string; icon: LucideIcon; accent?: boolean }>;
  sortOptions?: Array<{ label: string; value: string }>;
}

export function ResourcePage<T extends { id: string; isActive?: boolean | null }>({
  title,
  description,
  endpoint,
  columns,
  fields,
  transform,
  searchPlaceholder,
  heroTitle,
  heroDescription,
  heroBadge,
  insights,
  sortOptions
}: ResourcePageProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("20");
  const [sortBy, setSortBy] = useState(sortOptions?.[0]?.value ?? "name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [isActive, setIsActive] = useState("all");
  const [editingRow, setEditingRow] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: 20 });

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize,
      sortBy,
      sortDirection
    });
    if (search) params.set("search", search);
    if (isActive !== "all") params.set("isActive", isActive);
    return params;
  }, [isActive, page, pageSize, search, sortBy, sortDirection]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<ApiList<T>>(`${endpoint}?${query.toString()}`);
      setRows(response.data);
      setPagination(response.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar registros.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [endpoint, query]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const payload = transform ? transform(form) : Object.fromEntries(form.entries());

    try {
      if (editingRow) {
        await apiFetch(`${endpoint}/${editingRow.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      }
      event.currentTarget.reset();
      setEditingRow(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar registro.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(row: T) {
    setError(null);
    try {
      await apiFetch(`${endpoint}/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !(row.isActive ?? true) })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar status.");
    }
  }

  async function remove(row: T) {
    setError(null);
    try {
      await apiFetch(`${endpoint}/${row.id}`, { method: "DELETE" });
      if (editingRow?.id === row.id) setEditingRow(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover registro.");
    }
  }

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pagination.pageSize));
  const showingFrom = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const showingTo = Math.min(pagination.total, pagination.page * pagination.pageSize);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button variant="secondary" onClick={() => void load()} icon={<RefreshCw size={16} />}>
            Atualizar dados
          </Button>
        }
      />
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

      {insights?.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {insights.map((item) => (
            <InsightCard key={item.label} title={item.label} value={item.value(rows)} detail={item.detail} icon={item.icon} accent={item.accent} />
          ))}
        </section>
      ) : null}

      <section className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0 2xl:order-2 2xl:sticky 2xl:top-20 2xl:self-start">
          <CardContent>
            <form key={editingRow?.id ?? "create"} className="grid gap-3" onSubmit={(event) => void submit(event)}>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Cadastro guiado</p>
                <h2 className="mt-2 text-base font-semibold text-[var(--brand-primary)]">
                  {editingRow ? "Editar registro" : "Novo registro"}
                </h2>
                <p className="text-sm text-slate-500">
                  {editingRow ? "Atualize os dados e salve para refletir a mudanca na base." : "Validado novamente no backend."}
                </p>
              </div>
              {fields.map((field) => (
                <Input
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  type={field.type ?? "text"}
                  required={field.required}
                  defaultValue={
                    editingRow
                      ? fieldValue(editingRow, field.name)
                      : undefined
                  }
                />
              ))}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={submitting} icon={editingRow ? <Pencil size={16} /> : <Plus size={16} />}>
                  {submitting ? "Salvando..." : editingRow ? "Salvar alterações" : "Salvar cadastro"}
                </Button>
                {editingRow ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditingRow(null);
                    }}
                  >
                    Cancelar edicao
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
        <div className="grid min-w-0 gap-3 2xl:order-1">
          <Card variant="brand" className="overflow-hidden shadow-[0_28px_64px_rgba(11,29,61,0.18)]">
            <CardContent className="grid gap-4 p-6">
              <div>
                <Badge className="border-white/10 bg-white/10 text-white">{heroBadge ?? "Visao operacional"}</Badge>
                <h2 data-brand-display="true" className="mt-4 text-3xl font-semibold text-white">
                  {heroTitle ?? title}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">
                  {heroDescription ?? description}
                </p>
              </div>
            </CardContent>
          </Card>
          <Input
            aria-label="Buscar"
            placeholder={searchPlaceholder ?? "Buscar por nome, codigo, documento ou SKU"}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <div className="grid gap-3 md:grid-cols-4">
            <Select
              aria-label="Status"
              options={[
                { label: "Todos os status", value: "all" },
                { label: "Somente ativos", value: "true" },
                { label: "Somente inativos", value: "false" }
              ]}
              value={isActive}
              onChange={(event) => {
                setIsActive(event.target.value);
                setPage(1);
              }}
            />
            <Select
              aria-label="Ordenar por"
              options={sortOptions ?? [{ label: "Nome", value: "name" }]}
              value={sortBy}
              onChange={(event) => {
                setSortBy(event.target.value);
                setPage(1);
              }}
            />
            <Select
              aria-label="Direcao"
              options={[
                { label: "Crescente", value: "asc" },
                { label: "Decrescente", value: "desc" }
              ]}
              value={sortDirection}
              onChange={(event) => {
                setSortDirection(event.target.value);
                setPage(1);
              }}
            />
            <Select
              aria-label="Itens por pagina"
              options={[
                { label: "10 por pagina", value: "10" },
                { label: "20 por pagina", value: "20" },
                { label: "50 por pagina", value: "50" }
              ]}
              value={pageSize}
              onChange={(event) => {
                setPageSize(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <DataTable
            columns={[
              ...columns,
              {
                key: "resource-status",
                header: "Operação",
                render: (row) => (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" icon={<Pencil size={14} />} onClick={() => setEditingRow(row)}>
                      Editar
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void toggleActive(row)}>
                      {(row.isActive ?? true) ? "Desativar" : "Reativar"}
                    </Button>
                    <ConfirmDialog
                      title="Remover registro"
                      description="Esta ação remove o registro da listagem operacional. Use apenas quando fizer sentido para o tenant."
                      trigger={
                        <Button type="button" variant="danger" icon={<Trash2 size={14} />}>
                          Excluir
                        </Button>
                      }
                      onConfirm={() => void remove(row)}
                    />
                  </div>
                )
              }
            ]}
            rows={rows}
            empty={
              loading ? (
                "Carregando..."
              ) : search ? (
                <EmptyState
                  eyebrow="Busca sem retorno"
                  title="Nenhum resultado com esse filtro."
                  description="Tente outro termo de busca ou limpe o campo para voltar a enxergar toda a base."
                  icon={<FolderSearch size={20} />}
                  action={
                    <Button variant="secondary" onClick={() => setSearch("")}>
                      Limpar busca
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  eyebrow="Base inicial"
                  title={`Ainda nao ha registros em ${title.toLowerCase()}.`}
                  description="Use o formulario ao lado para criar o primeiro item deste modulo e iniciar a operacao."
                  icon={<FolderSearch size={20} />}
                />
              )
            }
          />
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm text-slate-600 shadow-[0_10px_24px_rgba(11,29,61,0.04)] md:flex-row md:items-center md:justify-between">
            <p>
              Mostrando <span className="font-medium text-[var(--brand-primary)]">{showingFrom}</span> a{" "}
              <span className="font-medium text-[var(--brand-primary)]">{showingTo}</span> de{" "}
              <span className="font-medium text-[var(--brand-primary)]">{pagination.total}</span> registros
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" icon={<ChevronLeft size={16} />} disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Anterior
              </Button>
              <Badge>
                Página {page} de {totalPages}
              </Badge>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                icon={<ChevronRight size={16} />}
              >
                Próxima
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function fieldValue<T extends { id: string }>(row: T, key: string) {
  const value = (row as Record<string, unknown>)[key];
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "";
}

function InsightCard({
  title,
  value,
  detail,
  icon: Icon,
  accent = false
}: {
  title: string;
  value: number | string;
  detail: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--brand-primary)]">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{detail}</p>
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            accent ? "bg-[rgba(245,195,74,0.18)] text-[#c78b07]" : "bg-[rgba(19,58,124,0.10)] text-[var(--brand-secondary)]"
          }`}
        >
          <Icon size={20} />
        </div>
      </CardContent>
    </Card>
  );
}
