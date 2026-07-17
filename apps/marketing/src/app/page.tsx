"use client";

import { BrandLogo } from "@sgc/ui";
import { LandingSocialProof } from "../components/landing-social-proof";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  LockKeyhole,
  MonitorSmartphone,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  Store,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

const plans = [
  {
    name: "Essencial",
    slug: "starter",
    price: "R$ 99",
    description: "Para organizar a primeira operação.",
    users: "até 3 usuários",
    branches: "1 loja",
    support: "Suporte por e-mail",
    modules: ["Vendas e clientes", "Estoque essencial", "Financeiro básico"],
  },
  {
    name: "Pro",
    slug: "pro",
    price: "R$ 199",
    description: "Para lojas que crescem com controle.",
    users: "até 10 usuários",
    branches: "até 3 lojas",
    support: "Suporte prioritário",
    featured: true,
    modules: ["Tudo do Essencial", "PDV e caixa", "Compras e relatórios", "Auditoria operacional"],
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    price: "R$ 399",
    description: "Para operações multiunidade exigentes.",
    users: "usuários ampliados",
    branches: "multi-lojas",
    support: "Acompanhamento dedicado",
    modules: [
      "Tudo do Pro",
      "Permissões avançadas",
      "Integrações e API",
      "Estratégia de implantação",
    ],
  },
];

const productViews = [
  {
    eyebrow: "PDV RÁPIDO",
    title: "Venda ágil, mesmo nos horários de pico.",
    description: "Scanner sempre pronto, atalhos de pagamento e fechamento por operador.",
    icon: ShoppingCart,
    accent: "gold",
    rows: [
      ["Café Tradicional 500g", "2x R$ 18,90"],
      ["Biscoito Recheado 120g", "1x R$ 6,50"],
    ],
    total: "R$ 44,30",
  },
  {
    eyebrow: "ESTOQUE POR LOJA",
    title: "Estoque que acompanha a operação real.",
    description: "Entradas, transferências, inventário e alertas de reposição com rastreabilidade.",
    icon: Boxes,
    accent: "blue",
    rows: [
      ["Matriz", "42 itens abaixo do mínimo"],
      ["Loja Centro", "Transferência em trânsito"],
    ],
    total: "98,6% acurácia",
  },
  {
    eyebrow: "FINANCEIRO",
    title: "Caixa visível antes de virar urgência.",
    description: "Contas, baixas, conciliação e projeção em uma leitura simples para o gestor.",
    icon: CircleDollarSign,
    accent: "green",
    rows: [
      ["A receber", "R$ 28.540,00"],
      ["A pagar", "R$ 9.860,00"],
    ],
    total: "R$ 18.680,00",
  },
  {
    eyebrow: "DASHBOARD",
    title: "Decisões baseadas no dia a dia da empresa.",
    description: "Receita, ticket médio, metas e alertas operacionais no mesmo painel.",
    icon: BarChart3,
    accent: "blue",
    rows: [
      ["Vendas no período", "184"],
      ["Ticket médio", "R$ 86,40"],
    ],
    total: "+12,8% no período",
  },
];

const faqs = [
  [
    "Consigo migrar dados de outra planilha ou sistema?",
    "Sim. A importação de produtos e clientes valida colunas antes da gravação e mostra um relatório de inconsistências.",
  ],
  [
    "O leitor de código de barras funciona?",
    "Leitores USB ou Bluetooth em modo teclado funcionam diretamente no cadastro de produtos e no PDV. Basta apontar o cursor para o campo de leitura.",
  ],
  [
    "Como funciona a emissão fiscal?",
    "O módulo é preparado para homologação por município e regime tributário. A emissão deve ser ativada após a configuração fiscal da empresa.",
  ],
  [
    "Posso pagar por Pix ou cartão?",
    "Sim. A contratação é concluída em checkout seguro do Asaas, com Pix e cartão disponíveis conforme o plano.",
  ],
  [
    "Há suporte e como funciona o cancelamento?",
    "Cada plano informa seu canal de suporte. Cancelamento e reembolso seguem as condições publicadas antes da contratação.",
  ],
  [
    "Meus dados ficam separados dos de outros clientes?",
    "Sim. Cada empresa opera em um tenant isolado, com permissões por usuário e por filial, além de trilha de auditoria.",
  ],
];

