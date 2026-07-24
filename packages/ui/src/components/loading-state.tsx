import { cn } from "../lib/cn";

export function LoadingState({
  label = "Carregando",
  description,
  minHeight = "8rem",
  className,
}: {
  label?: string;
  description?: string;
  minHeight?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{ minHeight }}
      className={cn(
        "flex min-w-0 items-center justify-center rounded-lg border border-[var(--brand-border)] bg-white p-6 text-center shadow-[0_10px_24px_rgba(11,29,61,0.04)]",
        className,
      )}
    >
      <div className="grid justify-items-center gap-2">
        <span
          aria-hidden="true"
          className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-border)] border-t-[var(--brand-accent)] motion-reduce:animate-none"
        />
        <strong className="text-sm font-medium text-[var(--brand-primary)]">{label}</strong>
        {description ? <span className="max-w-md text-xs text-slate-500">{description}</span> : null}
      </div>
    </div>
  );
}
