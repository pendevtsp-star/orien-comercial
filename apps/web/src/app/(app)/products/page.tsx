"use client";

import { Badge } from "@sgc/ui";
import { Boxes, PackageSearch, ShieldCheck, Tags } from "lucide-react";
import { ResourcePage } from "../../../components/resource-page";

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
        { name: "imageUrl", label: "URL da imagem do produto", type: "url" },
        { name: "salePrice", label: "Preco de venda", type: "number", required: true },
        { name: "costPrice", label: "Custo", type: "number" },
        { name: "minStock", label: "Estoque minimo", type: "number" }
      ]}
      transform={(form) => ({
        name: form.get("name"),
        sku: form.get("sku") || undefined,
        barcode: form.get("barcode") || undefined,
        salePrice: Number(form.get("salePrice") || 0),
        costPrice: Number(form.get("costPrice") || 0),
        minStock: Number(form.get("minStock") || 0),
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
