export type DashboardInvoicesResult<TInvoice> = {
  invoices: TInvoice[];
  unavailable: boolean;
};

export async function loadDashboardInvoices<TInvoice>(
  fetchInvoices: () => Promise<TInvoice[]>,
  logError: (message?: unknown, ...optionalParams: unknown[]) => void = console.error,
): Promise<DashboardInvoicesResult<TInvoice>> {
  try {
    return {
      invoices: await fetchInvoices(),
      unavailable: false,
    };
  } catch (error) {
    logError('[dashboard] Dashboard invoices unavailable', error);

    return {
      invoices: [],
      unavailable: true,
    };
  }
}
