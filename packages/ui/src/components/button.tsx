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
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    >
      <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
        {icon ? <span aria-hidden="true" className="shrink-0">{icon}</span> : null}
        <span>{children}</span>
      </span>
    </button>
  );
}
