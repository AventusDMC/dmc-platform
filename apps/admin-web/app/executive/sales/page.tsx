import Link from 'next/link';
import { SummaryStrip } from '../../components/SummaryStrip';
import { TableSectionShell } from '../../components/TableSectionShell';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { WorkspaceSubheader } from '../../components/WorkspaceSubheader';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';

export const dynamic = 'force-dynamic';

type BookingSummary = {
  totalBookings: number;
  cancelledBookings: number;
  totalSell: number;
  totalCost: number;
  totalProfit: number;
  avgMargin: number;
};

type SupplierRow = {
  supplierId: string | null;
  supplierName: string;
  serviceCount: number;
  totalCost: number;
  totalSell: number;
  totalProfit: number;
  avgMargin: number;
};

type MonthRow = {
  month: string;
  totalBookings: number;
  totalSell: number;
  totalProfit: number;
  avgMargin: number;
};

type SalesPageProps = {
  searchParams?: Promise<{ startDate?: string; endDate?: string }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function str(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}
function nullableStr(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}
function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}
function percent(value: number) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)}%`;
}
function formatMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

async function getJson(pathBase: string, query: string) {
  return adminPageFetchJson<unknown>(`${pathBase}${query ? `?${query}` : ''}`, `Sales report (${pathBase})`, { cache: 'no-store' });
}

async function safeLoad<T>(load: () => Promise<unknown>, normalize: (v: unknown) => T, fallback: T): Promise<{ value: T; failed: boolean }> {
  try {
    return { value: normalize(await load()), failed: false };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    return { value: fallback, failed: true };
  }
}

export default async function ExecutiveSalesPage({ searchParams }: SalesPageProps) {
  const resolved = searchParams ? await searchParams : {};
  const startDate = resolved.startDate || '';
  const endDate = resolved.endDate || '';
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const query = params.toString();
  const dateRangeLabel = startDate || endDate ? `${startDate || 'Any date'} to ${endDate || 'Any date'}` : 'All dates';

  const [summary, suppliers, months] = await Promise.all([
    safeLoad<BookingSummary>(
      () => getJson('/api/reports/booking-summary', query),
      (v) => {
        const r = asRecord(v);
        return {
          totalBookings: num(r.totalBookings),
          cancelledBookings: num(r.cancelledBookings),
          totalSell: num(r.totalSell),
          totalCost: num(r.totalCost),
          totalProfit: num(r.totalProfit),
          avgMargin: num(r.avgMargin),
        };
      },
      { totalBookings: 0, cancelledBookings: 0, totalSell: 0, totalCost: 0, totalProfit: 0, avgMargin: 0 },
    ),
    safeLoad<SupplierRow[]>(
      () => getJson('/api/reports/supplier-performance', query),
      (v) => {
        const rows = Array.isArray(asRecord(v).suppliers) ? (asRecord(v).suppliers as unknown[]) : [];
        return rows.map((entry) => {
          const r = asRecord(entry);
          return {
            supplierId: nullableStr(r.supplierId),
            supplierName: str(r.supplierName, 'Unassigned supplier'),
            serviceCount: num(r.serviceCount),
            totalCost: num(r.totalCost),
            totalSell: num(r.totalSell),
            totalProfit: num(r.totalProfit),
            avgMargin: num(r.avgMargin),
          };
        });
      },
      [],
    ),
    safeLoad<MonthRow[]>(
      () => getJson('/api/reports/monthly-trends', query),
      (v) => {
        const rows = Array.isArray(asRecord(v).months) ? (asRecord(v).months as unknown[]) : [];
        return rows.map((entry) => {
          const r = asRecord(entry);
          return {
            month: str(r.month, ''),
            totalBookings: num(r.totalBookings),
            totalSell: num(r.totalSell),
            totalProfit: num(r.totalProfit),
            avgMargin: num(r.avgMargin),
          };
        });
      },
      [],
    ),
  ]);

  const topSuppliers = [...suppliers.value].sort((a, b) => b.totalSell - a.totalSell).slice(0, 10);
  const maxMonthRevenue = Math.max(1, ...months.value.map((m) => m.totalSell));

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Executive"
          title="Sales Intelligence"
          description="Revenue, profit, margin, top suppliers, and the monthly trend across booked business."
          summary={
            <SummaryStrip
              items={[
                { id: 'revenue', label: 'Revenue', value: money(summary.value.totalSell), helper: dateRangeLabel },
                { id: 'cost', label: 'Supplier Cost', value: money(summary.value.totalCost), helper: 'Cost base' },
                { id: 'profit', label: 'Gross Profit', value: money(summary.value.totalProfit), helper: 'Revenue less cost' },
                { id: 'margin', label: 'Margin %', value: percent(summary.value.avgMargin), helper: dateRangeLabel },
                { id: 'bookings', label: 'Bookings', value: String(summary.value.totalBookings), helper: `${summary.value.cancelledBookings} cancelled` },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Sales Intelligence"
              title="Booked business overview"
              description="Composed from the booking-summary, supplier-performance, and monthly-trends reports."
              actions={
                <>
                  <Link href="/finance" className="dashboard-toolbar-link">Finance</Link>
                  <Link href="/executive/operations" className="dashboard-toolbar-link">Operations</Link>
                </>
              }
            />

            <form className="reports-filter-bar" action="/executive/sales">
              <label>
                From date
                <input type="date" name="startDate" defaultValue={startDate} />
              </label>
              <label>
                To date
                <input type="date" name="endDate" defaultValue={endDate} />
              </label>
              <button type="submit" className="primary-button">Apply</button>
              {startDate || endDate ? (
                <Link href="/executive/sales" className="secondary-button">Clear</Link>
              ) : null}
            </form>

            {summary.failed || suppliers.failed || months.failed ? (
              <section className="workspace-section">
                <p className="eyebrow">Some data unavailable</p>
                <p className="detail-copy">One or more reports could not be loaded; figures shown may be partial. Try again shortly.</p>
              </section>
            ) : null}

            <TableSectionShell
              title="Monthly trend"
              description={`Revenue, profit, and margin by booking month. ${dateRangeLabel}.`}
              context={<p>{months.value.length} months in scope</p>}
              emptyState={
                months.value.length === 0 ? (
                  <div className="empty-state ui-empty-state">
                    <strong>No booking history yet.</strong>
                    <p>Monthly figures appear once bookings carry sell/cost values in range.</p>
                  </div>
                ) : undefined
              }
            >
              {months.value.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="money-cell">Bookings</th>
                        <th className="money-cell">Revenue</th>
                        <th className="money-cell">Profit</th>
                        <th className="money-cell">Margin</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {months.value.map((m) => (
                        <tr key={m.month}>
                          <td>{formatMonth(m.month)}</td>
                          <td className="money-cell">{m.totalBookings}</td>
                          <td className="money-cell">{money(m.totalSell)}</td>
                          <td className="money-cell">{money(m.totalProfit)}</td>
                          <td className="money-cell">{percent(m.avgMargin)}</td>
                          <td>
                            <span
                              aria-hidden
                              style={{
                                display: 'inline-block',
                                height: '0.6rem',
                                width: `${Math.round((m.totalSell / maxMonthRevenue) * 100)}%`,
                                minWidth: m.totalSell > 0 ? '4px' : '0',
                                background: '#0F766E',
                                borderRadius: 999,
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </TableSectionShell>

            <TableSectionShell
              title="Top suppliers"
              description="Highest revenue suppliers across booked services, with margin."
              context={<p>Top {topSuppliers.length} of {suppliers.value.length}</p>}
              emptyState={
                topSuppliers.length === 0 ? (
                  <div className="empty-state ui-empty-state">
                    <strong>No supplier activity yet.</strong>
                    <p>Supplier rows appear once booked services carry sell/cost values in range.</p>
                  </div>
                ) : undefined
              }
            >
              {topSuppliers.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Supplier</th>
                        <th className="money-cell">Services</th>
                        <th className="money-cell">Revenue</th>
                        <th className="money-cell">Cost</th>
                        <th className="money-cell">Profit</th>
                        <th className="money-cell">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topSuppliers.map((s) => (
                        <tr key={s.supplierId || s.supplierName}>
                          <td>{s.supplierName}</td>
                          <td className="money-cell">{s.serviceCount}</td>
                          <td className="money-cell">{money(s.totalSell)}</td>
                          <td className="money-cell">{money(s.totalCost)}</td>
                          <td className="money-cell">{money(s.totalProfit)}</td>
                          <td className="money-cell">{percent(s.avgMargin)}</td>
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
