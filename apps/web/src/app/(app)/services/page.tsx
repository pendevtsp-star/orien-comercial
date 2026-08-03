"use client";

import { Badge } from "@sgc/ui";
import { Clock3, HandCoins, Wrench } from "lucide-react";
import { ResourcePage } from "../../../components/resource-page";

interface ServiceRow {
  id: string;
  name: string;
  description?: string;
  basePrice: string;
  estimatedMinutes?: number;
  isActive: boolean;
}

export default function ServicesPage() {
  return (
    <ResourcePage<ServiceRow>
      title="Serviços"
      description="Cadastre serviços vendáveis com preço-base e tempo estimado, sem misturar dados fiscais de produtos."
      endpoint="/services"
      searchPlaceholder="Buscar por nome ou descrição"
      insights={[
        {
          label: "Serviços",
          value: (rows) => rows.length,
          detail: "Itens do catálogo",
          icon: Wrench,
        },
        {
          label: "Ativos",
          value: (rows) => rows.filter((row) => row.isActive).length,
          detail: "Disponíveis para venda",
          icon: HandCoins,
          accent: true,
        },
        {
          label: "Com duração",
          value: (rows) => rows.filter((row) => row.estimatedMinutes).length,
          detail: "Prontos para agenda",
          icon: Clock3,
        },
      ]}
      sortOptions={[
        { label: "Nome", value: "name" },
        { label: "Preço", value: "basePrice" },
        { label: "Cadastro", value: "createdAt" },
      ]}
      fields={[
        { name: "name", label: "Nome do serviço", required: true },
        { name: "description", label: "Descrição" },
        { name: "basePrice", label: "Preço-base", type: "number", required: true },
        { name: "estimatedMinutes", label: "Duração estimada (minutos)", type: "number" },
      ]}
      transform={(form) => ({
        name: form.get("name"),
        description: form.get("description") || undefined,
        basePrice: Number(form.get("basePrice") || 0),
        estimatedMinutes: form.get("estimatedMinutes")
          ? Number(form.get("estimatedMinutes"))
          : undefined,
        isActive: true,
      })}
      columns={[
        {
          key: "name",
          header: "Serviço",
          render: (row) => <span className="font-medium">{row.name}</span>,
        },
        { key: "description", header: "Descrição", render: (row) => row.description ?? "-" },
        {
          key: "price",
          header: "Preço-base",
          render: (row) =>
            Number(row.basePrice).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        },
        {
          key: "duration",
          header: "Duração",
          render: (row) => (row.estimatedMinutes ? `${row.estimatedMinutes} min` : "-"),
        },
        {
          key: "status",
          header: "Status",
          render: (row) => <Badge>{row.isActive ? "Ativo" : "Inativo"}</Badge>,
        },
      ]}
    />
  );
}
