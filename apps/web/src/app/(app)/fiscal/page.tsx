"use client";

import { Badge, Button, Card, CardContent, EmptyState, PageHeader } from "@sgc/ui";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Download,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch, downloadApiFile, getTenantId } from "../../../lib/api";

type Branch = { id: string; name: string };
type Settings = {
  provider: "focus_nfe" | "spedy";
  environment: "homologation" | "production";
  status: string;
  documentMode: "nfce" | "nfe" | "both";
  taxRegime: "simples_nacional" | "simples_excesso" | "regime_normal";
  legalName: string;
  tradeName: string;
  taxId: string;
  stateRegistration: string;
  municipalRegistration: string;
  state: string;
  cityCode: string;
  addressLine: string;
  addressNumber: string;
  district: string;
  postalCode: string;
  cscIdentifier: string;
  nfceSeries: number;
  nextNfceNumber: number;
  nfeSeries: number;
  nextNfeNumber: number;
  contingencyEnabled: boolean;
  certificateMode: "provider_managed" | "orien_vault";
  certificateExpiresAt: string;
  accountantReviewStatus: string;
  homologationStatus: string;
  homologationApprovedAt?: string | null;
  productionRequestedAt?: string | null;
  productionApprovedAt?: string | null;
  productionRevokedAt?: string | null;
};
type Overview = {
  branch: Branch;
  settings: Settings;
  credentials: { hasCertificate: boolean; hasCsc: boolean; hasProviderToken: boolean };
  webhook: { configured: boolean; tokenLast4?: string | null; configuredAt?: string | null; url: string };
};
type Readiness = {
  integrationConfigured: boolean;
  missingSettings: string[];
  products: {
    total: number;
    technicallyReady: number;
    reviewed: number;
    pending: Array<{ id: string; name: string; missing: string[] }>;
    reviewQueue: Array<{ id: string; name: string; review_status: string }>;
  };
  accountantReviewStatus: string;
  canIssueHomologation: boolean;
  canActivateProduction: boolean;
  homologation: { status: string; authorizedDocuments: number; approvedAt?: string | null };
  production: {
    requestedAt?: string | null;
    approvedAt?: string | null;
    revokedAt?: string | null;
    active: boolean;
  };
};
type FiscalDocument = {
  id: string;
  saleId: string;
  branchName: string;
  documentType: string;
  status: string;
  reference: string;
  accessKey?: string | null;
  protocol?: string | null;
  rejectionCode?: string | null;
  rejectionReason?: string | null;
  attemptCount: number;
  contingency: boolean;
  createdAt: string;
  artifacts?: Record<string, string>;
};
type ContingencyDocument = {
  id: string;
  saleId: string;
  branchName: string;
  documentType: string;
  status: string;
  reference: string;
  attemptCount: number;
  deadlineAt?: string | null;
  syncedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
};
type NumberVoid = {
  id: string;
  branchName: string;
  series: number;
  numberStart: number;
  numberEnd: number;
  justification: string;
  status: string;
  protocol?: string | null;
  providerMessage?: string | null;
  requestedAt: string;
};

