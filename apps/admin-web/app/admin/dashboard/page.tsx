import Link from 'next/link';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { AdminHeaderActions } from '../../components/AdminHeaderActions';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';
import { calculatePercentChange, formatPercentChange } from './dashboard-metrics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type BookingSummary = {
  totalBookings: number;
  totalSell: number;
  totalCost: number;
  totalProfit: number;
  avgMargin: number;
  cancelledBookings?: number;
};

type FinanceSummary = {
  outstandingReceivables: number;
  overdueReceivables: number;
};

type AlertsSummary = {
  overdueReceivables: unknown[];
  lowMarginBookings: unknown[];
  highCostServices: unknown[];
  unpaidSupplierPayables: unknown[];
};

type MonthlyTrends = {
  months: Array<{
    month: string;
    totalBookings: number;
    totalSell: number;
    totalProfit: number;
    avgMargin: number;
  }>;
};

type BookingListItem = {
  id: string;
  bookingRef: string;
  status: string;
  startDate?: string | null;
  snapshotJson?: {
    title?: string | null;
  } | null;
  clientSnapshotJson?: {
    name?: string | null;
  } | null;
  pricingSnapshotJson?: {
    totalSell?: number | null;
  } | null;
  services?: Array<{
    status?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
  }>;
};

const EMPTY_BOOKING_SUMMARY: BookingSummary = {
  totalBookings: 0,
  totalSell: 0,
  totalCost: 0,
  totalProfit: 0,
  avgMargin: 0,
  cancelledBookings: 0,
};

const EMPTY_FINANCE_SUMMARY: FinanceSummary = {
  outstandingReceivables: 0,
  overdueReceivables: 0,
};

const EMPTY_ALERTS: AlertsSummary = {
  overdueReceivables: [],
  lowMarginBookings: [],
  highCostServices: [],
  unpaidSupplierPayables: [],
};

const EMPTY_MONTHLY_TRENDS: MonthlyTrends = {
  months: [],
};

async function safeDashboardFetchJson<T>(
  input: string,
  label: string,
  fallback: T,
  normalize: (value: T) => T,
) {
  try {
    const value = await adminPageFetchJson<T>(input, label, { cache: 'no-store' });
    return normalize(value);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error(`[dashboard] ${label} unavailable`, error);
    return fallback;
  }
}

async function getBookingSummary() {
  return safeDashboardFetchJson(
    '/api/reports/booking-summary',
    'Dashboard booking summary',
    EMPTY_BOOKING_SUMMARY,
    normalizeBookingSummary,
  );
}

async function getFinanceSummary() {
  return safeDashboardFetchJson(
    '/api/reports/finance-summary',
    'Dashboard finance summary',
    EMPTY_FINANCE_SUMMARY,
    normalizeFinanceSummary,
  );
}

async function getAlerts() {
  return safeDashboardFetchJson('/api/reports/alerts', 'Dashboard alerts', EMPTY_ALERTS, normalizeAlerts);
}

async function getMonthlyTrends() {
  const endDate = new Date();
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - 5, 1));
  const params = new URLSearchParams({
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  });

  return safeDashboardFetchJson(
    `/api/reports/monthly-trends?${params.toString()}`,
    'Dashboard monthly trends',
    EMPTY_MONTHLY_TRENDS,
    normalizeMonthlyTrends,
  );
}

async function getBookings() {
  return safeDashboardFetchJson('/api/bookings', 'Dashboard operational snapshot', [], normalizeBookings);
}

