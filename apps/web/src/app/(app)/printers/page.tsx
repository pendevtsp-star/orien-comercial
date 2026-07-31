"use client";

import { Badge, Button, Card, CardContent, Input, PageHeader, Select } from "@sgc/ui";
import { ChevronDown, Plus, Printer, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api";

const sizes = [
  { label: "40 x 25 mm", value: "40x25" },
  { label: "50 x 30 mm", value: "50x30" },
  { label: "60 x 40 mm", value: "60x40" },
  { label: "80 x 40 mm", value: "80x40" },
];

export default function PrintersPage() {
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [branchId, setBranchId] = useState("");
  const [size, setSize] = useState("50x30");
  const [labelShowLogo, setLabelShowLogo] = useState(true);
  const [labelShowName, setLabelShowName] = useState(true);
  const [labelShowPrice, setLabelShowPrice] = useState(true);
  const [labelShowBarcodeText, setLabelShowBarcodeText] = useState(true);
  const [labelShowSku, setLabelShowSku] = useState(false);
  const [labelFooter, setLabelFooter] = useState("");
  const [dpi, setDpi] = useState("203");
  const [mode, setMode] = useState("browser");
  const [receiptWidth, setReceiptWidth] = useState("80");
  const [copies, setCopies] = useState(1);
  const [receiptShowLogo, setReceiptShowLogo] = useState(true);
  const [receiptShowDocument, setReceiptShowDocument] = useState(true);
  const [receiptFooter, setReceiptFooter] = useState("");
  const [printerName, setPrinterName] = useState("");
  const [silentPrint, setSilentPrint] = useState(false);
  const [autoCut, setAutoCut] = useState(true);
  const [openCashDrawer, setOpenCashDrawer] = useState(false);
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; purpose: string; width: string; copies: number; isDefault: boolean; deviceHint?: string }>>([]);
  const [profileName, setProfileName] = useState("Comprovante do caixa");
  const [profilePurpose, setProfilePurpose] = useState("sale_receipt");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const printUrl = useMemo(
    () => `/catalog-tools?branchId=${branchId}&labelSize=${size}&dpi=${dpi}`,
    [branchId, size, dpi],
  );

  useEffect(() => {
    void apiFetch<{ data: Array<{ id: string; name: string }> }>("/branches?pageSize=100&isActive=true")
      .then((result) => {
        setBranches(result.data);
        const firstBranch = result.data[0]?.id ?? "";
        if (firstBranch) setBranchId(firstBranch);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar lojas."));
  }, []);

  useEffect(() => {
    if (!branchId) return;
    let active = true;
    void loadSettings(branchId, () => active);
    return () => {
      active = false;
    };
  }, [branchId]);

  async function loadSettings(nextBranchId: string, isActive = () => true) {
    try {
      const settings = await apiFetch<{
        labelSize: string;
        labelShowLogo: boolean;
        labelShowName: boolean;
        labelShowPrice: boolean;
        labelShowBarcodeText: boolean;
        labelShowSku: boolean;
        labelFooter?: string;
        dpi: string;
        receiptMode: string;
        receiptWidth: string;
        receiptCopies: number;
        receiptShowLogo: boolean;
        receiptShowDocument: boolean;
        receiptFooter?: string;
        defaultPrinterName?: string;
        silentPrint: boolean;
        autoCut: boolean;
        openCashDrawer: boolean;
      }>(`/printing-settings?branchId=${nextBranchId}`);
      if (!isActive()) return;
      setSize(settings.labelSize);
      setLabelShowLogo(settings.labelShowLogo ?? true);
      setLabelShowName(settings.labelShowName ?? true);
      setLabelShowPrice(settings.labelShowPrice ?? true);
      setLabelShowBarcodeText(settings.labelShowBarcodeText ?? true);
      setLabelShowSku(settings.labelShowSku ?? false);
      setLabelFooter(settings.labelFooter ?? "");
      setDpi(settings.dpi);
      setMode(settings.receiptMode);
      setReceiptWidth(settings.receiptWidth ?? "80");
      setCopies(settings.receiptCopies);
      setReceiptShowLogo(settings.receiptShowLogo ?? true);
      setReceiptShowDocument(settings.receiptShowDocument ?? true);
      setReceiptFooter(settings.receiptFooter ?? "");
      setPrinterName(settings.defaultPrinterName ?? "");
      setSilentPrint(settings.silentPrint);
      setAutoCut(settings.autoCut ?? true);
      setOpenCashDrawer(settings.openCashDrawer ?? false);
      const profileResult = await apiFetch<{ data: typeof profiles }>(`/printer-profiles?branchId=${nextBranchId}`);
      if (!isActive()) return;
      setProfiles(profileResult.data);
      setError("");
    } catch (cause) {
      if (isActive()) setError(cause instanceof Error ? cause.message : "Não foi possível carregar a configuração.");
    }
  }

  async function saveSettings() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiFetch("/printing-settings", {
        method: "PATCH",
        body: JSON.stringify({
          branchId,
          labelSize: size,
          labelShowLogo,
          labelShowName,
          labelShowPrice,
          labelShowBarcodeText,
          labelShowSku,
          labelFooter: labelFooter || undefined,
          dpi,
          receiptMode: mode,
          receiptWidth,
          receiptCopies: copies,
          receiptShowLogo,
          receiptShowDocument,
          receiptFooter: receiptFooter || undefined,
          defaultPrinterName: printerName,
          silentPrint,
          autoCut,
          openCashDrawer,
        }),
      });
      setMessage("Configuração de impressão salva para esta loja.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a configuração.");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    if (!branchId || !profileName.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      await apiFetch("/printer-profiles", {
        method: "POST",
        body: JSON.stringify({
          branchId,
          name: profileName.trim(),
          purpose: profilePurpose,
          width: profilePurpose === "labels" ? "a4" : receiptWidth,
          copies,
          showLogo: receiptShowLogo,
          showDocument: receiptShowDocument,
          footer: receiptFooter || undefined,
          deviceHint: printerName || undefined,
          isDefault: true,
        }),
      });
      setMessage("Perfil salvo. Ele fica disponível como padrão desta finalidade na loja.");
      await loadSettings(branchId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Impressoras"
        description="Configure etiquetas e comprovantes separadamente para cada loja."
      />

      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1 sm:max-w-md">
            <Select
              label="Configurar loja"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              options={branches.map((branch) => ({ label: branch.name, value: branch.id }))}
            />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
            <span><strong className="text-[var(--brand-primary)]">1.</strong> Instale o driver</span>
            <span><strong className="text-[var(--brand-primary)]">2.</strong> Use o mesmo tamanho no driver</span>
            <span><strong className="text-[var(--brand-primary)]">3.</strong> Imprima em escala 100%</span>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="grid gap-5 p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-blue-50 text-[var(--brand-secondary)]"><Tag size={20} /></span>
              <div>
                <h2 className="font-semibold text-[var(--brand-primary)]">Etiqueta de produto</h2>
                <p className="mt-1 text-sm text-slate-600">Defina tamanho e informações exibidas na etiqueta desta loja.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Tamanho" value={size} onChange={(event) => setSize(event.target.value)} options={sizes} />
              <Select label="Resolução" value={dpi} onChange={(event) => setDpi(event.target.value)} options={[{ label: "203 DPI", value: "203" }, { label: "300 DPI", value: "300" }]} />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium text-[var(--brand-primary)]">Informações visíveis</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["Logo em preto e branco", labelShowLogo, setLabelShowLogo],
                  ["Nome do produto", labelShowName, setLabelShowName],
                  ["Preço", labelShowPrice, setLabelShowPrice],
                  ["Número do código", labelShowBarcodeText, setLabelShowBarcodeText],
                  ["SKU", labelShowSku, setLabelShowSku],
                ].map(([label, checked, setter]) => (
                  <label key={String(label)} className="flex min-h-10 items-center gap-2 rounded-md border border-[var(--brand-border)] px-3 text-sm text-slate-700">
                    <input type="checkbox" checked={Boolean(checked)} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} />
                    {String(label)}
                  </label>
                ))}
              </div>
            </fieldset>
            <Input label="Rodapé opcional" placeholder="Ex.: Obrigado pela preferência." value={labelFooter} onChange={(event) => setLabelFooter(event.target.value)} maxLength={80} />
            <div className="rounded-md bg-[var(--brand-surface)] p-3 text-sm text-slate-600">Logo usa a identidade visual cadastrada da empresa e será convertida para preto e branco.</div>
            <a href={printUrl} className="inline-flex min-h-10 w-fit items-center justify-center rounded-md border border-[var(--brand-border)] px-4 py-2 text-sm font-medium text-[var(--brand-primary)]">Abrir emissão de etiquetas</a>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-5 p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-blue-50 text-[var(--brand-secondary)]"><Printer size={20} /></span>
              <div>
                <h2 className="font-semibold text-[var(--brand-primary)]">Comprovante de venda</h2>
                <p className="mt-1 text-sm text-slate-600">Controle formato, conteúdo e comportamento da impressora do caixa.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="Modo" value={mode} onChange={(event) => setMode(event.target.value)} options={[{ label: "Navegador", value: "browser" }, { label: "Térmica", value: "thermal" }, { label: "Não imprimir", value: "none" }]} />
              <Select label="Largura" value={receiptWidth} onChange={(event) => setReceiptWidth(event.target.value)} options={[{ label: "58 mm", value: "58" }, { label: "80 mm", value: "80" }]} />
              <Input label="Vias" type="number" min={1} max={5} value={copies} onChange={(event) => setCopies(Number(event.target.value || 1))} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-10 items-center gap-2 rounded-md border border-[var(--brand-border)] px-3 text-sm text-slate-700"><input type="checkbox" checked={receiptShowLogo} onChange={(event) => setReceiptShowLogo(event.target.checked)} />Mostrar logo</label>
              <label className="flex min-h-10 items-center gap-2 rounded-md border border-[var(--brand-border)] px-3 text-sm text-slate-700"><input type="checkbox" checked={receiptShowDocument} onChange={(event) => setReceiptShowDocument(event.target.checked)} />Mostrar CPF/CNPJ</label>
              <label className="flex min-h-10 items-center gap-2 rounded-md border border-[var(--brand-border)] px-3 text-sm text-slate-700"><input type="checkbox" checked={autoCut} onChange={(event) => setAutoCut(event.target.checked)} />Corte automático</label>
              <label className="flex min-h-10 items-center gap-2 rounded-md border border-[var(--brand-border)] px-3 text-sm text-slate-700"><input type="checkbox" checked={openCashDrawer} onChange={(event) => setOpenCashDrawer(event.target.checked)} />Abrir gaveta</label>
            </div>
            <Input label="Nome da impressora" placeholder="Ex.: Elgin i9" value={printerName} onChange={(event) => setPrinterName(event.target.value)} />
            <Input label="Rodapé opcional" placeholder="Ex.: Obrigado pela preferência." value={receiptFooter} onChange={(event) => setReceiptFooter(event.target.value)} />
            <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" checked={silentPrint} onChange={(event) => setSilentPrint(event.target.checked)} /><span>Usar impressão silenciosa quando o agente local estiver disponível.</span></label>
            <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 font-mono text-[11px] text-slate-800 sm:max-w-[280px]">
              {receiptShowLogo ? <p className="text-center font-bold">LOGO DA EMPRESA</p> : null}
              <p className="text-center font-bold">COMPROVANTE</p>
              <p>Venda: 00000001</p>
              {receiptShowDocument ? <p>CPF/CNPJ: 000.000.000-00</p> : null}
              <p>1x Produto exemplo R$ 10,00</p>
              <p className="border-t border-dashed pt-1 font-bold">TOTAL R$ 10,00</p>
              <p className="text-center text-slate-500">{receiptFooter || "Obrigado pela preferência."}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void saveSettings()} disabled={saving || !branchId}>{saving ? "Salvando..." : "Salvar configurações da loja"}</Button>
        <span className="text-sm text-slate-500">As mudanças afetam somente a loja selecionada.</span>
      </div>

      <details className="rounded-xl border border-[var(--brand-border)] bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-semibold text-[var(--brand-primary)]">Perfis avançados de impressão <ChevronDown size={18} /></summary>
        <div className="grid gap-4 border-t border-[var(--brand-border)] p-5">
          <p className="text-sm text-slate-600">Crie perfis quando a loja usar impressoras diferentes para caixa, etiquetas, documentos ou fiscal.</p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end">
            <Input label="Nome do perfil" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Ex.: Térmica do caixa" />
            <Select label="Finalidade" value={profilePurpose} onChange={(event) => setProfilePurpose(event.target.value)} options={[{ label: "Comprovante de venda", value: "sale_receipt" }, { label: "Via do cliente", value: "customer_receipt" }, { label: "Etiquetas", value: "labels" }, { label: "Documentos A4", value: "documents" }, { label: "Fiscal/NFC-e", value: "fiscal" }]} />
            <Button type="button" variant="secondary" icon={<Plus size={15} />} onClick={() => void saveProfile()} disabled={saving || !branchId}>Salvar perfil</Button>
          </div>
          {profiles.length ? (
            <div className="divide-y divide-[var(--brand-border)] rounded-md border border-[var(--brand-border)]">
              {profiles.map((profile) => (
                <div key={profile.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div><strong className="text-[var(--brand-primary)]">{profile.name}</strong><p className="mt-0.5 text-xs text-slate-500">{purposeLabel(profile.purpose)} · {profile.width === "a4" ? "A4" : `${profile.width} mm`} · {profile.copies} via(s){profile.deviceHint ? ` · ${profile.deviceHint}` : ""}</p></div>
                  {profile.isDefault ? <Badge>Padrão</Badge> : null}
                </div>
              ))}
            </div>
          ) : <p className="rounded-md border border-dashed border-[var(--brand-border)] p-3 text-sm text-slate-500">Nenhum perfil criado.</p>}
        </div>
      </details>
    </div>
  );
}

function purposeLabel(value: string) {
  return ({ sale_receipt: "Comprovante de venda", customer_receipt: "Via do cliente", labels: "Etiquetas", documents: "Documentos", fiscal: "Fiscal/NFC-e" } as Record<string, string>)[value] ?? value;
}
