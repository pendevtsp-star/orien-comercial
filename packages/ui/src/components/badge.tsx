import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-0.5 text-xs font-medium text-[var(--brand-primary)]",
        className
      )}
      {...props}
    />
  );
}