export default async function AdminDashboardPage() {
  const [bookingSummary, financeSummary, alerts, monthlyTrends, bookings] = await Promise.all([
    getBookingSummary(),
    getFinanceSummary(),
    getAlerts(),
    getMonthlyTrends(),
    getBookings(),
  ]);
  const recentMonths = monthlyTrends.months.slice(-6);
  const thisMonthKey = getMonthKey(new Date());
  const lastMonthKey = getMonthKey(addMonths(new Date(), -1));
  const thisMonth = recentMonths.find((month) => month.month === thisMonthKey) || {
    month: thisMonthKey,
    totalBookings: 0,
    totalSell: 0,
    totalProfit: 0,
    avgMargin: 0,
  };
  const lastMonth = recentMonths.find((month) => month.month === lastMonthKey) || {
    month: lastMonthKey,
    totalBookings: 0,
    totalSell: 0,
    totalProfit: 0,
    avgMargin: 0,
  };
  const topAgent = getTopAgentThisMonth(bookings, thisMonthKey);
  const maxRevenue = Math.max(...recentMonths.map((month) => month.totalSell), 0);
  const operationalSnapshot = buildOperationalSnapshot(bookings);
  const hasNoActivity = bookingSummary.totalBookings === 0 && recentMonths.length === 0 && operationalSnapshot.upcoming.length === 0;

  return (
    <main className="page admin-dashboard-shell">
      <section className="panel reports-dashboard admin-dashboard-page">
        <AdminBreadcrumbs
          items={[
            { label: 'Dashboard', href: '/admin/dashboard' },
          ]}
        />

        <div className="page-header">
          <div>
            <p className="eyebrow">Internal/Admin only</p>
            <h1>Admin Dashboard</h1>
            <p className="detail-copy">Business performance, finance risk, and operations signals for the DMC team.</p>
          </div>
          <AdminHeaderActions className="admin-dashboard-launchpad-actions">
            <Link href="/quotes/new" className="primary-button">
              New Quote
            </Link>
            <Link href="/quotes" className="primary-button">
              Quotes
            </Link>
            <Link href="/bookings" className="primary-button">
              Bookings
            </Link>
            <Link href="/finance" className="primary-button">
              Finance
            </Link>
            <Link href="/admin/reports" className="primary-button">
              Reports
            </Link>
          </AdminHeaderActions>
        </div>

        <section className="dashboard-grid" aria-label="Dashboard KPI cards">
          <DashboardMetric label="Total Revenue" value={formatMoney(bookingSummary.totalSell)} helper="Latest non-cancelled bookings" />
          <DashboardMetric label="Total Profit" value={formatMoney(bookingSummary.totalProfit)} helper="Revenue minus internal cost" />
          <DashboardMetric label="Outstanding Receivables" value={formatMoney(financeSummary.outstandingReceivables)} helper="Client balances due" />
          <DashboardMetric label="Overdue Receivables" value={formatMoney(financeSummary.overdueReceivables)} helper="Past due client balances" />
          <DashboardMetric label="Total Bookings" value={formatNumber(bookingSummary.totalBookings)} helper="Current latest amendments" />
          <DashboardMetric label="Avg Margin" value={formatPercent(bookingSummary.avgMargin)} helper="Total profit / revenue" />
        </section>

        <section className="workspace-section admin-dashboard-selling-section">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">This Month</p>
              <h2>Sales performance at a glance</h2>
              <p className="detail-copy">Month-over-month movement is based on the monthly trends report.</p>
            </div>
          </div>
          <div className="dashboard-grid" aria-label="This Month KPI section">
            <TrendMetric
              label="Revenue"
              value={formatMoney(thisMonth.totalSell)}
              change={calculatePercentChange(thisMonth.totalSell, lastMonth.totalSell)}
            />
            <TrendMetric
              label="Profit"
              value={formatMoney(thisMonth.totalProfit)}
              change={calculatePercentChange(thisMonth.totalProfit, lastMonth.totalProfit)}
            />
            <TrendMetric
              label="Bookings"
              value={formatNumber(thisMonth.totalBookings)}
              change={calculatePercentChange(thisMonth.totalBookings, lastMonth.totalBookings)}
            />
            <TrendMetric
              label="Avg Margin"
              value={formatPercent(thisMonth.avgMargin)}
              change={calculatePercentChange(thisMonth.avgMargin, lastMonth.avgMargin)}
            />
          </div>
        </section>

        <section className="reports-list-grid">
          <section className="workspace-section admin-dashboard-top-agent">
            <div className="workspace-section-head">
              <div>
                <p className="eyebrow">Top Agent This Month</p>
                <h2>{topAgent.name}</h2>
              </div>
              <span className="admin-dashboard-agent-revenue">{formatMoney(topAgent.revenue)}</span>
            </div>
            <p className="detail-copy">Revenue is estimated from current-month booking sell totals already available to the admin dashboard.</p>
          </section>

          <section className="workspace-section admin-dashboard-attention">
            <div className="workspace-section-head">
              <div>
                <p className="eyebrow">Attention Needed</p>
                <h2>Commercial risk signals</h2>
              </div>
              <Link href="/admin/reports" className="secondary-button">
                View reports
              </Link>
            </div>
            <div className="dashboard-alert-preview">
              <AlertPreview label="Overdue Receivables" value={alerts.overdueReceivables.length} />
              <AlertPreview label="Low Margin Bookings" value={alerts.lowMarginBookings.length} />
              <AlertPreview label="High Cost Services" value={alerts.highCostServices.length} />
            </div>
          </section>
        </section>

        {hasNoActivity ? (
          <section className="workspace-section">
            <p className="eyebrow">Empty state</p>
            <h2>No dashboard activity yet.</h2>
            <p className="detail-copy">Create quotes and bookings to populate revenue, trend, alert, and operations signals.</p>
          </section>
        ) : null}

        <section className="reports-list-grid">
          <section className="workspace-section">
            <div className="workspace-section-head">
              <div>
                <p className="eyebrow">Alerts preview</p>
                <h2>Controls that need attention</h2>
              </div>
              <Link href="/admin/reports" className="secondary-button">
                View reports
              </Link>
            </div>
            <div className="dashboard-alert-preview">
              <AlertPreview label="Overdue Receivables" value={alerts.overdueReceivables.length} />
              <AlertPreview label="Low Margin Bookings" value={alerts.lowMarginBookings.length} />
              <AlertPreview label="High Cost Services" value={alerts.highCostServices.length} />
              <AlertPreview label="Unpaid Supplier Payables" value={alerts.unpaidSupplierPayables.length} />
            </div>
          </section>

          <section className="workspace-section">
            <div className="workspace-section-head">
              <div>
                <p className="eyebrow">Quick actions</p>
                <h2>Start common workflows</h2>
              </div>
            </div>
            <div className="dashboard-quick-links">
              <Link href="/quotes/new" className="dashboard-quick-link primary-button">New Quote</Link>
              <Link href="/quotes" className="dashboard-quick-link primary-button">Quotes</Link>
              <Link href="/bookings" className="dashboard-quick-link primary-button">Bookings</Link>
              <Link href="/finance" className="dashboard-quick-link primary-button">Finance</Link>
              <Link href="/admin/reports" className="dashboard-quick-link primary-button">Reports</Link>
            </div>
          </section>
        </section>

        <section className="workspace-section">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Monthly mini trend</p>
              <h2>Last 6 months revenue and profit</h2>
            </div>
          </div>
          {recentMonths.length > 0 ? (
            <div className="table-wrap">
              <table className="reports-visual-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Revenue</th>
                    <th>Profit</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMonths.map((month) => (
                    <tr key={month.month}>
                      <td>
                        <strong>{month.month}</strong>
                        <div className="table-subcopy">{formatNumber(month.totalBookings)} bookings</div>
                      </td>
                      <td>
                        <div className="reports-bar-cell">
                          <span>{formatMoney(month.totalSell)}</span>
                          <div className="reports-mini-bar" aria-hidden="true">
                            <span style={{ width: `${getBarWidth(month.totalSell, maxRevenue)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td>{formatMoney(month.totalProfit)}</td>
                      <td>{formatPercent(month.avgMargin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="detail-copy">No monthly trend data yet.</p>
          )}
        </section>

        <section className="reports-list-grid">
          <section className="workspace-section">
            <div className="workspace-section-head">
              <div>
                <p className="eyebrow">Operational snapshot</p>
                <h2>Bookings in motion</h2>
              </div>
            </div>
            <div className="dashboard-alert-preview">
              <AlertPreview label="Upcoming Bookings" value={operationalSnapshot.upcoming.length} />
              <AlertPreview label="Bookings In Progress" value={operationalSnapshot.inProgressCount} />
              <AlertPreview label="Pending Operations Assignments" value={operationalSnapshot.pendingAssignmentsCount} />
            </div>
          </section>

          <section className="workspace-section">
            <div className="workspace-section-head">
              <div>
                <p className="eyebrow">Upcoming bookings</p>
                <h2>Next departures</h2>
              </div>
            </div>
            {operationalSnapshot.upcoming.length > 0 ? (
              <div className="reports-alert-list">
                {operationalSnapshot.upcoming.map((booking) => (
                  <Link key={booking.id} href={`/bookings/${booking.id}`} className="reports-alert-row">
                    <strong>{booking.bookingRef}</strong>
                    <span>{booking.clientName} | {booking.title} | {formatDate(booking.startDate)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="detail-copy">No upcoming bookings available.</p>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeBookingSummary(value: BookingSummary) {
  const row = asRecord(value);

  return {
    totalBookings: asNumber(row.totalBookings),
    totalSell: asNumber(row.totalSell),
    totalCost: asNumber(row.totalCost),
    totalProfit: asNumber(row.totalProfit),
    avgMargin: asNumber(row.avgMargin),
    cancelledBookings: asNumber(row.cancelledBookings),
  };
}

function normalizeFinanceSummary(value: FinanceSummary) {
  const row = asRecord(value);

  return {
    outstandingReceivables: asNumber(row.outstandingReceivables),
    overdueReceivables: asNumber(row.overdueReceivables),
  };
}

function normalizeAlerts(value: AlertsSummary) {
  const row = asRecord(value);

  return {
    overdueReceivables: asArray(row.overdueReceivables),
    lowMarginBookings: asArray(row.lowMarginBookings),
    highCostServices: asArray(row.highCostServices),
    unpaidSupplierPayables: asArray(row.unpaidSupplierPayables),
  };
}

function normalizeMonthlyTrends(value: MonthlyTrends) {
  const row = asRecord(value);

  return {
    months: asArray<Record<string, unknown>>(row.months).map((month) => ({
      month: String(month.month || ''),
      totalBookings: asNumber(month.totalBookings),
      totalSell: asNumber(month.totalSell),
      totalProfit: asNumber(month.totalProfit),
      avgMargin: asNumber(month.avgMargin),
    })).filter((month) => month.month),
  };
}

function normalizeBookings(value: BookingListItem[]) {
  return asArray<BookingListItem>(value);
}

function DashboardMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <article className="dashboard-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}

function TrendMetric({ label, value, change }: { label: string; value: string; change: number }) {
  const toneClass = change >= 0 ? 'admin-dashboard-trend-positive' : 'admin-dashboard-trend-negative';

  return (
    <article className="dashboard-card admin-dashboard-trend-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p className={toneClass}>{formatPercentChange(change)} vs previous month</p>
    </article>
  );
}

function AlertPreview({ label, value }: { label: string; value: number }) {
  return (
    <div className="dashboard-card">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
      <p>{value > 0 ? 'Needs review' : 'Clear'}</p>
    </div>
  );
}

function buildOperationalSnapshot(bookings: BookingListItem[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = bookings
    .filter((booking) => booking.startDate && new Date(booking.startDate).getTime() >= today.getTime())
    .sort((left, right) => new Date(left.startDate || 0).getTime() - new Date(right.startDate || 0).getTime())
    .slice(0, 5)
    .map((booking) => ({
      id: booking.id,
      bookingRef: booking.bookingRef || booking.id,
      startDate: booking.startDate || null,
      title: booking.snapshotJson?.title || 'Booking',
      clientName: booking.clientSnapshotJson?.name || 'Client pending',
    }));

  return {
    upcoming,
    inProgressCount: bookings.filter((booking) => String(booking.status).toLowerCase() === 'in_progress').length,
    pendingAssignmentsCount: bookings.reduce((total, booking) => {
      const pendingServices = (booking.services || []).filter((service) => {
        const status = String(service.status || '').toLowerCase();
        return status !== 'cancelled' && !service.supplierId && !service.supplierName;
      });
      return total + pendingServices.length;
    }, 0),
  };
}

function getTopAgentThisMonth(bookings: BookingListItem[], monthKey: string) {
  const rowsByAgent = new Map<string, { name: string; revenue: number }>();

  for (const booking of bookings) {
    if (!booking.startDate || getMonthKey(new Date(booking.startDate)) !== monthKey) {
      continue;
    }

    const name = booking.clientSnapshotJson?.name || 'Agent unavailable';
    const row = rowsByAgent.get(name) || { name, revenue: 0 };
    row.revenue += Number(booking.pricingSnapshotJson?.totalSell || 0);
    rowsByAgent.set(name, row);
  }

  return [...rowsByAgent.values()].sort((left, right) => right.revenue - left.revenue)[0] || { name: 'No agent activity yet', revenue: 0 };
}

function addMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function getMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getBarWidth(value: number, maxValue: number) {
  if (!maxValue || value <= 0) {
    return 0;
  }

  return Math.max(8, Math.round((value / maxValue) * 100));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value || 0)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'Date pending';
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}
