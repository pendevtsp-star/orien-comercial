import { ArrowUpRight, LayoutDashboard } from "lucide-react";
import { hasVisibleShowcaseSlides, type LandingSlide } from "../lib/landing-settings";

type LandingProductShowcaseProps = { slides: LandingSlide[] };

export function LandingProductShowcase({ slides }: LandingProductShowcaseProps) {
  const visibleSlides = slides.filter((slide) => slide.isVisible);

  if (!hasVisibleShowcaseSlides(slides)) return null;

  return (
    <section id="produto" className="border-y border-[#d9e1ee] bg-white">
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[.2em] text-[#2563eb]">PROVA DO PRODUTO</p>
          <h2 data-brand-display="true" className="mt-3 text-4xl md:text-5xl">
            Recursos para uma operação mais organizada.
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Conheça os recursos para vender, controlar e acompanhar sua operação.
          </p>
        </div>
        <div
          className="mt-10 grid gap-5 md:grid-cols-2"
          role="region"
          aria-label="Vitrine de recursos da plataforma"
          aria-roledescription="carrossel"
        >
          {visibleSlides.map((slide, index) => (
            <article
              key={`${slide.title}-${index}`}
              className="overflow-hidden border border-[#d9e1ee] bg-[#f5f7fb]"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} de ${visibleSlides.length}`}
            >
              {slide.imageUrl ? (
                <img src={slide.imageUrl} alt={slide.alt} className="h-52 w-full object-cover" />
              ) : (
                <div className="grid min-h-52 place-items-center bg-[#0b1d3d] p-7 text-center text-white">
                  <LayoutDashboard size={34} className="text-[#f5c34a]" aria-hidden="true" />
                  <p className="mt-4 max-w-xs text-sm text-slate-300">
                    Visual do recurso na plataforma.
                  </p>
                </div>
              )}
              <div className="p-6">
                <p className="text-xs font-bold tracking-[.16em] text-[#2563eb]">
                  {slide.eyebrow || "PLATAFORMA ORIEN"}
                </p>
                <h3 data-brand-display="true" className="mt-3 text-3xl">
                  {slide.title}
                </h3>
                <p className="mt-3 leading-7 text-slate-600">{slide.description}</p>
                {slide.href ? (
                  <a
                    href={slide.href}
                    className="mt-5 inline-flex items-center gap-2 font-semibold text-[#2563eb]"
                  >
                    Conhecer este fluxo <ArrowUpRight size={17} />
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
