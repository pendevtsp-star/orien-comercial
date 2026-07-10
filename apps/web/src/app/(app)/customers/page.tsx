"use client";

import { Badge } from "@sgc/ui";
import { Building2, ContactRound, MailCheck, Smartphone } from "lucide-react";
import { ResourcePage } from "../../../components/resource-page";

interface CustomerRow {
  id: string;
  name: string;
  document?: string;
  email?: string;
  whatsapp?: string;
  communicationOptIn: boolean;
}

export default function CustomersPage() {
  return (
    <ResourcePage<CustomerRow>
      title="Clientes"
      description="Base de consumidores e empresas com consentimento de comunicacao."
      endpoint="/customers"
      searchPlaceholder="Buscar por nome, documento, e-mail ou WhatsApp"
      heroBadge="Relacionamento comercial"
      heroTitle="Clientes organizados para venda, recorrencia e contato responsavel."
      heroDescription="Consolide a base comercial com leitura rapida de contato, documentacao e canais disponiveis para relacionamento."
      insights={[
        { label: "Clientes cadastrados", value: (rows) => rows.length, detail: "Base total do tenant", icon: ContactRound },
        { label: "Com e-mail", value: (rows) => rows.filter((row) => row.email).length, detail: "Canal pronto para comunicacao", icon: MailCheck },
        { label: "Com WhatsApp", value: (rows) => rows.filter((row) => row.whatsapp).length, detail: "Contato direto disponivel", icon: Smartphone },
        {
          label: "Com documento",
          value: (rows) => rows.filter((row) => row.document).length,
          detail: "Base mais preparada para faturamento",
          icon: Building2,
          accent: true
        }
      ]}
      sortOptions={[
        { label: "Nome", value: "name" },
        { label: "Documento", value: "document" },
        { label: "E-mail", value: "email" },
        { label: "Cadastro", value: "createdAt" }
      ]}
      fields={[
        { name: "name", label: "Nome", required: true },
        { name: "document", label: "CPF/CNPJ" },
        { name: "email", label: "E-mail", type: "email" },
        { name: "whatsapp", label: "WhatsApp" }
      ]}
      transform={(form) => ({
        name: form.get("name"),
        document: form.get("document") || undefined,
        email: form.get("email") || undefined,
        whatsapp: form.get("whatsapp") || undefined,
        type: "individual",
        tags: [],
        communicationOptIn: false,
        isActive: true
      })}
      columns={[
        { key: "name", header: "Nome", render: (row) => row.name },
        { key: "document", header: "Documento", render: (row) => row.document ?? "-" },
        { key: "email", header: "E-mail", render: (row) => row.email ?? "-" },
        { key: "whatsapp", header: "WhatsApp", render: (row) => row.whatsapp ?? "-" },
        {
          key: "optin",
          header: "Comunicacao",
          render: (row) => <Badge>{row.communicationOptIn ? "Opt-in" : "Sem opt-in"}</Badge>
        }
      ]}
    />
  );
}
