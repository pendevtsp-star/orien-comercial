import { BrandLogo } from "@sgc/ui";
import {
  ArrowRight,
  Building2,
  LockKeyhole,
  MonitorSmartphone,
  PackageCheck,
  ShieldCheck,
  Store,
  UsersRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { LandingHero } from "../components/landing-hero";
import { LandingCalculator } from "../components/landing-calculator";
import { LandingPlanComparison } from "../components/landing-plan-comparison";
import { LandingProductShowcase } from "../components/landing-product-showcase";
import { LandingSection } from "../components/landing-section";
import { LandingSocialProof } from "../components/landing-social-proof";
import {
  getLandingSettings,
  hasVisibleShowcaseSlides,
  isValidWhatsappNumber,
  normalizeWhatsappNumber,
} from "../lib/landing-settings";

const faqs = [
  [
    "Consigo migrar dados de outra planilha ou sistema?",
    "Sim. A importação de produtos e clientes valida colunas antes da gravação e mostra um relatório de inconsistências.",
  ],
  [
    "O leitor de código de barras funciona?",
    "Leitores USB ou Bluetooth em modo teclado funcionam diretamente no cadastro de produtos e no PDV.",
  ],
  [
    "Como funciona a emissão fiscal?",
    "O módulo é preparado para homologação por município e regime tributário após a configuração fiscal da empresa.",
  ],
  [
    "Posso pagar por Pix ou cartão?",
    "Sim. A contratação é concluída em checkout seguro, com Pix e cartão conforme o plano.",
  ],
  [
    "Meus dados ficam separados dos de outros clientes?",
    "Sim. Cada empresa opera em um tenant isolado, com permissões por usuário e filial e trilha de auditoria.",
  ],
] as const;

const segments: Array<{ Icon: LucideIcon; title: string; text: string }> = [
  { Icon: Store, title: "Varejo", text: "PDV, preços e estoque no ritmo da loja." },
  {
    Icon: PackageCheck,
    title: "Distribuidoras",
    text: "Pedidos, compras e movimentações por unidade.",
  },
  {
    Icon: WandSparkles,
    title: "Serviços",
    text: "Clientes, recebimentos e acompanhamento comercial.",
  },
  {
    Icon: Building2,
    title: "Multi-lojas",
    text: "Permissões, transferências e visão consolidada.",
  },
];

const securityFeatures: Array<{ Icon: LucideIcon; label: string }> = [
  { Icon: ShieldCheck, label: "Acesso por função e filial" },
  { Icon: LockKeyhole, label: "Sessões protegidas e tokens rotativos" },
  { Icon: UsersRound, label: "Dados isolados por empresa" },
  { Icon: MonitorSmartphone, label: "Auditoria de ações críticas" },
];

export default async function MarketingPage() {
  const settings = await getLandingSettings();
  const hasProductShowcase =
    settings.visibility.showProduct && hasVisibleShowcaseSlides(settings.showcaseSlides);
  const supportEmail = settings.supportEmail || "suporte@useorien.com.br";
  const whatsappNumber = normalizeWhatsappNumber(settings.whatsappNumber);
  const whatsappHref = isValidWhatsappNumber(whatsappNumber)
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(settings.whatsappMessage)}`
    : null;

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f8fb] text-[#0b1d3d]">
      <header className="sticky top-0 z-30 border-b border-[#d9e1ee] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <BrandLogo size="sm" />
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
            {hasProductShowcase ? <a href="#produto">Produto</a> : null}
            {settings.visibility.showPlans ? <a href="#planos">Planos</a> : null}
            {settings.visibility.showSecurity ? <a href="#seguranca">Segurança</a> : null}
            {settings.visibility.showFaq ? <a href="#faq">FAQ</a> : null}
          </nav>
          <div className="flex items-center gap-3">
            <a
              className="hidden text-sm font-semibold text-[#133a7c] sm:block"
              href="https://app.useorien.com.br/login"
            >
              Entrar
            </a>
            <a
              href={settings.hero.primaryCta.href}
              className="bg-[#0b1d3d] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#133a7c]"
            >
              {settings.hero.primaryCta.label}
            </a>
          </div>
        </div>
      </header>
      <LandingHero hero={settings.hero} />
      {hasProductShowcase ? (
        <LandingProductShowcase slides={settings.showcaseSlides} />
      ) : null}
      {settings.visibility.showCalculator ? <LandingCalculator /> : null}
      {settings.visibility.showMigration ? (
        <LandingSection
          eyebrow="COMO FUNCIONA"
          title="Da contratação à rotina em quatro passos."
          description="Uma implantação clara para a equipe ganhar contexto sem interromper o ritmo da operação."
          tone="muted"
        >
          <ol className="mt-10 grid gap-5 md:grid-cols-2">
            {[
              [
                "01",
                "Crie sua empresa",
                "Escolha o plano, informe os dados principais e conclua o checkout seguro.",
              ],
              [
                "02",
                "Configure a operação",
                "Cadastre lojas, equipe, produtos, clientes e preferências.",
              ],
              ["03", "Venda e acompanhe", "Use PDV, estoque, financeiro e alertas no dia a dia."],
              [
                "04",
                "Decida com contexto",
                "Acompanhe indicadores, metas, caixa e auditoria no painel.",
              ],
            ].map(([number, title, text]) => (
              <li key={number} className="flex gap-4 border-t border-[#d9e1ee] pt-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f0ff] text-sm font-bold text-[#133a7c]">
                  {number}
                </span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 leading-6 text-slate-600">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </LandingSection>
      ) : null}
      {settings.visibility.showPlans ? (
        <LandingPlanComparison presentation={settings.planPresentation} />
      ) : null}
      <LandingSocialProof settings={settings} />
      {settings.visibility.showSegments ? (
        <LandingSection
          id="segments"
          eyebrow="FEITO PARA A SUA OPERAÇÃO"
          title="Uma base única para negócios diferentes."
          tone="dark"
        >
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {segments.map(({ Icon, title, text }) => (
              <article key={title} className="border border-white/15 bg-white/5 p-5">
                <Icon className="text-[#f5c34a]" size={24} />
                <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
              </article>
            ))}
          </div>
        </LandingSection>
      ) : null}
      {settings.visibility.showSecurity ? (
        <LandingSection
          id="seguranca"
          eyebrow="SEGURANÇA E LGPD"
          title="Informação de negócio exige proteção de verdade."
          description="A Orien foi construída com separação de empresas, permissões por função e filial, auditoria e controles para reduzir acessos indevidos."
        >
          <div className="mt-10 grid gap-3 md:grid-cols-2">
            {securityFeatures.map(({ Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 border border-[#d9e1ee] bg-white p-4"
              >
                <Icon size={20} className="text-[#2563eb]" />
                <span className="font-medium">{label}</span>
              </div>
            ))}
          </div>
          <a href="/privacidade" className="mt-6 inline-block font-semibold text-[#2563eb]">
            Ler política de privacidade
          </a>
        </LandingSection>
      ) : null}
      {settings.visibility.showFaq ? (
        <section id="faq" className="border-y border-[#d9e1ee] bg-white">
          <div className="mx-auto max-w-4xl px-5 py-20">
            <div className="text-center">
              <p className="text-xs font-bold tracking-[.2em] text-[#2563eb]">
                DÚVIDAS ANTES DE COMEÇAR
              </p>
              <h2 data-brand-display="true" className="mt-3 text-4xl">
                Perguntas frequentes
              </h2>
            </div>
            <div className="mt-10 grid gap-3">
              {faqs.map(([question, answer]) => (
                <details key={question} className="border border-[#d9e1ee] bg-[#f7f8fb]">
                  <summary className="cursor-pointer p-5 font-semibold">{question}</summary>
                  <p className="border-t border-[#e8edf4] px-5 py-4 leading-7 text-slate-600">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <section className="bg-[#f5c34a]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-14 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-bold tracking-[.2em] text-[#725000]">
              PRONTO PARA ORGANIZAR
            </p>
            <h2 data-brand-display="true" className="mt-2 text-4xl">
              Comece a operar com mais clareza.
            </h2>
          </div>
          <a
            href={settings.finalCta.href}
            className="inline-flex items-center justify-center gap-2 bg-[#0b1d3d] px-5 py-3.5 font-semibold text-white"
          >
            {settings.finalCta.label}
            <ArrowRight size={17} />
          </a>
        </div>
      </section>
      <footer className="bg-[#081731] text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-[1.5fr_1fr_1fr] lg:px-8">
          <div>
            <BrandLogo size="sm" theme="dark" />
            <p className="mt-5 max-w-sm leading-7 text-slate-300">
              Gestão inteligente para negócios em crescimento.
            </p>
          </div>
          <div>
            <p className="font-semibold text-white">Institucional</p>
            <div className="mt-4 grid gap-3 text-sm">
              <a href="/termos">Termos de uso</a>
              <a href="/privacidade">Privacidade e LGPD</a>
              <a href="/cancelamento">Cancelamento e reembolso</a>
              {settings.footerLinks.map((link) => (
                <a key={`${link.label}-${link.href}`} href={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold text-white">Atendimento</p>
            <div className="mt-4 grid gap-3 text-sm">
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
              {whatsappHref ? (
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  WhatsApp comercial
                </a>
              ) : null}
              <a href="/checkout/status">Acompanhar checkout</a>
              <a href="https://app.useorien.com.br/login">Acessar plataforma</a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 py-5 text-center text-xs text-slate-500">
          Copyright {new Date().getFullYear()} Orien. Todos os direitos reservados.
        </div>
      </footer>
    </main>
  );
}
