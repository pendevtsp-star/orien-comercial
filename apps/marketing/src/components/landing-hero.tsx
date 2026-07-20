import { ArrowRight, Check, LayoutDashboard } from "lucide-react";
import type { PublicLandingSettings } from "../lib/landing-settings";

type LandingHeroProps = { hero: PublicLandingSettings["hero"] };

export function LandingHero({ hero }: LandingHeroProps) {
  return (
    <section className="border-b border-[#d9e1ee] bg-white">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-18 lg:grid-cols-[1fr_.9fr] lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[.2em] text-[#2563eb]">{hero.eyebrow}</p>
          <h1
            data-brand-display="true"
            className="mt-5 text-5xl leading-[1.02] text-[#0b1d3d] md:text-7xl"
          >
            {hero.title}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">{hero.description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={hero.primaryCta.href}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0b1d3d] px-5 py-3.5 font-semibold text-white shadow-[0_12px_30px_rgba(11,29,61,.18)] transition hover:bg-[#133a7c]"
            >
              {hero.primaryCta.label} <ArrowRight size={17} />
            </a>
            {hero.secondaryCta ? (
              <a
                href={hero.secondaryCta.href}
                className="rounded-lg border border-[#cbd7e9] bg-white px-5 py-3.5 font-semibold text-[#0b1d3d]"
              >
                {hero.secondaryCta.label}
              </a>
            ) : null}
          </div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600">
            <span className="flex items-center gap-2">
              <Check size={17} className="text-[#d6a100]" />
              {hero.trialText}
            </span>
            <span className="flex items-center gap-2">
              <Check size={17} className="text-[#d6a100]" />
              Pix e cartão no checkout
            </span>
            <span className="flex items-center gap-2">
              <Check size={17} className="text-[#d6a100]" />
              Suporte humano
            </span>
          </div>
        </div>
        <div className="border border-[#1f3f73] bg-[#0b1d3d] p-3 shadow-[0_38px_90px_rgba(11,29,61,.26)]">
          <div className="bg-[#f5f7fb] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-5 border-b border-[#d9e1ee] pb-5">
              <div>
                <p className="text-xs font-bold tracking-[.16em] text-[#2563eb]">ORIEN WORKSPACE</p>
                <p className="mt-2 text-xl font-semibold">Uma visão conectada da operação</p>
              </div>
              <span className="grid h-11 w-11 place-items-center bg-[#0b1d3d] text-[#f5c34a]">
                <LayoutDashboard size={21} />
              </span>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {["Vendas e PDV", "Estoque por filial", "Financeiro e metas"].map((feature) => (
                <p
                  key={feature}
                  className="border border-[#d9e1ee] bg-white p-4 text-sm font-semibold text-[#0b1d3d]"
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
