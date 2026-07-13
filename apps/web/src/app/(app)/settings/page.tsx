"use client";

import { Badge, Button, Card, CardContent, Input, PageHeader } from "@sgc/ui";
import { RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch, openApiDocument } from "../../../lib/api";

interface BrandingForm {
  companyName: string;
  tradingName?: string;
  documentId?: string;
  primaryColor: string;
  accentColor: string;
  supportEmail?: string;
  supportPhone?: string;
  website?: string;
  logoUrl?: string;
  logoData?: string;
  footerNote?: string;
}

export default function SettingsPage() {
  const [branding, setBranding] = useState<BrandingForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState("");
  const previewLogo = logoPreview || (branding?.logoUrl ? `${process.env.NEXT_PUBLIC_API_URL ?? ""}${branding.logoUrl}` : "");

  async function load() {
    setError(null);
    try {
      setBranding(await apiFetch<BrandingForm>("/tenants/current/branding"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar configuracoes.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const payload = {
        companyName: readString(form, "companyName"),
        tradingName: optionalString(form, "tradingName"),
        documentId: optionalString(form, "documentId"),
        primaryColor: readString(form, "primaryColor", "#0f172a"),
        accentColor: readString(form, "accentColor", "#2563eb"),
        supportEmail: optionalString(form, "supportEmail"),
        supportPhone: optionalString(form, "supportPhone"),
        website: optionalString(form, "website"),
        logoUrl: optionalString(form, "logoUrl"),
        logoData: logoPreview || undefined,
        footerNote: optionalString(form, "footerNote"),
      };
      await apiFetch("/tenants/current/branding", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await load();
      setLogoPreview("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar identidade documental.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Configuracoes"
        description="Identidade documental, padrao visual de comunicacoes e parametros de operacao."
        actions={
          <Button variant="secondary" onClick={() => void load()} icon={<RefreshCw size={16} />}>
            Atualizar
          </Button>
        }
      />
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardContent>
            <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-950">Identidade da empresa</h2>
                  <p className="text-sm text-slate-500">
                    Aplicada a relatorios, e-mails, comprovantes e documentos emitidos.
                  </p>
                </div>
                <Badge>Padrao oficial</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  name="companyName"
                  label="Razao / nome exibido"
                  defaultValue={branding?.companyName}
                  required
                />
                <Input
                  name="tradingName"
                  label="Nome fantasia"
                  defaultValue={branding?.tradingName}
                />
                <Input
                  name="documentId"
                  label="Documento da empresa"
                  defaultValue={branding?.documentId}
                />
                <Input name="website" label="Site" defaultValue={branding?.website} />
                <Input
                  name="supportEmail"
                  label="E-mail de suporte"
                  type="email"
                  defaultValue={branding?.supportEmail}
                />
                <Input name="supportPhone" label="Telefone" defaultValue={branding?.supportPhone} />
                <Input name="logoUrl" label="URL do logo" defaultValue={branding?.logoUrl} />
                <label className="grid gap-1 text-sm font-medium">
                  Logo da empresa
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="block w-full rounded-md border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return setLogoPreview("");
                      if (file.size > 2 * 1024 * 1024) {
                        setError("O logo deve ter no máximo 2 MB.");
                        event.currentTarget.value = "";
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () =>
                        setLogoPreview(typeof reader.result === "string" ? reader.result : "");
                      reader.readAsDataURL(file);
                    }}
                  />
                  <span className="text-xs font-normal text-slate-500">
                    PNG, JPEG, WebP ou SVG. Máximo de 2 MB.
                  </span>
                </label>
                <Input
                  name="footerNote"
                  label="Rodape padrao"
                  defaultValue={branding?.footerNote}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  name="primaryColor"
                  label="Cor primaria"
                  type="color"
                  defaultValue={branding?.primaryColor ?? "#0f172a"}
                />
                <Input
                  name="accentColor"
                  label="Cor de destaque"
                  type="color"
                  defaultValue={branding?.accentColor ?? "#2563eb"}
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar identidade"}
              </Button>
              {previewLogo ? (
                <div className="flex items-center gap-3 rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3">
                  <img
                    className="h-12 w-12 rounded-md bg-white object-contain p-1"
                    src={previewLogo}
                    alt="Prévia do logo"
                  />
                  <span className="text-sm text-slate-600">
                    Prévia do logo usado em documentos e comunicações.
                  </span>
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardContent className="grid gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Padrao de emissao</h2>
                <p className="text-sm text-slate-500">
                  Toda saida formal deve usar a mesma base visual e metadados.
                </p>
              </div>
              {[
                "Comprovantes de venda",
                "Relatorios de estoque",
                "Relatorios financeiros",
                "Convites e e-mails operacionais",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                >
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Preview rapido</h2>
                <p className="text-sm text-slate-500">
                  Abra um documento real para validar a identidade aplicada.
                </p>
              </div>
              <div
                className="overflow-hidden rounded-2xl border border-[var(--brand-border)]"
                style={{
                  background: `linear-gradient(135deg, ${branding?.primaryColor ?? "#0f172a"}, #133a7c)`,
                }}
              >
                <div className="grid gap-4 p-5 text-white sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/70">
                      {branding?.tradingName || branding?.companyName || "Empresa"}
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold">Comprovante de conferência</h3>
                    <p className="mt-2 text-sm text-white/72">
                      Prévia do cabeçalho aplicado em relatórios, comprovantes e e-mails.
                    </p>
                  </div>
                  <div className="grid min-h-20 place-items-center rounded-xl border border-white/20 bg-white/10 p-3">
                    {previewLogo ? (
                      <img className="max-h-14 max-w-full object-contain" src={previewLogo} alt="Logo" />
                    ) : (
                      <span className="text-center text-xs text-white/70">Sem logo</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-white p-3 text-xs text-slate-600">
                  <span>{branding?.documentId || "CPF/CNPJ opcional"}</span>
                  <span className="text-right">{branding?.website || "useorien.com.br"}</span>
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={() => void openApiDocument("/financial/cashflow/document")}
              >
                Ver modelo financeiro
              </Button>
              <Button
                variant="secondary"
                onClick={() => void openApiDocument("/stock/reports/document?kind=low-stock")}
              >
                Ver modelo de estoque
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function readString(form: FormData, key: string, fallback = "") {
  const value = form.get(key);
  return typeof value === "string" ? value : fallback;
}

function optionalString(form: FormData, key: string) {
  const value = readString(form, key);
  return value || undefined;
}
