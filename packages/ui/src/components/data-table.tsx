import { isValidElement, type ReactNode } from "react";
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
    if (isValidElement(empty)) return empty;
    return (
      <div className="rounded-xl border border-dashed border-[var(--brand-border)] bg-white p-8 text-center text-sm text-slate-500">
        {empty}
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-auto rounded-xl border border-[var(--brand-border)] bg-white shadow-[0_14px_32px_rgba(11,29,61,0.04)]">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="bg-[var(--brand-surface)] text-xs uppercase tracking-[0.12em] text-[var(--brand-secondary)]">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-3 py-3 font-semibold sm:px-4">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--brand-border)]">
          {rows.map((row) => (
            <tr key={row.id} className={cn("text-slate-700 transition hover:bg-[rgba(241,243,246,0.65)]")}>
              {columns.map((column) => (
                <td key={column.key} className="max-w-[20rem] break-words px-3 py-3 align-top sm:px-4">
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
