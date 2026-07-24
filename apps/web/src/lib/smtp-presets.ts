export type SmtpSecurity = "starttls" | "ssl";

export type SmtpPreset = {
  id: "locaweb" | "microsoft_365" | "google_workspace" | "zoho" | "hostinger" | "manual";
  label: string;
  description: string;
  host: string;
  port: string;
  security: SmtpSecurity;
};

export const smtpPresets: SmtpPreset[] = [
  {
    id: "locaweb",
    label: "Locaweb",
    description: "Configuração segura recomendada para e-mail Locaweb.",
    host: "smtp.locaweb.com.br",
    port: "587",
    security: "starttls",
  },
  {
    id: "microsoft_365",
    label: "Microsoft 365",
    description: "Para contas Outlook e Microsoft 365 da empresa.",
    host: "smtp.office365.com",
    port: "587",
    security: "starttls",
  },
  {
    id: "google_workspace",
    label: "Google Workspace",
    description: "Use uma senha de aplicativo criada na conta Google.",
    host: "smtp.gmail.com",
    port: "587",
    security: "starttls",
  },
  {
    id: "zoho",
    label: "Zoho Mail",
    description: "Para contas empresariais hospedadas na Zoho.",
    host: "smtp.zoho.com",
    port: "587",
    security: "starttls",
  },
  {
    id: "hostinger",
    label: "Hostinger",
    description: "Configuração SSL recomendada para e-mail Hostinger.",
    host: "smtp.hostinger.com",
    port: "465",
    security: "ssl",
  },
  {
    id: "manual",
    label: "Configurar manualmente",
    description: "Use os dados enviados pelo seu provedor de e-mail.",
    host: "",
    port: "",
    security: "starttls",
  },
];

export const smtpPresetById = Object.fromEntries(
  smtpPresets.map((preset) => [preset.id, preset]),
) as Record<SmtpPreset["id"], SmtpPreset>;

export function applySmtpPreset(
  presetId: SmtpPreset["id"],
  current: Record<string, string>,
): Record<string, string> {
  const preset = smtpPresetById[presetId];
  return {
    ...current,
    providerName: preset.id,
    host: preset.host,
    port: preset.port,
    security: preset.security,
  };
}
