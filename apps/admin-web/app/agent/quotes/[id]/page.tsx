import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson } from '../../../lib/admin-server';

type AgentQuoteDetail = {
  id: string;
  quoteNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  quoteCurrency: string;
  totalSell: number;
  pricePerPax: number;
  publicUrl: string | null;
  itinerary: Array<{
    id: string;
    dayNumber: number;
    title: string;
    description: string | null;
    services: Array<{
      id: string;
      title: string;
      category: string;
      serviceDate: string | null;
      startTime: string | null;
    }>;
  }>;
};

type AgentQuotePageProps = {
  params: Promise<{ id: string }>;
};

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

async function getQuote(id: string) {
  return adminPageFetchJson<AgentQuoteDetail | null>(`/api/agent/quotes/${id}`, 'Agent quote detail', {
    cache: 'no-store',
    allow404: true,
  });
}

export default async function AgentQuoteDetailPage({ params }: AgentQuotePageProps) {
  const { id } = await params;
  const quote = await getQuote(id);

  if (!quote) {
    notFound();
  }

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="section-stack">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Agent Quote</p>
              <h1>{quote.title}</h1>
              {quote.description ? <p className="detail-copy">{quote.description}</p> : null}
            </div>
            <div className="table-action-row">
              <Link href="/agent/quotes" className="secondary-button">Back to quotes</Link>
              {quote.publicUrl ? <a href={quote.publicUrl} className="primary-button" target="_blank" rel="noreferrer">Open Proposal</a> : null}
            </div>
          </div>

          <section className="quote-client-summary-strip">
            <article className="quote-client-summary-card">
              <span>Status</span>
              <strong>{quote.status}</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Total package price</span>
              <strong>{formatMoney(quote.totalSell, quote.quoteCurrency)}</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Price per person</span>
              <strong>{formatMoney(quote.pricePerPax, quote.quoteCurrency)}</strong>
            </article>
          </section>

          <article className="detail-card">
            <p className="eyebrow">Itinerary</p>
            <h2>Day-by-day outline</h2>
            <div className="entity-list">
              {quote.itinerary.map((day) => (
                <section key={day.id} className="detail-card">
                  <p className="eyebrow">Day {day.dayNumber}</p>
                  <h3>{day.title}</h3>
                  {day.description ? <p className="detail-copy">{day.description}</p> : null}
                  <div className="entity-list">
                    {day.services.map((service) => (
                      <div key={service.id} className="table-action-row" style={{ justifyContent: 'space-between' }}>
                        <span>{service.title}</span>
                        <span className="detail-copy">{service.category}{service.startTime ? ` · ${service.startTime}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
