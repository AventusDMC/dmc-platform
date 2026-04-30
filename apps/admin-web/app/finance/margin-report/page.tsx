import Link from 'next/link';
import { ModuleSwitcher } from '../../components/ModuleSwitcher';
import { SummaryStrip } from '../../components/SummaryStrip';
import { TableSectionShell } from '../../components/TableSectionShell';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { WorkspaceSubheader } from '../../components/WorkspaceSubheader';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';

export const dynamic = 'force-dynamic';

type MarginReportRow = {
  supplierId: string | null;
  supplierName: string;
  totalCost: number;
  totalSell: number;
  totalProfit: number;
  avgMargin: number;
};

type MarginReportPageProps = {
  searchParams?: Promise<{
    from?: string;
    to?: string;
  }>;
};

async function getMarginReport(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();

  return adminPageFetchJson<unknown>(`/api/reports/supplier-performance${query ? `?${query}` : ''}`, 'Finance margin report', {
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

function normalizeMarginRows(value: unknown): MarginReportRow[] {
  const record = asRecord(value);
  const rows: unknown[] = Array.isArray(value) ? value : Array.isArray(record.suppliers) ? record.suppliers : [];

  return rows.map((entry) => {
    const row = asRecord(entry);
    return {
      supplierId: asNullableString(row.supplierId),
      supplierName: asString(row.supplierName || row.supplier, 'Unassigned supplier'),
      totalCost: asNumber(row.totalCost),
      totalSell: asNumber(row.totalSell),
      totalProfit: asNumber(row.totalProfit),
      avgMargin: asNumber(row.avgMargin),
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

function formatPercent(value: number) {
  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value || 0)}%`;
}

export default async function MarginReportPage({ searchParams }: MarginReportPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const from = resolvedSearchParams.from || '';
  const to = resolvedSearchParams.to || '';
  let rows: MarginReportRow[] = [];
  let loadError = false;

  try {
    rows = normalizeMarginRows(await getMarginReport(from, to));
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error('[finance/margin-report] report unavailable', error);
    loadError = true;
  }

  const totalCost = rows.reduce((total, row) => total + row.totalCost, 0);
  const totalRevenue = rows.reduce((total, row) => total + row.totalSell, 0);
  const totalProfit = rows.reduce((total, row) => total + row.totalProfit, 0);
  const marginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const dateRangeLabel = from || to ? `${from || 'Any date'} to ${to || 'Any date'}` : 'All dates';

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Finance"
          title="Margin Report"
          description="Review supplier-level cost, revenue, profit, and margin."
          switcher={
            <ModuleSwitcher
              ariaLabel="Finance slices"
              activeId="margin-report"
              items={[
                { id: 'all', label: 'Overview', href: '/finance', helper: 'All finance signals' },
                { id: 'margin-report', label: 'Margin Report', href: '/finance/margin-report', helper: 'Supplier margin' },
                { id: 'supplier-payables', label: 'Supplier Payables', href: '/finance/supplier-payables', helper: 'Supplier totals' },
                { id: 'reconciliation', label: 'Reconciliation', href: '/finance/reconciliation', helper: 'Proof review queue' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'suppliers', label: 'Suppliers', value: String(rows.length), helper: 'Rows in report' },
                { id: 'revenue', label: 'Total Revenue', value: formatMoney(totalRevenue), helper: dateRangeLabel },
                { id: 'cost', label: 'Total Cost', value: formatMoney(totalCost), helper: 'Supplier cost base' },
                { id: 'profit', label: 'Total Profit', value: formatMoney(totalProfit), helper: 'Revenue less cost' },
                { id: 'margin', label: 'Margin %', value: formatPercent(marginPercent), helper: dateRangeLabel },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Margin Report"
              title="Supplier margin summary"
              description="Supplier-level financial margin, optionally filtered by booking date."
              actions={
                <>
                  <Link href="/finance" className="dashboard-toolbar-link">
                    Finance
                  </Link>
                  <Link href="/finance/supplier-payables" className="dashboard-toolbar-link">
                    Supplier payables
                  </Link>
                </>
              }
            />

            <form className="reports-filter-bar" action="/finance/margin-report">
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
                <Link href="/finance/margin-report" className="secondary-button">
                  Clear
                </Link>
              ) : null}
            </form>

            {loadError ? (
              <section className="workspace-section">
                <p className="eyebrow">Report unavailable</p>
                <h2>Margin report could not be loaded.</h2>
                <p className="detail-copy">The page is still available. Try again once the supplier performance endpoint is healthy.</p>
              </section>
            ) : null}

            <TableSectionShell
              title="Finance margin report"
              description={`Supplier margin totals from the supplier performance report. ${dateRangeLabel}.`}
              context={<p>{rows.length} suppliers in scope</p>}
              emptyState={
                rows.length === 0 ? (
                  <div className="empty-state ui-empty-state">
                    <strong>{loadError ? 'Margin report is temporarily unavailable.' : 'No margin data yet.'}</strong>
                    <p>
                      {loadError
                        ? 'The report page is available, but supplier margin rows could not be loaded right now.'
                        : 'Supplier margin rows will appear here after bookings have sell and cost values in the selected date range.'}
                    </p>
                    {from || to ? (
                      <Link href="/finance/margin-report" className="secondary-button">
                        Clear date filter
                      </Link>
                    ) : null}
                  </div>
                ) : undefined
              }
            >
              {rows.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Supplier</th>
                        <th className="money-cell">Total Cost</th>
                        <th className="money-cell">Total Revenue</th>
                        <th className="money-cell">Profit</th>
                        <th className="money-cell">Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.supplierId || row.supplierName}>
                          <td>{row.supplierName}</td>
                          <td className="money-cell">{formatMoney(row.totalCost)}</td>
                          <td className="money-cell">{formatMoney(row.totalSell)}</td>
                          <td className="money-cell">{formatMoney(row.totalProfit)}</td>
                          <td className="money-cell">{formatPercent(row.avgMargin)}</td>
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
