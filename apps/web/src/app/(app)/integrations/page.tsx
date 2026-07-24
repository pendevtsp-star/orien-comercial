"use client";

import { Button, Card, CardContent, PageHeader } from "@sgc/ui";
import {
  CheckCircle2,
  CreditCard,
  Mail,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import {
  applySmtpPreset,
  smtpPresetById,
  smtpPresets,
  type SmtpPreset,
} from "../../../lib/smtp-presets";

type Provider = "asaas_business" | "smtp" | "whatsapp_meta" | "fiscal";
type Integration = {
  provider: Provider;
  status: string;
  settings: Record<string, string>;
  hasCredential: boolean;
  updatedAt?: string;
};
type Branch = { id: string; name: string };
type BranchOverride = {
  branchId: string;
  branchName: string;
  provider: Provider;
  enabled: boolean;
  settings: Record<string, string>;
  updatedAt: string;
};
const otherCards: Array<{
  provider: Exclude<Provider, "smtp">;
  title: string;
  description: string;
  icon: typeof Mail;
  fields: Array<[string, string, string]>;
}> = [
  {
    provider: "asaas_business",
    title: "Asaas da empresa",
    description: "PIX, boleto e cartão recebidos diretamente na conta da empresa.",
    icon: CreditCard,
    fields: [["apiUrl", "Endereço da API", "https://api-sandbox.asaas.com/v3"]],
  },
  {
    provider: "whatsapp_meta",
    title: "WhatsApp oficial",
    description: "Base preparada para mensagens e alertas operacionais.",
    icon: MessageCircle,
    fields: [
      ["phoneNumberId", "Identificação do número", ""],
      ["businessAccountId", "Identificação da conta", ""],
    ],
  },
  {
    provider: "fiscal",
    title: "Focus NFe",
    description:
      "Token protegido para emissão, consulta e cancelamento no ambiente de homologação.",
    icon: ReceiptText,
    fields: [
      ["provider", "Provedor fiscal", "focus_nfe"],
      ["environment", "Ambiente", "homologation"],
    ],
  },
];

function Status({ item }: { item?: Integration }) {
  const text =
    item?.status === "configured"
      ? "Configurada"
      : item?.status === "error"
        ? "Revisar"
        : "Pendente";
  const tone =
    item?.status === "configured"
      ? "bg-emerald-50 text-emerald-800"
      : item?.status === "error"
        ? "bg-rose-50 text-rose-800"
        : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{text}</span>;
}

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [overrides, setOverrides] = useState<BranchOverride[]>([]);
  const [overrideBranchId, setOverrideBranchId] = useState("");
  const [overrideProvider, setOverrideProvider] = useState<Provider>("smtp");
  const [overrideEnabled, setOverrideEnabled] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [secret, setSecret] = useState<Record<string, string>>({});
  const [smtpDraft, setSmtpDraft] = useState<Record<string, string>>({});
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpInitialized, setSmtpInitialized] = useState(false);
  const [pendingPresetId, setPendingPresetId] = useState<SmtpPreset["id"] | null>(null);
  async function load() {
    try {
      const [integrations, branchResult, overridesResult] = await Promise.all([
        apiFetch<{ data: Integration[] }>("/integrations"),
        apiFetch<{ data: Branch[] }>("/branches?limit=100"),
        apiFetch<{ data: BranchOverride[] }>("/integrations/branches"),
      ]);
      setItems(integrations.data);
      setBranches(branchResult.data);
      setOverrides(overridesResult.data);
      setOverrideBranchId((current) => current || branchResult.data[0]?.id || "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao carregar integrações.");
    }
  }
  async function saveBranchOverride() {
    if (!overrideBranchId) return;
    try {
      await apiFetch("/integrations/branches/override", {
        method: "PUT",
        body: JSON.stringify({
          branchId: overrideBranchId,
          provider: overrideProvider,
          enabled: overrideEnabled,
          settings: {},
        }),
      });
      setNotice("Preferência por loja salva. A filial agora herda ou desativa este conector de forma explícita.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar a preferência da loja.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const smtp = items.find((item) => item.provider === "smtp");
  useEffect(() => {
    if (!smtp || smtpInitialized) return;
    const draft = {
      providerName: smtp.settings.providerName ?? "locaweb",
      from: smtp.settings.from ?? "",
      testRecipient: smtp.settings.testRecipient ?? "",
      host: smtp.settings.host ?? "",
      port: smtp.settings.port ?? "",
      security: smtp.settings.security ?? "starttls",
    };
    const presetId = smtpPresets.some((preset) => preset.id === draft.providerName)
      ? (draft.providerName as SmtpPreset["id"])
      : "locaweb";
    setSmtpDraft(draft.host || draft.port ? draft : applySmtpPreset(presetId, draft));
    setSmtpInitialized(true);
  }, [smtp, smtpInitialized]);
  async function save(provider: Provider, form: HTMLFormElement) {
    const entries = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const { username, password, secret: rawSecret, ...settings } = entries;
    try {
      await apiFetch(`/integrations/${provider}`, {
        method: "PUT",
        body: JSON.stringify({
          provider,
          mode: settings.environment ?? "production",
          status: "configured",
          settings,
        }),
      });
      const credential =
        provider === "smtp" && username && password
          ? JSON.stringify({ username, password })
          : rawSecret || secret[provider];
      if (credential)
        await apiFetch(`/integrations/${provider}/credential`, {
          method: "PUT",
          body: JSON.stringify({ secret: credential }),
        });
      setNotice(
        provider === "smtp"
          ? "E-mail da empresa salvo com segurança. Envie um teste para confirmar."
          : "Integração salva com credencial protegida.",
      );
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }
  async function test(provider: Provider) {
    try {
      const result = await apiFetch<{ message: string }>(`/integrations/${provider}/test`, {
        method: "POST",
        body: "{}",
      });
      setNotice(result.message);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Teste não concluído.");
    }
  }
  function updateSmtpDraft(field: string, value: string) {
    setSmtpDraft((current) => ({ ...current, [field]: value }));
  }
  function chooseSmtpPreset(presetId: SmtpPreset["id"]) {
    if (presetId === smtpDraft.providerName) return;
    if (smtpDraft.host || smtpDraft.port) {
      setPendingPresetId(presetId);
      return;
    }
    setSmtpDraft((current) => applySmtpPreset(presetId, current));
  }
  function applyPendingSmtpPreset() {
    if (!pendingPresetId) return;
    setSmtpDraft((current) => applySmtpPreset(pendingPresetId, current));
    setPendingPresetId(null);
  }
  async function saveSmtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((smtpUsername || smtpPassword) && (!smtpUsername || !smtpPassword)) {
      setNotice("Informe o usuário e a senha juntos ou deixe os dois campos vazios para manter os atuais.");
      return;
    }
    try {
      await apiFetch("/integrations/smtp", {
        method: "PUT",
        body: JSON.stringify({
          provider: "smtp",
          mode: "production",
          status: "configured",
          settings: smtpDraft,
        }),
      });
      if (smtpUsername && smtpPassword) {
        await apiFetch("/integrations/smtp/credential", {
          method: "PUT",
          body: JSON.stringify({ secret: JSON.stringify({ username: smtpUsername, password: smtpPassword }) }),
        });
        setSmtpUsername("");
        setSmtpPassword("");
      }
      setNotice("E-mail da empresa salvo com segurança. Envie um teste para confirmar.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar o e-mail da empresa.");
    }
  }
  const selectedSmtpPreset =
    smtpPresets.find((preset) => preset.id === smtpDraft.providerName) ?? smtpPresetById.locaweb;
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Integrações"
        description="Conecte serviços da empresa com dados protegidos e testes claros."
      />
      {notice ? (
        <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {notice}
        </p>
      ) : null}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-[var(--brand-surface)] text-[var(--brand-primary)]">
                <Mail size={20} />
              </span>
              <div>
                <h2 className="font-semibold">E-mail da empresa</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Envie comprovantes, alertas e convites usando o endereço comercial da sua empresa.
                </p>
              </div>
            </div>
            <Status item={smtp} />
          </div>
          <div className="mt-4 grid gap-1 rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 text-xs text-slate-600">
            <p>Conta: {smtp?.hasCredential ? "protegida" : "não cadastrada"}</p>
            <p>
              Último teste:{" "}
              {smtp?.settings.lastTestAt
                ? new Date(smtp.settings.lastTestAt).toLocaleString("pt-BR")
                : "não executado"}
            </p>
            {smtp?.settings.lastTestMessage ? (
              <p>Resultado: {smtp.settings.lastTestMessage}</p>
            ) : null}
          </div>
          <form
            className="mt-5 grid gap-3"
            onSubmit={(event: FormEvent<HTMLFormElement>) => void saveSmtp(event)}
          >
            <label className="grid gap-1 text-sm font-medium">
              Como você envia e-mails
              <select
                value={smtpDraft.providerName ?? "locaweb"}
                onChange={(event) => chooseSmtpPreset(event.target.value as SmtpPreset["id"])}
                className="h-10 rounded-md border border-[var(--brand-border)] px-3"
              >
                {smtpPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-slate-500">{selectedSmtpPreset.description}</p>
            {pendingPresetId ? (
              <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Aplicar a configuração de {smtpPresetById[pendingPresetId].label} vai substituir somente o servidor, a porta e a segurança atuais.
                </p>
                <span className="flex shrink-0 gap-2">
                  <Button type="button" variant="secondary" onClick={() => setPendingPresetId(null)}>
                    Manter dados
                  </Button>
                  <Button type="button" onClick={applyPendingSmtpPreset}>
                    Aplicar
                  </Button>
                </span>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                E-mail que envia mensagens
                <input
                  type="email"
                  required
                  value={smtpDraft.from ?? ""}
                  onChange={(event) => updateSmtpDraft("from", event.target.value)}
                  placeholder="contato@suaempresa.com.br"
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                E-mail para receber o teste
                <input
                  type="email"
                  required
                  value={smtpDraft.testRecipient ?? ""}
                  onChange={(event) => updateSmtpDraft("testRecipient", event.target.value)}
                  placeholder="voce@suaempresa.com.br"
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Usuário do e-mail
                <input
                  autoComplete="username"
                  value={smtpUsername}
                  onChange={(event) => setSmtpUsername(event.target.value)}
                  placeholder={
                    smtp?.hasCredential ? "Deixe vazio para manter o atual" : "Seu e-mail de acesso"
                  }
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Senha do e-mail
                <input
                  type="password"
                  autoComplete="new-password"
                  value={smtpPassword}
                  onChange={(event) => setSmtpPassword(event.target.value)}
                  placeholder={
                    smtp?.hasCredential
                      ? "Deixe vazio para manter a atual"
                      : "Senha ou senha de aplicativo"
                  }
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                />
              </label>
            </div>
            <details className="rounded-md border border-[var(--brand-border)] p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Configuração avançada
              </summary>
              <p className="mt-2 text-sm text-slate-500">
                Os dados abaixo já são preenchidos quando você escolhe um provedor. Use a opção manual somente se o seu provedor indicar outra configuração.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-sm font-medium">
                  Servidor
                  <input
                    required
                    value={smtpDraft.host ?? ""}
                    onChange={(event) => updateSmtpDraft("host", event.target.value)}
                    placeholder="smtp.seudominio.com"
                    className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Porta
                  <input
                    type="number"
                    required
                    value={smtpDraft.port ?? ""}
                    onChange={(event) => updateSmtpDraft("port", event.target.value)}
                    className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Segurança
                  <select
                    value={smtpDraft.security ?? "starttls"}
                    onChange={(event) => updateSmtpDraft("security", event.target.value)}
                    className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                  >
                    <option value="starttls">Conexão segura</option>
                    <option value="ssl">SSL</option>
                  </select>
                </label>
              </div>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" icon={<ShieldCheck size={16} />}>
                Salvar e-mail
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!smtp?.hasCredential}
                onClick={() => void test("smtp")}
                icon={<CheckCircle2 size={16} />}
              >
                Enviar teste
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {otherCards.map((card) => {
          const item = items.find((entry) => entry.provider === card.provider),
            Icon = card.icon;
          return (
            <Card key={card.provider}>
              <CardContent>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-md bg-[var(--brand-surface)] text-[var(--brand-primary)]">
                      <Icon size={20} />
                    </span>
                    <div>
                      <h2 className="font-semibold">{card.title}</h2>
                      <p className="mt-1 text-sm text-slate-500">{card.description}</p>
                    </div>
                  </div>
                  <Status item={item} />
                </div>
                <form
                  className="mt-5 grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save(card.provider, event.currentTarget);
                  }}
                >
                  {card.fields.map(([key, label, placeholder]) => (
                    <label className="grid gap-1 text-sm font-medium" key={key}>
                      {label}
                      <input
                        name={key}
                        defaultValue={item?.settings[key] ?? ""}
                        placeholder={placeholder}
                        className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                      />
                    </label>
                  ))}
                  <label className="grid gap-1 text-sm font-medium">
                    Chave de acesso
                    <input
                      name="secret"
                      type="password"
                      value={secret[card.provider] ?? ""}
                      onChange={(event) =>
                        setSecret({ ...secret, [card.provider]: event.target.value })
                      }
                      placeholder={item?.hasCredential ? "Já protegida" : "Informe para salvar"}
                      className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" icon={<ShieldCheck size={16} />}>
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!item?.hasCredential}
                      onClick={() => void test(card.provider)}
                      icon={<CheckCircle2 size={16} />}
                    >
                      Testar conexão
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardContent className="grid gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--brand-secondary)]">
              Escopo por loja
            </p>
            <h2 className="mt-1 font-semibold text-[var(--brand-primary)]">
              Controle em quais filiais cada integração pode operar
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              A configuração principal continua protegida no nível da empresa. Aqui você apenas permite ou bloqueia o uso por loja, evitando que uma filial use uma integração fora do processo definido.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
            <label className="grid gap-1 text-sm font-medium">
              Loja
              <select value={overrideBranchId} onChange={(event) => setOverrideBranchId(event.target.value)} className="h-10 rounded-md border border-[var(--brand-border)] px-3">
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Serviço
              <select value={overrideProvider} onChange={(event) => setOverrideProvider(event.target.value as Provider)} className="h-10 rounded-md border border-[var(--brand-border)] px-3">
                <option value="smtp">E-mail da empresa</option>
                <option value="asaas_business">Recebimentos Asaas</option>
                <option value="whatsapp_meta">WhatsApp oficial</option>
                <option value="fiscal">Fiscal</option>
              </select>
            </label>
            <label className="flex h-10 items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={overrideEnabled} onChange={(event) => setOverrideEnabled(event.target.checked)} />
              Permitida
            </label>
            <Button type="button" onClick={() => void saveBranchOverride()}>Salvar para a loja</Button>
          </div>
          {overrides.length ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {overrides.map((item) => (
                <div key={`${item.branchId}-${item.provider}`} className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 text-sm">
                  <strong className="block text-[var(--brand-primary)]">{item.branchName}</strong>
                  <span className="text-slate-500">{item.provider.replace("_", " ")}</span>
                  <span className={`mt-2 block text-xs font-medium ${item.enabled ? "text-emerald-700" : "text-rose-700"}`}>{item.enabled ? "Uso permitido" : "Uso bloqueado"}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Todas as filiais seguem a configuração padrão da empresa.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
