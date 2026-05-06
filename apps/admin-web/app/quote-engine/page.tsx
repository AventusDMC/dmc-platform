import Link from 'next/link';
import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { NewQuoteForm } from './QuoteEngineForms';
import type { DmcQuote } from './types';

async function fetchQuotes() {
  return adminPageFetchJson<DmcQuote[]>('/api/quote-engine/quotes', 'Quote engine quotes', { cache: 'no-store' });
}

export default async function QuoteEnginePage() {
  let quotes: DmcQuote[] = [];
  let loadError = '';

  try {
    quotes = await fetchQuotes();
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    loadError = error instanceof Error ? error.message : 'Quote engine quotes are unavailable.';
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Sales</p>
          <h1>DMC Quote Engine</h1>
          <p>Phase 1 multi-country quotes with ordered internal and external package segments.</p>
        </div>
      </div>

      <NewQuoteForm />

      <section className="dashboard-section-card">
        <div className="section-header">
          <div>
            <h2>Quotes</h2>
            <p>Manual matrix pricing and segment structure only.</p>
          </div>
          <span className="status-badge">{quotes.length} quote{quotes.length === 1 ? '' : 's'}</span>
        </div>
        {loadError ? <p className="form-error">{loadError}</p> : null}
        {quotes.length === 0 ? (
          <p className="empty-state">No quote engine records yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quote</th>
                  <th>Client</th>
                  <th>Dates</th>
                  <th>Currency</th>
                  <th>Status</th>
                  <th>Segments</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id}>
                    <td>{quote.title}</td>
                    <td>{quote.clientName}</td>
                    <td>{quote.startDate.slice(0, 10)} - {quote.endDate.slice(0, 10)}</td>
                    <td>{quote.currency}</td>
                    <td><span className="status-badge">{quote.status}</span></td>
                    <td>{quote.segments?.length || 0}</td>
                    <td><Link className="compact-button" href={`/quote-engine/${quote.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
