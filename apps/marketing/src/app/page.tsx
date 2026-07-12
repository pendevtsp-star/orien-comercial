import { Badge, BrandLogo, Button } from "@sgc/ui";
import {
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  LockKeyhole,
  type LucideIcon,
  MessageCircle,
  MoveUpRight,
  ShieldCheck,
  ShoppingCart,
  UsersRound
} from "lucide-react";

const modules: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Vendas e PDV", icon: ShoppingCart },
  { label: "Estoque por loja", icon: Boxes },
  { label: "Clientes e CRM", icon: UsersRound },
  { label: "Financeiro", icon: BarChart3 },
  { label: "Multiempresa", icon: Building2 },
  { label: "WhatsApp futuro", icon: MessageCircle }
];

const securityItems: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Cookies HttpOnly", icon: LockKeyhole },
  { label: "RBAC por tenant e filial", icon: ShieldCheck },
  { label: "RLS no PostgreSQL", icon: ShieldCheck }
];
const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Orien";
const marketingDomain = "useorien.com.br";

export default function MarketingPage() {
  return (
    <main className="bg-[linear-gradient(180deg,#fafafa_0%,#f5f7fb_100%)]">
      <header className="sticky top-0 z-20 border-b border-[var(--brand-border)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <BrandLogo size="sm" />
          <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <a href="#modulos">Modulos</a>
            <a href="#seguranca">Seguranca</a>
            <a href="#faq">FAQ</a>
            <a href="#planos">Planos</a>
          </nav>
          <a href="/checkout" className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">Começar agora</a>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[var(--brand-border)] bg-white">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_44%),radial-gradient(circle_at_top_right,rgba(245,195,74,0.12),transparent_34%)]" />
        <div className="relative mx-auto grid min-h-[720px] max-w-7xl content-center gap-10 px-4 py-16 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div className="max-w-2xl">
            <Badge>Gestao inteligente para negocios em crescimento</Badge>
            <h1 data-brand-display="true" className="mt-6 text-5xl font-semibold tracking-normal text-[var(--brand-primary)] md:text-7xl">
              {appName}
            </h1>
            <p className="mt-5 max-w-xl text-xl leading-8 text-slate-600">
              Centralize vendas, estoque, clientes, financeiro e operacao multiunidade em uma plataforma premium para empresas que estao crescendo com metodo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/checkout" className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-3 text-sm font-semibold text-white">Começar agora <MoveUpRight size={16} /></a>
              <Button variant="secondary">Falar no WhatsApp</Button>
            </div>
            <div className="mt-8 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
              {["Tenant isolado", "RBAC por filial", "Backups planejados"].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[var(--brand-accent)]" />
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-10 flex items-center gap-3 text-sm text-slate-500">
              <span className="inline-block h-px w-12 bg-[var(--brand-accent)]" />
              <span>{marketingDomain}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#11284f] bg-[var(--brand-primary)] p-4 shadow-[0_36px_80px_rgba(11,29,61,0.22)]">
            <div className="rounded-xl bg-white p-4">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Dashboard</p>
                  <p className="font-semibold text-[var(--brand-primary)]">Visao executiva do dia</p>
                </div>
                <BrandLogo size="sm" iconOnly />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Receita", "R$ 245,7 mil"],
                  ["Lucro liquido", "R$ 76,3 mil"],
                  ["Novos clientes", "128"]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 text-2xl font-semibold text-[var(--brand-primary)]">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
                <div className="rounded-xl border border-[var(--brand-border)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-[var(--brand-primary)]">Receita nos ultimos 6 meses</p>
                    <span className="rounded-full bg-[rgba(245,195,74,0.18)] px-2 py-1 text-xs text-[var(--brand-primary)]">+18,5%</span>
                  </div>
                  <div className="flex h-44 items-end gap-3">
                    {[32, 48, 66, 44, 84, 96].map((height, index) => (
                      <div key={height} className="flex flex-1 flex-col items-center gap-2">
                        <div
                          className="w-full rounded-t-full bg-[linear-gradient(180deg,#F5C34A_0%,#2563EB_100%)]"
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-xs text-slate-400">{["Dez", "Jan", "Fev", "Mar", "Abr", "Mai"][index]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--brand-border)] p-4">
                  <p className="text-sm font-medium text-[var(--brand-primary)]">Receita por categoria</p>
                  <div className="mt-6 flex items-center justify-center">
                    <div className="relative h-32 w-32 rounded-full bg-[conic-gradient(#133A7C_0_42%,#2563EB_42%_73%,#F5C34A_73%_90%,#d9e1ee_90%_100%)]">
                      <div className="absolute inset-5 rounded-full bg-white" />
                    </div>
                  </div>
                  <div className="mt-5 grid gap-2 text-sm text-slate-600">
                    {[
                      ["Servicos", "42%"],
                      ["Assinaturas", "31%"],
                      ["Consultoria", "17%"],
                      ["Outros", "10%"]
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between">
                        <span>{label}</span>
                        <span className="font-medium text-[var(--brand-primary)]">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="modulos" className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
        <div className="max-w-2xl">
          <h2 data-brand-display="true" className="text-4xl font-semibold text-[var(--brand-primary)]">Modulos para operar sem planilhas paralelas</h2>
          <p className="mt-3 text-slate-600">
            A fundacao nasce preparada para varejo, servicos, multi-lojas e empresas que vendem para CPF ou CNPJ.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {modules.map(({ label, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-[var(--brand-border)] bg-white p-5 shadow-sm">
              <Icon className="text-[var(--brand-secondary)]" size={22} />
              <h3 className="mt-4 font-semibold text-[var(--brand-primary)]">{label}</h3>
              <p className="mt-2 text-sm text-slate-500">Fluxos pensados para uso diario, dados consistentes e evolucao por etapas.</p>
            </div>
          ))}
        </div>
      </section>

      <section id="seguranca" className="border-y border-[var(--brand-border)] bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 lg:grid-cols-2 lg:px-8">
          <div>
            <Badge>Seguranca desde a fundacao</Badge>
            <h2 data-brand-display="true" className="mt-4 text-4xl font-semibold text-[var(--brand-primary)]">Isolamento, validacao backend e auditoria como padrao</h2>
            <p className="mt-3 text-slate-600">
              O produto e projetado contra IDOR/BOLA, acesso horizontal entre tenants, mass assignment e vazamento de PII em logs.
            </p>
          </div>
          <div className="grid gap-3">
            {securityItems.map(({ label, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-[var(--brand-border)] p-4">
                <Icon className="text-[var(--brand-accent)]" size={20} />
                <span className="font-medium text-[var(--brand-primary)]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="planos" className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
        <h2 data-brand-display="true" className="text-4xl font-semibold text-[var(--brand-primary)]">Planos preparados para crescer</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[["Essencial", "starter"], ["Pro", "pro"], ["Enterprise", "enterprise"]].map(([plan, slug]) => (
            <div key={plan} className="rounded-xl border border-[var(--brand-border)] bg-white p-5 shadow-sm">
              <h3 className="text-xl font-semibold text-[var(--brand-primary)]">{plan}</h3>
              <p className="mt-2 text-sm text-slate-500">Limites de usuarios, lojas, mensagens e modulos definidos no admin da plataforma.</p>
              <a href={`/checkout?plan=${slug}`} className={`mt-5 block rounded-lg px-4 py-3 text-center text-sm font-semibold ${plan === "Pro" ? "bg-[var(--brand-primary)] text-white" : "border border-[var(--brand-border)] text-[var(--brand-primary)]"}`}>Começar com {plan}</a>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="border-y border-[var(--brand-border)] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
          <div className="max-w-2xl">
            <h2 data-brand-display="true" className="text-4xl font-semibold text-[var(--brand-primary)]">Perguntas frequentes</h2>
            <p className="mt-3 text-slate-600">
              A primeira entrega foi desenhada para dar base solida e abrir espaco para evolucao comercial, financeira e operacional sem retrabalho.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              ["Ja nasce multiempresa e multiloja?", "Sim. A arquitetura usa tenant_id, branch_id, RBAC e isolamento por contexto desde a base."],
              ["Tem pagamentos e fiscal ativos?", "Nao nesta etapa. As interfaces estao preparadas e a integracao de assinatura entra com Asaas sandbox."],
              ["Os relatórios e emails seguem identidade visual?", "Sim. Os documentos renderizados usam padrao visual compartilhado com branding do tenant e assinatura Orien por padrao."],
              ["Da para customizar por cliente contratante?", "Sim. Nome, cores, rodape, dados de contato e links institucionais podem ser ajustados por tenant."]
            ].map(([question, answer]) => (
              <div key={question} className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
                <h3 className="font-semibold text-[var(--brand-primary)]">{question}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 text-sm text-slate-500 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" />
          <span className="text-slate-400">|</span>
          <span>Gestao inteligente para negocios em crescimento</span>
        </div>
        <a href={`https://${marketingDomain}`} className="font-medium text-[var(--brand-secondary)]">
          {marketingDomain}
        </a>
      </footer>
    </main>
  );
}
