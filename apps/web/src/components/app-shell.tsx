"use client";

import { BrandLogo, Button } from "@sgc/ui";
import {
  BarChart3,
  BellRing,
  Layers3,
  Boxes,
  Building2,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  LogOut,
  Menu,
  PackageCheck,
  Settings,
  Wrench,
  ScanBarcode,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, getTenantId, setTenantId } from "../lib/api";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/branches", label: "Lojas", icon: Building2 },
  { href: "/products", label: "Produtos", icon: Boxes },
  { href: "/stock", label: "Estoque", icon: PackageCheck },
  { href: "/suppliers", label: "Fornecedores", icon: Truck },
  { href: "/purchases", label: "Compras", icon: ClipboardList },
  { href: "/sales", label: "Vendas", icon: ShoppingCart },
  { href: "/pos", label: "PDV", icon: ScanBarcode },
  { href: "/customers", label: "Clientes", icon: UsersRound },
  { href: "/catalog-tools", label: "Ferramentas", icon: Wrench },
  { href: "/financial", label: "Financeiro", icon: CircleDollarSign },
  { href: "/alerts", label: "Alertas", icon: BellRing },
  { href: "/operations", label: "Operacoes avancadas", icon: Layers3 },
  { href: "/team", label: "Equipe", icon: ShieldCheck },
  { href: "/subscription", label: "Assinatura", icon: CreditCard },
  { href: "/settings", label: "Configuracoes", icon: Settings },
  { href: "/sessions", label: "Dispositivos", icon: ShieldCheck },
];
const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Orien";

interface MeResponse {
  user: { name: string; email: string; mustChangePassword?: boolean };
  memberships: Array<{
    tenantId: string;
    tenantName: string;
    branchId: string | null;
    roleSlug: string;
  }>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

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

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    router.push("/login");
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
            <nav className="grid gap-1 overflow-y-auto p-3">
              {navigation.map((item) => {
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
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-[#11284f] bg-[var(--brand-primary)] text-white lg:block">
        <div className="flex h-20 items-center border-b border-white/10 px-5">
          <div className="grid gap-1">
            <BrandLogo size="sm" theme="dark" />
            <p className="text-xs text-white/68">Gestao inteligente para negocios em crescimento</p>
          </div>
        </div>
        <nav className="grid max-h-[calc(100vh-5rem)] gap-1 overflow-y-auto p-3 pb-32">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                  active
                    ? "bg-[linear-gradient(135deg,#133A7C,#2563EB)] text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)]"
                    : "text-white/74 hover:bg-white/8 hover:text-white"
                }`}
              >
                <Icon size={17} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/72">
          <p className="font-medium text-white">{appName}</p>
          <p className="mt-1">Painel premium para operacao comercial, financeira e multiunidade.</p>
        </div>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-[var(--brand-border)] bg-white/95 px-4 py-3 backdrop-blur lg:h-16 lg:px-8 lg:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="secondary"
              className="h-9 w-9 px-0 lg:hidden"
              aria-label="Abrir menu"
              onClick={() => setMobileNavigationOpen(true)}
            >
              <Menu size={18} />
            </Button>
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
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => void logout()}
            icon={<LogOut size={16} />}
          >
            Sair
          </Button>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1600px] overflow-x-clip px-3 py-5 sm:px-4 lg:px-6 xl:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
