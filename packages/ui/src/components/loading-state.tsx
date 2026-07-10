export function LoadingState({ label = "Carregando" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-white px-3 py-2 text-sm text-slate-500 shadow-[0_10px_24px_rgba(11,29,61,0.04)]">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--brand-accent)]" />
      {label}
    </div>
  );
}
