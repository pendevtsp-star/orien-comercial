"use client";

import { CheckCircle2, Power, PowerOff, X } from "lucide-react";
import { Button } from "./button";

export type BulkStatusAction = "activate" | "deactivate";

export function BulkActionBar({
  selectedCount,
  itemLabel = "registros",
  pendingAction,
  busy = false,
  feedback,
  onRequestAction,
  onClear,
  onConfirm,
  onCancel,
}: {
  selectedCount: number;
  itemLabel?: string;
  pendingAction?: BulkStatusAction | null;
  busy?: boolean;
  feedback?: string | null;
  onRequestAction: (action: BulkStatusAction) => void;
  onClear: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const visibleItemLabel = selectedCount === 1 && itemLabel.endsWith("s") ? itemLabel.slice(0, -1) : itemLabel;
  const selectedText = `${selectedCount} ${visibleItemLabel} selecionado${selectedCount === 1 ? "" : "s"}`;
  const actionText = pendingAction === "activate" ? "ativação" : "desativação";

  return (
    <div className="grid gap-2" aria-live="polite">
      {selectedCount ? (
        <section className="flex flex-col gap-3 rounded-lg border border-[var(--brand-border)] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-[var(--brand-primary)]">{selectedText}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy} icon={<Power size={15} />} onClick={() => onRequestAction("activate")}>
              Ativar selecionados
            </Button>
            <Button type="button" variant="secondary" disabled={busy} icon={<PowerOff size={15} />} onClick={() => onRequestAction("deactivate")}>
              Desativar selecionados
            </Button>
            <Button type="button" variant="ghost" disabled={busy} icon={<X size={15} />} onClick={onClear}>
              Limpar seleção
            </Button>
          </div>
        </section>
      ) : null}

      {pendingAction ? (
        <section role="alertdialog" aria-modal="false" aria-labelledby="bulk-confirm-title" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h3 id="bulk-confirm-title" className="font-semibold">Confirmar {actionText}</h3>
          <p className="mt-1">A operação será aplicada aos {selectedCount} registros em um único lote auditado.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={onConfirm}>{busy ? "Aplicando..." : "Confirmar"}</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button>
          </div>
        </section>
      ) : null}

      {feedback ? (
        <p role="status" className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" tabIndex={-1}>
          <CheckCircle2 aria-hidden="true" size={16} />
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
