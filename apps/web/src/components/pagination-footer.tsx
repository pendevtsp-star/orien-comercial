"use client";

import { Badge, Button } from "@sgc/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PaginationFooter({
  page,
  pageSize,
  total,
  onPrevious,
  onNext
}: {
  page: number;
  pageSize: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total ? (page - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm text-slate-600 shadow-[0_10px_24px_rgba(11,29,61,0.04)] md:flex-row md:items-center md:justify-between">
      <p>
        Mostrando <span className="font-medium text-[var(--brand-primary)]">{showingFrom}</span> a{" "}
        <span className="font-medium text-[var(--brand-primary)]">{showingTo}</span> de{" "}
        <span className="font-medium text-[var(--brand-primary)]">{total}</span> registros
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" icon={<ChevronLeft size={16} />} disabled={page <= 1} onClick={onPrevious}>
          Anterior
        </Button>
        <Badge>
          Pagina {page} de {totalPages}
        </Badge>
        <Button type="button" variant="secondary" icon={<ChevronRight size={16} />} disabled={page >= totalPages} onClick={onNext}>
          Proxima
        </Button>
      </div>
    </div>
  );
}
