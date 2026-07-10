"use client";

import { BrandLogo, Button, Input } from "@sgc/ui";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiFetch, setTenantId } from "../../lib/api";

interface MeResponse {
  memberships: Array<{ tenantId: string }>;
}
const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Orien";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          password: form.get("password")
        })
      });
      const me = await apiFetch<MeResponse>("/me");
      const firstTenant = me.memberships[0]?.tenantId;
      if (firstTenant) setTenantId(firstTenant);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#f7f8fc_0%,#eef2f8_44%,#f8fafc_100%)] px-4">
      <section className="w-full max-w-md rounded-2xl border border-[var(--brand-border)] bg-white p-7 shadow-[0_24px_70px_rgba(11,29,61,0.08)]">
        <div className="mb-6">
          <BrandLogo size="sm" className="mb-5" />
          <p className="text-sm font-medium text-[var(--brand-secondary)]">{appName}</p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--brand-primary)]">Entrar no painel</h1>
          <p className="mt-2 text-sm text-slate-500">Use uma conta vinculada ao tenant para acessar dados reais.</p>
        </div>
        <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
          <Input label="E-mail" name="email" type="email" autoComplete="email" required />
          <Input label="Senha" name="password" type="password" autoComplete="current-password" required />
          {error ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
          <Button type="submit" disabled={loading} icon={<ArrowRight size={16} />}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </section>
    </main>
  );
}
