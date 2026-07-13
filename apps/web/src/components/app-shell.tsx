"use client";

import { BrandLogo, Button } from "@sgc/ui";
import {
  BarChart3,
  BellRing,
  BriefcaseBusiness,
  FileBarChart,
  FileText,
  Tag,
  Gift,
  Boxes,
  Building2,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  ChevronDown,
  CircleHelp,
  Headset,
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
  Search,
  Star,
  Sun,
  History,
  Truck,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, getTenantId, setTenantId } from "../lib/api";
import { applyPreferences, defaultPreferences, type UserPreferences } from "../lib/preferences";

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof BarChart3;
  permissions?: string[];
  anyPermissions?: string[];
  platformOnly?: boolean;
};
const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Visão estratégica", icon: BarChart3, permissions: ["dashboard.read"] },
  { href: "/store-central", label: "Operação de hoje", icon: BriefcaseBusiness, permissions: ["dashboard.read"] },
  { href: "/branches", label: "Lojas", icon: Building2, permissions: ["branches.read"] },
  { href: "/products", label: "Produtos", icon: Boxes, permissions: ["products.read"] },
  { href: "/stock", label: "Estoque", icon: PackageCheck, permissions: ["stock.read"] },
  { href: "/suppliers", label: "Fornecedores", icon: Truck, permissions: ["stock.purchase"] },
  { href: "/purchases", label: "Compras", icon: ClipboardList, permissions: ["stock.purchase"] },
  { href: "/sales", label: "Vendas", icon: ShoppingCart, permissions: ["sales.read"] },
  { href: "/pos", label: "PDV", icon: ScanBarcode, permissions: ["sales.create"] },
  { href: "/operations?section=quotes", label: "Orçamentos e pedidos", icon: FileText, permissions: ["sales.create"] },
  { href: "/operations?section=pricing", label: "Promoções e preços", icon: Tag, permissions: ["sales.create"] },
  { href: "/operations?section=credit", label: "Crediário", icon: CircleDollarSign, permissions: ["financial.read"] },
  { href: "/customers", label: "Clientes", icon: UsersRound, permissions: ["customers.read"] },
  { href: "/loyalty", label: "Fidelidade", icon: Gift, permissions: ["customers.read"] },
  { href: "/catalog-tools", label: "Ferramentas", icon: Wrench, permissions: ["products.read"] },
  { href: "/printers", label: "Impressoras", icon: MonitorCog, permissions: ["products.read"] },
  {
    href: "/financial",
    label: "Financeiro",
    icon: CircleDollarSign,
    permissions: ["financial.read"],
  },
  {
    href: "/reports",
    label: "Relatórios",
    icon: FileBarChart,
    anyPermissions: ["dashboard.read", "sales.read", "financial.read", "stock.reports"],
  },
  { href: "/alerts", label: "Alertas", icon: BellRing, permissions: ["stock.read"] },
  { href: "/tasks", label: "Tarefas", icon: ClipboardList, permissions: ["dashboard.read"] },
  { href: "/support", label: "Suporte", icon: Headset, permissions: ["dashboard.read"] },
  { href: "/audit", label: "Auditoria", icon: History, permissions: ["users.read"] },
  { href: "/team", label: "Equipe", icon: ShieldCheck, permissions: ["users.read"] },
  {
    href: "/subscription",
    label: "Assinatura",
    icon: CreditCard,
    permissions: ["subscriptions.read"],
  },
  { href: "/settings", label: "Configurações", icon: Settings, permissions: ["tenants.read"] },
  { href: "/integrations", label: "Integrações", icon: PlugZap, permissions: ["tenants.read"] },
  { href: "/preferences", label: "Preferências", icon: Palette },
  { href: "/sessions", label: "Dispositivos", icon: ShieldCheck },
];
const navigationGroups = [
  { id: "overview", label: "Visão executiva", routes: ["/dashboard"] },
  { id: "operation", label: "Operação diária", routes: ["/store-central", "/pos", "/sales", "/operations?section=quotes"] },
  {
    id: "catalog",
    label: "Catálogo e estoque",
    routes: ["/branches", "/products", "/stock", "/suppliers", "/purchases", "/catalog-tools", "/printers"],
  },
  { id: "customers", label: "Clientes", routes: ["/customers", "/loyalty"] },
  {
    id: "management",
    label: "Gestão",
    routes: ["/financial", "/reports", "/alerts", "/tasks", "/support", "/operations?section=pricing", "/operations?section=credit", "/audit"],
  },
  {
    id: "administration",
    label: "Administração",
    routes: [
      "/team",
      "/subscription",
      "/settings",
      "/integrations",
      "/preferences",
      "/sessions",
    ],
  },
] as const;
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

