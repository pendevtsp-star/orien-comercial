"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@sgc/ui";

const api = process.env.NEXT_PUBLIC_API_URL ?? "https://api.useorien.com.br/api/v1";
const plans: Record<string, { label: string; price: string; description: string }> = {
  starter: { label: "Essencial", price: "R$ 99/mês", description: "Fundação comercial para começar com organização." },
  pro: { label: "Pro", price: "R$ 199/mês", description: "Operação completa para empresas em expansão." },
  enterprise: { label: "Enterprise", price: "R$ 399/mês", description: "Estrutura ampliada para operações exigentes." }
};

export default function CheckoutPage() {
  const [planSlug, setPlanSlug] = useState("pro");
  const [companyName, setCompanyName] = useState("");
  const [document, setDocument] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = useMemo(() => plans[planSlug] ?? { label: "Pro", price: "R$ 199/mês", description: "Operação completa para empresas em expansão." }, [planSlug]);

  useEffect(() => {
    const plan = new URLSearchParams(window.location.search).get("plan");
    if (plan && plans[plan]) setPlanSlug(plan);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${api}/subscriptions/public/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planSlug, companyName, document, ownerName, email, password, couponCode: couponCode || undefined, billingType: "PIX" })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? "Não foi possível iniciar sua contratação.");
      if (result.trialStarted && result.loginUrl) {
        window.location.assign(result.loginUrl);
        return;
      }
      if (!result.checkoutUrl) throw new Error("A cobrança foi criada, mas o checkout não foi retornado.");
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar sua contratação.");
      setLoading(false);
    }
  }

  return <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-[#0b1d3d] lg:py-14"><div className="mx-auto grid max-w-5xl gap-7 lg:grid-cols-[0.85fr_1.15fr]"><aside className="rounded-xl bg-[#0b1d3d] p-7 text-white lg:p-10"><BrandLogo size="sm" /><p className="mt-12 text-xs font-semibold tracking-[0.18em] text-[#f5c34a]">CONTRATAÇÃO ORIEN</p><h1 data-brand-display="true" className="mt-3 text-4xl">Comece com uma operação organizada.</h1><p className="mt-4 leading-7 text-slate-300">Você cria a empresa, recebe o acesso de proprietário e conclui a primeira mensalidade em ambiente seguro.</p><div className="mt-10 rounded-lg border border-white/15 bg-white/10 p-5"><p className="text-sm text-slate-300">Plano selecionado</p><p className="mt-1 text-2xl font-semibold">{selected.label}</p><p className="mt-1 text-[#f5c34a]">{selected.price}</p><p className="mt-4 text-sm leading-6 text-slate-300">{selected.description}</p></div><p className="mt-8 text-xs leading-5 text-slate-400">Pagamento seguro por Pix ou cartão, processado pelo Asaas. Dados de cartão não passam pelos servidores da Orien.</p></aside><section className="rounded-xl border border-[#d9e1ee] bg-white p-6 shadow-sm lg:p-10"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold tracking-[0.18em] text-[#2563eb]">SEU ESPAÇO ORIEN</p><h2 data-brand-display="true" className="mt-2 text-3xl">Criar empresa e contratar</h2></div><Link className="text-sm font-semibold text-[#2563eb]" href="/">Voltar</Link></div><form className="mt-8 grid gap-4" onSubmit={submit}><label className="grid gap-1 text-sm font-semibold">Plano<select value={planSlug} onChange={(event) => setPlanSlug(event.target.value)} className="rounded-lg border border-[#cbd7e9] px-3 py-3"><option value="starter">Essencial - R$ 99/mês</option><option value="pro">Pro - R$ 199/mês</option><option value="enterprise">Enterprise - R$ 399/mês</option></select></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">Nome da empresa<input required value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="rounded-lg border border-[#cbd7e9] px-3 py-3" /></label><label className="grid gap-1 text-sm font-semibold">CPF ou CNPJ<input required value={document} onChange={(event) => setDocument(event.target.value)} inputMode="numeric" placeholder="Somente números" className="rounded-lg border border-[#cbd7e9] px-3 py-3" /></label></div><label className="grid gap-1 text-sm font-semibold">Nome do proprietário<input required value={ownerName} onChange={(event) => setOwnerName(event.target.value)} className="rounded-lg border border-[#cbd7e9] px-3 py-3" /></label><label className="grid gap-1 text-sm font-semibold">E-mail de acesso<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="rounded-lg border border-[#cbd7e9] px-3 py-3" /></label><label className="grid gap-1 text-sm font-semibold">Senha de acesso<span className="relative"><input required type={showPassword ? "text" : "password"} minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="w-full rounded-lg border border-[#cbd7e9] px-3 py-3 pr-20" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#2563eb]">{showPassword ? "Ocultar" : "Mostrar"}</button></span><small className="font-normal text-slate-500">Mínimo de 12 caracteres.</small></label><label className="grid gap-1 text-sm font-semibold">Cupom de desconto <input value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Opcional" className="rounded-lg border border-[#cbd7e9] px-3 py-3" /></label>{error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}<button disabled={loading} className="mt-2 rounded-lg bg-[#0b1d3d] px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? "Preparando checkout..." : "Continuar para Pix ou cartão"}</button><p className="text-center text-xs leading-5 text-slate-500">Ao continuar, você cria uma conta de proprietário e escolhe Pix ou cartão no checkout seguro do Asaas.</p></form></section></div></main>;
}
