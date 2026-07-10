import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty
}: {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  empty?: ReactNode;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--brand-border)] bg-white p-8 text-center text-sm text-slate-500">
        {empty}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-white shadow-[0_14px_32px_rgba(11,29,61,0.04)]">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-[var(--brand-surface)] text-xs uppercase tracking-[0.12em] text-[var(--brand-secondary)]">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 font-semibold">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--brand-border)]">
          {rows.map((row) => (
            <tr key={row.id} className={cn("text-slate-700 transition hover:bg-[rgba(241,243,246,0.65)]")}>
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3">
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
