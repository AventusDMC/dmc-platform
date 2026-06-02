import Link from 'next/link';
import { ModuleSwitcher } from '../../components/ModuleSwitcher';
import { SummaryStrip } from '../../components/SummaryStrip';
import { TableSectionShell } from '../../components/TableSectionShell';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { WorkspaceSubheader } from '../../components/WorkspaceSubheader';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';

export const dynamic = 'force-dynamic';

type CostVarianceRow = {
  bookingId: string | null;
  bookingRef: string;
  clientName: string;
  expectedCost: number;
  payableCost: number;
  actualPaid: number;
  variance: number;
  variancePercent: number;
};

type CostVariancePageProps = {
  searchParams?: Promise<{
    startDate?: string;
    endDate?: string;
  }>;
};

async function getCostVariance(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const query = params.toString();

  return adminPageFetchJson<unknown>(`/api/reports/supplier-cost-variance${query ? `?${query}` : ''}`, 'Supplier cost variance report', {
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

function normalizeRows(value: unknown): CostVarianceRow[] {
  const rows: unknown[] = Array.isArray(value) ? value : [];
  return rows.map((entry) => {
    const row = asRecord(entry);
    return {
      bookingId: asNullableString(row.bookingId),
      bookingRef: asString(row.bookingRef, 'Booking'),
      clientName: asString(row.clientName, 'Client'),
      expectedCost: asNumber(row.expectedCost),
      payableCost: asNumber(row.payableCost),
      actualPaid: asNumber(row.actualPaid),
      variance: asNumber(row.variance),
      variancePercent: asNumber(row.variancePercent),
    };
  });
}

function formatMoney(value: number | null | undefined) {
  const numericValue = Number(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function formatPercent(value: number | null | undefined) {
  const numericValue = Number(value);
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
    Number.isFinite(numericValue) ? numericValue : 0,
  );
  return `${numericValue > 0 ? '+' : ''}${formatted}%`;
}

function varianceColor(variance: number) {
  if (variance > 0) return '#b91c1c';
  if (variance < 0) return '#15803d';
  return '#475467';
}

export default async function CostVariancePage({ searchParams }: CostVariancePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const startDate = resolvedSearchParams.startDate || '';
  const endDate = resolvedSearchParams.endDate || '';
  let report: Record<string, unknown> = {};
  let rows: CostVarianceRow[] = [];
  let loadError = false;

  try {
    report = asRecord(await getCostVariance(startDate, endDate));
    rows = normalizeRows(report.bookings);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error('[finance/cost-variance] report unavailable', error);
    loadError = true;
  }

  const totalExpected = asNumber(report.totalExpectedCost);
  const totalPayable = asNumber(report.totalPayableCost);
  const totalActual = asNumber(report.totalActualPaid);
  const totalVariance = asNumber(report.totalVariance);
  const overBudget = asNumber(report.overBudgetCount);
  const dateRangeLabel = startDate || endDate ? `${startDate || 'Any date'} to ${endDate || 'Any date'}` : 'All dates';

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Finance"
          title="Cost Variance"
          description="Expected supplier cost vs. committed payable vs. actual paid, per booking."
          switcher={
            <ModuleSwitcher
              ariaLabel="Finance slices"
              activeId="cost-variance"
              items={[
                { id: 'all', label: 'Overview', href: '/finance', helper: 'All finance signals' },
                { id: 'margin-report', label: 'Margin Report', href: '/finance/margin-report', helper: 'Supplier margin' },
                { id: 'cost-variance', label: 'Cost Variance', href: '/finance/cost-variance', helper: 'Expected vs actual' },
                { id: 'supplier-payables', label: 'Supplier Payables', href: '/finance/supplier-payables', helper: 'Supplier totals' },
                { id: 'reconciliation', label: 'Reconciliation', href: '/finance/reconciliation', helper: 'Proof review queue' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'expected', label: 'Expected Cost', value: formatMoney(totalExpected), helper: 'Quoted supplier cost' },
                { id: 'payable', label: 'Committed Payable', value: formatMoney(totalPayable), helper: 'Agreed to pay suppliers' },
                { id: 'variance', label: 'Variance', value: formatMoney(totalVariance), helper: 'Payable less expected' },
                { id: 'actual', label: 'Actual Paid', value: formatMoney(totalActual), helper: 'Supplier payments marked paid' },
                { id: 'over', label: 'Over Budget', value: String(overBudget), helper: 'Bookings above quote' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Cost Variance"
              title="Supplier cost variance by booking"
              description="Where the committed supplier payable diverges from the originally quoted cost. Positive variance = over budget."
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

            <form className="reports-filter-bar" action="/finance/cost-variance">
              <label>
                From date
                <input type="date" name="startDate" defaultValue={startDate} />
              </label>
              <label>
                To date
                <input type="date" name="endDate" defaultValue={endDate} />
              </label>
              <button type="submit" className="primary-button">
                Apply
              </button>
              {startDate || endDate ? (
                <Link href="/finance/cost-variance" className="secondary-button">
                  Clear
                </Link>
              ) : null}
            </form>

            {loadError ? (
              <section className="workspace-section">
                <p className="eyebrow">Report unavailable</p>
                <h2>Cost variance report could not be loaded.</h2>
                <p className="detail-copy">The page is still available. Try again once the reports endpoint is healthy.</p>
              </section>
            ) : null}

            <TableSectionShell
              title="Supplier cost variance"
              description={`Expected vs committed vs actual supplier cost per booking. ${dateRangeLabel}.`}
              context={<p>{rows.length} bookings in scope</p>}
              emptyState={
                rows.length === 0 ? (
                  <div className="empty-state ui-empty-state">
                    <strong>{loadError ? 'Cost variance is temporarily unavailable.' : 'No cost data yet.'}</strong>
                    <p>
                      {loadError
                        ? 'The report page is available, but variance rows could not be loaded right now.'
                        : 'Variance rows appear once bookings carry quoted service costs in the selected date range.'}
                    </p>
                    {startDate || endDate ? (
                      <Link href="/finance/cost-variance" className="secondary-button">
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
                        <th>Booking</th>
                        <th>Client</th>
                        <th className="money-cell">Expected</th>
                        <th className="money-cell">Payable</th>
                        <th className="money-cell">Actual Paid</th>
                        <th className="money-cell">Variance</th>
                        <th className="money-cell">Variance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.bookingId || row.bookingRef}>
                          <td>
                            {row.bookingId ? (
                              <Link href={`/bookings/${row.bookingId}`} prefetch={false}>
                                {row.bookingRef}
                              </Link>
                            ) : (
                              row.bookingRef
                            )}
                          </td>
                          <td>{row.clientName}</td>
                          <td className="money-cell">{formatMoney(row.expectedCost)}</td>
                          <td className="money-cell">{formatMoney(row.payableCost)}</td>
                          <td className="money-cell">{formatMoney(row.actualPaid)}</td>
                          <td className="money-cell" style={{ color: varianceColor(row.variance), fontWeight: 600 }}>
                            {formatMoney(row.variance)}
                          </td>
                          <td className="money-cell" style={{ color: varianceColor(row.variance) }}>
                            {formatPercent(row.variancePercent)}
                          </td>
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
