import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center break-words rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-0.5 text-center text-xs font-medium leading-5 text-[var(--brand-primary)]",
        className
      )}
      {...props}
    />
  );
}
