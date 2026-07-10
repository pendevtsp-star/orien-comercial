import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  tabs
}: {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  tabs: Array<{ value: string; label: string; content: ReactNode }>;
}) {
  return (
    <RadixTabs.Root defaultValue={defaultValue} value={value} onValueChange={onValueChange}>
      <RadixTabs.List className="inline-flex rounded-xl border border-[var(--brand-border)] bg-white p-1 shadow-[0_10px_24px_rgba(11,29,61,0.04)]">
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition data-[state=active]:bg-[linear-gradient(135deg,#133A7C,#2563EB)] data-[state=active]:text-white"
            )}
          >
            {tab.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((tab) => (
        <RadixTabs.Content key={tab.value} value={tab.value} className="mt-4">
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
