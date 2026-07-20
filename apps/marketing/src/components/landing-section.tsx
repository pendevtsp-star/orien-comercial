import type { ReactNode } from "react";

type LandingSectionProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  tone?: "default" | "muted" | "dark";
  align?: "left" | "center";
};

export function LandingSection({
  id,
  eyebrow,
  title,
  description,
  children,
  tone = "default",
  align = "left",
}: LandingSectionProps) {
  const surface = tone === "dark" ? "bg-[#0b1d3d] text-white" : tone === "muted" ? "bg-white" : "";
  const copy = tone === "dark" ? "text-slate-300" : "text-slate-600";
  const eyebrowColor = tone === "dark" ? "text-[#f5c34a]" : "text-[#2563eb]";
  const alignment = align === "center" ? "mx-auto text-center" : "";

  return (
    <section id={id} className={surface}>
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className={`max-w-2xl ${alignment}`}>
          {eyebrow ? (
            <p className={`text-xs font-bold tracking-[.2em] ${eyebrowColor}`}>{eyebrow}</p>
          ) : null}
          <h2 data-brand-display="true" className="mt-3 text-4xl md:text-5xl">
            {title}
          </h2>
          {description ? <p className={`mt-4 text-lg leading-8 ${copy}`}>{description}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}
