"use client";
import { Button, Card, CardContent, Input, PageHeader, Select } from "@sgc/ui";
import { Check, Palette, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import {
  applyPreferences,
  defaultPreferences,
  type UserPreferences,
} from "../../../lib/preferences";
const themes = [
  { value: "orien", label: "Orien", colors: ["#0B1D3D", "#2563EB", "#F5C34A"] },
  { value: "safira", label: "Safira", colors: ["#071B33", "#075985", "#06B6D4"] },
  { value: "esmeralda", label: "Esmeralda", colors: ["#092C2A", "#0F766E", "#10B981"] },
  { value: "grafite", label: "Grafite", colors: ["#20252D", "#475569", "#2563EB"] },
  { value: "rubi", label: "Rubi", colors: ["#241119", "#881337", "#E11D48"] },
  { value: "solaris", label: "Solaris", colors: ["#111111", "#D6A600", "#FFD54A"] },
] as const;
const routes: Array<[string, string]> = [
  ["/dashboard", "Dashboard"],
  ["/pos", "PDV"],
  ["/sales", "Vendas"],
  ["/stock", "Estoque"],
  ["/financial", "Financeiro"],
  ["/operations", "Operacoes avancadas"],
  ["/customers", "Clientes"],
  ["/purchases", "Compras"],
];
const widgets: Array<[string, string]> = [
  ["executive", "Resumo executivo"],
  ["financial", "Posicao financeira"],
  ["indicators", "Indicadores operacionais"],
  ["performance", "Performance comercial"],
  ["period", "Comparativo do periodo"],
  ["goals", "Metas"],
  ["role-focus", "Meu foco por perfil"],
  ["health", "Saúde operacional"],
];
export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<UserPreferences>(defaultPreferences);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void apiFetch<UserPreferences>("/preferences")
      .then((value) => {
        setPrefs(value);
        applyPreferences(value);
      })
      .finally(() => setLoading(false));
  }, []);
  function update<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    applyPreferences(next);
  }
  function toggle(key: "favoriteRoutes" | "dashboardWidgets", value: string) {
    update(
      key,
      prefs[key].includes(value) ? prefs[key].filter((x) => x !== value) : [...prefs[key], value],
    );
  }
  async function save() {
    const result = await apiFetch<{ preferences: UserPreferences }>("/preferences", {
      method: "PATCH",
      body: JSON.stringify(prefs),
    });
    setPrefs(result.preferences);
    applyPreferences(result.preferences);
    setMessage("Preferencias sincronizadas com sua conta.");
  }
  function restore() {
    setPrefs(defaultPreferences);
    applyPreferences(defaultPreferences);
    setMessage("Previa restaurada. Salve para confirmar.");
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Aparencia e preferencias"
        description="Personalize sua experiencia sem perder a identidade e os padroes de acessibilidade da Orien."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={restore}>
              Restaurar Orien
            </Button>
            <Button icon={<Save size={16} />} onClick={() => void save()} disabled={loading}>
              Salvar preferencias
            </Button>
          </div>
        }
      />
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      <Card>
        <CardContent className="grid gap-5">
          <div>
            <Palette />
            <h2 className="mt-2 text-xl font-semibold">Tema da interface</h2>
            <p className="text-sm text-slate-500">
              Paletas controladas com contraste validado e assinatura visual Orien.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {themes.map((theme) => (
              <button
                key={theme.value}
                type="button"
                onClick={() => update("theme", theme.value)}
                className={`grid gap-3 rounded-md border p-4 text-left transition ${prefs.theme === theme.value ? "border-[var(--brand-highlight)] ring-2 ring-[var(--brand-highlight)]/20" : "border-[var(--brand-border)]"}`}
              >
                <span className="flex items-center justify-between">
                  <strong>{theme.label}</strong>
                  {prefs.theme === theme.value ? <Check size={17} /> : null}
                </span>
                <span className="flex gap-2">
                  {theme.colors.map((color) => (
                    <span
                      key={color}
                      className="h-8 flex-1 rounded-sm border border-black/10"
                      style={{ background: color }}
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Select
              label="Modo"
              value={prefs.colorMode}
              onChange={(e) => update("colorMode", e.target.value as UserPreferences["colorMode"])}
              options={[
                { label: "Automatico", value: "system" },
                { label: "Claro", value: "light" },
                { label: "Escuro", value: "dark" },
              ]}
            />
            <Select
              label="Densidade"
              value={prefs.density}
              onChange={(e) => update("density", e.target.value as UserPreferences["density"])}
              options={[
                { label: "Confortavel", value: "comfortable" },
                { label: "Compacta", value: "compact" },
              ]}
            />
            <Select
              label="Menu lateral"
              value={prefs.sidebarMode}
              onChange={(e) =>
                update("sidebarMode", e.target.value as UserPreferences["sidebarMode"])
              }
              options={[
                { label: "Expandido", value: "expanded" },
                { label: "Compacto", value: "compact" },
                { label: "Recolhido", value: "collapsed" },
              ]}
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={prefs.reduceMotion}
              onChange={(e) => update("reduceMotion", e.target.checked)}
            />
            Reduzir animacoes e transicoes
          </label>
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="grid gap-4">
            <h2 className="text-lg font-semibold">Navegacao pessoal</h2>
            <Select
              label="Pagina inicial"
              value={prefs.startPage}
              onChange={(e) => update("startPage", e.target.value)}
              options={routes.map(([value, label]) => ({ value, label }))}
            />
            <Select
              label="Formato de data"
              value={prefs.dateFormat}
              onChange={(e) =>
                update("dateFormat", e.target.value as UserPreferences["dateFormat"])
              }
              options={[
                { label: "31/12/2026", value: "dd/MM/yyyy" },
                { label: "12/31/2026", value: "MM/dd/yyyy" },
                { label: "2026-12-31", value: "yyyy-MM-dd" },
              ]}
            />
            <div>
              <p className="mb-2 text-sm font-medium">Atalhos favoritos</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {routes.map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 rounded-md bg-[var(--brand-surface)] p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={prefs.favoriteRoutes.includes(value)}
                      onChange={() => toggle("favoriteRoutes", value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-4">
            <h2 className="text-lg font-semibold">Notificacoes</h2>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={prefs.notifyInApp}
                onChange={(e) => update("notifyInApp", e.target.checked)}
              />
              Central interna
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={prefs.notifyEmail}
                onChange={(e) => update("notifyEmail", e.target.checked)}
              />
              Receber alertas por e-mail
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Silenciar a partir de"
                type="time"
                value={prefs.quietHoursStart?.slice(0, 5) ?? ""}
                onChange={(e) => update("quietHoursStart", e.target.value || null)}
              />
              <Input
                label="Retomar alertas as"
                type="time"
                value={prefs.quietHoursEnd?.slice(0, 5) ?? ""}
                onChange={(e) => update("quietHoursEnd", e.target.value || null)}
              />
            </div>
            <p className="text-xs text-slate-500">
              Alertas criticos de seguranca continuam visiveis na central.
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent>
          <h2 className="text-lg font-semibold">Meu dashboard</h2>
          <p className="mb-4 text-sm text-slate-500">
            Escolha os blocos que aparecem na sua visao inicial.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {widgets.map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2 rounded-md border border-[var(--brand-border)] p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={prefs.dashboardWidgets.includes(value)}
                  onChange={() => toggle("dashboardWidgets", value)}
                />
                {label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
