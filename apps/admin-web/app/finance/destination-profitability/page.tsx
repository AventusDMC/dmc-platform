import Link from 'next/link';
import { ModuleSwitcher } from '../../components/ModuleSwitcher';
import { SummaryStrip } from '../../components/SummaryStrip';
import { TableSectionShell } from '../../components/TableSectionShell';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { WorkspaceSubheader } from '../../components/WorkspaceSubheader';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';

export const dynamic = 'force-dynamic';

type DestinationRow = {
  country: string;
  serviceCount: number;
  totalCost: number;
  totalSell: number;
  totalProfit: number;
  marginPercent: number;
};

type DestinationProfitabilityPageProps = {
  searchParams?: Promise<{
    startDate?: string;
    endDate?: string;
  }>;
};

async function getDestinationProfitability(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const query = params.toString();

  return adminPageFetchJson<unknown>(
    `/api/reports/destination-profitability${query ? `?${query}` : ''}`,
    'Destination profitability report',
    { cache: 'no-store' },
  );
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

function normalizeRows(value: unknown): DestinationRow[] {
  const rows: unknown[] = Array.isArray(value) ? value : [];
  return rows.map((entry) => {
    const row = asRecord(entry);
    return {
      country: asString(row.country, 'Unattributed'),
      serviceCount: asNumber(row.serviceCount),
      totalCost: asNumber(row.totalCost),
      totalSell: asNumber(row.totalSell),
      totalProfit: asNumber(row.totalProfit),
      marginPercent: asNumber(row.marginPercent),
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
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(
    Number.isFinite(numericValue) ? numericValue : 0,
  );
  return `${formatted}%`;
}

function profitColor(profit: number) {
  if (profit > 0) return '#15803d';
  if (profit < 0) return '#b91c1c';
  return '#475467';
}

export default async function DestinationProfitabilityPage({ searchParams }: DestinationProfitabilityPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const startDate = resolvedSearchParams.startDate || '';
  const endDate = resolvedSearchParams.endDate || '';
  let report: Record<string, unknown> = {};
  let rows: DestinationRow[] = [];
  let loadError = false;

  try {
    report = asRecord(await getDestinationProfitability(startDate, endDate));
    rows = normalizeRows(report.countries);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error('[finance/destination-profitability] report unavailable', error);
    loadError = true;
  }

  const totalSell = rows.reduce((sum, row) => sum + row.totalSell, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.totalCost, 0);
  const totalProfit = rows.reduce((sum, row) => sum + row.totalProfit, 0);
  const attributedCountries = rows.filter((row) => row.country !== 'Unattributed').length;
  const unattributed = asNumber(report.unattributedServiceCount);
  const dateRangeLabel = startDate || endDate ? `${startDate || 'Any date'} to ${endDate || 'Any date'}` : 'All dates';

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Finance"
          title="Destination Profitability"
          description="Booked service profit attributed to destination country (from each service's quote itinerary day)."
          switcher={
            <ModuleSwitcher
              ariaLabel="Finance slices"
              activeId="destination-profitability"
              items={[
                { id: 'all', label: 'Overview', href: '/finance', helper: 'All finance signals' },
                { id: 'margin-report', label: 'Margin Report', href: '/finance/margin-report', helper: 'Supplier margin' },
                { id: 'cost-variance', label: 'Cost Variance', href: '/finance/cost-variance', helper: 'Expected vs actual' },
                {
                  id: 'destination-profitability',
                  label: 'Destination Profit',
                  href: '/finance/destination-profitability',
                  helper: 'Profit by country',
                },
                { id: 'supplier-payables', label: 'Supplier Payables', href: '/finance/supplier-payables', helper: 'Supplier totals' },
                { id: 'reconciliation', label: 'Reconciliation', href: '/finance/reconciliation', helper: 'Proof review queue' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'sell', label: 'Total Sell', value: formatMoney(totalSell), helper: 'Across attributed services' },
                { id: 'cost', label: 'Total Cost', value: formatMoney(totalCost), helper: 'Supplier cost' },
                { id: 'profit', label: 'Gross Profit', value: formatMoney(totalProfit), helper: 'Sell less cost' },
                { id: 'countries', label: 'Countries', value: String(attributedCountries), helper: 'Distinct destinations' },
                { id: 'unattributed', label: 'Unattributed', value: String(unattributed), helper: 'Services with no country' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Destination Profitability"
              title="Gross profit by destination country"
              description="Each booked service's profit attributed to its itinerary day's country (manual override or derived from the day's hotels). Services that can't be mapped to a country are grouped as Unattributed."
              actions={
                <>
                  <Link href="/finance" className="dashboard-toolbar-link">
                    Finance
                  </Link>
                  <Link href="/finance/cost-variance" className="dashboard-toolbar-link">
                    Cost variance
                  </Link>
                </>
              }
            />

            <form className="reports-filter-bar" action="/finance/destination-profitability">
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
                <Link href="/finance/destination-profitability" className="secondary-button">
                  Clear
                </Link>
              ) : null}
            </form>

            {loadError ? (
              <section className="workspace-section">
                <p className="eyebrow">Report unavailable</p>
                <h2>Destination profitability report could not be loaded.</h2>
                <p className="detail-copy">The page is still available. Try again once the reports endpoint is healthy.</p>
              </section>
            ) : null}

            <TableSectionShell
              title="Profit by country"
              description={`Gross profit attributed to destination country. ${dateRangeLabel}.`}
              context={<p>{rows.length} {rows.length === 1 ? 'country' : 'countries'} in scope</p>}
              emptyState={
                rows.length === 0 ? (
                  <div className="empty-state ui-empty-state">
                    <strong>{loadError ? 'Destination profitability is temporarily unavailable.' : 'No destination data yet.'}</strong>
                    <p>
                      {loadError
                        ? 'The report page is available, but country rows could not be loaded right now.'
                        : 'Rows appear once bookings carry services whose quote itinerary days resolve to a country in the selected date range.'}
                    </p>
                    {startDate || endDate ? (
                      <Link href="/finance/destination-profitability" className="secondary-button">
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
                        <th>Country</th>
                        <th className="money-cell">Services</th>
                        <th className="money-cell">Cost</th>
                        <th className="money-cell">Sell</th>
                        <th className="money-cell">Gross Profit</th>
                        <th className="money-cell">Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.country}>
                          <td>{row.country}</td>
                          <td className="money-cell">{row.serviceCount}</td>
                          <td className="money-cell">{formatMoney(row.totalCost)}</td>
                          <td className="money-cell">{formatMoney(row.totalSell)}</td>
                          <td className="money-cell" style={{ color: profitColor(row.totalProfit), fontWeight: 600 }}>
                            {formatMoney(row.totalProfit)}
                          </td>
                          <td className="money-cell">{formatPercent(row.marginPercent)}</td>
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
