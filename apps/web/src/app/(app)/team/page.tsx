"use client";

import { Badge, BulkActionBar, type BulkStatusAction, Button, Card, CardContent, DataTable, EmptyState, Input, LoadingState, PageHeader, Select, Tabs } from "@sgc/ui";
import { DollarSign, LockKeyhole, MailPlus, Plus, RefreshCw, ShieldCheck, Target, UsersRound, type LucideIcon } from "lucide-react";
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
  permissions?: string[];
}

interface CommissionRuleRow {
  id: string;
  userId: string;
  userName: string;
  branchId?: string | null;
  branchName?: string | null;
  ratePercent: number;
  isActive: boolean;
}

interface SellerGoalRow {
  id: string;
  userId: string;
  userName: string;
  branchId?: string | null;
  branchName?: string | null;
  periodStart: string;
  periodEnd: string;
  salesTarget: number;
  revenue: number;
  provisionedCommission: number;
}

const permissionGroups = [
  { label: "Lojas", permissions: ["branches.read", "branches.create", "branches.update", "branches.delete"] },
  { label: "Produtos", permissions: ["products.read", "products.create", "products.update", "products.delete"] },
  { label: "Clientes", permissions: ["customers.read", "customers.create", "customers.update", "customers.delete"] },
  { label: "Estoque", permissions: ["stock.read", "stock.adjust", "stock.transfer", "stock.inventory", "stock.purchase", "stock.reports"] },
  { label: "Vendas/PDV", permissions: ["sales.read", "sales.create", "sales.cancel", "sales.history"] },
  { label: "Financeiro", permissions: ["financial.read", "financial.receive", "financial.pay", "financial.reconcile", "financial.categories.manage"] },
  { label: "Equipe", permissions: ["users.read", "users.invite", "users.memberships.manage", "users.roles.manage"] },
  { label: "Assinatura", permissions: ["subscriptions.read", "subscriptions.manage"] },
  { label: "Painel", permissions: ["dashboard.read", "tenants.read", "tenants.update"] },
] as const;

const permissionLabels: Record<string, string> = {
  "branches.read": "Ver",
  "branches.create": "Criar",
  "branches.update": "Editar",
  "branches.delete": "Excluir",
  "products.read": "Ver",
  "products.create": "Criar",
  "products.update": "Editar",
  "products.delete": "Excluir",
  "customers.read": "Ver",
  "customers.create": "Criar",
  "customers.update": "Editar",
  "customers.delete": "Excluir",
  "stock.read": "Ver",
  "stock.adjust": "Ajustar",
  "stock.transfer": "Transferir",
  "stock.inventory": "Inventário",
  "stock.purchase": "Comprar",
  "stock.reports": "Relatórios",
  "sales.read": "Ver",
  "sales.create": "Vender",
  "sales.cancel": "Cancelar",
  "sales.history": "Histórico",
  "financial.read": "Ver",
  "financial.receive": "Baixar recebível",
  "financial.pay": "Pagar",
  "financial.reconcile": "Conciliar",
  "financial.categories.manage": "Categorias",
  "users.read": "Ver",
  "users.invite": "Convidar",
  "users.memberships.manage": "Membros",
  "users.roles.manage": "Perfis",
  "subscriptions.read": "Ver",
  "subscriptions.manage": "Gerenciar",
  "dashboard.read": "Ver painel",
  "tenants.read": "Ver empresa",
  "tenants.update": "Editar empresa",
};

