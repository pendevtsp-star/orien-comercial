import { MessageCircle, Shield, Clock, Headphones, Lock } from "lucide-react";
import {
  isValidWhatsappNumber,
  normalizeWhatsappNumber,
  type PublicLandingSettings,
} from "../lib/landing-settings";

type LandingSocialProofProps = { settings: PublicLandingSettings };

const trustBadges = [
  { Icon: Shield, label: "Dados protegidos com criptografia" },
  { Icon: Lock, label: "Conformidade LGPD" },
  { Icon: Clock, label: "Suporte em horário comercial" },
  { Icon: Headphones, label: "Atendimento humano" },
];

export function LandingSocialProof({ settings }: LandingSocialProofProps) {
  const whatsappNumber = normalizeWhatsappNumber(settings.whatsappNumber);
  const whatsappHref = isValidWhatsappNumber(whatsappNumber)
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(settings.whatsappMessage)}`
    : null;

  return (
    <>
      {/* Trust Badges */}
      <section className="border-b border-[#d9e1ee] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {trustBadges.map(({ Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-[#d9e1ee] bg-[#f7f8fb] p-4 transition-colors hover:border-[#2563eb]/30"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e8f0ff]">
                  <Icon size={20} className="text-[#2563eb]" aria-hidden="true" />
                </div>
                <span className="text-sm font-medium text-[#0b1d3d]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      {settings.visibility.showTestimonials && settings.testimonials.length > 0 ? (
        <section id="testimonials" className="border-b border-[#d9e1ee] bg-[#f7f8fb]">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold tracking-[.2em] text-[#2563eb] uppercase">
                Depoimentos de clientes
              </p>
              <h2 data-brand-display="true" className="mt-4 text-4xl md:text-5xl">
                {settings.socialProof.title}
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Relatos compartilhados por quem já usa a Orien no dia a dia.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {settings.testimonials.map((testimonial) => (
                <article
                  key={`${testimonial.name}-${testimonial.company}`}
                  className="relative flex min-h-[280px] flex-col justify-between rounded-2xl border border-[#d9e1ee] bg-white p-8 shadow-[0_8px_30px_rgba(11,29,61,.06)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(11,29,61,.1)] hover:-translate-y-1"
                >
                  {/* Decorative quote */}
                  <div className="absolute -left-2 -top-2 text-6xl font-bold text-[#2563eb]/10" aria-hidden="true">
                    &ldquo;
                  </div>
                  
                  <p className="relative text-base leading-7 text-slate-600">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>
                  
                  <div className="mt-8 flex items-center gap-4 border-t border-[#e8edf4] pt-6">
                    {testimonial.imageUrl ? (
                      <img
                        src={testimonial.imageUrl}
                        alt={`Foto de ${testimonial.name}`}
                        className="h-12 w-12 rounded-full object-cover ring-2 ring-[#e8f0ff]"
                      />
                    ) : (
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-[#e8f0ff] text-sm font-bold text-[#133a7c] ring-2 ring-white">
                        {initials(testimonial.name)}
                      </span>
                    )}
                    <div>
                      <p className="font-semibold text-[#0b1d3d]">{testimonial.name}</p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {[testimonial.role, testimonial.company].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* WhatsApp Float */}
      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          aria-label="Falar com a Orien pelo WhatsApp"
          className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25c06b] text-white shadow-[0_8px_25px_rgba(37,192,107,.4)] transition-all duration-200 hover:scale-110 hover:shadow-[0_12px_35px_rgba(37,192,107,.5)]"
        >
          <MessageCircle size={24} aria-hidden="true" />
        </a>
      ) : null}
    </>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0])
    .join("")
    .toUpperCase();
}
