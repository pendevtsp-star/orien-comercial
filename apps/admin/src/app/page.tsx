"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

const api = process.env.NEXT_PUBLIC_API_URL ?? "https://api.useorien.com.br/api/v1";
type Section =
  "overview" | "tenants" | "billing" | "webhooks" | "support" | "staff" | "health" | "errors" | "audit";
const navigation: Array<[Section, string]> = [
  ["overview", "Visão geral"],
  ["tenants", "Tenants"],
  ["billing", "Cobrança SaaS"],
  ["webhooks", "Webhooks"],
  ["support", "Suporte"],
  ["staff", "Equipe interna"],
  ["health", "Saúde operacional"],
  ["errors", "Erros recentes"],
  ["audit", "Auditoria"],
];

async function call(path: string, init: RequestInit = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => ({}))).message ?? "Não foi possível concluir a operação.",
    );
  return response.json();
}

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function date(value: unknown) {
  return value ? new Date(String(value)).toLocaleString("pt-BR") : "-";
}
function supportSlaText(ticket: any) {
  if (!ticket?.slaDueAt) return "SLA não calculado";
  const labels: Record<string, string> = {
    ok: "SLA em dia",
    due_soon: "SLA próximo",
    overdue: "SLA vencido",
    resolved: "SLA encerrado",
  };
  return `${labels[ticket.slaState ?? "ok"] ?? "SLA"} até ${date(ticket.slaDueAt)}`;
}
function supportAttachmentUrls(ticket: any) {
  const urls = ticket?.metadata?.attachmentUrls;
  return Array.isArray(urls) ? urls.filter((url): url is string => typeof url === "string") : [];
}