export default function TeamPage() {
  const [activeTab, setActiveTab] = useState("members");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [simulatedRoleId, setSimulatedRoleId] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string[]>>({});
  const [commercialMembers, setCommercialMembers] = useState<MemberRow[]>([]);
  const [commissionRules, setCommissionRules] = useState<CommissionRuleRow[]>([]);
  const [sellerGoals, setSellerGoals] = useState<SellerGoalRow[]>([]);
  const [commercialSaving, setCommercialSaving] = useState(false);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<{ inviteUrl: string; emailPreviewHtml: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberStatus, setMemberStatus] = useState("all");
  const [memberPage, setMemberPage] = useState(1);
  const [memberPagination, setMemberPagination] = useState({ total: 0, page: 1, pageSize: 10 });
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberBulkBusy, setMemberBulkBusy] = useState(false);
  const [memberBulkAction, setMemberBulkAction] = useState<BulkStatusAction | null>(null);
  const [memberBulkFeedback, setMemberBulkFeedback] = useState<string | null>(null);
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
  const commercialMemberOptions = useMemo(
    () => commercialMembers.filter((member) => member.status === "active").map((member) => ({ label: `${member.userName} · ${member.roleName ?? member.roleSlug}`, value: member.userId })),
    [commercialMembers]
  );
  const invitePageSize = 10;

  async function loadReferenceData() {
    setError(null);
    try {
      const inviteQuery = new URLSearchParams({ page: String(invitePage), pageSize: String(invitePageSize) });
      if (inviteSearch) inviteQuery.set("search", inviteSearch);
      const [invitesResponse, branchesResponse, rolesResponse, membersResponse] = await Promise.all([
        apiFetch<ListResponse<InviteRow>>(`/invites?${inviteQuery.toString()}`),
        apiFetch<ListResponse<BranchRow>>("/branches?pageSize=100"),
        apiFetch<ListResponse<RoleOption>>("/roles"),
        apiFetch<ListResponse<MemberRow>>("/memberships?pageSize=100&status=active")
      ]);

      setInvites(invitesResponse.data);
      setInvitePagination(invitesResponse.pagination ?? { total: invitesResponse.data.length, page: invitePage, pageSize: invitePageSize });
      setBranches(branchesResponse.data);
      setRoles(rolesResponse.data);
      setCommercialMembers(membersResponse.data);
      setRoleDrafts(Object.fromEntries(rolesResponse.data.map((role) => [role.roleId, role.permissions ?? []])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar equipe.");
    }
  }

  async function loadCommercialGovernance() {
    try {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      const [rulesResponse, goalsResponse] = await Promise.all([
        apiFetch<CommissionRuleRow[]>("/dashboard/commission-rules"),
        apiFetch<SellerGoalRow[]>(`/dashboard/seller-goals?startDate=${startDate}&endDate=${endDate}`)
      ]);
      setCommissionRules(rulesResponse);
      setSellerGoals(goalsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar metas e comissões.");
    }
  }

  useEffect(() => {
    void loadReferenceData();
  }, [invitePage, inviteSearch]);

  useEffect(() => {
    void loadCommercialGovernance();
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [memberPage, memberSearch, memberStatus]);

  useEffect(() => {
    void loadAudit();
  }, [auditPage, auditSearch]);

  async function loadMembers() {
    setError(null);
    setMemberLoading(true);
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
    } finally {
      setMemberLoading(false);
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

  async function bulkUpdateMembers() {
    if (!selectedMembers.length || !memberBulkAction) return;
    setMemberBulkBusy(true);
    const selectedCount = selectedMembers.length;
    const status = memberBulkAction === "activate" ? "active" : "disabled";
    try {
      await apiFetch("/memberships/bulk/status", {
        method: "POST",
        body: JSON.stringify({ membershipIds: selectedMembers, status }),
      });
      setMemberBulkFeedback(`${selectedCount} ${selectedCount === 1 ? "acesso foi atualizado" : "acessos foram atualizados"}.`);
      setMemberBulkAction(null);
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar membros selecionados.");
      setMemberBulkAction(null);
    } finally {
      setMemberBulkBusy(false);
    }
  }

  function togglePermission(role: RoleOption, permission: string) {
    if (role.roleSlug === "owner") return;
    setRoleDrafts((current) => {
      const selected = new Set(current[role.roleId] ?? role.permissions ?? []);
      if (selected.has(permission)) selected.delete(permission);
      else selected.add(permission);
      return { ...current, [role.roleId]: Array.from(selected).sort() };
    });
  }

  async function saveRole(role: RoleOption) {
    if (role.roleSlug === "owner") return;
    setSavingRoleId(role.roleId);
    try {
      const response = await apiFetch<ListResponse<RoleOption>>(`/roles/${role.roleId}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permissions: roleDrafts[role.roleId] ?? [] }),
      });
      setRoles(response.data);
      setRoleDrafts(Object.fromEntries(response.data.map((item) => [item.roleId, item.permissions ?? []])));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar permissões.");
    } finally {
      setSavingRoleId(null);
    }
  }

  async function saveCommissionRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setCommercialSaving(true);
    try {
      await apiFetch("/dashboard/commission-rules", {
        method: "POST",
        body: JSON.stringify({
          userId: form.get("userId"),
          branchId: form.get("branchId") || undefined,
          ratePercent: Number(form.get("ratePercent")),
          isActive: true
        })
      });
      event.currentTarget.reset();
      await loadCommercialGovernance();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar a regra de comissão.");
    } finally {
      setCommercialSaving(false);
    }
  }

  async function saveSellerGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setCommercialSaving(true);
    try {
      await apiFetch("/dashboard/seller-goals", {
        method: "POST",
        body: JSON.stringify({
          userId: form.get("userId"),
          branchId: form.get("branchId") || undefined,
          periodStart: form.get("periodStart"),
          periodEnd: form.get("periodEnd"),
          salesTarget: Number(form.get("salesTarget"))
        })
      });
      await loadCommercialGovernance();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar a meta do vendedor.");
    } finally {
      setCommercialSaving(false);
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
            onClick={() => void Promise.all([loadReferenceData(), loadMembers(), loadAudit(), loadCommercialGovernance()])}
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
        <TeamMetric title="Auditoria recente" value={audit.length} detail="Eventos carregados para conferência" icon={LockKeyhole} accent />
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
                      <Badge className="border-white/10 bg-white/10 text-white">Governança de acesso</Badge>
                      <h2 data-brand-display="true" className="mt-4 text-3xl font-semibold text-white">
                        Equipe, perfis e escopo por filial com leitura imediata.
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
                        A operação mostra quem acessa a empresa, em qual contexto e com qual nível de permissão.
                      </p>
                    </div>
                    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/6 p-4">
                      <TeamFigure label="Membros ativos" value={members.filter((member) => member.status === "active").length} />
                      <TeamFigure label="Escopo global" value={members.filter((member) => !member.branchId).length} />
                      <TeamFigure label="Escopo por filial" value={members.filter((member) => !!member.branchId).length} accent />
                    </div>
                  </CardContent>
                </Card>
                <div className="grid gap-3 md:grid-cols-[1.4fr_minmax(0,1fr)]">
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
                </div>
                <BulkActionBar
                  selectedCount={selectedMembers.length}
                  itemLabel="acessos"
                  pendingAction={memberBulkAction}
                  busy={memberBulkBusy}
                  feedback={memberBulkFeedback}
                  onRequestAction={(action) => {
                    setMemberBulkAction(action);
                    setMemberBulkFeedback(null);
                  }}
                  onClear={() => {
                    setSelectedMembers([]);
                    setMemberBulkAction(null);
                  }}
                  onCancel={() => setMemberBulkAction(null)}
                  onConfirm={() => void bulkUpdateMembers()}
                />
                {memberLoading && !members.length ? (
                  <LoadingState label="Carregando equipe" description="Consultando acessos, perfis e escopos autorizados." minHeight="18rem" />
                ) : (
                <DataTable
                  rows={members.map((member) => ({ ...member, id: member.membershipId }))}
                  empty={
                    <EmptyState
                      eyebrow="Acesso ao tenant"
                      title="Nenhum membro encontrado."
                      description="Assim que usuários forem vinculados à empresa, eles aparecerão aqui com perfil, escopo e status."
                      icon={<UsersRound size={20} />}
                    />
                  }
                  columns={[
                    {
                      key: "select",
                      header: (
                        <input
                          type="checkbox"
                          aria-label="Selecionar todos os acessos desta página"
                          checked={members.length > 0 && members.every((member) => selectedMembers.includes(member.membershipId))}
                          onChange={(event) => {
                            setSelectedMembers(event.target.checked ? members.map((member) => member.membershipId) : []);
                            setMemberBulkFeedback(null);
                          }}
                        />
                      ),
                      render: (row) => (
                        <input
                          type="checkbox"
                          aria-label={`Selecionar acesso de ${row.userName}`}
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
                    { key: "status", header: "Status", render: (row) => <Badge>{row.status === "active" ? "Ativo" : "Desativado"}</Badge> },
                    { key: "permissions", header: "Permissões", render: (row) => `${row.permissions.length} regras` },
                    {
                      key: "actions",
                      header: "Ações",
                      render: (row) => (
                        <Button variant="secondary" onClick={() => void updateMember(row)}>
                          {row.status === "active" ? "Desativar" : "Reativar"}
                        </Button>
                      )
                    }
                  ]}
                />
                )}
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
            value: "permissions",
            label: "Permissões",
            content: (
              <Card>
                <CardContent className="grid gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">
                      Central de permissões
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">
                      O que cada perfil pode acessar
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Marque o que cada perfil pode ver ou executar. Proprietário fica bloqueado
                      como referência de acesso total para evitar perda acidental de administração.
                    </p>
                  </div>
                  <div className="grid gap-3 rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 md:grid-cols-[280px_minmax(0,1fr)] md:items-end">
                    <Select label="Simular visão de um perfil" value={simulatedRoleId} onChange={(event) => setSimulatedRoleId(event.target.value)} options={[{ label: "Selecione um perfil", value: "" }, ...roles.map((role) => ({ label: role.roleName, value: role.roleId }))]} />
                    <PermissionSimulation role={roles.find((role) => role.roleId === simulatedRoleId)} permissions={roleDrafts[simulatedRoleId] ?? roles.find((role) => role.roleId === simulatedRoleId)?.permissions ?? []} />
                  </div>
                  <div className="overflow-x-auto rounded-md border border-[var(--brand-border)]">
                    <table className="min-w-[1120px] w-full text-sm">
                      <thead className="bg-[var(--brand-surface)] text-left text-xs uppercase tracking-[0.14em] text-[var(--brand-secondary)]">
                        <tr>
                          <th className="px-4 py-3">Área</th>
                          {roles.map((role) => (
                            <th key={role.roleId} className="px-4 py-3">
                              <div className="flex items-center justify-between gap-2">
                                <span>{role.roleName}</span>
                                {role.roleSlug === "owner" ? (
                                  <Badge>Total</Badge>
                                ) : (
                                  <Button
                                    className="h-8 px-3 text-xs"
                                    variant="secondary"
                                    disabled={savingRoleId === role.roleId || !roleChanged(role, roleDrafts)}
                                    onClick={() => void saveRole(role)}
                                  >
                                    {savingRoleId === role.roleId ? "Salvando" : "Salvar"}
                                  </Button>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--brand-border)]">
                        {permissionGroups.map((group) => (
                          <tr key={group.label}>
                            <td className="px-4 py-3 font-medium text-[var(--brand-primary)]">
                              {group.label}
                            </td>
                            {roles.map((role) => {
                              const draft = roleDrafts[role.roleId] ?? role.permissions ?? [];
                              const granted = group.permissions.filter((permission) =>
                                draft.includes(permission),
                              ).length;
                              const full = granted === group.permissions.length;
                              return (
                                <td key={role.roleId} className="min-w-48 px-4 py-3 align-top">
                                  <div className="mb-2">
                                    <Badge className={full ? "border-emerald-200 bg-emerald-50 text-emerald-800" : granted ? "border-amber-200 bg-amber-50 text-amber-800" : ""}>
                                      {granted ? `${granted}/${group.permissions.length}` : "Sem acesso"}
                                    </Badge>
                                  </div>
                                  <div className="grid gap-1.5">
                                    {group.permissions.map((permission) => (
                                      <label key={permission} className="flex items-center gap-2 text-xs normal-case tracking-normal text-slate-700">
                                        <input
                                          type="checkbox"
                                          disabled={role.roleSlug === "owner"}
                                          checked={role.roleSlug === "owner" || draft.includes(permission)}
                                          onChange={() => togglePermission(role, permission)}
                                        />
                                        {permissionLabels[permission] ?? permission}
                                      </label>
                                    ))}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )
          },
          {
            value: "commercial",
            label: "Metas e comissões",
            content: (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="grid gap-4">
                  <Card>
                    <CardContent className="grid gap-4">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Comissão por venda</p>
                        <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">Regra por pessoa e filial</h2>
                        <p className="mt-1 text-sm text-slate-500">A comissão é provisionada automaticamente ao concluir a venda e ajustada em cancelamentos ou devoluções.</p>
                      </div>
                      <form className="grid gap-3" onSubmit={(event) => void saveCommissionRule(event)}>
                        <Select name="userId" label="Colaborador" options={[{ label: "Selecione", value: "" }, ...commercialMemberOptions]} required />
                        <Select name="branchId" label="Filial" options={branchOptions} />
                        <Input name="ratePercent" label="Comissão (%)" type="number" min="0" max="100" step="0.01" placeholder="Ex.: 2,5" required />
                        <Button type="submit" icon={<DollarSign size={16} />} disabled={commercialSaving}>Salvar regra</Button>
                      </form>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="grid gap-4">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Meta comercial</p>
                        <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">Meta por vendedor</h2>
                      </div>
                      <form className="grid gap-3" onSubmit={(event) => void saveSellerGoal(event)}>
                        <Select name="userId" label="Colaborador" options={[{ label: "Selecione", value: "" }, ...commercialMemberOptions]} required />
                        <Select name="branchId" label="Filial" options={branchOptions} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input name="periodStart" label="Início" type="date" defaultValue={monthStart()} required />
                          <Input name="periodEnd" label="Fim" type="date" defaultValue={monthEnd()} required />
                        </div>
                        <Input name="salesTarget" label="Meta de vendas (R$)" type="number" min="0" step="0.01" required />
                        <Button type="submit" icon={<Target size={16} />} disabled={commercialSaving}>Salvar meta</Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
                <div className="grid gap-4">
                  <Card>
                    <CardContent className="grid gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Regras ativas</p>
                        <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">Comissões configuradas</h2>
                      </div>
                      <DataTable rows={commissionRules} empty={<EmptyState eyebrow="Comissões" title="Nenhuma regra criada." description="Cadastre a primeira regra para provisionar comissões automaticamente nas vendas." icon={<DollarSign size={20} />} />} columns={[
                        { key: "person", header: "Colaborador", render: (row) => row.userName },
                        { key: "branch", header: "Filial", render: (row) => row.branchName ?? "Todas" },
                        { key: "rate", header: "Comissão", render: (row) => `${Number(row.ratePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` },
                        { key: "status", header: "Status", render: (row) => <Badge>{row.isActive ? "Ativa" : "Inativa"}</Badge> }
                      ]} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="grid gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Mês atual</p>
                        <h2 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">Acompanhamento das metas</h2>
                      </div>
                      <DataTable rows={sellerGoals} empty={<EmptyState eyebrow="Metas" title="Nenhuma meta para este período." description="Defina metas por pessoa para acompanhar resultado e comissão provisionada." icon={<Target size={20} />} />} columns={[
                        { key: "person", header: "Colaborador", render: (row) => row.userName },
                        { key: "scope", header: "Filial", render: (row) => row.branchName ?? "Todas" },
                        { key: "progress", header: "Realizado", render: (row) => `${currency(row.revenue)} de ${currency(row.salesTarget)}` },
                        { key: "commission", header: "Comissão", render: (row) => currency(row.provisionedCommission) }
                      ]} />
                    </CardContent>
                  </Card>
                </div>
              </div>
            )
          },
          {
            value: "invites",
            label: "Convites",
            content: (
              <div className="grid min-w-0 gap-4 2xl:grid-cols-[360px_minmax(0,1fr)]">
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
                      description="Ações críticas de acesso e governança ficarão registradas aqui assim que forem executadas."
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

function PermissionSimulation({ role, permissions }: { role?: RoleOption; permissions: string[] }) {
  if (!role) return <p className="text-sm leading-6 text-slate-500">Escolha um perfil para conferir exatamente quais áreas aparecem para ele. O bloqueio também é aplicado pela API.</p>;
  const visibleAreas = permissionGroups.filter((group) => role.roleSlug === "owner" || group.permissions.some((permission) => permissions.includes(permission))).map((group) => group.label);
  const blockedAreas = permissionGroups.filter((group) => !visibleAreas.includes(group.label)).map((group) => group.label);
  return <div className="grid gap-2 text-sm"><div><strong className="text-[var(--brand-primary)]">{role.roleName}</strong><span className="ml-2 text-slate-500">enxerga {visibleAreas.length} área(s)</span></div><p className="text-slate-600"><strong>Disponível:</strong> {visibleAreas.join(", ") || "nenhuma área"}.</p>{blockedAreas.length ? <p className="text-slate-500"><strong>Oculto e bloqueado:</strong> {blockedAreas.join(", ")}.</p> : null}</div>;
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

function roleChanged(role: RoleOption, drafts: Record<string, string[]>) {
  const original = [...(role.permissions ?? [])].sort().join("|");
  const draft = [...(drafts[role.roleId] ?? role.permissions ?? [])].sort().join("|");
  return original !== draft;
}

function monthStart() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
}

function monthEnd() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function currency(value: number) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
