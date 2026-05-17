import Link from 'next/link';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';

type AgentMe = {
  id: string;
  name: string;
  email: string;
  role: string;
  company?: {
    id: string;
    name: string;
  } | null;
};

type AgentQuote = {
  id: string;
  title: string;
  status: string;
  totalSell: number;
  quoteCurrency: string;
  publicEnabled: boolean;
  publicUrl: string | null;
};

type AgentBooking = {
  id: string;
  bookingRef: string;
  title: string;
  status: string;
  travelStartDate?: string | null;
};

type AgentInvoice = {
  id: string;
  totalAmount: number;
  currency: string;
  status: string;
  dueDate: string;
};

type AgentProposal = {
  id: string;
  title: string;
  publicUrl: string;
};

type AgentDeparture = {
  id: string;
  seriesName: string;
  departureCode: string | null;
  departureDate: string | null;
  availability: {
    seatsRemaining: number | null;
    stopSale: boolean;
  };
};

export const dynamic = 'force-dynamic';

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'JOD' ? 3 : 2,
  }).format(amount);
}

async function getMe() {
  return adminPageFetchJson<AgentMe>('/api/agent/me', 'Agent profile', { cache: 'no-store' });
}

async function getQuotes() {
  return adminPageFetchJson<AgentQuote[]>('/api/agent/quotes', 'Agent quotes', { cache: 'no-store' });
}

async function getBookings() {
  return adminPageFetchJson<AgentBooking[]>('/api/agent/bookings', 'Agent bookings', { cache: 'no-store' });
}

async function getInvoices() {
  return adminPageFetchJson<AgentInvoice[]>('/api/agent/invoices', 'Agent invoices', { cache: 'no-store' });
}

async function getProposals() {
  return adminPageFetchJson<AgentProposal[]>('/api/agent/proposals', 'Agent proposals', { cache: 'no-store' });
}

async function getDepartures() {
  return adminPageFetchJson<AgentDeparture[]>('/api/agent/departures', 'Agent departures', { cache: 'no-store' });
}

async function safeAgentFetch<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error(`[agent/dashboard] ${label} unavailable`, error);
    return fallback;
  }
}

export default async function AgentDashboardPage() {
  const [me, quotes, bookings, invoices, proposals, departures] = await Promise.all([
    safeAgentFetch<AgentMe | null>('profile', getMe, null),
    safeAgentFetch<AgentQuote[]>('quotes', getQuotes, []),
    safeAgentFetch<AgentBooking[]>('bookings', getBookings, []),
    safeAgentFetch<AgentInvoice[]>('invoices', getInvoices, []),
    safeAgentFetch<AgentProposal[]>('proposals', getProposals, []),
    safeAgentFetch<AgentDeparture[]>('departures', getDepartures, []),
  ]);

  if (!me) {
    return (
      <main className="page">
        <section className="panel workspace-panel">
          <div className="section-stack">
            <div className="workspace-section-head">
              <div>
                <p className="eyebrow">Agent Portal</p>
                <h1>Agent sign in required</h1>
                <p className="detail-copy">Sign in with an active agent account to view assigned quotes, bookings, invoices, vouchers, and departures.</p>
              </div>
            </div>
            <div className="table-action-row">
              <Link href="/login?next=/agent/dashboard" className="secondary-button">Sign in</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const activeQuotes = quotes.filter((quote) => ['DRAFT', 'READY', 'SENT', 'REVISION_REQUESTED'].includes(quote.status)).length;
  const confirmedBookings = bookings.filter((booking) => ['confirmed', 'in_progress'].includes(booking.status)).length;
  const unpaidInvoices = invoices.filter((invoice) => invoice.status === 'ISSUED').length;
  const pendingBalances = invoices.filter((invoice: any) => Number(invoice.balanceDue ?? invoice.totalAmount ?? 0) > 0).length;
  const travelAlerts = departures.filter((departure) => departure.availability?.stopSale || departure.availability?.seatsRemaining === 0).length;
  const voucherReadyBookings = bookings.filter((booking: any) => booking.voucherReadiness === 'ready' || booking.voucherReadiness === 'sent').length;

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="section-stack">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Agent Portal</p>
              <h1>{me.company?.name || me.name}</h1>
              <p className="detail-copy">Read-only access for assigned quotes, bookings, invoices, vouchers, departures, payment status, and controlled amendment requests.</p>
            </div>
          </div>

          <section className="quote-client-summary-strip" aria-label="Agent summary">
            <article className="quote-client-summary-card">
              <span>Active quotes</span>
              <strong>{activeQuotes}</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Confirmed bookings</span>
              <strong>{confirmedBookings}</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Unpaid invoices</span>
              <strong>{unpaidInvoices}</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Pending balances</span>
              <strong>{pendingBalances}</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Travel alerts</span>
              <strong>{travelAlerts}</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Voucher readiness</span>
              <strong>{voucherReadyBookings}</strong>
            </article>
          </section>

          <section className="quote-preview-grid">
            <article className="detail-card">
              <p className="eyebrow">Quick Links</p>
              <h2>Workspace</h2>
              <div className="table-action-row">
                <Link href="/agent/quotes" className="secondary-button">Quotes</Link>
                <Link href="/agent/bookings" className="secondary-button">Bookings</Link>
                <Link href="/agent/invoices" className="secondary-button">Invoices</Link>
                <Link href="/agent/departures" className="secondary-button">Departures</Link>
              </div>
            </article>

            <article className="detail-card">
              <p className="eyebrow">Recent proposals</p>
              <h2>Shared links</h2>
              <div className="entity-list">
                {proposals.length === 0 ? <p className="empty-state">No public proposal links yet.</p> : proposals.slice(0, 5).map((proposal) => (
                  <div key={proposal.id} className="table-action-row" style={{ justifyContent: 'space-between' }}>
                    <span>{proposal.title}</span>
                    <a href={proposal.publicUrl} className="compact-button" target="_blank" rel="noreferrer">Open</a>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="detail-card">
            <p className="eyebrow">Regular Tours</p>
            <h2>Upcoming departures</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Departure</th>
                    <th>Date</th>
                    <th>Availability</th>
                    <th>Stop sale</th>
                  </tr>
                </thead>
                <tbody>
                  {departures.slice(0, 5).map((departure) => (
                    <tr key={departure.id}>
                      <td>{departure.departureCode || departure.seriesName}</td>
                      <td>{departure.departureDate ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(departure.departureDate)) : 'Date pending'}</td>
                      <td>{departure.availability?.seatsRemaining === null || departure.availability?.seatsRemaining === undefined ? 'On request' : `${departure.availability.seatsRemaining} seats remaining`}</td>
                      <td><span className="status-badge">{departure.availability?.stopSale ? 'Stop sale' : 'Open'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="detail-card">
            <p className="eyebrow">Quotes</p>
            <h2>Latest assigned quotes</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Quote</th>
                    <th>Status</th>
                    <th>Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.slice(0, 5).map((quote) => (
                    <tr key={quote.id}>
                      <td>{quote.title}</td>
                      <td><span className="status-badge">{quote.status}</span></td>
                      <td>{formatMoney(quote.totalSell, quote.quoteCurrency)}</td>
                      <td>
                        <div className="table-action-row">
                          <Link href={`/agent/quotes/${quote.id}`} className="compact-button">Open</Link>
                          {quote.publicEnabled && quote.publicUrl ? <a href={quote.publicUrl} className="compact-button" target="_blank" rel="noreferrer">Proposal</a> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
