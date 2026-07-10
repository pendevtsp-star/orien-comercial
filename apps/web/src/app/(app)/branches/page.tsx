"use client";

import { Badge } from "@sgc/ui";
import { Building2, MapPinned, Orbit, Store } from "lucide-react";
import { ResourcePage } from "../../../components/resource-page";

interface BranchRow {
  id: string;
  name: string;
  code: string;
  city?: string;
  state?: string;
  isActive: boolean;
}

export default function BranchesPage() {
  return (
    <ResourcePage<BranchRow>
      title="Lojas e filiais"
      description="Unidades operacionais com estoque, caixa e equipe independentes."
      endpoint="/branches"
      searchPlaceholder="Buscar por nome da loja, codigo, cidade ou UF"
      heroBadge="Estrutura operacional"
      heroTitle="Filiais com escopo claro para operacao, estoque e equipe."
      heroDescription="Centralize as unidades do tenant com leitura rapida de cobertura geografica e base operacional ativa."
      insights={[
        { label: "Filiais cadastradas", value: (rows) => rows.length, detail: "Base total de unidades", icon: Store },
        { label: "Unidades ativas", value: (rows) => rows.filter((row) => row.isActive).length, detail: "Lojas prontas para operar", icon: Building2 },
        {
          label: "Cidades cobertas",
          value: (rows) => new Set(rows.map((row) => row.city).filter(Boolean)).size,
          detail: "Presenca geografica atual",
          icon: MapPinned
        },
        {
          label: "Expansao pronta",
          value: () => "Tenant-ready",
          detail: "Modelo preparado para novas lojas",
          icon: Orbit,
          accent: true
        }
      ]}
      sortOptions={[
        { label: "Nome", value: "name" },
        { label: "Codigo", value: "code" },
        { label: "Cidade", value: "city" },
        { label: "Cadastro", value: "createdAt" }
      ]}
      fields={[
        { name: "name", label: "Nome", required: true },
        { name: "code", label: "Codigo", required: true },
        { name: "city", label: "Cidade" },
        { name: "state", label: "UF" }
      ]}
      transform={(form) => ({
        name: form.get("name"),
        code: form.get("code"),
        city: form.get("city") || undefined,
        state: form.get("state") || undefined,
        isActive: true
      })}
      columns={[
        { key: "name", header: "Nome", render: (row) => row.name },
        { key: "code", header: "Codigo", render: (row) => row.code },
        { key: "city", header: "Cidade", render: (row) => [row.city, row.state].filter(Boolean).join(" / ") },
        { key: "status", header: "Status", render: (row) => <Badge>{row.isActive ? "Ativa" : "Inativa"}</Badge> }
      ]}
    />
  );
}
