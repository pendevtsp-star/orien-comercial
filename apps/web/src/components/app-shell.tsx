"use client";

import { BrandLogo, Button } from "@sgc/ui";
import {
  BarChart3,
  BellRing,
  Layers3,
  FileBarChart,
  Boxes,
  Building2,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  PackageCheck,
  Palette,
  Settings,
  Wrench,
  MonitorCog,
  PlugZap,
  ScanBarcode,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Truck,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, getTenantId, setTenantId } from "../lib/api";
import { applyPreferences, defaultPreferences, type UserPreferences } from "../lib/preferences";

type NavigationItem = { href: string; label: string; icon: typeof BarChart3; permissions?: string[]; anyPermissions?: string[]; platformOnly?: boolean };
const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3, permissions: ["dashboard.read"] },
  { href: "/branches", label: "Lojas", icon: Building2, permissions: ["branches.read"] },
  { href: "/products", label: "Produtos", icon: Boxes, permissions: ["products.read"] },
  { href: "/stock", label: "Estoque", icon: PackageCheck, permissions: ["stock.read"] },
  { href: "/suppliers", label: "Fornecedores", icon: Truck, permissions: ["stock.purchase"] },
  { href: "/purchases", label: "Compras", icon: ClipboardList, permissions: ["stock.purchase"] },
  { href: "/sales", label: "Vendas", icon: ShoppingCart, permissions: ["sales.read"] },
  { href: "/pos", label: "PDV", icon: ScanBarcode, permissions: ["sales.create"] },
  { href: "/customers", label: "Clientes", icon: UsersRound, permissions: ["customers.read"] },
  { href: "/catalog-tools", label: "Ferramentas", icon: Wrench, permissions: ["products.read"] },
  { href: "/financial", label: "Financeiro", icon: CircleDollarSign, permissions: ["financial.read"] },
  { href: "/reports", label: "Relatórios", icon: FileBarChart, anyPermissions: ["dashboard.read", "sales.read", "financial.read", "stock.reports"] },
  { href: "/alerts", label: "Alertas", icon: BellRing, permissions: ["stock.read"] },
  { href: "/operations", label: "Operacoes avancadas", icon: Layers3, permissions: ["dashboard.read"] },
  { href: "/team", label: "Equipe", icon: ShieldCheck, permissions: ["users.read"] },
  { href: "/subscription", label: "Assinatura", icon: CreditCard, permissions: ["subscriptions.read"] },
  { href: "/settings", label: "Configuracoes", icon: Settings, permissions: ["tenants.read"] },
  { href: "/integrations", label: "Integrações", icon: PlugZap, permissions: ["tenants.read"] },
  { href: "/preferences", label: "Preferencias", icon: Palette },
  { href: "/sessions", label: "Dispositivos", icon: ShieldCheck },
  { href: "/platform", label: "Gestão Orien", icon: MonitorCog, platformOnly: true },
];
const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Orien";

interface MeResponse {
  user: { name: string; email: string; mustChangePassword?: boolean; isPlatformAdmin?: boolean };
  memberships: Array<{
    tenantId: string;
    tenantName: string;
    branchId: string | null;
    branchName?: string | null;
    roleSlug: string;
    permissions: string[];
  }>;
}

