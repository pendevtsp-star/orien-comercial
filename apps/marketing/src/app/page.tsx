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

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo principal
      </a>
      <main id="main-content" className="min-h-screen overflow-hidden bg-[#f7f8fb] text-[#0b1d3d]">
      <header className="sticky top-0 z-30 border-b border-[#d9e1ee] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <BrandLogo size="sm" />
          <nav aria-label="Navegação principal" className="hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
            {hasProductShowcase ? <a href="#produto">Produto</a> : null}
            {settings.visibility.showPlans ? <a href="#planos">Planos</a> : null}
            {settings.visibility.showSecurity ? <a href="#seguranca">Segurança</a> : null}
            {settings.visibility.showFaq ? <a href="#faq">FAQ</a> : null}
          </nav>
          <div className="flex items-center gap-3">
            <a
              className="hidden text-sm font-semibold text-[#133a7c] sm:block"
              href="https://app.useorien.com.br/login"
              aria-label="Entrar na plataforma Orien"
            >
              Entrar
            </a>
            <a
              href={settings.hero.primaryCta.href}
              className="bg-[#0b1d3d] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#133a7c]"
              aria-label={settings.hero.primaryCta.label}
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
              <p className="text-xs font-bold tracking-[.2em] text-[#2563eb] uppercase">
                Dúvidas antes de começar
              </p>
              <h2 data-brand-display="true" className="mt-4 text-4xl md:text-5xl">
                Perguntas frequentes
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Respostas para as dúvidas mais comuns sobre a Orien.
              </p>
            </div>
            <div className="mt-12 space-y-4">
              {faqs.map(([question, answer]) => (
                <details
                  key={question}
                  className="group rounded-xl border border-[#d9e1ee] bg-[#f7f8fb] transition-all duration-200 hover:border-[#2563eb]/30 [&[open]]:border-[#2563eb]/50 [&[open]]:bg-white"
                >
                  <summary className="flex cursor-pointer items-center justify-between p-5 font-semibold text-[#0b1d3d] transition-colors group-hover:text-[#2563eb]">
                    {question}
                    <span className="ml-4 text-slate-400 transition-transform duration-200 group-open:rotate-180">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </summary>
                  <p className="border-t border-[#e8edf4] px-5 py-4 leading-7 text-slate-600">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <section className="bg-gradient-to-br from-[#f5c34a] via-[#f5c34a] to-[#e8b730]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="max-w-xl">
            <p className="text-xs font-bold tracking-[.2em] text-[#725000] uppercase">
              Comece agora
            </p>
            <h2 data-brand-display="true" className="mt-3 text-4xl md:text-5xl leading-tight">
              Teste grátis por 14 dias.
            </h2>
            <p className="mt-4 text-lg leading-7 text-[#725000]">
              Sem cartão de crédito. Cancele quando quiser. Suporte humano incluso.
            </p>
          </div>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <a
              href={settings.finalCta.href}
              className="inline-flex items-center gap-2.5 rounded-xl bg-[#0b1d3d] px-7 py-4 text-base font-semibold text-white shadow-[0_8px_30px_rgba(11,29,61,.25)] transition-all duration-200 hover:bg-[#133a7c] hover:shadow-[0_12px_40px_rgba(11,29,61,.3)]"
              aria-label={settings.finalCta.label}
            >
              {settings.finalCta.label}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <span className="text-sm text-[#725000]">
              Sem compromisso • Cancele quando quiser
            </span>
          </div>
        </div>
      </section>
      <footer aria-label="Rodapé" className="bg-[#081731] text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-[1.5fr_1fr_1fr] lg:px-8">
          <div>
            <BrandLogo size="sm" theme="dark" />
            <p className="mt-5 max-w-sm leading-7 text-slate-300">
              Gestão inteligente para negócios em crescimento.
            </p>
          </div>
          <div>
            <p className="font-semibold text-white">Institucional</p>
            <nav aria-label="Links institucionais" className="mt-4 grid gap-3 text-sm">
              <a href="/termos">Termos de uso</a>
              <a href="/privacidade">Privacidade e LGPD</a>
              <a href="/cancelamento">Cancelamento e reembolso</a>
              {settings.footerLinks.map((link) => (
                <a key={`${link.label}-${link.href}`} href={link.href}>
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
          <div>
            <p className="font-semibold text-white">Atendimento</p>
            <nav aria-label="Links de atendimento" className="mt-4 grid gap-3 text-sm">
              <a href={`mailto:${supportEmail}`} aria-label={`Enviar email para ${supportEmail}`}>{supportEmail}</a>
              {whatsappHref ? (
                <a href={whatsappHref} target="_blank" rel="noreferrer" aria-label="Falar com suporte no WhatsApp">
                  WhatsApp comercial
                </a>
              ) : null}
              <a href="/checkout/status" aria-label="Acompanhar status do checkout">Acompanhar checkout</a>
              <a href="https://app.useorien.com.br/login" aria-label="Acessar a plataforma Orien">Acessar plataforma</a>
            </nav>
          </div>
        </div>
        <div className="border-t border-white/10 py-5 text-center text-xs text-slate-500">
          Copyright {new Date().getFullYear()} Orien. Todos os direitos reservados.
        </div>
      </footer>
    </main>
    </>
  );
}
