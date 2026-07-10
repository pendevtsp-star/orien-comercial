import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";

export function ConfirmDialog({
  title,
  description,
  trigger,
  onConfirm
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  onConfirm: () => void;
}) {
  return (
    <Dialog title={title} trigger={trigger}>
      <div className="grid gap-4">
        <div className="flex gap-3 text-sm text-slate-600">
          <AlertTriangle className="mt-0.5 text-amber-600" size={18} />
          <p>{description}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="danger" onClick={onConfirm}>
            Confirmar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
