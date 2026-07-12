"use client";

import { MessageCircle, Star } from "lucide-react";
import { useEffect, useState } from "react";

type Testimonial = {
  quote: string;
  name: string;
  company: string;
  role: string;
  imageUrl: string;
};

type LandingSettings = {
  showTestimonials: boolean;
  whatsappNumber: string;
  whatsappMessage: string;
  testimonials: Testimonial[];
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "https://api.useorien.com.br/api/v1";

export function LandingSocialProof() {
  const [settings, setSettings] = useState<LandingSettings | null>(null);

  useEffect(() => {
    void fetch(`${api}/public/landing`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setSettings(data))
      .catch(() => setSettings(null));
  }, []);

  const whatsappHref = settings?.whatsappNumber
    ? `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(settings.whatsappMessage || "Olá, quero conhecer a Orien.")}`
    : null;
  const testimonials = settings?.showTestimonials ? settings.testimonials ?? [] : [];

  return <>
    {settings?.showTestimonials !== false && <section className="border-y border-[#d9e1ee] bg-[#f7f8fb]">
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="flex justify-center gap-1 text-[#f5c34a]" aria-label="Avaliações de clientes">
            {Array.from({ length: 5 }, (_, index) => <Star key={index} size={23} fill="currentColor" />)}
          </div>
          <p className="mt-6 text-xs font-bold tracking-[.2em] text-[#2563eb]">EXPERIÊNCIAS REAIS</p>
          <h2 data-brand-display="true" className="mt-3 text-4xl md:text-5xl">Quem organiza a operação, sente a diferença.</h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">Depoimentos publicados somente com autorização de cada empresa.</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {testimonials.length === 0 && <article className="col-span-full rounded-xl border border-dashed border-[#cbd7e9] bg-white p-8 text-center text-slate-600"><p className="font-semibold text-[#0b1d3d]">As primeiras avaliações autorizadas aparecerão aqui.</p><p className="mt-2 text-sm">O backoffice permite publicar cada relato com nome, empresa, cargo e imagem opcional.</p></article>}
          {testimonials.map((testimonial) => <article key={`${testimonial.name}-${testimonial.company}`} className="flex min-h-[260px] flex-col justify-between rounded-xl border border-[#d9e1ee] bg-white p-7 shadow-[0_16px_36px_rgba(11,29,61,.08)]">
            <p className="text-base leading-7 text-slate-600">{testimonial.quote}</p>
            <div className="mt-8 flex items-center gap-4">
              {testimonial.imageUrl ? <img src={testimonial.imageUrl} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-[#e8f0ff] text-sm font-bold text-[#133a7c]">{initials(testimonial.name)}</span>}
              <div><p className="font-semibold text-[#0b1d3d]">{testimonial.name}</p><p className="mt-0.5 text-sm text-slate-500">{[testimonial.role, testimonial.company].filter(Boolean).join(" · ")}</p></div>
            </div>
          </article>)}
        </div>
      </div>
    </section>}
    {whatsappHref && <a href={whatsappHref} target="_blank" rel="noreferrer" aria-label="Falar com a Orien pelo WhatsApp" className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#0b1d3d] text-white shadow-[0_12px_30px_rgba(11,29,61,.3)] transition hover:bg-[#133a7c]"><MessageCircle size={22} /></a>}
  </>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((item) => item[0]).join("").toUpperCase();
}
