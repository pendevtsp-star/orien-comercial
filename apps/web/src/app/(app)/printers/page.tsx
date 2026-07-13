"use client";

import { Badge, Button, Card, CardContent, Input, PageHeader, Select } from "@sgc/ui";
import { CheckCircle2, Printer, ScanBarcode, Usb } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api";

const sizes = [
  { label: "50 x 30 mm", value: "50x30" },
  { label: "60 x 40 mm", value: "60x40" },
  { label: "80 x 40 mm", value: "80x40" },
];

export default function PrintersPage() {
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [branchId, setBranchId] = useState("");
  const [size, setSize] = useState("50x30");
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const printUrl = useMemo(() => `/catalog-tools?labelSize=${size}&dpi=${dpi}`, [size, dpi]);

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
    void loadSettings(branchId);
  }, [branchId]);

  async function loadSettings(nextBranchId: string) {
    try {
      const settings = await apiFetch<{
        labelSize: string;
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
      setSize(settings.labelSize);
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
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a configuração.");
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

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Impressoras térmicas"
        description="Guia de instalação e configuração para etiquetas, comprovantes e operação de balcão."
        actions={
          <Button
            variant="secondary"
            icon={<Printer size={16} />}
            onClick={() => window.print()}
          >
            Imprimir guia
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card variant="brand">
          <CardContent className="grid gap-5 p-6">
            <Badge className="w-fit border-white/10 bg-white/10 text-white">Operação local</Badge>
            <div>
              <h2 data-brand-display="true" className="text-3xl font-semibold text-white">
                Instale como impressora do sistema e imprima pelo navegador.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
                Para o beta, o caminho mais estável é usar o driver oficial da impressora no
                Windows, macOS ou Linux e selecionar a térmica na janela de impressão do navegador.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Step number="1" label="Instalar driver" />
              <Step number="2" label="Configurar tamanho" />
              <Step number="3" label="Imprimir sem escala" accent />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">
                Perfil de impressão por loja
              </p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">
                Padrão salvo para etiquetas e comprovantes
              </h2>
            </div>
            {message ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {message}
              </p>
            ) : null}
            {error ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
            <Select
              label="Loja"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              options={branches.map((branch) => ({ label: branch.name, value: branch.id }))}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="Etiqueta"
                value={size}
                onChange={(event) => setSize(event.target.value)}
                options={sizes}
              />
              <Select
                label="DPI"
                value={dpi}
                onChange={(event) => setDpi(event.target.value)}
                options={[
                  { label: "203 DPI", value: "203" },
                  { label: "300 DPI", value: "300" },
                ]}
              />
              <Select
                label="Comprovante"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                options={[
                  { label: "Navegador", value: "browser" },
                  { label: "Térmica", value: "thermal" },
                  { label: "Não imprimir", value: "none" },
                ]}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="Largura do comprovante"
                value={receiptWidth}
                onChange={(event) => setReceiptWidth(event.target.value)}
                options={[
                  { label: "58 mm", value: "58" },
                  { label: "80 mm", value: "80" },
                ]}
              />
              <label className="flex items-center gap-2 rounded-md border border-[var(--brand-border)] px-3 py-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={receiptShowLogo}
                  onChange={(event) => setReceiptShowLogo(event.target.checked)}
                />
                Mostrar logo
              </label>
              <label className="flex items-center gap-2 rounded-md border border-[var(--brand-border)] px-3 py-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={receiptShowDocument}
                  onChange={(event) => setReceiptShowDocument(event.target.checked)}
                />
                Mostrar CPF/CNPJ
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <Input
                label="Nome da impressora padrão"
                placeholder="Ex.: Elgin i9, Zebra GC420t"
                value={printerName}
                onChange={(event) => setPrinterName(event.target.value)}
              />
              <Input
                label="Vias"
                type="number"
                min={1}
                max={5}
                value={copies}
                onChange={(event) => setCopies(Number(event.target.value || 1))}
              />
            </div>
            <Input
              label="Rodapé do comprovante"
              placeholder="Ex.: Obrigado pela preferência."
              value={receiptFooter}
              onChange={(event) => setReceiptFooter(event.target.value)}
            />
            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={silentPrint}
                onChange={(event) => setSilentPrint(event.target.checked)}
              />
              <span>
                Preparar para impressão silenciosa quando o agente local estiver disponível.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-md border border-[var(--brand-border)] p-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={autoCut}
                  onChange={(event) => setAutoCut(event.target.checked)}
                />
                <span>Cortar papel automaticamente ao final do comprovante.</span>
              </label>
              <label className="flex items-start gap-2 rounded-md border border-[var(--brand-border)] p-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={openCashDrawer}
                  onChange={(event) => setOpenCashDrawer(event.target.checked)}
                />
                <span>Abrir gaveta de dinheiro ao finalizar venda em dinheiro.</span>
              </label>
            </div>
            <div className="rounded-xl border border-[var(--brand-border)] bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-secondary)]">Prévia compacta</p>
              <div className="mt-3 max-w-[260px] rounded-md border border-dashed border-slate-300 bg-white p-3 font-mono text-[11px] text-slate-800">
                {receiptShowLogo ? <p className="text-center font-bold">LOGO DA EMPRESA</p> : null}
                <p className="text-center font-bold">COMPROVANTE</p>
                <p>Venda: 00000001</p>
                {receiptShowDocument ? <p>CPF/CNPJ: 000.000.000-00</p> : null}
                <p>1x Produto exemplo R$ 10,00</p>
                <p className="border-t border-dashed pt-1 font-bold">TOTAL R$ 10,00</p>
                <p className="text-center text-slate-500">{receiptFooter || "Obrigado pela preferência."}</p>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 text-sm text-slate-600">
              Use escala 100%, margens ausentes e orientação automática. Se a etiqueta sair cortada,
              ajuste primeiro o tamanho no driver da impressora e só depois no Orien.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveSettings()} disabled={saving || !branchId}>
                {saving ? "Salvando..." : "Salvar configuração"}
              </Button>
              <a
                href={printUrl}
                className="inline-flex min-h-10 w-fit items-center justify-center rounded-md border border-[var(--brand-border)] px-4 py-2 text-sm font-medium text-[var(--brand-primary)]"
              >
                Abrir emissão de etiquetas
              </a>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Instruction
          icon={<Usb size={22} />}
          title="Conexão USB"
          items={[
            "Conecte a impressora antes de abrir o navegador.",
            "Instale o driver do fabricante.",
            "Defina a térmica como impressora disponível do sistema.",
          ]}
        />
        <Instruction
          icon={<Printer size={22} />}
          title="Etiquetas"
          items={[
            "Cadastre código de barras no produto.",
            "Selecione produtos em Ferramentas > Etiquetas.",
            "Confira a prévia e imprima em 100%.",
          ]}
        />
        <Instruction
          icon={<ScanBarcode size={22} />}
          title="Leitor e PDV"
          items={[
            "Leitores USB/Bluetooth funcionam em modo teclado.",
            "Use F2 para focar o campo de leitura.",
            "Se o leitor falhar, pesquise o produto manualmente.",
          ]}
        />
      </section>

      <Card>
        <CardContent className="grid gap-3">
          <h2 className="font-semibold text-[var(--brand-primary)]">Próximo nível</h2>
          <p className="text-sm leading-6 text-slate-600">
            Depois do beta, podemos adicionar um agente local opcional para impressão silenciosa,
            corte automático e descoberta de impressoras. Esse agente precisa de instalação no
            computador da loja e deve ser tratado como módulo separado por segurança.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Step({ number, label, accent = false }: { number: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.08] p-4">
      <p className={accent ? "text-[var(--brand-accent)]" : "text-white"}>{number}</p>
      <p className="mt-2 text-sm font-medium text-white">{label}</p>
    </div>
  );
}

function Instruction({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-3 text-[var(--brand-primary)]">
          {icon}
          <h2 className="font-semibold">{title}</h2>
        </div>
        <div className="grid gap-2">
          {items.map((item) => (
            <p key={item} className="flex gap-2 text-sm text-slate-600">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              <span>{item}</span>
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
