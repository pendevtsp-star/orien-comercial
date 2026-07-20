import { MessageCircle } from "lucide-react";
import {
  isValidWhatsappNumber,
  normalizeWhatsappNumber,
  type PublicLandingSettings,
} from "../lib/landing-settings";

type LandingSocialProofProps = { settings: PublicLandingSettings };

export function LandingSocialProof({ settings }: LandingSocialProofProps) {
  const whatsappNumber = normalizeWhatsappNumber(settings.whatsappNumber);
  const whatsappHref = isValidWhatsappNumber(whatsappNumber)
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(settings.whatsappMessage)}`
    : null;

  return (
    <>
      {settings.visibility.showTestimonials && settings.testimonials.length > 0 ? (
        <section id="testimonials" className="border-y border-[#d9e1ee] bg-[#f7f8fb]">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mt-6 text-xs font-bold tracking-[.2em] text-[#2563eb]">
                DEPOIMENTOS DE CLIENTES
              </p>
              <h2 data-brand-display="true" className="mt-3 text-4xl md:text-5xl">
                {settings.socialProof.title}
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Relatos compartilhados por clientes da Orien.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {settings.testimonials.map((testimonial) => (
                <article
                  key={`${testimonial.name}-${testimonial.company}`}
                  className="flex min-h-64 flex-col justify-between border border-[#d9e1ee] bg-white p-7 shadow-[0_16px_36px_rgba(11,29,61,.08)]"
                >
                  <p className="text-base leading-7 text-slate-600">{testimonial.quote}</p>
                  <div className="mt-8 flex items-center gap-4">
                    {testimonial.imageUrl ? (
                      <img
                        src={testimonial.imageUrl}
                        alt=""
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-[#e8f0ff] text-sm font-bold text-[#133a7c]">
                        {initials(testimonial.name)}
                      </span>
                    )}
                    <div>
                      <p className="font-semibold text-[#0b1d3d]">{testimonial.name}</p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {[testimonial.role, testimonial.company].filter(Boolean).join(" - ")}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          aria-label="Falar com a Orien pelo WhatsApp"
          className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#0b1d3d] text-white shadow-[0_12px_30px_rgba(11,29,61,.3)] transition hover:bg-[#133a7c]"
        >
          <MessageCircle size={22} />
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