function roleLabel(slug?: string | null) {
  return (
    (
      {
        owner: "Proprietario",
        admin: "Administrador",
        manager: "Gerente",
        seller: "Vendedor",
        cashier: "Caixa",
        stock: "Estoquista",
        finance: "Financeiro",
        support: "Suporte",
        viewer: "Consulta",
      } as Record<string, string>
    )[slug ?? ""] ?? "Perfil"
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    apiFetch<MeResponse>("/me")
      .then((payload) => {
        if (payload.user.mustChangePassword) {
          router.replace("/change-password");
          return;
        }
        setMe(payload);
        if (!getTenantId() && payload.memberships[0]?.tenantId) {
          setTenantId(payload.memberships[0].tenantId);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void apiFetch<UserPreferences>("/preferences").then((value) => {
      setPreferences(value);
      applyPreferences(value);
    });
  }, []);

  useEffect(() => {
    if (!me || !getTenantId()) return;
    void apiFetch<{ notifications: number }>("/operations/overview")
      .then((value) => setNotificationCount(Number(value.notifications ?? 0)))
      .catch(() => undefined);
  }, [me]);

  useEffect(() => {
    function redirectToLogin() {
      router.replace("/login?reason=session-expired");
    }

    window.addEventListener("sgc:session-expired", redirectToLogin);
    return () => window.removeEventListener("sgc:session-expired", redirectToLogin);
  }, [router]);

  const currentMembership = useMemo(() => {
    const tenantId = getTenantId();
    return (
      me?.memberships.find((membership) => membership.tenantId === tenantId) ??
      me?.memberships[0] ??
      null
    );
  }, [me]);
  useEffect(() => { document.title = currentMembership?.tenantName ? `Orien | ${currentMembership.tenantName}` : "Orien | Gestão inteligente"; }, [currentMembership?.tenantName]);
  const allowedNavigation = useMemo(() => {
    const granted = currentMembership?.permissions ?? [];
    return navigation.filter((item) => (!item.platformOnly || me?.user.isPlatformAdmin) && (!item.permissions || item.permissions.every((permission) => granted.includes(permission))) && (!item.anyPermissions || item.anyPermissions.some((permission) => granted.includes(permission))));
  }, [currentMembership]);
  const orderedNavigation = useMemo(
    () =>
      [...allowedNavigation].sort(
        (a, b) =>
          Number(preferences.favoriteRoutes.includes(b.href)) -
          Number(preferences.favoriteRoutes.includes(a.href)),
      ),
    [allowedNavigation, preferences.favoriteRoutes],
  );
  const compact = preferences.sidebarMode === "compact";
  const collapsed = preferences.sidebarMode === "collapsed";
  const roleName = roleLabel(currentMembership?.roleSlug);
  const routeItem = navigation.find((item) => pathname === item.href);
  const grantedPermissions = currentMembership?.permissions ?? [];
  const routeAllowed =
    !routeItem ||
    ((!routeItem.platformOnly || me?.user.isPlatformAdmin) && (!routeItem.permissions || routeItem.permissions.every((permission) => grantedPermissions.includes(permission))) && (!routeItem.anyPermissions || routeItem.anyPermissions.some((permission) => grantedPermissions.includes(permission))));
  const initials = (me?.user.name ?? "Orien")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  async function quickMode() {
    const next = {
      ...preferences,
      colorMode: preferences.colorMode === "dark" ? "light" : "dark",
    } as UserPreferences;
    setPreferences(next);
    applyPreferences(next);
    await apiFetch("/preferences", { method: "PATCH", body: JSON.stringify(next) }).catch(
      () => undefined,
    );
  }

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    router.push("/login");
  }

  useEffect(() => {
    if (!me || routeAllowed) return;
    router.replace(orderedNavigation[0]?.href ?? "/preferences");
  }, [me, orderedNavigation, routeAllowed, router]);

  return (
    <div className="min-h-screen bg-[var(--brand-surface)]">
      {mobileNavigationOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45"
            aria-label="Fechar navegação"
            onClick={() => setMobileNavigationOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[min(86vw,320px)] flex-col bg-[var(--brand-primary)] text-white shadow-2xl">
            <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
              <BrandLogo size="sm" theme="dark" />
              <Button
                variant="ghost"
                className="h-9 w-9 px-0 text-white hover:bg-white/10"
                aria-label="Fechar menu"
                onClick={() => setMobileNavigationOpen(false)}
              >
                <X size={18} />
              </Button>
            </div>
            <nav className="orien-sidebar-scroll grid gap-1 overflow-y-auto p-3">
              {orderedNavigation.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavigationOpen(false)}
                    className={`flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium ${active ? "bg-[linear-gradient(135deg,#133A7C,#2563EB)] text-white" : "text-white/80 hover:bg-white/10"}`}
                  >
                    <Icon size={17} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}
      {!collapsed ? (
        <aside
          className={`fixed inset-y-0 left-0 hidden border-r border-[#11284f] bg-[var(--brand-primary)] text-white lg:block ${compact ? "w-20" : "w-72"}`}
        >
          <div className="flex h-20 items-center border-b border-white/10 px-5">
            <div className="grid gap-1">
              <BrandLogo size="sm" theme="dark" iconOnly={compact} />
              {!compact ? (
                <p className="text-xs text-white/68">
                  Gestao inteligente para negocios em crescimento
                </p>
              ) : null}
            </div>
          </div>
          <nav className="orien-sidebar-scroll grid max-h-[calc(100vh-5rem)] gap-1 overflow-y-auto p-3 pb-32">
            {orderedNavigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={compact ? item.label : undefined}
                  className={`flex h-11 items-center rounded-md text-sm font-medium transition ${compact ? "justify-center px-0" : "gap-3 px-3"} ${
                    active
                      ? "bg-[linear-gradient(135deg,#133A7C,#2563EB)] text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)]"
                      : "text-white/74 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <Icon size={17} />
                  {!compact ? item.label : null}
                </Link>
              );
            })}
          </nav>
          {!compact ? (
            <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/72">
              <p className="font-medium text-white">{appName}</p>
              <p className="mt-1">
                Painel premium para operacao comercial, financeira e multiunidade.
              </p>
            </div>
          ) : null}
        </aside>
      ) : null}
      <div className={collapsed ? "" : compact ? "lg:pl-20" : "lg:pl-72"}>
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-[var(--brand-border)] bg-white/95 px-4 py-3 backdrop-blur lg:h-16 lg:px-8 lg:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--brand-border)] bg-white text-[var(--brand-primary)] transition hover:bg-[var(--brand-surface)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-blue-500/25 ${collapsed ? "" : "lg:hidden"}`}
              aria-label="Abrir menu"
              onClick={() => setMobileNavigationOpen(true)}
            >
              <Menu size={18} />
            </button>
            <div className="grid min-w-0 gap-1">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">
                Tenant ativo
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <p className="max-w-[13rem] truncate text-sm font-semibold text-[var(--brand-primary)] sm:max-w-none">
                  {currentMembership?.tenantName ?? "Carregando..."}
                </p>
                <p className="max-w-[13rem] truncate text-xs text-slate-500 sm:max-w-none">
                  Perfil {currentMembership?.roleSlug ?? "-"}
                  {currentMembership?.branchId ? " · Filial autorizada" : " · Todas as lojas"}
                </p>
              </div>
              {me?.memberships && me.memberships.length > 1 ? (
                <select
                  className="h-9 max-w-xs rounded-md border border-[var(--brand-border)] bg-white px-3 text-sm text-[var(--brand-primary)]"
                  value={currentMembership?.tenantId ?? ""}
                  onChange={(event) => {
                    setTenantId(event.target.value);
                    window.location.reload();
                  }}
                >
                  {me.memberships.map((membership) => (
                    <option key={membership.tenantId} value={membership.tenantId}>
                      {membership.tenantName}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
          <div className="relative flex shrink-0 items-center gap-2">
            <Link
              href="/operations"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--brand-border)] bg-white text-[var(--brand-primary)]"
              aria-label="Notificacoes"
            >
              <BellRing size={17} />
              {notificationCount ? (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold text-white">
                  {Math.min(notificationCount, 99)}
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--brand-border)] bg-white p-1.5 pr-2 text-left"
              onClick={() => setAccountOpen((value) => !value)}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--brand-primary)] text-xs font-semibold text-white">
                {initials}
              </span>
              <span className="hidden min-w-0 sm:grid">
                <strong className="max-w-32 truncate text-xs text-[var(--brand-primary)]">
                  {me?.user.name ?? "Carregando"}
                </strong>
                <span className="text-[11px] text-slate-500">{roleName}</span>
              </span>
              <ChevronDown size={14} />
            </button>
            {accountOpen ? (
              <div className="absolute right-0 top-12 z-50 grid w-72 gap-1 rounded-md border border-[var(--brand-border)] bg-white p-2 shadow-2xl">
                <div className="border-b border-[var(--brand-border)] p-3">
                  <p className="font-semibold text-[var(--brand-primary)]">{me?.user.name}</p>
                  <p className="truncate text-xs text-slate-500">{me?.user.email}</p>
                  <p className="mt-2 text-xs text-[var(--brand-secondary)]">
                    {roleName} ·{" "}
                    {currentMembership?.branchId ? "Filial autorizada" : "Todas as lojas"}
                  </p>
                </div>
                <button
                  className="flex items-center gap-2 rounded-md p-3 text-sm hover:bg-[var(--brand-surface)]"
                  onClick={() => void quickMode()}
                >
                  {preferences.colorMode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                  Alternar claro/escuro
                </button>
                <Link
                  className="rounded-md p-3 text-sm hover:bg-[var(--brand-surface)]"
                  href="/preferences"
                >
                  Aparencia e preferencias
                </Link>
                <Link
                  className="rounded-md p-3 text-sm hover:bg-[var(--brand-surface)]"
                  href="/sessions"
                >
                  Dispositivos conectados
                </Link>
                <Link
                  className="rounded-md p-3 text-sm hover:bg-[var(--brand-surface)]"
                  href="/change-password"
                >
                  Trocar senha
                </Link>
                <button
                  className="flex items-center gap-2 rounded-md p-3 text-left text-sm text-rose-600 hover:bg-rose-50"
                  onClick={() => void logout()}
                >
                  <LogOut size={16} />
                  Sair
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1600px] overflow-x-clip px-3 py-5 sm:px-4 lg:px-6 xl:px-8">
          {!me ? (
            <div className="py-16 text-center text-sm text-slate-500">Carregando acesso...</div>
          ) : routeAllowed ? (
            children
          ) : (
            <div className="py-16 text-center text-sm text-slate-500">Redirecionando para uma area autorizada...</div>
          )}
        </main>
        <footer className="px-3 pb-4 text-center text-[11px] text-slate-500 sm:px-4 lg:px-6">
          Orien · Beta privado
        </footer>
      </div>
    </div>
  );
}
