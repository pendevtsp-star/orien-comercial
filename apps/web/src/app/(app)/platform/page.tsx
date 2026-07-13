"use client";

import { Button, Card, CardContent, PageHeader } from "@sgc/ui";
import { ExternalLink } from "lucide-react";

const backofficeUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? "https://admin.useorien.com.br";

export default function PlatformPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Backoffice Orien"
        description="A gestão da plataforma fica separada do ambiente operacional dos clientes."
      />
      <Card>
        <CardContent className="grid max-w-2xl gap-4">
          <h2 className="text-lg font-semibold text-[var(--brand-primary)]">Acesse o ambiente administrativo separado</h2>
          <p className="text-sm leading-6 text-slate-600">Tenants, cobrança SaaS, suporte, webhooks e saúde da plataforma não fazem parte do painel da empresa. Abra o backoffice em uma nova aba para manter os contextos separados.</p>
          <div><Button icon={<ExternalLink size={16} />} onClick={() => window.location.assign(backofficeUrl)}>Abrir backoffice Orien</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
