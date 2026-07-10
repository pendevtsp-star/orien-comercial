import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function Card({ className, variant = "default", style, ...props }: HTMLAttributes<HTMLDivElement> & { variant?: "default" | "brand" }) {
  const isBrand = variant === "brand";

  return (
    <div
      className={cn(
        "min-w-0 max-w-full rounded-xl border shadow-[0_16px_40px_rgba(11,29,61,0.05)]",
        isBrand ? "border-[#11284f] text-white" : "border-[var(--brand-border)] bg-white",
        className
      )}
      style={isBrand ? { ...style, backgroundColor: "var(--brand-primary)" } : style}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-[var(--brand-border)] p-5", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 p-4 sm:p-5", className)} {...props} />;
}
