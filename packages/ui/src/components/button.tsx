import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-strong)]",
  secondary: "border border-[var(--brand-border)] bg-white text-[var(--brand-primary)] hover:bg-[var(--brand-surface)]",
  ghost: "text-[var(--brand-primary)] hover:bg-[var(--brand-surface)]",
  danger: "bg-rose-600 text-white hover:bg-rose-700"
};

export function Button({ className, variant = "primary", icon, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 max-w-full min-w-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    >
      <span className="inline-flex min-w-0 items-center justify-center gap-2 text-center leading-5">
        {icon ? <span aria-hidden="true" className="shrink-0">{icon}</span> : null}
        <span className="min-w-0 break-words">{children}</span>
      </span>
    </button>
  );
}
