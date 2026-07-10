"use client";

import { Badge, Button, Card, CardContent, DataTable, EmptyState, Input, PageHeader, Select, Tabs } from "@sgc/ui";
import { LockKeyhole, MailPlus, Plus, RefreshCw, ShieldCheck, UsersRound, type LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { PaginationFooter } from "../../../components/pagination-footer";

interface ListResponse<T> {
  data: T[];
  pagination?: { total: number; page: number; pageSize: number };
}

interface BranchRow {
  id: string;
  name: string;
}

interface MemberRow {
  membershipId: string;
  userId: string;
  userName: string;
  userEmail: string;
  branchId?: string | null;
  branchName?: string | null;
  status: string;
  roleId: string;
  roleSlug: string;
  roleName?: string;
  permissions: string[];
}

interface InviteRow {
  id: string;
  email: string;
  branchName?: string | null;
  roleName?: string;
  expiresAt: string;
}

interface AuditRow {
  id: string;
  actorName?: string | null;
  action: string;
  entityType: string;
  createdAt: string;
}

interface RoleOption {
  roleId: string;
  roleName: string;
  roleSlug?: string;
}

export default function TeamPage() {
  const [activeTab, setActiveTab] = useState("members");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [lastInvite, setLastInvite] = useState<{ inviteUrl: string; emailPreviewHtml: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberStatus, setMemberStatus] = useState("all");
  const [memberPage, setMemberPage] = useState(1);
  const [memberPagination, setMemberPagination] = useState({ total: 0, page: 1, pageSize: 10 });
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [inviteSearch, setInviteSearch] = useState("");
  const [invitePage, setInvitePage] = useState(1);
  const [invitePagination, setInvitePagination] = useState({ total: 0, page: 1, pageSize: 10 });
  const [auditSearch, setAuditSearch] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagination, setAuditPagination] = useState({ total: 0, page: 1, pageSize: 10 });

  const branchOptions = useMemo(
    () => [{ label: "Escopo global", value: "" }, ...branches.map((branch) => ({ label: branch.name, value: branch.id }))],
    [branches]
  );
  const roleOptions = useMemo(() => roles.map((role) => ({ label: role.roleName, value: role.roleId })), [roles]);
  const invitePageSize = 10;

  async function loadReferenceData() {
    setError(null);
    try {
      const inviteQuery = new URLSearchParams({ page: String(invitePage), pageSize: String(invitePageSize) });
      if (inviteSearch) inviteQuery.set("search", inviteSearch);
      const [invitesResponse, branchesResponse, rolesResponse] = await Promise.all([
        apiFetch<ListResponse<InviteRow>>(`/invites?${inviteQuery.toString()}`),
        apiFetch<ListResponse<BranchRow>>("/branches?pageSize=100"),
        apiFetch<ListResponse<RoleOption>>("/roles")
      ]);

      setInvites(invitesResponse.data);
      setInvitePagination(invitesResponse.pagination ?? { total: invitesResponse.data.length, page: invitePage, pageSize: invitePageSize });
      setBranches(branchesResponse.data);
      setRoles(rolesResponse.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar equipe.");
    }
  }

  useEffect(() => {
    void loadReferenceData();
  }, [invitePage, inviteSearch]);

  useEffect(() => {
    void loadMembers();
  }, [memberPage, memberSearch, memberStatus]);

  useEffect(() => {
    void loadAudit();
  }, [auditPage, auditSearch]);

  async function loadMembers() {
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(memberPage), pageSize: "10" });
      if (memberSearch) query.set("search", memberSearch);
      if (memberStatus !== "all") query.set("status", memberStatus);
      const response = await apiFetch<ListResponse<MemberRow>>(`/memberships?${query.toString()}`);
      setMembers(response.data);
      setMemberPagination(response.pagination ?? { total: response.data.length, page: memberPage, pageSize: 10 });
      setSelectedMembers([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar membros.");
    }
  }

  async function loadAudit() {
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(auditPage), pageSize: "10" });
      if (auditSearch) query.set("search", auditSearch);
      const response = await apiFetch<ListResponse<AuditRow>>(`/audit-logs?${query.toString()}`);
      setAudit(response.data);
      setAuditPagination(response.pagination ?? { total: response.data.length, page: auditPage, pageSize: 10 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar auditoria.");
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiFetch<{ inviteToken: string; inviteUrl: string; emailPreviewHtml: string }>("/invites", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          roleId: form.get("roleId"),
          branchId: form.get("branchId") || undefined
        })
      });
      void navigator.clipboard.writeText(response.inviteToken).catch(() => undefined);
      setLastInvite({ inviteUrl: response.inviteUrl, emailPreviewHtml: response.emailPreviewHtml });
      event.currentTarget.reset();
      setInvitePage(1);
      await loadReferenceData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao convidar membro.");
    }
  }

  async function updateMember(member: MemberRow) {
    try {
      await apiFetch(`/memberships/${member.membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({
          roleId: member.roleId,
          branchId: member.branchId ?? undefined,
          status: member.status === "active" ? "disabled" : "active"
        })
      });
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar membro.");
    }
  }

  async function bulkUpdateMembers(status: "active" | "disabled") {
    const targets = members.filter((member) => selectedMembers.includes(member.membershipId));
    if (!targets.length) return;
    try {
      await Promise.all(
        targets.map((member) =>
          apiFetch(`/memberships/${member.membershipId}`, {
            method: "PATCH",
            body: JSON.stringify({
              roleId: member.roleId,
              branchId: member.branchId ?? undefined,
              status
            })
          })
        )
      );
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar membros selecionados.");
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Equipe"
        description="Convites reais, perfis, escopo por filial e trilha de auditoria."
        actions={
          <Button
            variant="secondary"
            onClick={() => void Promise.all([loadReferenceData(), loadMembers(), loadAudit()])}
            icon={<RefreshCw size={16} />}
          >
            Atualizar dados
          </Button>
        }
      />
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <TeamMetric title="Membros" value={members.length} detail="Pessoas com acesso ao tenant" icon={UsersRound} />
        <TeamMetric title="Convites pendentes" value={invites.length} detail="Entradas aguardando aceite" icon={MailPlus} />
        <TeamMetric title="Perfis ativos" value={members.filter((member) => member.status === "active").length} detail="Acessos operacionais habilitados" icon={ShieldCheck} />
        <TeamMetric title="Auditoria recente" value={audit.length} detail="Eventos carregados para conferencia" icon={LockKeyhole} accent />
      </section>

      <Tabs
        defaultValue="members"
        value={activeTab}
        onValueChange={setActiveTab}
        tabs={[
          {
            value: "members",
            label: "Membros",
            content: (
              <div className="grid gap-4">
                <Card variant="brand" className="overflow-hidden shadow-[0_28px_64px_rgba(11,29,61,0.18)]">
                  <CardContent className="grid gap-4 p-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <div>
                      <Badge className="border-white/10 bg-white/10 text-white">Governanca de acesso</Badge>
                      <h2 data-brand-display="true" className="mt-4 text-3xl font-semibold text-white">
                        Equipe, perfis e escopo por filial com leitura imediata.
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
                        A operacao consegue enxergar quem acessa o tenant, em qual contexto e com qual nivel de permissao.
                      </p>
                    </div>
                    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/6 p-4">
                      <TeamFigure label="Membros ativos" value={members.filter((member) => member.status === "active").length} />
                      <TeamFigure label="Escopo global" value={members.filter((member) => !member.branchId).length} />
                      <TeamFigure label="Escopo por filial" value={members.filter((member) => !!member.branchId).length} accent />
                    </div>
                  </CardContent>
                </Card>
                <div className="grid gap-3 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
                  <Input
                    aria-label="Buscar membros"
                    placeholder="Buscar por nome ou e-mail"
                    value={memberSearch}
                    onChange={(event) => {
                      setMemberSearch(event.target.value);
                      setMemberPage(1);
                    }}
                  />
                  <Select
                    aria-label="Status dos membros"
                    options={[
                      { label: "Todos os status", value: "all" },
                      { label: "Somente ativos", value: "active" },
                      { label: "Somente desativados", value: "disabled" }
                    ]}
                    value={memberStatus}
                    onChange={(event) => {
                      setMemberStatus(event.target.value);
                      setMemberPage(1);
                    }}
                  />
                  <Button variant="secondary" disabled={!selectedMembers.length} onClick={() => void bulkUpdateMembers("active")}>
                    Reativar selecionados
                  </Button>
                  <Button variant="secondary" disabled={!selectedMembers.length} onClick={() => void bulkUpdateMembers("disabled")}>
                    Desativar selecionados
                  </Button>
                </div>
                <DataTable
                  rows={members.map((member) => ({ ...member, id: member.membershipId }))}
                  empty={
                    <EmptyState
                      eyebrow="Acesso ao tenant"
                      title="Nenhum membro encontrado."
                      description="Assim que usuarios forem vinculados ao tenant, eles aparecerao aqui com perfil, escopo e status."
                      icon={<UsersRound size={20} />}
                    />
                  }
                  columns={[
                    {
                      key: "select",
                      header: "Selecionar",
                      render: (row) => (
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(row.membershipId)}
                          onChange={(event) => {
                            setSelectedMembers((current) =>
                              event.target.checked
                                ? [...current, row.membershipId]
                                : current.filter((membershipId) => membershipId !== row.membershipId)
                            );
                          }}
                        />
                      )
                    },
                    { key: "name", header: "Pessoa", render: (row) => `${row.userName} · ${row.userEmail}` },
                    { key: "role", header: "Perfil", render: (row) => row.roleName ?? row.roleSlug },
                    { key: "branch", header: "Escopo", render: (row) => row.branchName ?? "Global" },
                    { key: "status", header: "Status", render: (row) => <Badge>{row.status}</Badge> },
                    { key: "permissions", header: "Permissoes", render: (row) => `${row.permissions.length} regras` },
                    {
                      key: "actions",
                      header: "Acoes",
                      render: (row) => (
                        <Button variant="secondary" onClick={() => void updateMember(row)}>
                          {row.status === "active" ? "Desativar" : "Reativar"}
                        </Button>
                      )
                    }
                  ]}
                />
                <PaginationFooter
                  page={memberPagination.page}
                  pageSize={memberPagination.pageSize}
                  total={memberPagination.total}
                  onPrevious={() => setMemberPage((current) => Math.max(1, current - 1))}
                  onNext={() => setMemberPage((current) => current + 1)}
                />
              </div>
            )
          },
          {
            value: "invites",
            label: "Convites",
            content: (
              <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                <Card>
                  <CardContent className="grid gap-4">
                    <form className="grid gap-3" onSubmit={(event) => void invite(event)}>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Onboarding de acesso</p>
                        <h2 className="mt-2 text-base font-semibold text-[var(--brand-primary)]">Novo convite</h2>
                      </div>
                      <Input name="email" label="E-mail" type="email" required />
                      <Select name="roleId" label="Perfil" options={roleOptions} required />
                      <Select name="branchId" label="Escopo da filial" options={branchOptions} />
                      <Button type="submit" icon={<Plus size={16} />}>
                        Gerar convite
                      </Button>
                    </form>
                    {lastInvite ? (
                      <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 text-sm text-slate-700">
                        <p className="font-medium text-[var(--brand-primary)]">Ultimo convite gerado</p>
                        <p className="mt-2 break-all">{lastInvite.inviteUrl}</p>
                        <div className="mt-3 flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              void navigator.clipboard.writeText(lastInvite.inviteUrl).catch(() => undefined);
                            }}
                          >
                            Copiar link
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              const popup = window.open("", "_blank", "noopener,noreferrer");
                              if (!popup) return;
                              popup.document.write(lastInvite.emailPreviewHtml);
                              popup.document.close();
                            }}
                          >
                            Ver email
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
                <div className="grid gap-3">
                  <Input
                    aria-label="Buscar convites"
                    placeholder="Buscar por e-mail, perfil ou escopo"
                    value={inviteSearch}
                    onChange={(event) => {
                      setInviteSearch(event.target.value);
                      setInvitePage(1);
                    }}
                  />
                  <DataTable
                    rows={invites}
                    empty={
                      <EmptyState
                        eyebrow="Onboarding"
                        title="Nenhum convite pendente."
                        description="Quando novos acessos forem gerados, os convites aparecerao aqui com prazo e escopo."
                        icon={<MailPlus size={20} />}
                      />
                    }
                    columns={[
                      { key: "email", header: "E-mail", render: (row) => row.email },
                      { key: "role", header: "Perfil", render: (row) => row.roleName ?? "-" },
                      { key: "branch", header: "Escopo", render: (row) => row.branchName ?? "Global" },
                      { key: "expires", header: "Expira", render: (row) => new Date(row.expiresAt).toLocaleDateString("pt-BR") }
                    ]}
                  />
                  <PaginationFooter
                    page={invitePagination.page}
                    pageSize={invitePagination.pageSize}
                    total={invitePagination.total}
                    onPrevious={() => setInvitePage((current) => Math.max(1, current - 1))}
                    onNext={() => setInvitePage((current) => current + 1)}
                  />
                </div>
              </div>
            )
          },
          {
            value: "audit",
            label: "Auditoria",
            content: (
              <div className="grid gap-3">
                <Input
                  aria-label="Buscar auditoria"
                  placeholder="Buscar por acao ou entidade"
                  value={auditSearch}
                  onChange={(event) => {
                    setAuditSearch(event.target.value);
                    setAuditPage(1);
                  }}
                />
                <DataTable
                  rows={audit}
                  empty={
                    <EmptyState
                      eyebrow="Rastreabilidade"
                      title="Sem eventos de auditoria."
                      description="Acoes criticas de acesso e governanca ficarao registradas aqui assim que forem executadas."
                      icon={<LockKeyhole size={20} />}
                    />
                  }
                  columns={[
                    { key: "date", header: "Data", render: (row) => new Date(row.createdAt).toLocaleString("pt-BR") },
                    { key: "actor", header: "Ator", render: (row) => row.actorName ?? "Sistema" },
                    { key: "action", header: "Acao", render: (row) => row.action },
                    { key: "entity", header: "Entidade", render: (row) => row.entityType }
                  ]}
                />
                <PaginationFooter
                  page={auditPagination.page}
                  pageSize={auditPagination.pageSize}
                  total={auditPagination.total}
                  onPrevious={() => setAuditPage((current) => Math.max(1, current - 1))}
                  onNext={() => setAuditPage((current) => current + 1)}
                />
              </div>
            )
          }
        ]}
      />
    </div>
  );
}

function TeamMetric({
  title,
  value,
  detail,
  icon: Icon,
  accent = false
}: {
  title: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--brand-primary)]">{value.toLocaleString("pt-BR")}</p>
          <p className="mt-2 text-xs text-slate-500">{detail}</p>
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            accent ? "bg-[rgba(245,195,74,0.18)] text-[#c78b07]" : "bg-[rgba(19,58,124,0.10)] text-[var(--brand-secondary)]"
          }`}
        >
          <Icon size={20} />
        </div>
      </CardContent>
    </Card>
  );
}

function TeamFigure({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/8 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/68">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent ? "text-[var(--brand-accent)]" : "text-white"}`}>{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}