export default function FiscalPage() {
  const searchParams = useSearchParams();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [contingency, setContingency] = useState<ContingencyDocument[]>([]);
  const [numberVoids, setNumberVoids] = useState<NumberVoid[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [webhookSecret, setWebhookSecret] = useState<{
    url: string;
    authorizationHeader: string;
    authorization: string;
  } | null>(null);
  const [granted, setGranted] = useState<string[]>([]);

  useEffect(() => {
    const branchFromUrl = searchParams.get("branchId");
    Promise.all([
      apiFetch<{ data: Branch[] }>("/branches?page=1&pageSize=100"),
      apiFetch<{ memberships: Array<{ tenantId: string; permissions: string[] }> }>("/me"),
    ])
      .then(([result, me]) => {
        setBranches(result.data);
        setBranchId((current) =>
          current || result.data.find((branch) => branch.id === branchFromUrl)?.id || result.data[0]?.id || "",
        );
        setGranted(me.memberships.find((item) => item.tenantId === getTenantId())?.permissions ?? []);
      })
      .catch((err) => setError(message(err)))
      .finally(() => setLoading(false));
  }, [searchParams]);

  useEffect(() => {
    if (branchId) void loadBranch(branchId);
  }, [branchId]);

  async function loadBranch(id: string) {
    setLoading(true);
    try {
      const [settings, currentReadiness, currentDocuments, currentContingency, currentNumberVoids] = await Promise.all([
        apiFetch<Overview>(`/fiscal/branches/${id}/settings`),
        apiFetch<Readiness>(`/fiscal/branches/${id}/readiness`),
        apiFetch<{ data: FiscalDocument[] }>(`/fiscal/documents?branchId=${id}&page=1&pageSize=50`),
        apiFetch<{ data: ContingencyDocument[] }>(`/fiscal/contingency?branchId=${id}`),
        apiFetch<{ data: NumberVoid[] }>(`/fiscal/number-voids?branchId=${id}`),
      ]);
      setOverview(settings);
      setReadiness(currentReadiness);
      setDocuments(currentDocuments.data);
      setContingency(currentContingency.data);
      setNumberVoids(currentNumberVoids.data);
      setWebhookSecret(null);
      setError(null);
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      provider: form.get("provider"),
      environment: "homologation",
      documentMode: form.get("documentMode"),
      taxRegime: form.get("taxRegime"),
      legalName: form.get("legalName"),
      tradeName: form.get("tradeName"),
      taxId: form.get("taxId"),
      stateRegistration: form.get("stateRegistration"),
      municipalRegistration: optional(form, "municipalRegistration"),
      state: form.get("state"),
      cityCode: form.get("cityCode"),
      addressLine: form.get("addressLine"),
      addressNumber: form.get("addressNumber"),
      district: form.get("district"),
      postalCode: form.get("postalCode"),
      cscIdentifier: optional(form, "cscIdentifier"),
      nfceSeries: Number(form.get("nfceSeries")),
      nextNfceNumber: Number(form.get("nextNfceNumber")),
      nfeSeries: Number(form.get("nfeSeries")),
      nextNfeNumber: Number(form.get("nextNfeNumber")),
      contingencyEnabled: form.get("contingencyEnabled") === "on",
      certificateMode: form.get("certificateMode"),
      certificateExpiresAt: optional(form, "certificateExpiresAt"),
    };
    await act(async () => {
      await apiFetch(`/fiscal/branches/${branchId}/settings`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setNotice("Configuração fiscal salva. Uma nova aprovação contábil será necessária.");
    });
  }

  async function saveCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("certificate") as File;
    const certificateBase64 = file?.size ? await fileToBase64(file) : undefined;
    await act(async () => {
      await apiFetch(`/fiscal/branches/${branchId}/credentials`, {
        method: "PUT",
        body: JSON.stringify({
          certificateBase64,
          certificatePassword: optional(form, "certificatePassword"),
          cscToken: optional(form, "cscToken"),
        }),
      });
      setNotice("Credencial fiscal atualizada no cofre protegido.");
      event.currentTarget.reset();
    });
  }

  async function reviewProduct(productId: string, status: "approved" | "rejected") {
    const note =
      status === "rejected"
        ? window.prompt("Descreva o ajuste necessário:")
        : "Cadastro conferido para homologação.";
    if (status === "rejected" && !note) return;
    await act(async () => {
      await apiFetch(`/fiscal/products/${productId}/review`, {
        method: "POST",
        body: JSON.stringify({ status, note }),
      });
      setNotice(
        status === "approved"
          ? "Produto aprovado para homologação."
          : "Produto devolvido para correção.",
      );
    });
  }

  async function reviewBranch(status: "approved" | "rejected") {
    const note =
      status === "rejected"
        ? window.prompt("Descreva o ajuste necessário:")
        : "Configuração da loja conferida.";
    if (status === "rejected" && !note) return;
    await act(async () => {
      await apiFetch(`/fiscal/branches/${branchId}/review`, {
        method: "POST",
        body: JSON.stringify({ status, note }),
      });
      setNotice(
        status === "approved"
          ? "Configuração fiscal aprovada."
          : "Configuração devolvida para correção.",
      );
    });
  }

  async function documentAction(id: string, action: "sync" | "retry" | "cancel") {
    let body = "{}";
    if (action === "cancel") {
      const justification = window.prompt(
        "Informe a justificativa do cancelamento (mínimo 15 caracteres):",
      );
      if (!justification) return;
      body = JSON.stringify({ justification });
    }
    await act(async () => {
      await apiFetch(`/fiscal/documents/${id}/${action}`, { method: "POST", body });
      setNotice(action === "cancel" ? "Cancelamento processado." : "Documento fiscal atualizado.");
    });
  }

  async function rotateWebhookToken() {
    await act(async () => {
      const result = await apiFetch<{
        url: string;
        authorizationHeader: string;
        authorization: string;
      }>(`/fiscal/branches/${branchId}/webhook-token`, { method: "POST", body: "{}" });
      setWebhookSecret(result);
      setOverview((current) =>
        current
          ? {
              ...current,
              webhook: {
                ...current.webhook,
                configured: true,
                tokenLast4: result.authorization.slice(-4),
                configuredAt: new Date().toISOString(),
              },
            }
          : current,
      );
      setNotice("Webhook renovado. Copie o token agora; ele não será exibido novamente.");
    }, false);
  }

  async function productionAction(action: "request" | "approve" | "revoke") {
    const labels = {
      request: "Solicitar ativação em produção",
      approve: "Aprovar ativação em produção",
      revoke: "Suspender emissão em produção",
    };
    const note = window.prompt(`${labels[action]}. Registre o motivo ou a evidência:`);
    if (!note) return;
    await act(async () => {
      await apiFetch(`/fiscal/branches/${branchId}/production/${action}`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      setNotice(`${labels[action]} registrada com sucesso.`);
    });
  }

  async function downloadArtifact(document: FiscalDocument, kind: string) {
    await act(async () => {
      const extension = kind === "danfe" ? "pdf" : "xml";
      await downloadApiFile(
        `/fiscal/documents/${document.id}/artifacts/${kind}`,
        `${kind}-${document.reference}.${extension}`,
      );
    }, false);
  }

  async function voidNumberRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act(async () => {
      const justification = form.get("justification");
      await apiFetch(`/fiscal/branches/${branchId}/number-voids`, {
        method: "POST",
        body: JSON.stringify({
          series: Number(form.get("series")),
          numberStart: Number(form.get("numberStart")),
          numberEnd: Number(form.get("numberEnd")),
          justification: typeof justification === "string" ? justification : "",
        }),
      });
      setNotice("Inutilização enviada ao provedor fiscal e registrada para auditoria.");
      event.currentTarget.reset();
    });
  }

  async function act(callback: () => Promise<void>, reload = true) {
    try {
      setError(null);
      await callback();
      if (reload) await loadBranch(branchId);
    } catch (err) {
      setError(message(err));
    }
  }

  const settings = overview?.settings;
  const canConfigure = granted.includes("fiscal.configure");
  const canReview = granted.includes("fiscal.review");
  const canActivate = granted.includes("fiscal.activate");
  const canCancel = granted.includes("fiscal.cancel");
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Central fiscal"
        description="Prepare cada loja, revise produtos e acompanhe NFC-e em homologação antes de ativar a produção."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={16} />}
            onClick={() => void loadBranch(branchId)}
            disabled={!branchId || loading}
          >
            Atualizar
          </Button>
        }
      />
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      <Card>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm font-medium">
            Loja
            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className="h-11 rounded-md border border-[var(--brand-border)] bg-white px-3"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <Badge className="h-fit">Ambiente de homologação · sem valor fiscal</Badge>
        </CardContent>
      </Card>

      {readiness ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Integração Focus"
            value={readiness.integrationConfigured ? "Conectada" : "Pendente"}
            ok={readiness.integrationConfigured}
          />
          <Metric
            label="Dados da loja"
            value={
              readiness.missingSettings.length
                ? `${readiness.missingSettings.length} pendência(s)`
                : "Completos"
            }
            ok={!readiness.missingSettings.length}
          />
          <Metric
            label="Produtos aptos"
            value={`${readiness.products.technicallyReady}/${readiness.products.total}`}
            ok={readiness.products.technicallyReady === readiness.products.total}
          />
          <Metric
            label="Revisão contábil"
            value={statusLabel(readiness.accountantReviewStatus)}
            ok={readiness.accountantReviewStatus === "approved"}
          />
        </section>
      ) : null}

      {readiness ? (
        <Card>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-secondary)]">
                Liberação controlada
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--brand-primary)]">
                Homologação e produção
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {readiness.production.active
                  ? "Emissão em produção ativa com dupla aprovação registrada."
                  : `${readiness.homologation.authorizedDocuments} documento(s) autorizado(s) em homologação. A ativação exige revisão contábil e aprovação de outra pessoa.`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>Homologação: {statusLabel(readiness.homologation.status)}</Badge>
                <Badge>
                  Produção: {readiness.production.active ? "Ativa" : readiness.production.requestedAt ? "Aguardando aprovação" : "Bloqueada"}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {canConfigure && !readiness.production.requestedAt && !readiness.production.active ? (
                <Button
                  onClick={() => void productionAction("request")}
                  disabled={!readiness.canActivateProduction}
                >
                  Solicitar produção
                </Button>
              ) : null}
              {canActivate && readiness.production.requestedAt && !readiness.production.active ? (
                <Button icon={<ShieldCheck size={16} />} onClick={() => void productionAction("approve")}>
                  Segunda aprovação
                </Button>
              ) : null}
              {canActivate && readiness.production.active ? (
                <Button variant="danger" onClick={() => void productionAction("revoke")}>
                  Suspender produção
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="grid gap-3 lg:grid-cols-3">
          {[
            ["1", "Corrija pendências", "Complete loja, produto, NCM, CFOP, CST/CSOSN e revisão contábil."],
            ["2", "Emita pela venda", "Na tela Vendas, use Emitir NFC-e. A Orien valida antes de transmitir."],
            ["3", "Acompanhe retorno", "Autorização, rejeição, DANFE, XML, contingência e cancelamento ficam nesta central."],
          ].map(([step, title, detail]) => (
            <div key={step} className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--brand-primary)] text-sm font-bold text-white">{step}</span>
              <h2 className="mt-3 font-semibold text-[var(--brand-primary)]">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">{detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {settings ? (
        <Card>
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--brand-primary)]">
                  Configuração da loja
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Produção fica bloqueada até a homologação e a conferência do contador.
                </p>
              </div>
              <Badge>{statusLabel(settings.accountantReviewStatus)}</Badge>
            </div>
            <form
              key={`${branchId}-${settings.status}`}
              className="mt-5 grid gap-5"
              onSubmit={(event) => void saveSettings(event)}
            >
              <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <legend className="col-span-full mb-2 font-medium">Emissão</legend>
                <FieldSelect
                  name="provider"
                  label="Provedor"
                  value={settings.provider}
                  options={[
                    ["focus_nfe", "Focus NFe"],
                    ["spedy", "Spedy (em avaliação)"],
                  ]}
                />
                <FieldSelect
                  name="documentMode"
                  label="Documentos"
                  value={settings.documentMode}
                  options={[
                    ["nfce", "NFC-e"],
                    ["nfe", "NF-e"],
                    ["both", "NFC-e e NF-e"],
                  ]}
                />
                <FieldSelect
                  name="taxRegime"
                  label="Regime tributário"
                  value={settings.taxRegime}
                  options={[
                    ["simples_nacional", "Simples Nacional"],
                    ["simples_excesso", "Simples com excesso"],
                    ["regime_normal", "Regime normal"],
                  ]}
                />
                <FieldSelect
                  name="certificateMode"
                  label="Certificado"
                  value={settings.certificateMode}
                  options={[
                    ["provider_managed", "Gerenciado pelo provedor"],
                    ["orien_vault", "Cofre Orien"],
                  ]}
                />
              </fieldset>
              <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <legend className="col-span-full mb-2 font-medium">
                  Empresa e endereço fiscal
                </legend>
                <Field
                  name="legalName"
                  label="Razão social"
                  value={settings.legalName}
                  required
                  wide
                />
                <Field
                  name="tradeName"
                  label="Nome fantasia"
                  value={settings.tradeName}
                  required
                  wide
                />
                <Field name="taxId" label="CNPJ" value={settings.taxId} required />
                <Field
                  name="stateRegistration"
                  label="Inscrição estadual"
                  value={settings.stateRegistration}
                  required
                />
                <Field
                  name="municipalRegistration"
                  label="Inscrição municipal"
                  value={settings.municipalRegistration}
                />
                <Field name="state" label="UF" value={settings.state} required maxLength={2} />
                <Field name="cityCode" label="Código IBGE" value={settings.cityCode} required />
                <Field name="postalCode" label="CEP" value={settings.postalCode} required />
                <Field
                  name="addressLine"
                  label="Logradouro"
                  value={settings.addressLine}
                  required
                  wide
                />
                <Field
                  name="addressNumber"
                  label="Número"
                  value={settings.addressNumber}
                  required
                />
                <Field name="district" label="Bairro" value={settings.district} required />
              </fieldset>
              <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <legend className="col-span-full mb-2 font-medium">Numeração e contingência</legend>
                <Field
                  name="nfceSeries"
                  label="Série NFC-e"
                  value={settings.nfceSeries}
                  type="number"
                  required
                />
                <Field
                  name="nextNfceNumber"
                  label="Próxima NFC-e"
                  value={settings.nextNfceNumber}
                  type="number"
                  required
                />
                <Field
                  name="nfeSeries"
                  label="Série NF-e"
                  value={settings.nfeSeries}
                  type="number"
                  required
                />
                <Field
                  name="nextNfeNumber"
                  label="Próxima NF-e"
                  value={settings.nextNfeNumber}
                  type="number"
                  required
                />
                <Field
                  name="cscIdentifier"
                  label="Identificador do CSC"
                  value={settings.cscIdentifier}
                />
                <Field
                  name="certificateExpiresAt"
                  label="Validade do A1"
                  value={settings.certificateExpiresAt?.slice(0, 16)}
                  type="datetime-local"
                />
                <label className="flex items-center gap-2 self-end rounded-md border border-[var(--brand-border)] p-3 text-sm">
                  <input
                    name="contingencyEnabled"
                    type="checkbox"
                    defaultChecked={settings.contingencyEnabled}
                  />{" "}
                  Permitir contingência offline
                </label>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                {canConfigure ? <Button type="submit" icon={<Save size={16} />}>
                  Salvar configuração
                </Button> : null}
                {canReview ? <Button
                  type="button"
                  variant="secondary"
                  icon={<CheckCircle2 size={16} />}
                  onClick={() => void reviewBranch("approved")}
                >
                  Aprovar conferência
                </Button> : null}
                {canReview ? <Button
                  type="button"
                  variant="secondary"
                  icon={<XCircle size={16} />}
                  onClick={() => void reviewBranch("rejected")}
                >
                  Solicitar correção
                </Button> : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {canConfigure ? <Card>
        <CardContent>
          <h2 className="text-lg font-semibold text-[var(--brand-primary)]">
            Credenciais protegidas
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            O token da Focus fica em Integrações. Certificado e CSC nunca são devolvidos ao
            navegador.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Badge>
              Token: {overview?.credentials.hasProviderToken ? "cadastrado" : "pendente"}
            </Badge>
            <Badge>
              A1: {overview?.credentials.hasCertificate ? "protegido" : "gerenciado pelo provedor"}
            </Badge>
            <Badge>CSC: {overview?.credentials.hasCsc ? "protegido" : "pendente"}</Badge>
          </div>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => void saveCredentials(event)}
          >
            <label className="grid gap-1 text-sm font-medium">
              Certificado A1 (.pfx)
              <input
                name="certificate"
                type="file"
                accept=".pfx,.p12,application/x-pkcs12"
                className="min-h-11 rounded-md border border-[var(--brand-border)] bg-white p-2"
              />
            </label>
            <Field
              name="certificatePassword"
              label="Senha do certificado"
              value=""
              type="password"
            />
            <Field name="cscToken" label="CSC da NFC-e" value="" type="password" wide />
            <div className="flex flex-wrap items-end gap-2">
              <Button type="submit" icon={<ShieldCheck size={16} />}>
                Guardar credencial
              </Button>
              <Link
                href="/integrations"
                className="inline-flex h-10 items-center rounded-md border border-[var(--brand-border)] px-4 text-sm font-medium"
              >
                Configurar token Focus
              </Link>
            </div>
          </form>
        </CardContent>
      </Card> : null}

      {canConfigure ? <Card>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--brand-primary)]">Retorno automático da Focus</h2>
              <p className="mt-1 text-sm text-slate-500">
                Configure esta URL como webhook na Focus para receber autorizações e rejeições sem atualização manual.
              </p>
            </div>
            <Badge>{overview?.webhook.configured ? `Ativo · final ${overview.webhook.tokenLast4}` : "Pendente"}</Badge>
          </div>
          <div className="mt-4 grid gap-3 rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">URL do webhook</span>
              <code className="mt-1 block break-all text-sm">{overview?.webhook.url}</code>
            </div>
            {webhookSecret ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <strong>Token exibido uma única vez</strong>
                <p className="mt-1 break-all">Cabeçalho: {webhookSecret.authorizationHeader}</p>
                <code className="mt-1 block break-all">{webhookSecret.authorization}</code>
              </div>
            ) : null}
            <div>
              <Button variant="secondary" icon={<KeyRound size={16} />} onClick={() => void rotateWebhookToken()}>
                {overview?.webhook.configured ? "Renovar token" : "Gerar token do webhook"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card> : null}

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--brand-primary)]">
                Revisão dos produtos
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Pendências técnicas são corrigidas no cadastro do produto; a aprovação fica
                registrada com usuário e horário.
              </p>
            </div>
            <Badge>
              {readiness
                ? `${readiness.products.reviewed}/${readiness.products.total} revisados`
                : "Carregando"}
            </Badge>
          </div>
          {readiness?.products.pending.length ? (
            <div className="mt-4 grid gap-2">
              {readiness.products.pending.map((product) => (
                <div
                  key={product.id}
                  className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <strong>{product.name}</strong>
                    <p className="text-xs text-amber-800">Falta: {product.missing.join(", ")}</p>
                  </div>
                  <Link
                    href={`/products?search=${encodeURIComponent(product.name)}`}
                    className="text-sm font-medium text-[var(--brand-secondary)]"
                  >
                    Corrigir produto
                  </Link>
                </div>
              ))}
            </div>
          ) : null}
          {canReview && readiness?.products.reviewQueue.length ? (
            <div className="mt-4 grid gap-2">
              {readiness.products.reviewQueue
                .filter(
                  (item) => !readiness.products.pending.some((pending) => pending.id === item.id),
                )
                .map((product) => (
                  <div
                    key={product.id}
                    className="flex flex-col gap-2 rounded-md border border-[var(--brand-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <strong>{product.name}</strong>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => void reviewProduct(product.id, "approved")}
                      >
                        Aprovar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => void reviewProduct(product.id, "rejected")}
                      >
                        Corrigir
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          ) : null}
          {readiness &&
          !readiness.products.pending.length &&
          !readiness.products.reviewQueue.length ? (
            <div className="mt-4">
              <EmptyState
                eyebrow="Cadastro fiscal"
                title="Produtos aptos e revisados."
                description="A loja está pronta para os testes de emissão em homologação."
                icon={<FileCheck2 size={20} />}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--brand-primary)]">
                  Contingência NFC-e
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Documentos emitidos offline precisam ser acompanhados até a autorização definitiva.
                </p>
              </div>
              <Badge>{contingency.length} em acompanhamento</Badge>
            </div>
            <div className="mt-4 grid gap-2">
              {contingency.map((document) => (
                <article key={document.id} className="rounded-md border border-[var(--brand-border)] p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{document.documentType.toUpperCase()} · venda {document.saleId.slice(0, 8)}</strong>
                    <StatusBadge status={document.status} />
                  </div>
                  <p className="mt-1 text-slate-500">
                    Loja {document.branchName} · tentativas {document.attemptCount}
                    {document.deadlineAt ? ` · prazo ${new Date(document.deadlineAt).toLocaleString("pt-BR")}` : ""}
                  </p>
                  {document.syncedAt ? (
                    <p className="mt-2 text-emerald-700">Sincronizada em {new Date(document.syncedAt).toLocaleString("pt-BR")}.</p>
                  ) : null}
                  {document.lastError ? <p className="mt-2 text-rose-700">{document.lastError}</p> : null}
                </article>
              ))}
              {!contingency.length ? (
                <EmptyState
                  eyebrow="Operação fiscal"
                  title="Nenhuma contingência aberta."
                  description="Quando uma NFC-e for emitida offline, ela aparecerá aqui até ser sincronizada."
                  icon={<ShieldCheck size={20} />}
                />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--brand-primary)]">
                  Inutilização de numeração
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Use quando uma faixa de NFC-e não puder mais ser aproveitada. A justificativa fica auditada.
                </p>
              </div>
              <Badge>{numberVoids.length} registro(s)</Badge>
            </div>
            {canCancel ? (
              <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={(event) => void voidNumberRange(event)}>
                <Field name="series" label="Série" value={settings?.nfceSeries ?? 1} type="number" required />
                <Field name="numberStart" label="Número inicial" value="" type="number" required />
                <Field name="numberEnd" label="Número final" value="" type="number" required />
                <label className="grid gap-1 text-sm font-medium sm:col-span-3">
                  Justificativa
                  <input
                    name="justification"
                    required
                    minLength={15}
                    maxLength={255}
                    placeholder="Ex.: falha técnica na emissão em contingência"
                    className="h-11 min-w-0 rounded-md border border-[var(--brand-border)] bg-white px-3"
                  />
                </label>
                <div className="sm:col-span-3">
                  <Button type="submit">Inutilizar faixa</Button>
                </div>
              </form>
            ) : null}
            <div className="mt-4 grid gap-2">
              {numberVoids.slice(0, 5).map((item) => (
                <article key={item.id} className="rounded-md border border-[var(--brand-border)] p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>Série {item.series} · {item.numberStart} a {item.numberEnd}</strong>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-1 text-slate-500">{new Date(item.requestedAt).toLocaleString("pt-BR")} · {item.justification}</p>
                  {item.protocol ? <p className="mt-1 text-slate-600">Protocolo: {item.protocol}</p> : null}
                  {item.providerMessage ? <p className="mt-1 text-slate-600">{item.providerMessage}</p> : null}
                </article>
              ))}
              {!numberVoids.length ? <p className="text-sm text-slate-500">Nenhuma inutilização registrada para esta loja.</p> : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--brand-primary)]">
                Documentos e rejeições
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Ações são idempotentes e cada mudança fica registrada na auditoria.
              </p>
            </div>
            <Badge>{documents.length} documento(s)</Badge>
          </div>
          <div className="mt-4 grid gap-3">
            {documents.map((document) => (
              <article
                key={document.id}
                className="grid gap-3 rounded-md border border-[var(--brand-border)] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>
                      {document.documentType.toUpperCase()} · venda {document.saleId.slice(0, 8)}
                    </strong>
                    <StatusBadge status={document.status} />
                    {document.contingency ? <Badge>Contingência</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(document.createdAt).toLocaleString("pt-BR")} · tentativa(s):{" "}
                    {document.attemptCount}
                  </p>
                  {document.rejectionReason ? (
                    <p className="mt-2 rounded bg-rose-50 p-2 text-sm text-rose-700">
                      {document.rejectionCode ? `${document.rejectionCode} · ` : ""}
                      {document.rejectionReason}
                    </p>
                  ) : null}
                  {document.accessKey ? (
                    <p className="mt-2 break-all text-xs text-slate-600">
                      Chave: {document.accessKey}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {document.artifacts?.xml === "ready" ? (
                    <Button variant="ghost" icon={<Download size={15} />} onClick={() => void downloadArtifact(document, "xml")}>
                      XML
                    </Button>
                  ) : null}
                  {document.artifacts?.danfe === "ready" ? (
                    <Button variant="ghost" icon={<Download size={15} />} onClick={() => void downloadArtifact(document, "danfe")}>
                      DANFE
                    </Button>
                  ) : null}
                  {document.artifacts?.cancellation_xml === "ready" ? (
                    <Button variant="ghost" icon={<Download size={15} />} onClick={() => void downloadArtifact(document, "cancellation_xml")}>
                      XML do cancelamento
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    icon={<RefreshCw size={15} />}
                    onClick={() => void documentAction(document.id, "sync")}
                  >
                    Consultar
                  </Button>
                  {["rejected", "retry_pending", "error"].includes(document.status) ? (
                    <Button
                      icon={<RotateCcw size={15} />}
                      onClick={() => void documentAction(document.id, "retry")}
                    >
                      Tentar novamente
                    </Button>
                  ) : null}
                  {document.status === "authorized" ? (
                    <Button
                      variant="danger"
                      onClick={() => void documentAction(document.id, "cancel")}
                    >
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {!loading && !documents.length ? (
            <div className="mt-4">
              <EmptyState
                eyebrow="Homologação"
                title="Nenhum documento fiscal nesta loja."
                description="As solicitações feitas no PDV e em Vendas aparecerão aqui."
                icon={<FileCheck2 size={20} />}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <strong className="mt-2 block text-xl text-[var(--brand-primary)]">{value}</strong>
        </div>
        {ok ? (
          <CheckCircle2 className="text-emerald-600" size={22} />
        ) : (
          <AlertTriangle className="text-amber-500" size={22} />
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  name,
  label,
  value,
  required,
  wide,
  type = "text",
  maxLength,
}: {
  name: string;
  label: string;
  value: string | number;
  required?: boolean;
  wide?: boolean;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label className={`grid gap-1 text-sm font-medium ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        maxLength={maxLength}
        className="h-11 min-w-0 rounded-md border border-[var(--brand-border)] bg-white px-3"
      />
    </label>
  );
}

function FieldSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: Array<[string, string]>;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="h-11 rounded-md border border-[var(--brand-border)] bg-white px-3"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    ["authorized", "processed"].includes(status)
      ? "bg-emerald-50 text-emerald-800"
      : status === "cancelled"
        ? "bg-slate-100 text-slate-700"
        : ["rejected", "error", "failed"].includes(status)
          ? "bg-rose-50 text-rose-700"
          : "bg-amber-50 text-amber-800";
  return <Badge className={tone}>{statusLabel(status)}</Badge>;
}

function statusLabel(status: string) {
  return (
    (
      {
        approved: "Aprovada",
        pending: "Pendente",
        rejected: "Rejeitada",
        authorized: "Autorizada",
        cancelled: "Cancelada",
        queued: "Na fila",
        transmitting: "Transmitindo",
        retry_pending: "Nova tentativa",
        error: "Erro",
        contingency: "Contingência",
        passed: "Concluída",
        in_progress: "Em andamento",
        failed: "Falhou",
        processed: "Processada",
        requested: "Solicitada",
      } as Record<string, string>
    )[status] ?? status
  );
}

function optional(form: FormData, name: string) {
  const entry = form.get(name);
  const value = typeof entry === "string" ? entry.trim() : "";
  return value || undefined;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação fiscal.";
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Não foi possível converter o certificado."));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o certificado."));
    reader.readAsDataURL(file);
  });
}
