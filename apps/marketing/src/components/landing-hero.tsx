import { ArrowRight, Check, LayoutDashboard } from "lucide-react";
import type { PublicLandingSettings } from "../lib/landing-settings";

type LandingHeroProps = { hero: PublicLandingSettings["hero"] };

export function LandingHero({ hero }: LandingHeroProps) {
  return (
    <section className="border-b border-[#d9e1ee] bg-white">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-18 lg:grid-cols-[1fr_.9fr] lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[.2em] text-[#2563eb] uppercase">{hero.eyebrow}</p>
          <h1
            data-brand-display="true"
            className="mt-6 text-5xl leading-[1.05] tracking-tight text-[#0b1d3d] md:text-7xl"
          >
            {hero.title}
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">{hero.description}</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a
              href={hero.primaryCta.href}
              className="inline-flex items-center gap-2.5 rounded-lg bg-[#0b1d3d] px-6 py-4 text-base font-semibold text-white shadow-[0_16px_40px_rgba(11,29,61,.2)] transition-all duration-200 hover:bg-[#133a7c] hover:shadow-[0_20px_50px_rgba(11,29,61,.25)]"
              aria-label={hero.primaryCta.label}
            >
              {hero.primaryCta.label} <ArrowRight size={18} aria-hidden="true" />
            </a>
            {hero.secondaryCta ? (
              <a
                href={hero.secondaryCta.href}
                className="inline-flex items-center rounded-lg border-2 border-[#cbd7e9] bg-white px-6 py-4 text-base font-semibold text-[#0b1d3d] transition-all duration-200 hover:border-[#133a7c] hover:bg-[#f8f9fb]"
                aria-label={hero.secondaryCta.label}
              >
                {hero.secondaryCta.label}
              </a>
            ) : null}
          </div>
          <div className="mt-12 flex flex-wrap gap-x-8 gap-y-4 text-sm text-slate-600">
            <span className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e8f0ff]">
                <Check size={14} className="text-[#2563eb]" aria-hidden="true" />
              </span>
              {hero.trialText}
            </span>
            <span className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e8f0ff]">
                <Check size={14} className="text-[#2563eb]" aria-hidden="true" />
              </span>
              Pix e cartão no checkout
            </span>
            <span className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e8f0ff]">
                <Check size={14} className="text-[#2563eb]" aria-hidden="true" />
              </span>
              Suporte humano
            </span>
          </div>
        </div>
        <div className="relative border border-[#1f3f73] bg-[#0b1d3d] p-3 shadow-[0_40px_100px_rgba(11,29,61,.28)]">
          <div className="absolute -left-4 -top-4 h-24 w-24 rounded-full bg-[#2563eb]/10 blur-2xl" aria-hidden="true" />
          <div className="absolute -bottom-4 -right-4 h-32 w-32 rounded-full bg-[#f5c34a]/10 blur-2xl" aria-hidden="true" />
          <div className="relative bg-[#f5f7fb] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-5 border-b border-[#d9e1ee] pb-5">
              <div>
                <p className="text-xs font-bold tracking-[.16em] text-[#2563eb]">ORIEN WORKSPACE</p>
                <p className="mt-2 text-xl font-semibold leading-tight">Uma visão conectada da operação</p>
              </div>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#0b1d3d] text-[#f5c34a]">
                <LayoutDashboard size={22} aria-hidden="true" />
              </span>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {["Vendas e PDV", "Estoque por filial", "Financeiro e metas"].map((feature) => (
                <p
                  key={feature}
                  className="border border-[#d9e1ee] bg-white p-4 text-sm font-semibold text-[#0b1d3d] transition-colors hover:border-[#2563eb]/30"
                >
                  {feature}
                </p>
              ))}
            </div>
            <p className="mt-6 text-sm leading-6 text-slate-600">
              Dados e processos da operação em uma leitura feita para quem precisa agir todos os
              dias.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
