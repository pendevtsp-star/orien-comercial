import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  eyebrow,
  icon
}: {
  title: string;
  description: string;
  action?: ReactNode;
  eyebrow?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="grid place-items-center overflow-hidden rounded-xl border border-dashed border-[var(--brand-border)] bg-white p-8 text-center shadow-[0_12px_30px_rgba(11,29,61,0.04)] sm:p-10">
      <div className="max-w-md">
        {icon ? (
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-secondary)] shadow-[0_10px_22px_rgba(11,29,61,0.08)]">
            {icon}
          </div>
        ) : null}
        {eyebrow ? <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">{eyebrow}</p> : null}
        <h3 className="mt-2 text-lg font-semibold text-[var(--brand-primary)]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
