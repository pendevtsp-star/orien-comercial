"use client";

import { Badge, Button, Card, CardContent, DataTable, PageHeader, Select, Tabs } from "@sgc/ui";
import { FileSpreadsheet, Printer, Upload } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, openApiDocument } from "../../../lib/api";

interface List<T> {
  data: T[];
}
interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  salePrice: string;
}
interface Preview {
  jobId: string;
  entityType: string;
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  errors: Array<{ row: number; messages: string[] }>;
  preview: Record<string, unknown>[];
}

export default function CatalogToolsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [size, setSize] = useState("50x30");
  const [entityType, setEntityType] = useState("products");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void apiFetch<List<Product>>("/products?pageSize=100&isActive=true")
      .then((response) => setProducts(response.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar produtos."));
  }, []);
  const allSelected = useMemo(
    () => products.length > 0 && selected.length === products.length,
    [products, selected],
  );
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const base64 = await readBase64(file);
      const result = await apiFetch<Preview>("/imports/preview", {
        method: "POST",
        body: JSON.stringify({ entityType, fileBase64: base64 }),
      });
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao analisar planilha.");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }
  async function commit() {
    if (!preview || preview.rejectedRows) return;
    setLoading(true);
    try {
      await apiFetch("/imports/commit", {
        method: "POST",
        body: JSON.stringify({ jobId: preview.jobId }),
      });
      setPreview(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao importar planilha.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        title="Ferramentas do catálogo"
        description="Etiquetas térmicas e importação validada de produtos ou clientes."
      />
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <Tabs
        defaultValue="labels"
        tabs={[
          {
            value: "labels",
            label: "Etiquetas",
            content: (
              <Card>
                <CardContent className="grid gap-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <Select
                      label="Tamanho"
                      value={size}
                      onChange={(event) => setSize(event.target.value)}
                      options={[
                        { label: "40 × 25 mm", value: "40x25" },
                        { label: "50 × 30 mm", value: "50x30" },
                        { label: "60 × 40 mm", value: "60x40" },
                      ]}
                    />
                    <Button
                      icon={<Printer size={16} />}
                      disabled={!selected.length}
                      onClick={() =>
                        void openApiDocument(
                          `/products/labels/print?ids=${selected.join(",")}&size=${size}`,
                        )
                      }
                    >
                      Imprimir {selected.length} etiqueta(s)
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setSelected(allSelected ? [] : products.map((product) => product.id))
                      }
                    >
                      {allSelected ? "Limpar seleção" : "Selecionar todos"}
                    </Button>
                  </div>
                  <DataTable
                    rows={products}
                    empty="Nenhum produto disponível."
                    columns={[
                      {
                        key: "select",
                        header: "",
                        render: (row) => (
                          <input
                            type="checkbox"
                            checked={selected.includes(row.id)}
                            onChange={() =>
                              setSelected((current) =>
                                current.includes(row.id)
                                  ? current.filter((id) => id !== row.id)
                                  : [...current, row.id],
                              )
                            }
                          />
                        ),
                      },
                      { key: "name", header: "Produto", render: (row) => row.name },
                      {
                        key: "code",
                        header: "Código",
                        render: (row) => row.barcode ?? row.sku ?? <Badge>Sem código</Badge>,
                      },
                      {
                        key: "price",
                        header: "Preço",
                        render: (row) =>
                          Number(row.salePrice).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }),
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            value: "import",
            label: "Importar Excel",
            content: (
              <div className="grid min-w-0 gap-4 2xl:grid-cols-[340px_minmax(0,1fr)]">
                <Card>
                  <CardContent className="grid gap-4">
                    <FileSpreadsheet size={28} />
                    <div>
                      <h2 className="font-semibold">Planilha Excel</h2>
                      <p className="text-sm text-slate-500">
                        A primeira linha deve conter os cabeçalhos. Até 5.000 linhas por arquivo.
                      </p>
                    </div>
                    <Select
                      label="Tipo de cadastro"
                      value={entityType}
                      onChange={(event) => {
                        setEntityType(event.target.value);
                        setPreview(null);
                      }}
                      options={[
                        { label: "Produtos", value: "products" },
                        { label: "Clientes", value: "customers" },
                      ]}
                    />
                    <label className="inline-flex min-h-10 max-w-full cursor-pointer flex-wrap items-center justify-center gap-2 rounded-md bg-[var(--brand-primary)] px-4 py-2 text-center text-sm font-medium text-white">
                      <Upload size={16} />
                      {loading ? "Analisando..." : "Selecionar .xlsx"}
                      <input
                        className="sr-only"
                        type="file"
                        accept=".xlsx"
                        disabled={loading}
                        onChange={(event) => void chooseFile(event)}
                      />
                    </label>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="grid gap-4">
                    {preview ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Metric label="Linhas" value={preview.totalRows} />
                          <Metric label="Válidas" value={preview.validRows} />
                          <Metric
                            label="Rejeitadas"
                            value={preview.rejectedRows}
                            danger={preview.rejectedRows > 0}
                          />
                        </div>
                        {preview.errors.length ? (
                          <div className="max-h-64 overflow-auto rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                            {preview.errors.map((item) => (
                              <p key={item.row}>
                                Linha {item.row}: {item.messages.join("; ")}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                            Planilha validada e pronta para importação transacional.
                          </p>
                        )}
                        <Button
                          disabled={loading || preview.rejectedRows > 0}
                          onClick={() => void commit()}
                        >
                          Confirmar importação
                        </Button>
                      </>
                    ) : (
                      <div className="grid min-h-56 place-items-center text-center text-slate-500">
                        <p>Selecione uma planilha para ver a prévia e os erros antes de gravar.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function Metric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${danger ? "border-rose-200 bg-rose-50" : "border-[var(--brand-border)] bg-[var(--brand-surface)]"}`}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
