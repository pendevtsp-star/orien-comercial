"use client";

import { Badge, Button, Card, CardContent, PageHeader, Select } from "@sgc/ui";
import { CheckCircle2, MonitorCog, Printer, ScanBarcode, Usb } from "lucide-react";
import { useMemo, useState } from "react";

const sizes = [
  { label: "50 x 30 mm", value: "50x30" },
  { label: "60 x 40 mm", value: "60x40" },
  { label: "80 x 40 mm", value: "80x40" },
];

export default function PrintersPage() {
  const [size, setSize] = useState("50x30");
  const [dpi, setDpi] = useState("203");
  const [mode, setMode] = useState("browser");

  const printUrl = useMemo(() => `/catalog-tools?labelSize=${size}&dpi=${dpi}`, [size, dpi]);

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
                Perfil de impressão
              </p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">
                Padrão recomendado
              </h2>
            </div>
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
                label="Modo"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                options={[
                  { label: "Navegador", value: "browser" },
                  { label: "Driver nativo", value: "native" },
                ]}
              />
            </div>
            <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 text-sm text-slate-600">
              Use escala 100%, margens ausentes e orientação automática. Se a etiqueta sair cortada,
              ajuste primeiro o tamanho no driver da impressora e só depois no Orien.
            </div>
            <a
              href={printUrl}
              className="inline-flex min-h-10 w-fit items-center justify-center rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white"
            >
              Abrir emissão de etiquetas
            </a>
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
