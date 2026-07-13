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

type Provider = "asaas_business" | "smtp" | "whatsapp_meta" | "fiscal";
type Integration = {
  provider: Provider;
  status: string;
  settings: Record<string, string>;
  hasCredential: boolean;
  updatedAt?: string;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [secret, setSecret] = useState<Record<string, string>>({});
  async function load() {
    try {
      setItems((await apiFetch<{ data: Integration[] }>("/integrations")).data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao carregar integrações.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
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
  const smtp = items.find((item) => item.provider === "smtp");
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
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void save("smtp", event.currentTarget);
            }}
          >
            <label className="grid gap-1 text-sm font-medium">
              Seu provedor de e-mail
              <select
                name="providerName"
                defaultValue={smtp?.settings.providerName ?? "locaweb"}
                className="h-10 rounded-md border border-[var(--brand-border)] px-3"
              >
                <option value="locaweb">Locaweb</option>
                <option value="google">Google Workspace</option>
                <option value="zoho">Zoho Mail</option>
                <option value="hostinger">Hostinger</option>
                <option value="other">Outro provedor</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                E-mail que envia mensagens
                <input
                  name="from"
                  type="email"
                  required
                  defaultValue={smtp?.settings.from ?? ""}
                  placeholder="contato@suaempresa.com.br"
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                E-mail para receber o teste
                <input
                  name="testRecipient"
                  type="email"
                  required
                  defaultValue={smtp?.settings.testRecipient ?? ""}
                  placeholder="voce@suaempresa.com.br"
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Usuário do e-mail
                <input
                  name="username"
                  autoComplete="username"
                  placeholder={
                    smtp?.hasCredential ? "Deixe vazio para manter o atual" : "Seu e-mail de acesso"
                  }
                  className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Senha do e-mail
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
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
                Use os dados fornecidos pelo seu provedor de e-mail.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-sm font-medium">
                  Servidor
                  <input
                    name="host"
                    required
                    defaultValue={smtp?.settings.host ?? ""}
                    placeholder="smtp.seudominio.com"
                    className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Porta
                  <input
                    name="port"
                    type="number"
                    required
                    defaultValue={smtp?.settings.port ?? "587"}
                    className="h-10 rounded-md border border-[var(--brand-border)] px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Segurança
                  <select
                    name="security"
                    defaultValue={smtp?.settings.security ?? "starttls"}
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
    </div>
  );
}
