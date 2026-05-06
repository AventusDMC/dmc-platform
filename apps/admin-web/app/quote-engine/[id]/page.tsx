import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';
import { QuoteEngineWorkspace } from '../QuoteEngineForms';
import type { DmcQuote } from '../types';

async function fetchQuote(id: string) {
  return adminPageFetchJson<DmcQuote | null>(`/api/quote-engine/quotes/${id}`, 'Quote engine detail', { cache: 'no-store' });
}

export default async function QuoteEngineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let quote: DmcQuote | null = null;
  let loadError = '';

  try {
    quote = await fetchQuote(id);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    loadError = error instanceof Error ? error.message : 'Quote engine detail is unavailable.';
  }

  if (!quote && !loadError) {
    notFound();
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">DMC Quote Engine</p>
          <h1>{quote?.title || 'Quote unavailable'}</h1>
          <p>{quote ? `${quote.clientName} | ${quote.currency} | ${quote.status}` : loadError}</p>
        </div>
        <Link className="secondary-button" href="/quote-engine">Back to engine</Link>
      </div>

      {loadError ? <p className="form-error">{loadError}</p> : null}
      {quote ? <QuoteEngineWorkspace quote={quote} /> : null}
    </main>
  );
}
