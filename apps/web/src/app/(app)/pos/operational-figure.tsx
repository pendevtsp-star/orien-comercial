export function OperationalFigure({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-[var(--brand-border)] bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p
        className={`mt-2 text-lg font-semibold ${accent ? "text-amber-700" : "text-[var(--brand-primary)]"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