export default function Admin() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [active, setActive] = useState<Section>("overview");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginNeedsMfa, setLoginNeedsMfa] = useState(false);
  const [loginMfaCode, setLoginMfaCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mfa, setMfa] = useState<any>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [tenantDetail, setTenantDetail] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [supportReason, setSupportReason] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState("support");

  async function load() {
    try {
      const [overview, tenants, billing, health, staff, webhooks, sessions, audits, mfaStatus, errors, supportTickets] =
        await Promise.all([
          call("/platform/overview"),
          call("/platform/tenants"),
          call("/platform/billing"),
          call("/platform/health"),
          call("/platform/staff"),
          call("/platform/webhooks"),
          call("/platform/support-sessions"),
          call("/platform/audits"),
          call("/platform/mfa/status"),
          call("/platform/errors"),
          call("/platform/support-tickets"),
        ]);
      setDashboard({
        overview,
        tenants,
        billing,
        health,
        staff,
        webhooks,
        sessions,
        audits,
        mfaStatus,
        errors,
        supportTickets,
      });
      setError("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Acesso não autorizado.";
      setDashboard(null);
      setError(message);
      throw cause;
    }
  }
  useEffect(() => {
    void load().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!notice && !error) return;
    const timer = window.setTimeout(() => {
      setNotice("");
      setError("");
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [notice, error]);

  async function login(event: FormEvent) {
    event.preventDefault();
    try {
      if (loginNeedsMfa) {
        await call("/platform/mfa/verify", {
          method: "POST",
          body: JSON.stringify({ code: loginMfaCode }),
        });
      } else {
        await call("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password, rememberMe }),
        });
      }
      await load();
      setLoginNeedsMfa(false);
      setLoginMfaCode("");
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Não foi possível entrar. Verifique suas credenciais e tente novamente.";
      if (message.toLowerCase().includes("autenticador") || message.toLowerCase().includes("mfa")) {
        setLoginNeedsMfa(true);
        setError("Informe o código atual do aplicativo autenticador para concluir o acesso.");
        return;
      }
      setError(message);
    }
  }
  async function act(action: () => Promise<unknown>, message: string) {
    try {
      setError("");
      await action();
      await load();
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação.");
    }
  }
  async function openTenant(tenant: any) {
    setSelectedTenant(tenant);
    setActive("tenants");
    try {
      const [detail, notesResult] = await Promise.all([
        call(`/platform/tenants/${tenant.id}`),
        call(`/platform/tenants/${tenant.id}/notes`),
      ]);
      setTenantDetail(detail);
      setNotes(notesResult.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o tenant.");
    }
  }
  const current = useMemo(
    () => dashboard?.tenants.data.find((tenant: any) => tenant.id === selectedTenant?.id),
    [dashboard, selectedTenant],
  );

  if (!dashboard)
    return (
      <main className="login">
        <section className="login-card">
          <p className="eyebrow">ORIEN ADMIN</p>
          <h1>Backoffice da plataforma</h1>
          <p className="muted">Operação, suporte, cobrança e integridade do ecossistema Orien.</p>
          <form onSubmit={login}>
            <label>
              E-mail administrativo
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Senha
              <span className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />{" "}
              <span>
                <strong>Manter conectado</strong>
                <small>Use somente em um dispositivo pessoal.</small>
              </span>
            </label>
            {loginNeedsMfa && (
              <label>
                Código do autenticador
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={loginMfaCode}
                  onChange={(event) => setLoginMfaCode(event.target.value)}
                  placeholder="000000"
                  required
                />
              </label>
            )}
            <button className="btn primary">
              {loginNeedsMfa ? "Confirmar MFA e entrar" : "Entrar no backoffice"}
            </button>
            {loginNeedsMfa && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setLoginNeedsMfa(false);
                  setLoginMfaCode("");
                  setError("");
                }}
              >
                Voltar para e-mail e senha
              </button>
            )}
            {error && <p className="feedback error">{error}</p>}
          </form>
        </section>
      </main>
    );

  return (
    <div className="admin">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark">O</span>
          <div>
            <b>Orien</b>
            <small>Administração da plataforma</small>
          </div>
        </div>
        <nav className="nav">
          {navigation.map(([id, label]) => (
            <button
              key={id}
              className={active === id ? "active" : ""}
              onClick={() => setActive(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <p
          style={{
            margin: "20px 12px 0",
            color: "#6f88ad",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".14em",
          }}
        >
          COMERCIAL
        </p>
        <nav className="nav" style={{ marginTop: 8 }}>
          <Link
            style={{
              color: "#b8c6db",
              borderRadius: 8,
              padding: "11px 12px",
              textDecoration: "none",
              fontSize: 14,
            }}
            href="/coupons"
          >
            Cupons
          </Link>
          <Link
            style={{
              color: "#b8c6db",
              borderRadius: 8,
              padding: "11px 12px",
              textDecoration: "none",
              fontSize: 14,
            }}
            href="/landing"
          >
            Landing page
          </Link>
          <Link
            style={{
              color: "#b8c6db",
              borderRadius: 8,
              padding: "11px 12px",
              textDecoration: "none",
              fontSize: 14,
            }}
            href="/testimonials"
          >
            Depoimentos
          </Link>
        </nav>
        <div className="operator">
          <span className="dot" /> Plataforma protegida
          <br />
          <small>
            {dashboard.mfaStatus.mfa_enabled
              ? "MFA ativo"
              : dashboard.mfaStatus.mfa_configured
                ? "MFA aguardando confirmação"
                : "MFA pendente"}
          </small>
        </div>
      </aside>
      <main className="main">
        <header className="top">
          <div>
            <p className="eyebrow">ORIEN PLATFORM</p>
            <h1>{navigation.find(([id]) => id === active)?.[1]}</h1>
            <p className="muted">
              Gestão de clientes, receita recorrente, suporte e segurança em um só lugar.
            </p>
          </div>
          <div className="actions">
            <button
              className="btn"
              onClick={() =>
                void act(
                  () => call("/platform/observability/test", { method: "POST", body: "{}" }),
                  "Evento de teste enviado ao monitoramento.",
                )
              }
            >
              Testar monitoramento
            </button>
            <button className="btn" onClick={() => void act(load, "Dados atualizados.")}>
              Atualizar
            </button>
            <button
              className="btn"
              disabled={dashboard.mfaStatus.mfa_enabled}
              onClick={() =>
                void act(
                  async () =>
                    setMfa(await call("/platform/mfa/setup", { method: "POST", body: "{}" })),
                  "Configure o autenticador antes de fechar este aviso.",
                )
              }
            >
              {dashboard.mfaStatus.mfa_enabled
                ? "MFA ativo"
                : dashboard.mfaStatus.mfa_configured
                  ? "Concluir MFA"
                  : "Configurar MFA"}
            </button>
            <button
              className="btn danger"
              onClick={() =>
                void call("/auth/logout", { method: "POST", body: "{}" }).finally(() =>
                  setDashboard(null),
                )
              }
            >
              Sair
            </button>
          </div>
        </header>
        {error && (
          <p className="feedback error" role="alert">
            <span>{error}</span>
            <button aria-label="Fechar mensagem" onClick={() => setError("")}>
              ×
            </button>
          </p>
        )}
        {notice && (
          <p className="feedback success" role="status">
            <span>{notice}</span>
            <button aria-label="Fechar mensagem" onClick={() => setNotice("")}>
              ×
            </button>
          </p>
        )}
        {mfa && (
          <section className="mfa">
            <div>
              <p className="eyebrow">SEGURANÇA DA CONTA</p>
              <h2>
                {mfa.alreadyConfigured ? "Confirmar autenticador" : "Configurar autenticador"}
              </h2>
              <p className="muted">
                {mfa.alreadyConfigured
                  ? "Use o código atual do seu aplicativo autenticador para concluir a ativação."
                  : "Escaneie o QR Code com Google Authenticator, 1Password ou similar. Guarde os códigos de recuperação em local seguro."}
              </p>
              <code>{mfa.secret}</code>
              {mfa.recoveryCodes.length > 0 && (
                <div className="recovery">
                  {mfa.recoveryCodes.map((value: string) => (
                    <span key={value}>{value}</span>
                  ))}
                </div>
              )}
            </div>
            <img src={mfa.qrCodeDataUrl} alt="QR Code para configurar MFA" />
            <div className="mfa-confirm">
              <input
                aria-label="Código MFA"
                placeholder="Código de 6 dígitos ou recuperação"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
              />
              <button
                className="btn primary"
                onClick={() =>
                  void act(async () => {
                    await call("/platform/mfa/verify", {
                      method: "POST",
                      body: JSON.stringify({ code: mfaCode }),
                    });
                    setMfa(null);
                  }, "MFA ativado com sucesso.")
                }
              >
                Confirmar e ativar
              </button>
            </div>
          </section>
        )}
        {active === "overview" && (
          <Overview dashboard={dashboard} selectTenant={openTenant} setActive={setActive} />
        )}
        {active === "tenants" && (
          <Tenants
            dashboard={dashboard}
            openTenant={openTenant}
            act={act}
            detail={tenantDetail}
            tenant={current}
            notes={notes}
            note={note}
            setNote={setNote}
            supportReason={supportReason}
            setSupportReason={setSupportReason}
          />
        )}
        {active === "billing" && (
          <Billing data={dashboard.billing.data} tenants={dashboard.tenants.data} act={act} />
        )}
        {active === "webhooks" && <Webhooks data={dashboard.webhooks.data} act={act} />}
        {active === "support" && (
          <Support tickets={dashboard.supportTickets.data} sessions={dashboard.sessions.data} act={act} />
        )}
        {active === "staff" && (
          <Staff
            data={dashboard.staff.data}
            email={staffEmail}
            setEmail={setStaffEmail}
            role={staffRole}
            setRole={setStaffRole}
            act={act}
          />
        )}
        {active === "health" && <Health health={dashboard.health} />}
        {active === "errors" && <Errors data={dashboard.errors.data} />}
        {active === "audit" && <Audit data={dashboard.audits.data} />}
      </main>
    </div>
  );
}

function Overview({ dashboard, selectTenant, setActive }: any) {
  const fields = [
    ["Tenants ativos", dashboard.overview.activeTenants],
    ["MRR contratado", money(dashboard.overview.mrrCents)],
    ["Sessões em curso", dashboard.overview.activeSessions],
    ["Webhooks a tratar", dashboard.overview.recentWebhookEvents],
  ];
  return (
    <>
      <section className="metrics">
        {fields.map(([label, value]) => (
          <article className="metric" key={String(label)}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <section className="content-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">BASE CONTRATANTE</p>
              <h2>Clientes que pedem atenção</h2>
            </div>
            <button className="text-button" onClick={() => setActive("tenants")}>
              Ver todos
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Plano</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dashboard.tenants.data.slice(0, 6).map((tenant: any) => (
                <tr key={tenant.id}>
                  <td>
                    <strong>{tenant.name}</strong>
                    <br />
                    <small>{tenant.membersCount} membros</small>
                  </td>
                  <td>{tenant.planSlug ?? "trial"}</td>
                  <td>
                    <span className="pill">{tenant.status}</span>
                  </td>
                  <td>
                    <button className="btn small" onClick={() => void selectTenant(tenant)}>
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="panel">
          <p className="eyebrow">SAÚDE</p>
          <h2>Operação estável</h2>
          <div className="health-list">
            {Object.entries(dashboard.health).map(([key, value]) => (
              <p key={key}>
                <span>{key.replace(/([A-Z])/g, " $1")}</span>
                <strong>{String(value)}</strong>
              </p>
            ))}
          </div>
        </article>
      </section>
      <section className="quick-grid">
        <article className="panel">
          <h2>Próximas ações</h2>
          <p>Revise cobranças vencidas, eventos pendentes e solicitações de suporte.</p>
          <button className="btn" onClick={() => setActive("webhooks")}>
            Abrir webhooks
          </button>
        </article>
        <article className="panel">
          <h2>Segurança</h2>
          <p>
            {dashboard.mfaStatus.mfa_enabled
              ? `${dashboard.mfaStatus.recovery_codes} códigos de recuperação disponíveis.${dashboard.mfaStatus.sessionVerified ? " Sessão atual confirmada." : " Confirme o código novamente após um novo login."}`
              : dashboard.mfaStatus.mfa_configured
                ? "O autenticador já foi cadastrado. Abra “Concluir MFA” e informe o código atual de seis dígitos."
                : "MFA ainda não foi configurado."}
          </p>
        </article>
      </section>
    </>
  );
}
function Tenants({
  dashboard,
  openTenant,
  act,
  detail,
  tenant,
  notes,
  note,
  setNote,
  supportReason,
  setSupportReason,
}: any) {
  return (
    <div className="two-column">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CLIENTES</p>
            <h2>Base de tenants</h2>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Plano</th>
              <th>Status</th>
              <th>Membros</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {dashboard.tenants.data.map((item: any) => (
              <tr key={item.id}>
                <td>
                  {item.name}
                  <br />
                  <small>{item.slug}</small>
                </td>
                <td>{item.planSlug ?? "trial"}</td>
                <td>
                  <span className="pill">{item.status}</span>
                </td>
                <td>{item.membersCount}</td>
                <td>
                  <button className="btn small" onClick={() => void openTenant(item)}>
                    Abrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <aside className="panel detail">
        {tenant && detail ? (
          <>
            <p className="eyebrow">DETALHE DO TENANT</p>
            <h2>{detail.tenant.name}</h2>
            <p className="muted">
              {detail.members} membros · {detail.branches} lojas · {detail.salesLast30Days} vendas
              nos últimos 30 dias
            </p>
            <div className="inline-actions">
              <button
                className="btn"
                onClick={() =>
                  void act(
                    () =>
                      call(`/platform/tenants/${tenant.id}/status`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          status: tenant.status === "suspended" ? "active" : "suspended",
                        }),
                      }),
                    "Status do tenant atualizado.",
                  )
                }
              >
                {tenant.status === "suspended" ? "Reativar" : "Suspender"}
              </button>
              <button
                className="btn"
                onClick={() =>
                  void act(
                    () =>
                      call(`/platform/tenants/${tenant.id}/trial`, {
                        method: "POST",
                        body: JSON.stringify({ days: 7 }),
                      }),
                    "Trial prorrogado por 7 dias.",
                  )
                }
              >
                +7 dias de trial
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  if (
                    window.confirm(
                      "Conceder acesso vitalício Enterprise completo? Não haverá vínculo, cobrança ou cliente criado no Asaas da Orien; esse benefício não entra no MRR.",
                    )
                  )
                    void act(
                      () =>
                        call(`/platform/tenants/${tenant.id}/lifetime`, {
                          method: "POST",
                          body: JSON.stringify({
                            enabled: true,
                            note: "Acesso vitalício de parceria/teste",
                          }),
                        }),
                      "Acesso vitalício Enterprise concedido sem cobrança SaaS.",
                    );
                }}
              >
                Acesso vitalício
              </button>
            </div>
            <h3>Integrações</h3>
            {detail.integrations.length ? (
              detail.integrations.map((item: any) => (
                <p key={item.provider}>
                  <strong>{item.provider}</strong>
                  <br />
                  <small>
                    {item.status} · {date(item.updatedAt)}
                  </small>
                </p>
              ))
            ) : (
              <p className="muted">Nenhuma integração configurada.</p>
            )}
            <h3>Suporte auditado</h3>
            <textarea
              placeholder="Motivo do atendimento (mínimo 8 caracteres)"
              value={supportReason}
              onChange={(event) => setSupportReason(event.target.value)}
            />
            <button
              className="btn"
              onClick={() =>
                void act(
                  () =>
                    call(`/platform/tenants/${tenant.id}/support-sessions`, {
                      method: "POST",
                      body: JSON.stringify({ reason: supportReason }),
                    }),
                  "Sessão de suporte registrada e limitada a 30 minutos.",
                )
              }
            >
              Registrar sessão assistida
            </button>
            <h3>Notas internas</h3>
            <textarea
              placeholder="Registrar contexto do suporte"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <button
              className="btn"
              onClick={() =>
                void act(async () => {
                  await call(`/platform/tenants/${tenant.id}/notes`, {
                    method: "POST",
                    body: JSON.stringify({ body: note }),
                  });
                  setNote("");
                }, "Nota adicionada ao histórico.")
              }
            >
              Salvar nota
            </button>
            <div className="notes">
              {notes.map((item: any) => (
                <p key={item.id}>
                  <strong>{item.authorName ?? "Operador"}</strong>
                  <br />
                  {item.body}
                  <br />
                  <small>{date(item.createdAt)}</small>
                </p>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2>Selecione um tenant</h2>
            <p className="muted">
              Veja plano, lojas, integrações, notas de suporte e ações administrativas em um único
              painel.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
function Billing({ data, tenants, act }: any) {
  return (
    <section className="panel">
      <p className="eyebrow">RECEITA RECORRENTE</p>
      <h2>Cobrança SaaS</h2>
      <table>
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Plano</th>
            <th>Status</th>
            <th>Próximo ciclo</th>
            <th>Valor</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((item: any) => {
            const tenant = tenants.find((value: any) => value.name === item.tenantName);
            return (
              <tr key={`${item.tenantName}-${item.planName}`}>
                <td>{item.tenantName}</td>
                <td>{item.planName ?? "Sem plano"}</td>
                <td>
                  <span className="pill">{item.status}</span>
                </td>
                <td>{date(item.periodEndsAt)}</td>
                <td>{money(item.priceCents)}</td>
                <td>
                  {tenant && (
                    <button
                      className="btn small"
                      onClick={() =>
                        void act(
                          () =>
                            call(`/platform/tenants/${tenant.id}/trial`, {
                              method: "POST",
                              body: JSON.stringify({ days: 7 }),
                            }),
                          "Trial prorrogado por 7 dias.",
                        )
                      }
                    >
                      Prorrogar
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
function Webhooks({ data, act }: any) {
  return (
    <section className="panel">
      <p className="eyebrow">ENTREGAS EXTERNAS</p>
      <h2>Central de webhooks</h2>
      <p className="muted">
        Eventos são idempotentes. Reprocessar somente após validar a causa da falha.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provedor</th>
            <th>Evento</th>
            <th>Status</th>
            <th>Tentativas</th>
            <th>Recebido</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.length ? (
            data.map((item: any) => (
              <tr key={item.id}>
                <td>{item.provider}</td>
                <td>{item.eventType}</td>
                <td>
                  <span className="pill">{item.status}</span>
                </td>
                <td>{item.attempts}</td>
                <td>{date(item.createdAt)}</td>
                <td>
                  <button
                    className="btn small"
                    onClick={() =>
                      void act(
                        () =>
                          call(`/platform/webhooks/${item.id}/retry`, {
                            method: "POST",
                            body: "{}",
                          }),
                        "Webhook marcado para reprocessamento.",
                      )
                    }
                  >
                    Reprocessar
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="empty">
                Nenhum webhook registrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
function Support({ tickets, sessions, act }: any) {
  const [selectedId, setSelectedId] = useState(tickets[0]?.id ?? "");
  const [detail, setDetail] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void call(`/platform/support-tickets/${selectedId}`)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [selectedId]);
  return (
    <div className="two-column">
      <section className="panel">
        <p className="eyebrow">FILA DE ATENDIMENTO</p>
        <h2>Chamados dos clientes</h2>
        <p className="muted">Priorize chamados críticos, responda com histórico e mantenha a trilha auditável.</p>
        <table>
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Assunto</th>
              <th>Status</th>
              <th>Prioridade</th>
              <th>Atualizado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tickets.length ? (
              tickets.map((item: any) => (
                <tr key={item.id}>
                  <td>{item.tenantName}</td>
                  <td>
                    {item.subject}
                    <br />
                    <small>{item.category} · {item.messageCount} mensagens · {supportSlaText(item)}</small>
                  </td>
                  <td><span className="pill">{item.status}</span></td>
                  <td>{item.priority}</td>
                  <td>{date(item.updatedAt)}</td>
                  <td><button className="btn small" onClick={() => setSelectedId(item.id)}>Abrir</button></td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6} className="empty">Nenhum chamado aberto.</td></tr>
            )}
          </tbody>
        </table>
        <h3>Sessões assistidas</h3>
        <table>
          <thead><tr><th>Tenant</th><th>Operador</th><th>Motivo</th><th>Status</th><th>Expira</th></tr></thead>
          <tbody>
            {sessions.length ? sessions.slice(0, 8).map((item: any) => (
              <tr key={item.id}><td>{item.tenantName}</td><td>{item.operatorName}</td><td>{item.reason}</td><td><span className="pill">{item.status}</span></td><td>{date(item.expiresAt)}</td></tr>
            )) : <tr><td colSpan={5} className="empty">Nenhuma sessão assistida registrada.</td></tr>}
          </tbody>
        </table>
      </section>
      <aside className="panel detail">
        {detail ? (
          <>
            <p className="eyebrow">CHAMADO</p>
            <h2>{detail.ticket.subject}</h2>
            <p className="muted">{detail.ticket.tenantName} · {detail.ticket.openedByName ?? "Usuário"} · {date(detail.ticket.createdAt)}</p>
            <p className="muted">{supportSlaText(detail.ticket)}</p>
            {(detail.ticket.requestId || detail.ticket.pageUrl || supportAttachmentUrls(detail.ticket).length) ? (
              <div className="note-box">
                {detail.ticket.requestId ? <p><strong>Request ID:</strong> {detail.ticket.requestId}</p> : null}
                {detail.ticket.pageUrl ? <p><strong>Origem:</strong> <a href={detail.ticket.pageUrl} target="_blank" rel="noreferrer">{detail.ticket.pageUrl}</a></p> : null}
                {supportAttachmentUrls(detail.ticket).map((url) => (
                  <p key={url}><strong>Anexo:</strong> <a href={url} target="_blank" rel="noreferrer">{url}</a></p>
                ))}
              </div>
            ) : null}
            <div className="inline-actions">
              {["open", "waiting_support", "waiting_customer", "resolved", "closed"].map((status) => (
                <button key={status} className="btn small" onClick={() => void act(() => call(`/platform/support-tickets/${detail.ticket.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }), "Status do chamado atualizado.")}>{status}</button>
              ))}
            </div>
            <div className="notes">
              {detail.messages.map((message: any) => (
                <p key={message.id}>
                  <strong>{message.authorName} {message.internalNote ? "· nota interna" : ""}</strong>
                  <br />
                  {message.body}
                  <br />
                  <small>{date(message.createdAt)}</small>
                </p>
              ))}
            </div>
            <textarea placeholder="Responder ao cliente ou registrar nota interna" value={reply} onChange={(event) => setReply(event.target.value)} />
            <label className="check">
              <input type="checkbox" checked={internalNote} onChange={(event) => setInternalNote(event.target.checked)} /> Nota interna
            </label>
            <button className="btn primary" onClick={() => void act(async () => {
              await call(`/platform/support-tickets/${detail.ticket.id}/messages`, { method: "POST", body: JSON.stringify({ body: reply, internalNote }) });
              setReply("");
              setInternalNote(false);
              setDetail(await call(`/platform/support-tickets/${detail.ticket.id}`));
            }, internalNote ? "Nota interna registrada." : "Resposta enviada ao cliente.")}>Enviar</button>
          </>
        ) : (
          <>
            <h2>Selecione um chamado</h2>
            <p className="muted">As mensagens, notas internas e ações de status aparecem aqui.</p>
          </>
        )}
      </aside>
    </div>
  );
}
function Staff({ data, email, setEmail, role, setRole, act }: any) {
  return (
    <div className="two-column">
      <section className="panel">
        <p className="eyebrow">OPERADORES</p>
        <h2>Equipe interna</h2>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Perfil</th>
              <th>MFA</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((item: any) => (
              <tr key={item.id}>
                <td>
                  {item.name ?? item.email}
                  <br />
                  <small>{item.email}</small>
                </td>
                <td>{item.role}</td>
                <td>{item.mfaRequired ? "Obrigatório" : "Opcional"}</td>
                <td>
                  <span className="pill">{item.isActive ? "ativo" : "inativo"}</span>
                </td>
                <td>
                  <button
                    className="btn small"
                    onClick={() =>
                      void act(
                        () =>
                          call(`/platform/staff/${item.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ isActive: !item.isActive }),
                          }),
                        "Status do operador atualizado.",
                      )
                    }
                  >
                    {item.isActive ? "Desativar" : "Ativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <aside className="panel">
        <p className="eyebrow">ATRIBUIÇÃO DE PAPEL</p>
        <h2>Adicionar operador</h2>
        <p className="muted">
          O usuário precisa existir previamente. Todo operador interno recebe MFA obrigatório.
        </p>
        <label>
          E-mail
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="operador@orien.com.br"
          />
        </label>
        <label>
          Perfil
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="support">Suporte</option>
            <option value="operations">Operações</option>
            <option value="finance">Financeiro</option>
            <option value="superadmin">Superadmin</option>
          </select>
        </label>
        <button
          className="btn primary"
          onClick={() =>
            void act(
              () =>
                call("/platform/staff", { method: "POST", body: JSON.stringify({ email, role }) }),
              "Operador interno atribuído.",
            )
          }
        >
          Adicionar à equipe
        </button>
      </aside>
    </div>
  );
}
function Health({ health }: any) {
  return (
    <section className="health-grid">
      {Object.entries(health).map(([key, value]) => (
        <article className="panel" key={key}>
          <p className="eyebrow">MONITORAMENTO</p>
          <h2>{key.replace(/([A-Z])/g, " $1")}</h2>
          <strong className="big">{String(value)}</strong>
          <p className="muted">Leitura atual da infraestrutura e dos processos da plataforma.</p>
        </article>
      ))}
    </section>
  );
}
function Errors({ data }: any) {
  return (
    <section className="panel">
      <p className="eyebrow">OBSERVABILIDADE</p>
      <h2>Erros recentes da API</h2>
      <p className="muted">
        Eventos correlacionados por requestId para investigar falhas de API, checkout e webhooks.
      </p>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>RequestId</th>
            <th>Rota</th>
            <th>Status</th>
            <th>Mensagem</th>
          </tr>
        </thead>
        <tbody>
          {data.length ? (
            data.map((item: any) => (
              <tr key={item.id}>
                <td>{date(item.createdAt)}</td>
                <td>
                  <small>{item.requestId}</small>
                </td>
                <td>
                  <small>
                    {item.method} {item.path}
                  </small>
                </td>
                <td>{item.statusCode}</td>
                <td>{item.message}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="empty">
                Nenhum erro recente registrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
function Audit({ data }: any) {
  return (
    <section className="panel">
      <p className="eyebrow">RASTREABILIDADE</p>
      <h2>Auditoria da plataforma</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Operador</th>
            <th>Ação</th>
            <th>Entidade</th>
            <th>Dados</th>
          </tr>
        </thead>
        <tbody>
          {data.length ? (
            data.map((item: any) => (
              <tr key={item.id}>
                <td>{date(item.createdAt)}</td>
                <td>{item.actorName}</td>
                <td>{item.action}</td>
                <td>{item.entityType}</td>
                <td>
                  <small>{JSON.stringify(item.metadata)}</small>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="empty">
                Nenhuma ação auditada ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
