"use client";

import { Badge } from "@sgc/ui";
import { Boxes, PackageSearch, ShieldCheck, Tags } from "lucide-react";
import { ResourcePage } from "../../../components/resource-page";

interface ProductRow {
  id: string;
  name: string;
  sku?: string;
  salePrice: string;
  unit: string;
  isActive: boolean;
}

export default function ProductsPage() {
  return (
    <ResourcePage<ProductRow>
      title="Produtos"
      description="Cadastro comercial com preco, SKU e controle minimo de estoque."
      endpoint="/products"
      searchPlaceholder="Buscar por produto, SKU ou preco"
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
        { name: "salePrice", label: "Preco de venda", type: "number", required: true },
        { name: "costPrice", label: "Custo", type: "number" },
        { name: "minStock", label: "Estoque minimo", type: "number" }
      ]}
      transform={(form) => ({
        name: form.get("name"),
        sku: form.get("sku") || undefined,
        salePrice: Number(form.get("salePrice") || 0),
        costPrice: Number(form.get("costPrice") || 0),
        minStock: Number(form.get("minStock") || 0),
        unit: "un",
        isActive: true
      })}
      columns={[
        { key: "name", header: "Nome", render: (row) => row.name },
        { key: "sku", header: "SKU", render: (row) => row.sku ?? "-" },
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
