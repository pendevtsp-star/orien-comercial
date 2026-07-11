"use client";

import { BrandLogo, Button, Input } from "@sgc/ui";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch, setTenantId } from "../../lib/api";

interface MeResponse {
  user: { mustChangePassword?: boolean };
  memberships: Array<{ tenantId: string }>;
}
const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Orien";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    setSessionExpired(new URLSearchParams(window.location.search).get("reason") === "session-expired");
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          rememberMe: form.get("rememberMe") === "on"
        })
      });
      const me = await apiFetch<MeResponse>("/me");
      const firstTenant = me.memberships[0]?.tenantId;
      if (firstTenant) setTenantId(firstTenant);
      router.push(me.user.mustChangePassword ? "/change-password" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#f7f8fc_0%,#eef2f8_44%,#f8fafc_100%)] px-4">
      <section className="w-full max-w-md rounded-2xl border border-[var(--brand-border)] bg-white p-5 shadow-[0_24px_70px_rgba(11,29,61,0.08)] sm:p-7">
        <div className="mb-6">
          <BrandLogo size="sm" className="mb-5" />
          <p className="text-sm font-medium text-[var(--brand-secondary)]">{appName}</p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--brand-primary)]">Entrar no painel</h1>
          <p className="mt-2 text-sm text-slate-500">Use uma conta vinculada ao tenant para acessar dados reais.</p>
        </div>
        <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
          {sessionExpired ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Sua sessão expirou. Entre novamente para continuar.</p> : null}
          <Input label="E-mail" name="email" type="email" autoComplete="email" required />
          <label className="grid gap-1.5 text-sm text-slate-700" htmlFor="password">
            <span className="font-medium">Senha</span>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="h-10 w-full rounded-md border border-[var(--brand-border)] bg-white px-3 pr-11 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[color:rgba(245,195,74,0.2)]"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-slate-500 transition hover:text-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                title={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-600">
            <input name="rememberMe" type="checkbox" className="mt-0.5 h-4 w-4 rounded border-[var(--brand-border)] accent-[var(--brand-secondary)]" />
            <span><span className="font-medium text-[var(--brand-primary)]">Manter conectado</span><span className="mt-0.5 block text-xs text-slate-500">Use apenas em um dispositivo pessoal. A sessão poderá ser renovada por até 30 dias.</span></span>
          </label>
          {error ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </section>
    </main>
  );
}
