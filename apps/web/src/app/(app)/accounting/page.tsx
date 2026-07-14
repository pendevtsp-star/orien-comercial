"use client";

import { Badge, Button, Card, CardContent, EmptyState, PageHeader } from "@sgc/ui";
import { Archive, CheckCircle2, Download, FileCheck2, LockKeyhole, RefreshCw, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, downloadApiFile } from "../../../lib/api";

type Branch = { id: string; name: string };
type AccountantAccess = {
  id: string;
  name: string;
  email: string;
  branchName?: string | null;
  expiresAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
};
type Overview = {
  metrics: {
    totalDocuments: number;
    authorizedDocuments: number;
    cancelledDocuments: number;
    attentionDocuments: number;
    contingencyDocuments: number;
    xmlEligibleDocuments: number;
  };
  branches: Array<{
    id: string;
    name: string;
    reviewStatus: string;
    homologationStatus: string;
    environment?: string | null;
    productionRequestedAt?: string | null;
    productionApprovedAt?: string | null;
  }>;
  products: Array<{
    id: string;
    name: string;
    sku: string;
    reviewStatus: string;
    reviewNote?: string | null;
    ncm?: string | null;
    cest?: string | null;
  }>;
  documents: Array<{
    id: string;
    branchName: string;
    documentType: string;
    status: string;
    reference: string;
    accessKey?: string | null;
    rejectionCode?: string | null;
    rejectionReason?: string | null;
    createdAt: string;
    artifacts: Record<string, string>;
  }>;
  numberVoids: Array<{
    id: string;
    branchName: string;
    series: number;
    numberStart: number;
    numberEnd: number;
    status: string;
    protocol?: string | null;
    requestedAt: string;
  }>;
};

