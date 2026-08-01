export interface EntryFilters {
  search: string;
  branchId: string;
  paymentMethod: string;
  dueDateFrom: string;
  dueDateTo: string;
}

export function countAdvancedFilters(filters: EntryFilters) {
  return [filters.branchId, filters.paymentMethod, filters.dueDateFrom, filters.dueDateTo].filter(
    Boolean,
  ).length;
}

export function financialStatusLabel(status: string) {
  return (
    {
      open: "Em aberto",
      paid: "Pago",
      cancelled: "Cancelado",
      pending: "Pendente",
      reconciled: "Conciliado",
      diverged: "Com divergência",
    }[status] ?? status
  );
}
