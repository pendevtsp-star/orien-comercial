import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

export function Dialog({
  title,
  trigger,
  children
}: {
  title: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <RadixDialog.Root>
      <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-slate-950/35" />
        <RadixDialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(92vw,560px)] min-w-0 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <RadixDialog.Title className="text-base font-semibold text-slate-950">{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <Button variant="ghost" className="h-8 w-8 px-0" aria-label="Fechar">
                <X size={16} />
              </Button>
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
