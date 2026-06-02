import Link from 'next/link';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';

export const dynamic = 'force-dynamic';

type AgentAnalytics = {
  quoteCount: number;
  bookingCount: number;
  cancelledBookings: number;
  conversionRate: number;
  totalBookingValue: number;
  avgBookingValue: number;
  commissionPercent: number | null;
  totalCommission: number | null;
  bookingsByStatus: Array<{ status: string; count: number }>;
  monthlyTrend: Array<{ month: string; bookingCount: number; bookingValue: number }>;
};

const EMPTY: AgentAnalytics = {
  quoteCount: 0,
  bookingCount: 0,
  cancelledBookings: 0,
  conversionRate: 0,
  totalBookingValue: 0,
  avgBookingValue: 0,
  commissionPercent: null,
  totalCommission: null,
  bookingsByStatus: [],
  monthlyTrend: [],
};

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(
    Number.isFinite(Number(value)) ? Number(value) : 0,
  );
}

function formatMonth(month: string) {
  const [year, m] = month.split('-').map(Number);
  if (!year || !m) return month;
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(Date.UTC(year, m - 1, 1)));
}

async function getAnalytics(): Promise<AgentAnalytics> {
  return adminPageFetchJson<AgentAnalytics>('/api/agent/analytics', 'Agent analytics', { cache: 'no-store' });
}

export default async function AgentAnalyticsPage() {
  let analytics = EMPTY;
  let loadError = false;
  try {
    analytics = await getAnalytics();
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error('[agent/analytics] analytics unavailable', error);
    loadError = true;
  }

  const maxTrendValue = Math.max(1, ...analytics.monthlyTrend.map((row) => row.bookingValue));

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="section-stack">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Agent Portal</p>
              <h1>Performance Analytics</h1>
              <p className="detail-copy">Your quote-to-booking conversion, booking value, commission earned, and recent trend.</p>
            </div>
            <Link href="/agent/dashboard" className="secondary-button">Back to dashboard</Link>
          </div>

          {loadError ? (
            <section className="detail-card">
              <p className="eyebrow">Analytics unavailable</p>
              <h2>Could not load analytics right now.</h2>
              <p className="detail-copy">The page is available — try again shortly.</p>
            </section>
          ) : null}

          <section className="quote-client-summary-strip" aria-label="Agent performance summary">
            <article className="quote-client-summary-card">
              <span>Quotes</span>
              <strong>{analytics.quoteCount}</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Bookings</span>
              <strong>{analytics.bookingCount}</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Conversion</span>
              <strong>{analytics.conversionRate}%</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Booking value</span>
              <strong>{formatMoney(analytics.totalBookingValue)}</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Avg booking</span>
              <strong>{formatMoney(analytics.avgBookingValue)}</strong>
            </article>
            {analytics.totalCommission !== null ? (
              <article className="quote-client-summary-card">
                <span>Commission{analytics.commissionPercent !== null ? ` (${analytics.commissionPercent}%)` : ''}</span>
                <strong>{formatMoney(analytics.totalCommission)}</strong>
              </article>
            ) : null}
            <article className="quote-client-summary-card">
              <span>Cancelled</span>
              <strong>{analytics.cancelledBookings}</strong>
            </article>
          </section>

          <section className="quote-preview-grid">
            <article className="detail-card">
              <p className="eyebrow">Bookings by status</p>
              <h2>Status mix</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th className="money-cell">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.bookingsByStatus.length === 0 ? (
                      <tr>
                        <td colSpan={2}>No bookings yet.</td>
                      </tr>
                    ) : (
                      analytics.bookingsByStatus.map((row) => (
                        <tr key={row.status}>
                          <td><span className="status-badge">{row.status}</span></td>
                          <td className="money-cell">{row.count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="detail-card">
              <p className="eyebrow">Last 6 months</p>
              <h2>Booking trend</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="money-cell">Bookings</th>
                      <th className="money-cell">Value</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.monthlyTrend.length === 0 ? (
                      <tr>
                        <td colSpan={4}>No booking history yet.</td>
                      </tr>
                    ) : (
                      analytics.monthlyTrend.map((row) => (
                        <tr key={row.month}>
                          <td>{formatMonth(row.month)}</td>
                          <td className="money-cell">{row.bookingCount}</td>
                          <td className="money-cell">{formatMoney(row.bookingValue)}</td>
                          <td>
                            <span
                              aria-hidden
                              style={{
                                display: 'inline-block',
                                height: '0.6rem',
                                width: `${Math.round((row.bookingValue / maxTrendValue) * 100)}%`,
                                minWidth: row.bookingValue > 0 ? '4px' : '0',
                                background: '#0F766E',
                                borderRadius: 999,
                              }}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}
