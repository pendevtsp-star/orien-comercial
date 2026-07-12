"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BrandLogo } from "@sgc/ui";

const api = process.env.NEXT_PUBLIC_API_URL ?? "https://api.useorien.com.br/api/v1";

export default function TestimonialPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const [details, setDetails] = useState<{ company?: string; submitted?: boolean } | null>(null);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [quote, setQuote] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "sent" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    void fetch(`${api}/public/testimonials/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message ?? "Convite indisponível.");
        setDetails(body);
        setCompany(body.company ?? "");
        setState(body.submitted ? "sent" : "ready");
      })
      .catch((cause) => {
        setMessage(cause instanceof Error ? cause.message : "Convite indisponível.");
        setState("error");
      });
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const response = await fetch(`${api}/public/testimonials/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, company, role, quote, consentPublication: consent }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? "Não foi possível enviar sua avaliação.");
      setState("sent");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível enviar sua avaliação.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-10 text-[#0b1d3d] sm:py-16">
      <section className="mx-auto max-w-2xl rounded-2xl border border-[#d9e1ee] bg-white p-6 shadow-[0_18px_50px_rgba(11,29,61,.08)] sm:p-10">
        <BrandLogo size="sm" />
        <p className="mt-10 text-xs font-bold tracking-[.2em] text-[#2563eb]">
          AVALIAÇÃO CONVIDADA
        </p>
        {state === "loading" && (
          <>
            <h1 data-brand-display="true" className="mt-3 text-4xl">
              Preparando seu convite
            </h1>
            <p className="mt-4 text-slate-600">Só um instante.</p>
          </>
        )}
        {state === "error" && (
          <>
            <h1 data-brand-display="true" className="mt-3 text-4xl">
              Convite indisponível
            </h1>
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
              {message}
            </p>
            <Link href="/" className="mt-6 inline-block font-semibold text-[#2563eb]">
              Voltar para a Orien
            </Link>
          </>
        )}
        {state === "sent" && (
          <>
            <h1 data-brand-display="true" className="mt-3 text-4xl">
              Obrigado pelo seu relato.
            </h1>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              Sua avaliação será revisada pela equipe Orien antes de qualquer publicação.
            </p>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              Nenhuma informação será exibida na landing sem sua autorização explícita.
            </p>
          </>
        )}
        {state === "ready" && (
          <>
            <h1 data-brand-display="true" className="mt-3 text-4xl">
              Como a Orien ajudou sua operação?
            </h1>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              Seu relato ajuda outros negócios a entenderem a rotina com a Orien. A publicação
              depende de aprovação.
            </p>
            <form onSubmit={submit} className="mt-8 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Seu nome" value={name} setValue={setName} required />
                <Field label="Empresa" value={company} setValue={setCompany} />
              </div>
              <Field label="Cargo ou função" value={role} setValue={setRole} />
              <label className="grid gap-1 text-sm font-semibold">
                Seu depoimento
                <textarea
                  required
                  minLength={20}
                  maxLength={700}
                  value={quote}
                  onChange={(event) => setQuote(event.target.value)}
                  placeholder="Conte, em suas palavras, o que mudou na sua rotina."
                  className="min-h-36 rounded-lg border border-[#cbd7e9] px-3 py-3"
                />
              </label>
              <label className="flex items-start gap-3 rounded-lg bg-[#f5f7fb] p-4 text-sm leading-6 text-slate-600">
                <input
                  className="mt-1 h-4 w-4 accent-[#2563eb]"
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>
                  Autorizo a Orien a publicar este depoimento com meu nome, empresa e cargo, após
                  revisão da equipe.
                </span>
              </label>
              {message && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {message}
                </p>
              )}
              <button className="rounded-lg bg-[#0b1d3d] px-5 py-3.5 font-semibold text-white">
                Enviar para revisão
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  setValue,
  required = false,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <input
        required={required}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="rounded-lg border border-[#cbd7e9] px-3 py-3"
      />
    </label>
  );
}
