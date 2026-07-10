import type { SelectHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ label: string; value: string }>;
}

export function Select({ className, label, error, options, id, ...props }: SelectProps) {
  const selectId = id ?? props.name;

  return (
    <label className="grid min-w-0 gap-1.5 text-sm text-slate-700" htmlFor={selectId}>
      {label ? <span className="font-medium">{label}</span> : null}
      <select
        id={selectId}
        className={cn(
          "h-10 w-full min-w-0 rounded-md border border-[var(--brand-border)] bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[color:rgba(245,195,74,0.2)]",
          error && "border-rose-300 focus:border-rose-400 focus:ring-rose-100",
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </label>
  );
}
