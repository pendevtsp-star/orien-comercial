"use client";

import { Badge, Button } from "@sgc/ui";
import { Boxes, ImagePlus, PackageSearch, ScanBarcode, ShieldCheck, Sparkles, Tags, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ResourcePage } from "../../../components/resource-page";
import { apiFetch } from "../../../lib/api";

interface ProductRow {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  salePrice: string;
  unit: string;
  isActive: boolean;
  imageUrl?: string;
}

export default function ProductsPage() {
  return (
    <ResourcePage<ProductRow>
      title="Produtos"
      description="Cadastro comercial com imagem, preço, SKU, código de barras e controle mínimo de estoque."
      endpoint="/products"
      searchPlaceholder="Buscar por produto, SKU ou código de barras"
      heroBadge="Catalogo comercial"
      heroTitle="Produtos prontos para venda, estoque e margem."
      heroDescription="Estruture o catalogo do tenant com identificacao comercial, preco de venda e base para abastecimento e operacao multiloja."
      insights={[
        { label: "Produtos cadastrados", value: (rows) => rows.length, detail: "Itens no catalogo comercial", icon: Boxes },
        { label: "Com SKU", value: (rows) => rows.filter((row) => row.sku).length, detail: "Rastreabilidade comercial", icon: PackageSearch },
        {
          label: "Ticket medio de tabela",
          value: (rows) =>
            rows.length
              ? Number((rows.reduce((sum, row) => sum + Number(row.salePrice), 0) / rows.length).toFixed(2)).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL"
                })
              : "R$ 0,00",
          detail: "Preco medio dos produtos",
          icon: Tags
        },
        { label: "Cadastro ativo", value: (rows) => rows.filter((row) => row.isActive).length, detail: "Itens aptos para operacao", icon: ShieldCheck, accent: true }
      ]}
      sortOptions={[
        { label: "Nome", value: "name" },
        { label: "SKU", value: "sku" },
        { label: "Preco de venda", value: "salePrice" },
        { label: "Estoque minimo", value: "minStock" },
        { label: "Cadastro", value: "createdAt" }
      ]}
      fields={[
        { name: "name", label: "Nome", required: true },
        { name: "sku", label: "SKU" },
        { name: "barcode", label: "Código de barras (leitor USB/Bluetooth)" },
        { name: "imageFile", label: "Imagem do produto (PNG, JPEG ou WebP, até 5 MB)", type: "file" },
        { name: "salePrice", label: "Preco de venda", type: "number", required: true },
        { name: "costPrice", label: "Custo", type: "number" },
        { name: "minStock", label: "Estoque minimo", type: "number" }
        ,{ name: "initialStock", label: "Estoque inicial", type: "number" }
      ]}
      formExtras={<CatalogAssistant />}
      transform={(form) => ({
        name: form.get("name"),
        sku: form.get("sku") || undefined,
        barcode: form.get("barcode") || undefined,
        imageUrl: form.get("imageUrl") || undefined,
        salePrice: Number(form.get("salePrice") || 0),
        costPrice: Number(form.get("costPrice") || 0),
        minStock: Number(form.get("minStock") || 0),
        initialStock: Number(form.get("initialStock") || 0),
        initialStockBranchId: form.get("initialStockBranchId") || undefined,
        unit: "un",
        isActive: true
      })}
      columns={[
        { key: "name", header: "Produto", render: (row) => <span className="flex min-w-40 items-center gap-3">{row.imageUrl ? <img src={row.imageUrl} alt="" className="h-9 w-9 rounded-md border border-slate-200 object-cover" /> : <span className="grid h-9 w-9 place-items-center rounded-md bg-slate-100 text-xs text-slate-500">--</span>}{row.name}</span> },
        { key: "sku", header: "SKU", render: (row) => row.sku ?? "-" },
        { key: "barcode", header: "Código de barras", render: (row) => row.barcode ?? "-" },
        {
          key: "price",
          header: "Preco",
          render: (row) => Number(row.salePrice).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        },
        { key: "unit", header: "Unidade", render: (row) => row.unit },
        { key: "status", header: "Status", render: (row) => <Badge>{row.isActive ? "Ativo" : "Inativo"}</Badge> }
      ]}
    />
  );
}

