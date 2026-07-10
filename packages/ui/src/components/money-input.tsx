import type { InputHTMLAttributes } from "react";
import { Input } from "./input";

export function MoneyInput(props: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return <Input inputMode="decimal" step="0.01" type="number" min="0" {...props} />;
}