export default function MarketingPage() {
  const [view, setView] = useState(0);
  const [employees, setEmployees] = useState(5);
  const [hours, setHours] = useState(5);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const active = productViews[view] ?? productViews[0]!;
  const Icon = active.icon;
  const monthlyGain = useMemo(
    () => employees * hours * 4 * 32 + Math.round(employees * 190),
    [employees, hours],
  );

  function move(direction: number) {
    setView((current) => (current + direction + productViews.length) % productViews.length);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f8fb] text-[#0b1d3d]">
      <header className="sticky top-0 z-30 border-b border-[#d9e1ee] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <BrandLogo size="sm" />
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
            <a href="#produto">Produto</a>
            <a href="#planos">Planos</a>
            <a href="#seguranca">Segurança</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <a
              className="hidden text-sm font-semibold text-[#133a7c] sm:block"
              href="https://app.useorien.com.br/login"
            >
              Entrar
            </a>
            <a
              href="/checkout"
              className="rounded-lg bg-[#0b1d3d] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#133a7c]"
            >
              Começar agora
            </a>
          </div>
        </div>
      </header>

      <section className="relative border-b border-[#d9e1ee] bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_20%,rgba(37,99,235,.13),transparent_24%),radial-gradient(circle_at_86%_8%,rgba(245,195,74,.19),transparent_20%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-18 lg:grid-cols-[1fr_.9fr] lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-bold tracking-[.2em] text-[#2563eb]">
              GESTÃO INTELIGENTE PARA NEGÓCIOS EM CRESCIMENTO
            </p>
            <h1
              data-brand-display="true"
              className="mt-5 text-5xl leading-[1.02] text-[#0b1d3d] md:text-7xl"
            >
              Sua operação merece clareza para crescer.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              Vendas, PDV, estoque, financeiro e gestão multi-loja em uma plataforma que organiza o
              presente e prepara as próximas decisões.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/checkout?plan=pro"
                className="inline-flex items-center gap-2 rounded-lg bg-[#0b1d3d] px-5 py-3.5 font-semibold text-white shadow-[0_12px_30px_rgba(11,29,61,.18)]"
              >
                Teste a Orien <ArrowRight size={17} />
              </a>
              <a
                href="#produto"
                className="rounded-lg border border-[#cbd7e9] bg-white px-5 py-3.5 font-semibold text-[#0b1d3d]"
              >
                Ver a plataforma
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600">
              {["Sem cartão para explorar", "Pix e cartão no checkout", "Suporte humano"].map(
                (item) => (
                  <span className="flex items-center gap-2" key={item}>
                    <Check size={17} className="text-[#d6a100]" />
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-5 rounded-[2rem] bg-[#f5c34a]/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-[#1f3f73] bg-[#0b1d3d] p-3 shadow-[0_38px_90px_rgba(11,29,61,.26)]">
              <div className="rounded-xl bg-[#f5f7fb] p-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <div>
                    <p className="text-xs font-bold tracking-[.16em] text-[#2563eb]">
                      ORIEN WORKSPACE
                    </p>
                    <p className="mt-1 text-lg font-semibold">Visão do seu negócio</p>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#0b1d3d] text-[#f5c34a]">
                    <BarChart3 size={20} />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {[
                    ["Vendas", "184"],
                    ["Receita", "R$ 15,8 mil"],
                    ["Estoque", "98,6%"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-[#d9e1ee] bg-white p-3">
                      <p className="text-xs text-slate-500">{label}</p>
                      <strong className="mt-1 block text-sm text-[#0b1d3d]">{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-[1.5fr_1fr] gap-4">
                  <div className="rounded-lg border border-[#d9e1ee] bg-white p-4">
                    <p className="text-sm font-semibold">Fluxo da semana</p>
                    <div className="mt-5 flex h-28 items-end gap-2">
                      {[38, 55, 44, 78, 66, 92, 76].map((height, index) => (
                        <span
                          key={index}
                          className="flex-1 rounded-t bg-gradient-to-t from-[#133a7c] to-[#2563eb]"
                          style={{ height: `${height}%` }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#0b1d3d] p-4 text-white">
                    <p className="text-xs text-slate-300">Alerta de estoque</p>
                    <p className="mt-3 text-2xl font-semibold text-[#f5c34a]">12</p>
                    <p className="mt-1 text-xs text-slate-300">itens para repor</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="produto" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[.2em] text-[#2563eb]">PROVA DO PRODUTO</p>
          <h2 data-brand-display="true" className="mt-3 text-4xl md:text-5xl">
            A operação real, sem números decorativos.
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Conheça os fluxos que a equipe usa para vender, controlar e acompanhar a empresa todos
            os dias.
          </p>
        </div>
        <div className="mt-10 grid gap-6 lg:grid-cols-[.72fr_1.28fr]">
          <div className="grid gap-3">
            {productViews.map((item, index) => (
              <button
                key={item.eyebrow}
                onClick={() => setView(index)}
                className={`rounded-xl border p-5 text-left transition ${index === view ? "border-[#0b1d3d] bg-[#0b1d3d] text-white shadow-lg" : "border-[#d9e1ee] bg-white hover:border-[#2563eb]"}`}
              >
                <p
                  className={`text-xs font-bold tracking-[.16em] ${index === view ? "text-[#f5c34a]" : "text-[#2563eb]"}`}
                >
                  {item.eyebrow}
                </p>
                <p className="mt-2 font-semibold">{item.title}</p>
              </button>
            ))}
          </div>
          <article className="overflow-hidden rounded-2xl border border-[#cad7ea] bg-[#0b1d3d] p-3 shadow-xl">
            <div className="rounded-xl bg-[#f5f7fb] p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-[.18em] text-[#2563eb]">
                    {active.eyebrow}
                  </p>
                  <h3 data-brand-display="true" className="mt-3 text-3xl">
                    {active.title}
                  </h3>
                  <p className="mt-3 max-w-lg leading-7 text-slate-600">{active.description}</p>
                </div>
                <div
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${active.accent === "gold" ? "bg-[#fff3cb] text-[#b77a00]" : active.accent === "green" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-[#2563eb]"}`}
                >
                  <Icon size={22} />
                </div>
              </div>
              <div className="mt-7 rounded-xl border border-[#d9e1ee] bg-white">
                <div className="flex items-center justify-between border-b border-[#e6ebf3] px-5 py-4">
                  <span className="font-semibold">Resumo operacional</span>
                  <span className="rounded-full bg-[#e8f0ff] px-3 py-1 text-xs font-semibold text-[#133a7c]">
                    Atualizado agora
                  </span>
                </div>
                {active.rows.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-5 border-b border-[#eef1f6] px-5 py-4 text-sm"
                  >
                    <span className="font-medium">{label}</span>
                    <span className="text-slate-600">{value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-[#f8fafc] px-5 py-4">
                  <span className="font-semibold">Indicador</span>
                  <strong className="text-[#0b1d3d]">{active.total}</strong>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="text-sm text-slate-500">Tela disponível na plataforma Orien</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => move(-1)}
                    aria-label="Tela anterior"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-[#cbd7e9] bg-white"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => move(1)}
                    aria-label="Próxima tela"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-[#cbd7e9] bg-white"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section id="calculator" className="border-y border-[#d9e1ee] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[.95fr_1.05fr]">
            <div>
              <p className="text-xs font-bold tracking-[.2em] text-[#2563eb]">GANHO OPERACIONAL</p>
              <h2 data-brand-display="true" className="mt-3 text-4xl md:text-5xl">
                Descubra onde sua rotina pode respirar.
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Uma estimativa simples de horas recuperadas com menos retrabalho, conferência manual
                e procura por informação.
              </p>
            </div>
            <div className="rounded-2xl border border-[#d9e1ee] bg-[#f8fafc] p-6 sm:p-8">
              <div className="grid gap-6 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Pessoas na operação
                  <input
                    aria-label="Pessoas na operação"
                    type="range"
                    min="1"
                    max="50"
                    value={employees}
                    onChange={(e) => setEmployees(Number(e.target.value))}
                    className="mt-4 w-full accent-[#2563eb]"
                  />
                  <span className="mt-2 block text-3xl text-[#0b1d3d]">{employees}</span>
                </label>
                <label className="text-sm font-semibold">
                  Horas por semana em controles manuais
                  <input
                    aria-label="Horas por semana"
                    type="range"
                    min="1"
                    max="20"
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    className="mt-4 w-full accent-[#2563eb]"
                  />
                  <span className="mt-2 block text-3xl text-[#0b1d3d]">{hours}h</span>
                </label>
              </div>
              <div className="mt-7 rounded-xl bg-[#0b1d3d] p-6 text-white">
                <p className="text-sm text-slate-300">
                  Potencial mensal estimado de ganho operacional
                </p>
                <p className="mt-2 text-4xl font-semibold text-[#f5c34a]">
                  {monthlyGain.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Estimativa indicativa, considerando tempo recuperado e redução de perdas
                  operacionais. Os resultados dependem da rotina de cada empresa.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="plans" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="text-center">
          <p className="text-xs font-bold tracking-[.2em] text-[#2563eb]">PLANOS TRANSPARENTES</p>
          <h2 data-brand-display="true" className="mt-3 text-4xl md:text-5xl">
            Uma escolha clara para cada estágio.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Escolha pelos limites, módulos e suporte que sua empresa precisa agora. Cresça sem
            trocar de plataforma.
          </p>
        </div>
        <div id="planos" className="mt-10 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.slug}
              className={`relative rounded-2xl border p-7 ${plan.featured ? "border-[#0b1d3d] bg-[#0b1d3d] text-white shadow-[0_22px_48px_rgba(11,29,61,.22)]" : "border-[#d9e1ee] bg-white"}`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-7 rounded-full bg-[#f5c34a] px-3 py-1 text-xs font-bold text-[#0b1d3d]">
                  MAIS ESCOLHIDO
                </span>
              )}
              <h3 data-brand-display="true" className="text-3xl">
                {plan.name}
              </h3>
              <p className={`mt-2 ${plan.featured ? "text-slate-300" : "text-slate-600"}`}>
                {plan.description}
              </p>
              <p
                className={`mt-7 text-4xl font-semibold ${plan.featured ? "text-[#f5c34a]" : "text-[#0b1d3d]"}`}
              >
                {plan.price}
                <span className="text-base font-normal">/mês</span>
              </p>
              <div
                className={`my-7 border-t ${plan.featured ? "border-white/15" : "border-[#e5eaf2]"}`}
              />
              <ul className="grid gap-3 text-sm">
                {[plan.users, plan.branches, plan.support, ...plan.modules].map((item) => (
                  <li className="flex gap-2" key={item}>
                    <Check
                      size={17}
                      className={
                        plan.featured ? "shrink-0 text-[#f5c34a]" : "shrink-0 text-[#2563eb]"
                      }
                    />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={`/checkout?plan=${plan.slug}`}
                className={`mt-8 block rounded-lg px-4 py-3 text-center font-semibold ${plan.featured ? "bg-[#f5c34a] text-[#0b1d3d]" : "bg-[#0b1d3d] text-white"}`}
              >
                Escolher {plan.name}
              </a>
            </article>
          ))}
        </div>
        <p className="mt-5 text-center text-sm text-slate-500">
          Todos os planos incluem dados isolados por empresa, atualizações e canais de ajuda.
        </p>
      </section>

    <LandingSocialProof />

    <section id="segments" className="bg-[#0b1d3d] text-white">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-bold tracking-[.2em] text-[#f5c34a]">
              FEITO PARA A SUA OPERAÇÃO
            </p>
            <h2 data-brand-display="true" className="mt-3 text-4xl md:text-5xl">
              Uma base única para negócios diferentes.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              [Store, "Varejo", "PDV, preços e estoque no ritmo da loja."],
              [PackageCheck, "Distribuidoras", "Pedidos, compras e movimentações por unidade."],
              [WandSparkles, "Serviços", "Clientes, recebimentos e acompanhamento comercial."],
              [Building2, "Multi-lojas", "Permissões, transferências e visão consolidada."],
            ].map(([Component, title, text]) => {
              const Feature = Component as typeof Store;
              return (
                <article
                  key={title as string}
                  className="rounded-xl border border-white/15 bg-white/5 p-5"
                >
                  <Feature className="text-[#f5c34a]" size={24} />
                  <h3 className="mt-5 text-xl font-semibold">{title as string}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{text as string}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold tracking-[.2em] text-[#2563eb]">COMO FUNCIONA</p>
            <h2 data-brand-display="true" className="mt-3 text-4xl">
              Da contratação à rotina em quatro passos.
            </h2>
            <div className="mt-8 grid gap-5">
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
                <div key={number} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f0ff] text-sm font-bold text-[#133a7c]">
                    {number}
                  </span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 leading-6 text-slate-600">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div id="seguranca" className="rounded-2xl border border-[#d9e1ee] bg-white p-7">
            <p className="text-xs font-bold tracking-[.2em] text-[#2563eb]">SEGURANÇA E LGPD</p>
            <h2 data-brand-display="true" className="mt-3 text-3xl">
              Informação de negócio exige proteção de verdade.
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              A Orien foi construída com separação de empresas, permissões por papel e filial,
              registros de auditoria e controles para reduzir acessos indevidos.
            </p>
            <div className="mt-7 grid gap-3">
              {[
                [ShieldCheck, "Acesso por papel e filial"],
                [LockKeyhole, "Sessões protegidas e tokens rotativos"],
                [UsersRound, "Dados isolados por empresa"],
                [MonitorSmartphone, "Auditoria de ações críticas"],
              ].map(([Component, label]) => {
                const Feature = Component as typeof ShieldCheck;
                return (
                  <div
                    key={label as string}
                    className="flex items-center gap-3 rounded-lg bg-[#f5f7fb] p-4"
                  >
                    <Feature size={20} className="text-[#2563eb]" />
                    <span className="font-medium">{label as string}</span>
                  </div>
                );
              })}
            </div>
            <a href="/privacidade" className="mt-6 inline-block font-semibold text-[#2563eb]">
              Ler política de privacidade
            </a>
          </div>
        </div>
      </section>

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
            {faqs.map(([question, answer], index) => (
              <article key={question} className="rounded-xl border border-[#d9e1ee]">
                <button
                  className="flex w-full items-center justify-between gap-5 p-5 text-left font-semibold"
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                >
                  <span>{question}</span>
                  <span className="text-xl text-[#2563eb]">{openFaq === index ? "−" : "+"}</span>
                </button>
                {openFaq === index && (
                  <p className="border-t border-[#e8edf4] px-5 py-4 leading-7 text-slate-600">
                    {answer}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

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
            href="/checkout?plan=pro"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b1d3d] px-5 py-3.5 font-semibold text-white"
          >
            Criar minha empresa <ArrowRight size={17} />
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
            </div>
          </div>
          <div>
            <p className="font-semibold text-white">Atendimento</p>
            <div className="mt-4 grid gap-3 text-sm">
              <a href="mailto:suporte@useorien.com.br">suporte@useorien.com.br</a>
              <button
                type="button"
                disabled
                title="Configure o número de WhatsApp no backoffice para ativar este canal."
                className="cursor-not-allowed text-left text-slate-500"
              >
                WhatsApp comercial em breve
              </button>
              <a href="/checkout/status">Acompanhar checkout</a>
              <a href="https://app.useorien.com.br/login">Acessar plataforma</a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 py-5 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Orien. Todos os direitos reservados.
        </div>
      </footer>
    </main>
  );
}
