"use client";

import { Badge } from "@sgc/ui";
import { Building2, FileCheck2, Phone, Truck } from "lucide-react";
import { ResourcePage } from "../../../components/resource-page";

interface SupplierRow {
  id: string;
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  isActive: boolean;
}

export default function SuppliersPage() {
  return <ResourcePage<SupplierRow>
    title="Fornecedores"
    description="Parceiros de compra vinculados às entradas de estoque e documentos recebidos."
    endpoint="/suppliers"
    searchPlaceholder="Buscar por nome, documento ou e-mail"
    heroBadge="Abastecimento"
    heroTitle="Fornecedores organizados para comprar, receber e controlar custos."
    heroDescription="Mantenha os dados de contato e identificação conectados ao histórico de compras do tenant."
    insights={[
      { label: "Fornecedores", value: (rows) => rows.length, detail: "Parceiros carregados", icon: Truck },
      { label: "Com documento", value: (rows) => rows.filter((row) => row.document).length, detail: "Cadastros identificados", icon: FileCheck2 },
      { label: "Com contato", value: (rows) => rows.filter((row) => row.phone || row.whatsapp).length, detail: "Canal operacional", icon: Phone },
      { label: "Ativos", value: (rows) => rows.filter((row) => row.isActive).length, detail: "Aptos para compras", icon: Building2, accent: true }
    ]}
    sortOptions={[{ label: "Nome", value: "name" }, { label: "Cadastro", value: "createdAt" }]}
    fields={[
      { name: "name", label: "Nome / razão social", required: true },
      { name: "document", label: "CPF/CNPJ" },
      { name: "email", label: "E-mail", type: "email" },
      { name: "phone", label: "Telefone" },
      { name: "whatsapp", label: "WhatsApp" },
      { name: "notes", label: "Observações" }
    ]}
    transform={(form) => ({
      name: form.get("name"), document: form.get("document") || undefined,
      email: form.get("email") || undefined, phone: form.get("phone") || undefined,
      whatsapp: form.get("whatsapp") || undefined, notes: form.get("notes") || undefined, isActive: true
    })}
    columns={[
      { key: "name", header: "Fornecedor", render: (row) => row.name },
      { key: "document", header: "Documento", render: (row) => row.document ?? "-" },
      { key: "contact", header: "Contato", render: (row) => row.whatsapp ?? row.phone ?? row.email ?? "-" },
      { key: "status", header: "Status", render: (row) => <Badge>{row.isActive ? "Ativo" : "Inativo"}</Badge> }
    ]}
  />;
}
