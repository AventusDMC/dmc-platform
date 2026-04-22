import { notFound } from 'next/navigation';
import { adminPageFetchJson } from '../../lib/admin-server';
import {
  QuoteClientItineraryView,
  type ClientQuoteItineraryResponse,
  type ClientQuoteSummary,
} from '../../quotes/[id]/view/QuoteClientItineraryView';
import { PublicQuoteInteractionPanel } from './PublicQuoteInteractionPanel';

const API_BASE_URL = '/api';

type PublicQuoteViewPageProps = {
  params: Promise<{
    token: string;
  }>;
};

type PublicQuoteViewResponse = {
  quote: ClientQuoteSummary;
  itinerary: ClientQuoteItineraryResponse;
};

async function getPublicQuoteView(token: string): Promise<PublicQuoteViewResponse | null> {
  return adminPageFetchJson<PublicQuoteViewResponse | null>(`${API_BASE_URL}/quotes/public/${token}/view`, 'Public quote view', {
    cache: 'no-store',
    allowAnonymous: true,
    allow404: true,
  });
}

export default async function PublicQuoteViewPage({ params }: PublicQuoteViewPageProps) {
  const { token } = await params;
  const quoteView = await getPublicQuoteView(token);

  if (!quoteView) {
    notFound();
  }

  return (
    <QuoteClientItineraryView
      quote={quoteView.quote}
      itinerary={quoteView.itinerary}
      interactionPanel={
        <PublicQuoteInteractionPanel
          apiBaseUrl={API_BASE_URL}
          token={token}
          initialStatus={quoteView.quote.status || 'DRAFT'}
          initialInvoice={quoteView.quote.invoice || null}
        />
      }
    />
  );
}
