import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Orien workspace</p>
        <h1 data-brand-display="true" className="mt-2 text-3xl font-semibold tracking-normal text-[var(--brand-primary)]">
          {title}
        </h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full min-w-0 flex-wrap gap-2 lg:w-auto lg:max-w-[60%] lg:justify-end">{actions}</div> : null}
    </div>
  );
}