function CatalogAssistant() {
  const [lookupStatus, setLookupStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [initialStockBranchId, setInitialStockBranchId] = useState("");

  useEffect(() => {
    const fileInput = document.querySelector<HTMLInputElement>('input[name="imageFile"]');
    const handleChange = () => {
      const file = fileInput?.files?.[0];
      if (!file) return setPreview(null);
      setPreview(URL.createObjectURL(file));
    };
    fileInput?.addEventListener("change", handleChange);
    return () => fileInput?.removeEventListener("change", handleChange);
  }, []);
  useEffect(() => {
    void apiFetch<{ data: Array<{ id: string; name: string }> }>("/branches?pageSize=100&isActive=true")
      .then((result) => {
        setBranches(result.data);
        setInitialStockBranchId(result.data[0]?.id ?? "");
      })
      .catch(() => undefined);
  }, []);

  const field = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  const setField = (name: string, value?: string) => {
    const input = field(name);
    if (!input || !value) return;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  async function lookup() {
    const barcode = field("barcode")?.value.trim();
    if (!barcode) return setLookupStatus("Leia ou informe o código de barras primeiro.");
    setLookupStatus("Consultando catálogo...");
    try {
      const response = await apiFetch<{ found: boolean; source: string; product?: { name?: string; imageUrl?: string; barcode?: string } }>(`/products/barcode-lookup?barcode=${encodeURIComponent(barcode)}`);
      if (!response.found || !response.product) return setLookupStatus("Nenhum dado encontrado. Continue o cadastro manualmente.");
      setField("name", response.product.name);
      setField("barcode", response.product.barcode ?? barcode);
      setLookupStatus(response.source === "tenant" ? "Produto já existe no catálogo desta empresa." : "Dados sugeridos. Revise e confirme antes de salvar.");
      if (response.product.imageUrl) {
        setField("imageUrl", response.product.imageUrl);
        setPreview(response.product.imageUrl);
      }
    } catch {
      setLookupStatus("Não foi possível consultar agora. O cadastro manual continua disponível.");
    }
  }
  async function generateSku() {
    try {
      const response = await apiFetch<{ sku: string }>("/products/sku-suggestion");
      setField("sku", response.sku);
      setLookupStatus(`SKU ${response.sku} preparado. Você pode editar antes de salvar.`);
    } catch {
      setLookupStatus("Não foi possível gerar o SKU agora.");
    }
  }
  return (
    <div className="grid gap-3 rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3">
      <input type="hidden" name="imageUrl" />
      <input type="hidden" name="initialStockBranchId" value={initialStockBranchId} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--brand-primary)]">Cadastro assistido</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Use o leitor, gere um SKU e revise os dados antes de publicar o produto.</p>
        </div>
        <ScanBarcode size={18} className="text-[var(--brand-secondary)]" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="secondary" icon={<ScanBarcode size={15} />} onClick={() => void lookup()}>Consultar código</Button>
        <Button type="button" variant="secondary" icon={<Sparkles size={15} />} onClick={() => void generateSku()}>Gerar SKU</Button>
      </div>
      <ol className="grid gap-2 text-xs sm:grid-cols-4">
        {[["1", "Leia o código"], ["2", "Confirme dados"], ["3", "Preço e imagem"], ["4", "Estoque inicial"]].map(([step, label]) => (
          <li key={step} className="flex items-center gap-2 rounded-md border border-[var(--brand-border)] bg-white px-2 py-2 text-slate-600"><span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--brand-primary)] text-[10px] font-bold text-white">{step}</span>{label}</li>
        ))}
      </ol>
      {lookupStatus ? <p className="text-xs leading-5 text-slate-600">{lookupStatus}</p> : null}
      <div className="rounded-md border border-dashed border-[var(--brand-border)] bg-white p-2">
        <div className="flex items-center gap-3">
          {preview ? <img src={preview} alt="Prévia do produto" className="h-14 w-14 rounded-md border border-[var(--brand-border)] object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-md bg-[var(--brand-surface)] text-[var(--brand-secondary)]"><ImagePlus size={18} /></span>}
          <p className="min-w-0 text-xs leading-5 text-slate-500">A imagem é pré-visualizada antes do envio. Use PNG, JPEG ou WebP, em enquadramento quadrado, com até 5 MB.</p>
          {preview ? <button type="button" aria-label="Limpar prévia" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setPreview(null)}><X size={15} /></button> : null}
        </div>
      </div>
      {branches.length ? <label className="grid gap-1 text-xs font-medium text-slate-600">Loja do estoque inicial<select value={initialStockBranchId} onChange={(event) => setInitialStockBranchId(event.target.value)} className="h-9 rounded-md border border-[var(--brand-border)] bg-white px-2 text-sm text-slate-800">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label> : null}
    </div>
  );
}
