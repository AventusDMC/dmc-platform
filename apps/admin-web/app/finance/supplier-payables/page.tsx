import Link from 'next/link';
import { ModuleSwitcher } from '../../components/ModuleSwitcher';
import { SummaryStrip } from '../../components/SummaryStrip';
import { TableSectionShell } from '../../components/TableSectionShell';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { WorkspaceSubheader } from '../../components/WorkspaceSubheader';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';

export const dynamic = 'force-dynamic';

type SupplierPayable = {
  supplierId: string | null;
  supplierName: string;
  totalCost: number;
};

type SupplierPayablesPageProps = {
  searchParams?: Promise<{
    from?: string;
    to?: string;
  }>;
};

async function getSupplierPayables(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();

  return adminPageFetchJson<unknown>(`/api/reports/supplier-payables${query ? `?${query}` : ''}`, 'Supplier payables report', {
    cache: 'no-store',
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeSupplierPayables(value: unknown): SupplierPayable[] {
  const record = asRecord(value);
  const rows: unknown[] = Array.isArray(value) ? value : Array.isArray(record.suppliers) ? record.suppliers : [];

  return rows.map((entry) => {
    const row = asRecord(entry);
    return {
      supplierId: asNullableString(row.supplierId),
      supplierName: asString(row.supplierName || row.supplier, 'Unassigned supplier'),
      totalCost: asNumber(row.totalCost),
    };
  });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export default async function SupplierPayablesPage({ searchParams }: SupplierPayablesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const from = resolvedSearchParams.from || '';
  const to = resolvedSearchParams.to || '';
  let payables: SupplierPayable[] = [];
  let loadError = false;

  try {
    payables = normalizeSupplierPayables(await getSupplierPayables(from, to));
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error('[finance/supplier-payables] report unavailable', error);
    loadError = true;
  }

  const totalCost = payables.reduce((total, payable) => total + payable.totalCost, 0);
  const dateRangeLabel = from || to ? `${from || 'Any date'} to ${to || 'Any date'}` : 'All dates';

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Finance"
          title="Supplier Payables"
          description="Review supplier payable totals from booking service cost data."
          switcher={
            <ModuleSwitcher
              ariaLabel="Finance slices"
              activeId="supplier-payables"
              items={[
                { id: 'all', label: 'Overview', href: '/finance', helper: 'All finance signals' },
                { id: 'unpaid-suppliers', label: 'Unpaid Suppliers', href: '/finance?report=unpaid-suppliers', helper: 'Open payables' },
                { id: 'margin-report', label: 'Margin Report', href: '/finance/margin-report', helper: 'Supplier margin' },
                { id: 'supplier-payables', label: 'Supplier Payables', href: '/finance/supplier-payables', helper: 'Supplier totals' },
                { id: 'reconciliation', label: 'Reconciliation', href: '/finance/reconciliation', helper: 'Proof review queue' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'suppliers', label: 'Suppliers', value: String(payables.length), helper: 'Rows in report' },
                { id: 'total-payables', label: 'Total Payables', value: formatMoney(totalCost), helper: dateRangeLabel },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Supplier Payables"
              title="Supplier payable summary"
              description="A simple supplier-level view of total cost obligations, optionally filtered by booking date."
              actions={
                <>
                  <Link href="/finance" className="dashboard-toolbar-link">
                    Finance
                  </Link>
                  <Link href="/finance/margin-report" className="dashboard-toolbar-link">
                    Margin report
                  </Link>
                  <Link href="/admin/reports" className="dashboard-toolbar-link">
                    Reports
                  </Link>
                </>
              }
            />

            <form className="reports-filter-bar" action="/finance/supplier-payables">
              <label>
                From date
                <input type="date" name="from" defaultValue={from} />
              </label>
              <label>
                To date
                <input type="date" name="to" defaultValue={to} />
              </label>
              <button type="submit" className="primary-button">
                Apply
              </button>
              {from || to ? (
                <Link href="/finance/supplier-payables" className="secondary-button">
                  Clear
                </Link>
              ) : null}
            </form>

            {loadError ? (
              <section className="workspace-section">
                <p className="eyebrow">Report unavailable</p>
                <h2>Supplier payables could not be loaded.</h2>
                <p className="detail-copy">The page is still available. Try again once the supplier payables endpoint is healthy.</p>
              </section>
            ) : null}

            <TableSectionShell
              title="Supplier payables"
              description={`Supplier names and total costs from the supplier payables report. ${dateRangeLabel}.`}
              context={<p>{payables.length} suppliers in scope</p>}
              emptyState={
                payables.length === 0 ? (
                  <div className="empty-state ui-empty-state">
                    <strong>{loadError ? 'Supplier payables are temporarily unavailable.' : 'No supplier payables yet.'}</strong>
                    <p>
                      {loadError
                        ? 'The report page is available, but supplier payable totals could not be loaded right now.'
                        : 'Supplier totals will appear here after booking service costs exist for the selected date range.'}
                    </p>
                    {from || to ? (
                      <Link href="/finance/supplier-payables" className="secondary-button">
                        Clear date filter
                      </Link>
                    ) : null}
                  </div>
                ) : undefined
              }
            >
              {payables.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Supplier</th>
                        <th className="money-cell">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payables.map((payable) => (
                        <tr key={payable.supplierId || payable.supplierName}>
                          <td>{payable.supplierName}</td>
                          <td className="money-cell">{formatMoney(payable.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
