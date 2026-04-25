import Link from 'next/link';
import { adminPageFetchJson } from '../../lib/admin-server';

type AgentQuote = {
  id: string;
  quoteNumber: string | null;
  title: string;
  status: string;
  quoteCurrency: string;
  totalSell: number;
  travelStartDate: string | null;
  publicEnabled: boolean;
  publicUrl: string | null;
};

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value)) : 'To be confirmed';
}

async function getQuotes() {
  return adminPageFetchJson<AgentQuote[]>('/api/agent/quotes', 'Agent quotes', { cache: 'no-store' });
}

export default async function AgentQuotesPage() {
  const quotes = await getQuotes();

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="section-stack">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Agent Portal</p>
              <h1>Quotes</h1>
              <p className="detail-copy">Client-safe quote access with no supplier costs, margins, internal notes, or audit history.</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quote</th>
                  <th>Travel Date</th>
                  <th>Status</th>
                  <th>Value</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      <strong>{quote.title}</strong>
                      <div className="table-subcopy">{quote.quoteNumber || quote.id}</div>
                    </td>
                    <td>{formatDate(quote.travelStartDate)}</td>
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
        </div>
      </section>
    </main>
  );
}
