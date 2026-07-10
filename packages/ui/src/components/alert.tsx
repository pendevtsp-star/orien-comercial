import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950", className)}
      role="alert"
      {...props}
    />
  );
}