function helpForPath(pathname: string) {
  if (pathname === "/pos")
    return {
      title: "PDV rápido",
      text: "Use F2 para focar o leitor. Você também pode digitar o nome, SKU ou código do produto para adicioná-lo manualmente.",
      tip: "F4 seleciona dinheiro, F6 Pix e F8 cartão.",
    };
  if (pathname === "/purchases")
    return {
      title: "Compras",
      text: "Crie o pedido, aprove-o e registre recebimentos parciais quando a entrega chegar.",
      tip: "O recebimento atualiza estoque e custo do produto.",
    };
  if (pathname === "/stock")
    return {
      title: "Estoque",
      text: "Acompanhe saldo, transferências, inventários e entradas por compra.",
      tip: "Priorize itens abaixo do mínimo e produtos sem giro.",
    };
  if (pathname === "/financial")
    return {
      title: "Financeiro",
      text: "Registre contas, baixas e conciliações para manter o caixa previsto confiável.",
      tip: "Use filtros por situação antes de fazer ações em lote.",
    };
  return {
    title: "Atalho da Orien",
    text: "Use a busca global para encontrar registros e navegue pelos grupos do menu conforme seu fluxo de trabalho.",
    tip: "Ctrl/Cmd + K abre a busca de qualquer tela.",
  };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [notificationCount, setNotificationCount] = useState(0);
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editingFavorites, setEditingFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ label: string; detail: string; href: string }>
  >([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [currentSearch, setCurrentSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    overview: true,
    operation: true,
    catalog: false,
    customers: false,
    management: false,
    administration: false,
  });

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

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void Promise.all([
        apiFetch<{ data: Array<{ id: string; name: string; sku?: string }> }>(
          `/products?pageSize=5&search=${encodeURIComponent(query)}`,
        ).catch(() => ({ data: [] })),
        apiFetch<{ data: Array<{ id: string; name: string; document?: string }> }>(
          `/customers?pageSize=5&search=${encodeURIComponent(query)}`,
        ).catch(() => ({ data: [] })),
        apiFetch<{ data: Array<{ id: string; customerName?: string; totalAmount?: string }> }>(
          `/sales?pageSize=5&search=${encodeURIComponent(query)}`,
        ).catch(() => ({ data: [] })),
        apiFetch<{ data: Array<{ id: string; supplierName?: string; status?: string }> }>(
          `/purchases?pageSize=5&search=${encodeURIComponent(query)}`,
        ).catch(() => ({ data: [] })),
      ]).then(([products, customers, sales, purchases]) =>
        setSearchResults([
          ...products.data.map((item) => ({
            label: item.name,
            detail: `Produto${item.sku ? ` · ${item.sku}` : ""}`,
            href: `/products?focus=${item.id}`,
          })),
          ...customers.data.map((item) => ({
            label: item.name,
            detail: `Cliente${item.document ? ` · ${item.document}` : ""}`,
            href: `/customers?focus=${item.id}`,
          })),
          ...sales.data.map((item) => ({
            label: item.customerName ?? "Venda sem cliente",
            detail: `Venda · R$ ${Number(item.totalAmount ?? 0).toLocaleString("pt-BR")}`,
            href: `/sales?focus=${item.id}`,
          })),
          ...purchases.data.map((item) => ({
            label: item.supplierName ?? "Compra",
            detail: `Pedido · ${item.status ?? ""}`,
            href: `/purchases?focus=${item.id}`,
          })),
        ]),
      );
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);
  useEffect(() => {
    setActiveSearchIndex(0);
  }, [searchResults.length, searchQuery]);

  const currentMembership = useMemo(() => {
    const tenantId = getTenantId();
    return (
      me?.memberships.find((membership) => membership.tenantId === tenantId) ??
      me?.memberships[0] ??
      null
    );
  }, [me]);
  useEffect(() => {
    document.title = currentMembership?.tenantName
      ? `Orien | ${currentMembership.tenantName}`
      : "Orien | Gestão inteligente";
  }, [currentMembership?.tenantName]);
  useEffect(() => {
    setCurrentSearch(window.location.search.slice(1));
  }, [pathname]);
  const allowedNavigation = useMemo(() => {
    const granted = currentMembership?.permissions ?? [];
    return navigation.filter(
      (item) =>
        (!item.platformOnly || me?.user.isPlatformAdmin) &&
        (!item.permissions ||
          item.permissions.every((permission) => granted.includes(permission))) &&
        (!item.anyPermissions ||
          item.anyPermissions.some((permission) => granted.includes(permission))),
    );
  }, [currentMembership]);
  const groupedNavigation = useMemo(() => {
    const favoriteRoutes = new Set(preferences.favoriteRoutes);
    const favoriteItems = allowedNavigation.filter((item) => favoriteRoutes.has(item.href));
    const groups = navigationGroups
      .map((group) => ({
        ...group,
        items: group.routes.flatMap((route) => {
          const item = allowedNavigation.find((candidate) => candidate.href === route);
          return item && !favoriteRoutes.has(item.href) ? [item] : [];
        }),
      }))
      .filter((group) => group.items.length > 0);
    return { favoriteItems, groups };
  }, [allowedNavigation, preferences.favoriteRoutes]);
  const compact = preferences.sidebarMode === "compact";
  const collapsed = preferences.sidebarMode === "collapsed";
  const roleName = roleLabel(currentMembership?.roleSlug);
  const routeItem = navigation.find((item) => pathname === item.href);
  const grantedPermissions = currentMembership?.permissions ?? [];
  const routeAllowed =
    !routeItem ||
    ((!routeItem.platformOnly || me?.user.isPlatformAdmin) &&
      (!routeItem.permissions ||
        routeItem.permissions.every((permission) => grantedPermissions.includes(permission))) &&
      (!routeItem.anyPermissions ||
        routeItem.anyPermissions.some((permission) => grantedPermissions.includes(permission))));
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

  async function toggleFavorite(href: string) {
    const favoriteRoutes = preferences.favoriteRoutes.includes(href)
      ? preferences.favoriteRoutes.filter((route) => route !== href)
      : [...preferences.favoriteRoutes, href].slice(0, 8);
    const next = { ...preferences, favoriteRoutes };
    setPreferences(next);
    applyPreferences(next);
    await apiFetch("/preferences", { method: "PATCH", body: JSON.stringify(next) }).catch(() => {
      setPreferences(preferences);
      applyPreferences(preferences);
    });
  }

  useEffect(() => {
    if (!me || routeAllowed) return;
    router.replace(
      groupedNavigation.favoriteItems[0]?.href ??
        groupedNavigation.groups[0]?.items[0]?.href ??
        "/preferences",
    );
  }, [me, groupedNavigation, routeAllowed, router]);

  function navigationLink(item: NavigationItem, compactMode: boolean, closeMobile = false) {
    const Icon = item.icon;
    const active = item.href.includes("?")
      ? pathname === item.href.split("?")[0] && currentSearch === item.href.split("?")[1]
      : pathname === item.href;
    return (
      <div key={item.href} className="relative flex items-center">
      <Link
        href={item.href}
        title={compactMode ? item.label : undefined}
        onClick={() => closeMobile && setMobileNavigationOpen(false)}
        className={`orien-nav-item flex h-11 min-w-0 flex-1 items-center rounded-md text-sm font-medium transition ${compactMode ? "justify-center px-0" : "gap-3 px-3"} ${active ? "orien-nav-item-active" : ""}`}
      >
        <Icon size={17} />
        {!compactMode ? item.label : null}
      </Link>
      {editingFavorites && !compactMode ? <button type="button" aria-label={`${preferences.favoriteRoutes.includes(item.href) ? "Remover dos" : "Adicionar aos"} favoritos`} title={preferences.favoriteRoutes.includes(item.href) ? "Remover dos favoritos" : "Adicionar aos favoritos"} className="absolute right-2 grid h-7 w-7 place-items-center rounded-md text-white/75 hover:bg-white/10 hover:text-[var(--brand-accent)]" onClick={() => void toggleFavorite(item.href)}><Star size={15} fill={preferences.favoriteRoutes.includes(item.href) ? "currentColor" : "none"} /></button> : null}
      </div>
    );
  }

  function navigationContent(compactMode: boolean, closeMobile = false) {
    return (
      <>
        {groupedNavigation.favoriteItems.length ? (
          <section className="grid gap-1">
            {!compactMode ? <div className="flex items-center justify-between px-2"><p className="orien-nav-group-label p-0">Favoritos</p><button type="button" className="rounded px-1 text-[10px] font-medium text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setEditingFavorites((value) => !value)}>{editingFavorites ? "Concluir" : "Editar"}</button></div> : null}
            {groupedNavigation.favoriteItems.map((item) =>
              navigationLink(item, compactMode, closeMobile),
            )}
          </section>
        ) : null}
        {groupedNavigation.groups.map((group) => {
          const containsActive = group.items.some((item) => item.href === pathname);
          const open = compactMode || containsActive || openGroups[group.id];
          return (
            <section key={group.id} className="grid gap-1">
              {!compactMode ? (
                <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="orien-nav-group-label flex items-center justify-between"
                  aria-expanded={open}
                  onClick={() =>
                    setOpenGroups((current) => ({ ...current, [group.id]: !current[group.id] }))
                  }
                >
                  {group.label}
                  <ChevronDown
                    className={open ? "transition-transform" : "-rotate-90 transition-transform"}
                    size={14}
                  />
                </button>
                {editingFavorites || group.id === "overview" ? <button type="button" className="shrink-0 rounded px-1.5 py-1 text-[10px] font-medium text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setEditingFavorites((value) => !value)} title={editingFavorites ? "Concluir edição de favoritos" : "Editar favoritos"}>{editingFavorites ? "Concluir" : "Editar"}</button> : null}
                </div>
              ) : null}
              {open
                ? group.items.map((item) => navigationLink(item, compactMode, closeMobile))
                : null}
            </section>
          );
        })}
      </>
    );
  }

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
            <nav className="orien-sidebar-scroll grid content-start gap-4 overflow-y-auto p-3">
              {navigationContent(false, true)}
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
          <nav className="orien-sidebar-scroll grid max-h-[calc(100vh-5rem)] content-start gap-4 overflow-y-auto p-3 pb-32">
            {navigationContent(compact)}
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
            <button
              type="button"
              className="hidden h-10 items-center gap-2 rounded-md border border-[var(--brand-border)] bg-white px-3 text-sm text-slate-500 lg:flex"
              onClick={() => setCommandOpen(true)}
              aria-label="Busca global"
            >
              <Search size={16} /> Buscar{" "}
              <kbd className="rounded border px-1 text-[10px]">Ctrl K</kbd>
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--brand-border)] bg-white text-[var(--brand-primary)]"
              aria-label="Ajuda desta tela"
              onClick={() => setHelpOpen((value) => !value)}
            >
              <CircleHelp size={17} />
            </button>
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
        {helpOpen ? (
          <aside className="fixed bottom-5 right-5 z-40 w-[min(92vw,360px)] rounded-xl border border-[var(--brand-border)] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-[.14em] text-[var(--brand-secondary)]">
                  AJUDA CONTEXTUAL
                </p>
                <h2 className="mt-1 font-semibold text-[var(--brand-primary)]">
                  {helpForPath(pathname).title}
                </h2>
              </div>
              <button onClick={() => setHelpOpen(false)} aria-label="Fechar ajuda">
                ×
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{helpForPath(pathname).text}</p>
            <p className="mt-3 rounded-md bg-[var(--brand-surface)] p-3 text-xs text-slate-600">
              {helpForPath(pathname).tip}
            </p>
          </aside>
        ) : null}
        {commandOpen ? (
          <div
            className="fixed inset-0 z-50 grid place-items-start bg-slate-950/45 p-4 pt-[12vh]"
            onMouseDown={() => setCommandOpen(false)}
          >
            <div
              className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--brand-border)] bg-white shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-[var(--brand-border)] px-4">
                <Search size={18} />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar produto, cliente, venda ou pedido"
                  className="h-14 flex-1 border-0 bg-transparent outline-none"
                  role="combobox"
                  aria-expanded={searchResults.length > 0}
                  aria-controls="global-search-results"
                  aria-activedescendant={
                    searchResults.length ? `global-search-result-${activeSearchIndex}` : undefined
                  }
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveSearchIndex((current) =>
                        Math.min(searchResults.length - 1, current + 1),
                      );
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveSearchIndex((current) => Math.max(0, current - 1));
                    }
                    if (event.key === "Enter" && searchResults[activeSearchIndex]) {
                      event.preventDefault();
                      router.push(searchResults[activeSearchIndex].href);
                      setCommandOpen(false);
                    }
                    if ((event.ctrlKey || event.metaKey) && event.key === "Backspace") {
                      event.preventDefault();
                      setSearchQuery("");
                    }
                  }}
                />
              </div>
              <div id="global-search-results" role="listbox" className="max-h-80 overflow-auto p-2">
                {searchQuery.trim().length < 2 ? (
                  <p className="p-4 text-sm text-slate-500">Digite ao menos dois caracteres.</p>
                ) : searchResults.length ? (
                  searchResults.map((result, index) => {
                    const active = index === activeSearchIndex;
                    return (
                    <Link
                      id={`global-search-result-${index}`}
                      role="option"
                      aria-selected={active}
                      key={`${result.href}-${index}`}
                      href={result.href}
                      onClick={() => setCommandOpen(false)}
                      onMouseEnter={() => setActiveSearchIndex(index)}
                      className={`grid rounded-md px-3 py-2.5 ${
                        active
                          ? "bg-[var(--brand-highlight)] text-white"
                          : "hover:bg-[var(--brand-surface)]"
                      }`}
                    >
                      <strong className="text-sm">{result.label}</strong>
                      <span className={`text-xs ${active ? "text-white/75" : "text-slate-500"}`}>
                        {result.detail}
                      </span>
                    </Link>
                    );
                  })
                ) : (
                  <p className="p-4 text-sm text-slate-500">Nenhum resultado encontrado.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
        <main className="mx-auto w-full min-w-0 max-w-[1600px] overflow-x-clip px-3 py-5 sm:px-4 lg:px-6 xl:px-8">
          {!me ? (
            <div className="py-16 text-center text-sm text-slate-500">Carregando acesso...</div>
          ) : routeAllowed ? (
            children
          ) : (
            <div className="py-16 text-center text-sm text-slate-500">
              Redirecionando para uma area autorizada...
            </div>
          )}
        </main>
        <footer className="px-3 pb-4 text-center text-[11px] text-slate-500 sm:px-4 lg:px-6">
          Orien · Beta privado
        </footer>
      </div>
    </div>
  );
}
