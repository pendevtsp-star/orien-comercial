import { Check } from "lucide-react";
import type { PublicLandingSettings } from "../lib/landing-settings";

type Plan = {
  slug: "starter" | "pro" | "enterprise";
  name: string;
  price: string;
  description: string;
  users: string;
  branches: string;
  support: string;
  modules: string[];
};

const plans: Plan[] = [
  {
    slug: "starter",
    name: "Essencial",
    price: "R$ 99",
    description: "Para organizar a primeira operação.",
    users: "até 3 usuários",
    branches: "1 loja",
    support: "Suporte por e-mail",
    modules: ["Vendas e clientes", "Estoque essencial", "Financeiro básico"],
  },
  {
    slug: "pro",
    name: "Pro",
    price: "R$ 199",
    description: "Para lojas que crescem com controle.",
    users: "até 10 usuários",
    branches: "até 3 lojas",
    support: "Suporte prioritário",
    modules: ["Tudo do Essencial", "PDV e caixa", "Compras e relatórios", "Auditoria operacional"],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
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

type LandingPlanComparisonProps = { presentation: PublicLandingSettings["planPresentation"] };

export function LandingPlanComparison({ presentation }: LandingPlanComparisonProps) {
  return (
    <section id="planos" className="bg-[#f7f8fb]">
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold tracking-[.2em] text-[#2563eb]">PLANOS TRANSPARENTES</p>
          <h2 data-brand-display="true" className="mt-3 text-4xl md:text-5xl">
            Uma escolha clara para cada estágio.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Escolha pelos limites, módulos e suporte que sua empresa precisa agora.
          </p>
        </div>
        <div className="mt-10 grid gap-5 lg:hidden">
          {plans.map((plan) => (
            <PlanCard
              key={plan.slug}
              plan={plan}
              highlighted={plan.slug === presentation.highlightedPlan}
              ctaLabel={presentation.ctaLabels[plan.slug]}
            />
          ))}
        </div>
        <div className="mt-10 hidden overflow-x-auto border border-[#d9e1ee] bg-white lg:block">
          <table className="min-w-full text-left">
            <thead className="bg-[#0b1d3d] text-white">
              <tr>
                <th className="p-5 font-semibold">Comparativo</th>
                {plans.map((plan) => (
                  <th key={plan.slug} className="min-w-56 p-5">
                    <span className="text-2xl" data-brand-display="true">
                      {plan.name}
                    </span>
                    <span className="mt-2 block text-sm font-normal text-slate-300">
                      {plan.description}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Preço mensal", (plan: Plan) => `${plan.price}/mês`],
                ["Usuários", (plan: Plan) => plan.users],
                ["Filiais", (plan: Plan) => plan.branches],
                ["Suporte", (plan: Plan) => plan.support],
              ].map(([label, getValue]) => (
                <tr key={label as string} className="border-t border-[#e5eaf2]">
                  <th className="p-5 text-sm font-semibold text-[#0b1d3d]">{label as string}</th>
                  {plans.map((plan) => (
                    <td key={plan.slug} className="p-5 text-sm text-slate-600">
                      {(getValue as (plan: Plan) => string)(plan)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-[#e5eaf2]">
                <th className="p-5 text-sm font-semibold text-[#0b1d3d]">Recursos</th>
                {plans.map((plan) => (
                  <td key={plan.slug} className="p-5">
                    <ul className="grid gap-2 text-sm text-slate-600">
                      {plan.modules.map((module) => (
                        <li key={module} className="flex gap-2">
                          <Check size={16} className="shrink-0 text-[#2563eb]" />
                          {module}
                        </li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
              <tr className="border-t border-[#e5eaf2]">
                <th className="p-5" />
                {plans.map((plan) => (
                  <td key={plan.slug} className="p-5">
                    <a
                      href={`/checkout?plan=${plan.slug}`}
                      className="block bg-[#0b1d3d] px-4 py-3 text-center font-semibold text-white"
                    >
                      {presentation.ctaLabels[plan.slug]}
                    </a>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-5 text-center text-sm text-slate-500">
          Todos os planos incluem dados isolados por empresa, atualizações e canais de ajuda.
        </p>
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  highlighted,
  ctaLabel,
}: {
  plan: Plan;
  highlighted: boolean;
  ctaLabel: string;
}) {
  return (
    <article
      className={`border p-7 ${highlighted ? "border-[#0b1d3d] bg-[#0b1d3d] text-white" : "border-[#d9e1ee] bg-white"}`}
    >
      <p
        className={`text-xs font-bold tracking-[.16em] ${highlighted ? "text-[#f5c34a]" : "text-[#2563eb]"}`}
      >
        {highlighted ? "MAIS ESCOLHIDO" : "PLANO ORIEN"}
      </p>
      <h3 data-brand-display="true" className="mt-3 text-3xl">
        {plan.name}
      </h3>
      <p className={`mt-2 ${highlighted ? "text-slate-300" : "text-slate-600"}`}>
        {plan.description}
      </p>
      <p
        className={`mt-6 text-4xl font-semibold ${highlighted ? "text-[#f5c34a]" : "text-[#0b1d3d]"}`}
      >
        {plan.price}
        <span className="text-base font-normal">/mês</span>
      </p>
      <ul
        className={`mt-6 grid gap-3 border-y py-6 text-sm ${highlighted ? "border-white/15" : "border-[#e5eaf2]"}`}
      >
        {[plan.users, plan.branches, plan.support, ...plan.modules].map((item) => (
          <li key={item} className="flex gap-2">
            <Check
              size={17}
              className={highlighted ? "shrink-0 text-[#f5c34a]" : "shrink-0 text-[#2563eb]"}
            />
            {item}
          </li>
        ))}
      </ul>
      <a
        href={`/checkout?plan=${plan.slug}`}
        className={`mt-6 block px-4 py-3 text-center font-semibold ${highlighted ? "bg-[#f5c34a] text-[#0b1d3d]" : "bg-[#0b1d3d] text-white"}`}
      >
        {ctaLabel}
      </a>
    </article>
  );
}