export default function AccountingPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [closures, setClosures] = useState<Array<{ id: string; branchName?: string | null; period: string; status: string; documentCount: number; totalAmount: string; generatedAt?: string | null; closedAt?: string | null }>>([]);
  const [accountantAccesses, setAccountantAccesses] = useState<AccountantAccess[]>([]);
  const [accountantName, setAccountantName] = useState("");
  const [accountantEmail, setAccountantEmail] = useState("");
  const [accountantExpiresInDays, setAccountantExpiresInDays] = useState(30);
  const [generatedAccessUrl, setGeneratedAccessUrl] = useState("");

  useEffect(() => {
    void Promise.all([
      apiFetch<{ data: Branch[] }>("/branches?page=1&pageSize=100"),
      loadOverview(""),
      loadAccountantAccesses(),
    ])
      .then(([result]) => setBranches(result.data))
      .catch((err) => setError(message(err)))
      .finally(() => setLoading(false));
  }, []);

  async function loadOverview(selected = branchId) {
    const [result, closureResult] = await Promise.all([
      apiFetch<Overview>(`/fiscal/accounting/overview${selected ? `?branchId=${selected}` : ""}`),
      apiFetch<{ data: typeof closures }>("/fiscal/accounting/closures"),
    ]);
    setOverview(result);
    setClosures(closureResult.data);
    setError(null);
  }

  async function loadAccountantAccesses() {
    const result = await apiFetch<{ data: AccountantAccess[] }>("/fiscal/accounting/access");
    setAccountantAccesses(result.data);
  }

  async function selectBranch(value: string) {
    setBranchId(value);
    setLoading(true);
    try {
      await loadOverview(value);
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }

  async function reviewProduct(productId: string, status: "approved" | "rejected") {
    const note = window.prompt(
      status === "approved" ? "Registre a evidência da conferência:" : "Descreva a correção necessária:",
    );
    if (!note) return;
    await action(async () => {
      await apiFetch(`/fiscal/products/${productId}/review`, {
        method: "POST",
        body: JSON.stringify({ status, note }),
      });
      setNotice(status === "approved" ? "Produto aprovado." : "Produto devolvido para correção.");
    });
  }

  async function reviewBranch(id: string, status: "approved" | "rejected") {
    const note = window.prompt(
      status === "approved" ? "Registre a conferência da loja:" : "Descreva a correção necessária:",
    );
    if (!note) return;
    await action(async () => {
      await apiFetch(`/fiscal/branches/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ status, note }),
      });
      setNotice(status === "approved" ? "Loja aprovada pelo contador." : "Loja devolvida para correção.");
    });
  }

  async function action(callback: () => Promise<void>) {
    try {
      setError(null);
      await callback();
      await loadOverview();
    } catch (err) {
      setError(message(err));
    }
  }

  async function downloadPackage() {
    try {
      setError(null);
      const query = new URLSearchParams({ period });
      if (branchId) query.set("branchId", branchId);
      await downloadApiFile(`/fiscal/accounting/package?${query.toString()}`, `orien-contabilidade-${period}.zip`);
      setNotice("Pacote contábil gerado com entradas, saídas e XML disponíveis.");
      await loadOverview();
    } catch (err) { setError(message(err)); }
  }

  async function closePeriod() {
    if (!window.confirm(`Fechar a competência ${period}? O fechamento ficará registrado na auditoria.`)) return;
    await action(async () => {
      await apiFetch("/fiscal/accounting/close", { method: "POST", body: JSON.stringify({ period, branchId: branchId || undefined }) });
      setNotice("Competência fechada com sucesso.");
    });
  }

  async function createAccountantAccess() {
    if (!accountantName.trim() || !accountantEmail.trim()) {
      setError("Informe nome e e-mail do contador para gerar o acesso externo.");
      return;
    }
    await action(async () => {
      const result = await apiFetch<{ id: string; url: string; expiresAt: string }>("/fiscal/accounting/access", {
        method: "POST",
        body: JSON.stringify({
          name: accountantName,
          email: accountantEmail,
          branchId: branchId || undefined,
          expiresInDays: accountantExpiresInDays,
        }),
      });
      setGeneratedAccessUrl(result.url);
      setAccountantName("");
      setAccountantEmail("");
      setNotice("Acesso externo do contador gerado. Envie o link apenas para o profissional autorizado.");
      await loadAccountantAccesses();
    });
  }

  async function revokeAccountantAccess(id: string) {
    if (!window.confirm("Revogar este acesso externo do contador?")) return;
    await action(async () => {
      await apiFetch(`/fiscal/accounting/access/${id}/revoke`, { method: "POST", body: "{}" });
      setNotice("Acesso externo revogado.");
      await loadAccountantAccesses();
    });
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Espaço do contador"
        description="Revise cadastros tributários, acompanhe rejeições e exporte documentos fiscais por loja."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void loadOverview()} disabled={loading}>
              Atualizar
            </Button>
            <Button icon={<Download size={16} />} onClick={() => void downloadApiFile(`/fiscal/accounting/export${branchId ? `?branchId=${branchId}` : ""}`, "orien-fiscal-contabilidade.csv")}>
              Exportar conferência
            </Button>
          </div>
        }
      />
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {notice ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}

      <Card>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
            <label className="grid gap-1 text-sm font-medium">Loja analisada<select value={branchId} onChange={(event) => void selectBranch(event.target.value)} className="h-11 rounded-md border border-[var(--brand-border)] bg-white px-3"><option value="">Todas as lojas</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Competência<input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="h-11 rounded-md border border-[var(--brand-border)] bg-white px-3" /></label>
            <div className="flex flex-wrap gap-2"><Button icon={<Archive size={16} />} onClick={() => void downloadPackage()}>Gerar pacote mensal</Button><Button variant="secondary" icon={<LockKeyhole size={16} />} onClick={() => void closePeriod()}>Fechar competência</Button></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--brand-primary)]">Portal externo do contador</h2>
              <p className="text-sm text-slate-500">Gere um link temporário para o contador consultar documentos, financeiro e estoque baixo sem acessar o painel da loja.</p>
            </div>
            <Badge>{accountantAccesses.filter((item) => !item.revokedAt).length} ativo(s)</Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px_auto] lg:items-end">
            <label className="grid gap-1 text-sm font-medium">
              Nome do contador
              <input value={accountantName} onChange={(event) => setAccountantName(event.target.value)} className="h-11 rounded-md border border-[var(--brand-border)] bg-white px-3" placeholder="Ex.: Escritório Contábil" />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              E-mail
              <input type="email" value={accountantEmail} onChange={(event) => setAccountantEmail(event.target.value)} className="h-11 rounded-md border border-[var(--brand-border)] bg-white px-3" placeholder="contador@empresa.com.br" />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Validade
              <select value={accountantExpiresInDays} onChange={(event) => setAccountantExpiresInDays(Number(event.target.value))} className="h-11 rounded-md border border-[var(--brand-border)] bg-white px-3">
                <option value={7}>7 dias</option>
                <option value={30}>30 dias</option>
                <option value={90}>90 dias</option>
                <option value={180}>180 dias</option>
              </select>
            </label>
            <Button onClick={() => void createAccountantAccess()}>Gerar acesso</Button>
          </div>
          {generatedAccessUrl ? (
            <div className="grid gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
              <strong>Link gerado</strong>
              <p className="break-all">{generatedAccessUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(generatedAccessUrl)}>Copiar link</Button>
                <Button variant="ghost" onClick={() => setGeneratedAccessUrl("")}>Ocultar</Button>
              </div>
            </div>
          ) : null}
          <div className="grid gap-2">
            {accountantAccesses.map((access) => (
              <div key={access.id} className="grid gap-2 rounded-md border border-[var(--brand-border)] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                  <strong>{access.name}</strong>
                  <p className="text-sm text-slate-500">{access.email} · {access.branchName || "Todas as lojas"} · expira em {new Date(access.expiresAt).toLocaleDateString("pt-BR")}</p>
                  <p className="text-xs text-slate-500">Último acesso: {access.lastUsedAt ? new Date(access.lastUsedAt).toLocaleString("pt-BR") : "ainda não utilizado"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{access.revokedAt ? "Revogado" : "Ativo"}</Badge>
                  {!access.revokedAt ? <Button variant="ghost" onClick={() => void revokeAccountantAccess(access.id)}>Revogar</Button> : null}
                </div>
              </div>
            ))}
            {!accountantAccesses.length ? <p className="text-sm text-slate-500">Nenhum acesso externo gerado ainda.</p> : null}
          </div>
        </CardContent>
      </Card>

      {overview ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Documentos" value={overview.metrics.totalDocuments} />
          <Metric label="Autorizados" value={overview.metrics.authorizedDocuments} ok />
          <Metric label="Cancelados" value={overview.metrics.cancelledDocuments} />
          <Metric label="Atenção" value={overview.metrics.attentionDocuments} danger />
          <Metric label="Contingência" value={overview.metrics.contingencyDocuments} warning />
        </section>
      ) : null}

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold text-[var(--brand-primary)]">Fechamentos recentes</h2><p className="text-sm text-slate-500">Histórico de pacotes entregues e competências encerradas.</p></div><Badge>{closures.length} registro(s)</Badge></div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{closures.map((closure) => <div key={closure.id} className="rounded-md border border-[var(--brand-border)] p-3"><div className="flex items-center justify-between gap-2"><strong>{closure.period}</strong><Badge>{closure.status === "closed" ? "Fechada" : "Pacote gerado"}</Badge></div><p className="mt-2 text-sm text-slate-500">{closure.branchName || "Todas as lojas"} · {closure.documentCount} documento(s)</p><p className="mt-1 font-medium">{Number(closure.totalAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em entradas</p></div>)}</div>
          {!closures.length ? <p className="mt-4 text-sm text-slate-500">Nenhuma competência foi gerada ainda.</p> : null}
        </CardContent>
      </Card>

      <section className="grid gap-3 lg:grid-cols-2">
        {overview?.branches.map((branch) => (
          <Card key={branch.id}>
            <CardContent className="grid gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h2 className="font-semibold text-[var(--brand-primary)]">{branch.name}</h2><p className="text-sm text-slate-500">Ambiente: {branch.environment === "production" ? "produção" : "homologação"}</p></div>
                <Badge>{label(branch.reviewStatus)}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={<CheckCircle2 size={15} />} onClick={() => void reviewBranch(branch.id, "approved")}>Aprovar</Button>
                <Button variant="ghost" icon={<XCircle size={15} />} onClick={() => void reviewBranch(branch.id, "rejected")}>Solicitar correção</Button>
                <Link href={`/fiscal?branchId=${branch.id}`} className="inline-flex h-10 items-center rounded-md border border-[var(--brand-border)] px-4 text-sm font-medium">Abrir Central Fiscal</Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardContent>
          <h2 className="text-lg font-semibold text-[var(--brand-primary)]">Produtos aguardando revisão</h2>
          <div className="mt-4 grid gap-2">
            {overview?.products.map((product) => (
              <div key={product.id} className="grid gap-3 rounded-md border border-[var(--brand-border)] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div><strong>{product.name}</strong><p className="text-xs text-slate-500">SKU {product.sku} · NCM {product.ncm || "pendente"} · CEST {product.cest || "não informado"}</p></div>
                <div className="flex gap-2"><Button variant="secondary" onClick={() => void reviewProduct(product.id, "approved")}>Aprovar</Button><Button variant="ghost" onClick={() => void reviewProduct(product.id, "rejected")}>Corrigir</Button></div>
              </div>
            ))}
          </div>
          {!loading && !overview?.products.length ? <div className="mt-4"><EmptyState eyebrow="Revisão tributária" title="Nenhum produto pendente." description="Todos os produtos filtrados possuem revisão contábil aprovada." icon={<FileCheck2 size={20} />} /></div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="text-lg font-semibold text-[var(--brand-primary)]">Documentos recentes</h2>
          <div className="mt-4 grid gap-2">
            {overview?.documents.map((document) => (
              <div key={document.id} className="grid gap-2 rounded-md border border-[var(--brand-border)] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div><strong>{document.documentType.toUpperCase()} · {document.branchName}</strong><p className="text-xs text-slate-500">{document.reference} · {new Date(document.createdAt).toLocaleString("pt-BR")}</p>{document.rejectionReason ? <p className="mt-1 text-sm text-rose-700">{document.rejectionCode ? `${document.rejectionCode} · ` : ""}{document.rejectionReason}</p> : null}</div>
                <div className="flex flex-wrap gap-2"><Badge>{label(document.status)}</Badge>{Object.entries(document.artifacts || {}).filter(([, status]) => status === "ready").map(([kind]) => <Button key={kind} variant="ghost" icon={<Download size={14} />} onClick={() => void downloadApiFile(`/fiscal/documents/${document.id}/artifacts/${kind}`, `${kind}-${document.reference}.${kind === "danfe" ? "pdf" : "xml"}`)}>{kind === "danfe" ? "DANFE" : "XML"}</Button>)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[var(--brand-primary)]">Inutilizações recentes</h2>
              <p className="text-sm text-slate-500">Faixas de numeração NFC-e inutilizadas e auditadas por loja.</p>
            </div>
            <Badge>{overview?.numberVoids.length ?? 0} registro(s)</Badge>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {overview?.numberVoids.map((item) => (
              <div key={item.id} className="rounded-md border border-[var(--brand-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{item.branchName}</strong>
                  <Badge>{label(item.status)}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Série {item.series} · {item.numberStart} a {item.numberEnd} · {new Date(item.requestedAt).toLocaleString("pt-BR")}
                </p>
                {item.protocol ? <p className="mt-1 text-sm text-slate-600">Protocolo: {item.protocol}</p> : null}
              </div>
            ))}
          </div>
          {!overview?.numberVoids.length ? <p className="mt-4 text-sm text-slate-500">Nenhuma inutilização registrada.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, ok, warning, danger }: { label: string; value: number; ok?: boolean; warning?: boolean; danger?: boolean }) {
  const tone = danger
    ? "text-rose-700"
    : warning
      ? "text-amber-700"
      : ok
        ? "text-emerald-700"
        : "text-[var(--brand-primary)]";
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-slate-500">{label}</p>
        <strong className={`mt-2 block text-2xl ${tone}`}>{value}</strong>
      </CardContent>
    </Card>
  );
}

function label(status: string) {
  return ({ approved: "Aprovada", pending: "Pendente", rejected: "Rejeitada", passed: "Concluída", authorized: "Autorizada", cancelled: "Cancelada", retry_pending: "Nova tentativa", error: "Erro", queued: "Na fila", transmitting: "Transmitindo", requested: "Solicitada", processed: "Processada", failed: "Falhou", contingency: "Contingência" } as Record<string, string>)[status] ?? status;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação contábil.";
}
