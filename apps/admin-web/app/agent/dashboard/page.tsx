import Link from 'next/link';
import { adminPageFetchJson } from '../../lib/admin-server';

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

export default async function AgentDashboardPage() {
  const [me, quotes, bookings, invoices, proposals] = await Promise.all([getMe(), getQuotes(), getBookings(), getInvoices(), getProposals()]);
  const activeQuotes = quotes.filter((quote) => ['DRAFT', 'READY', 'SENT', 'REVISION_REQUESTED'].includes(quote.status)).length;
  const confirmedBookings = bookings.filter((booking) => ['confirmed', 'in_progress'].includes(booking.status)).length;
  const unpaidInvoices = invoices.filter((invoice) => invoice.status === 'ISSUED').length;

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="section-stack">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Agent Portal</p>
              <h1>{me.company?.name || me.name}</h1>
              <p className="detail-copy">View assigned quotes, active bookings, open invoices, and public proposal links without the internal admin tooling.</p>
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
              <span>Recent proposals</span>
              <strong>{proposals.length}</strong>
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
