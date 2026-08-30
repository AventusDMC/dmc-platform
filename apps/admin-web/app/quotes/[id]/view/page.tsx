import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { adminPageFetchJson } from '../../../lib/admin-server';
import { readSessionActor, type SessionRole } from '../../../lib/auth-session';
import { quoteDetailPath, quoteItineraryPath } from '../../../../lib/quote-operational-routing';
import {
  QuoteClientItineraryView,
  type ClientQuoteItineraryResponse,
  type ClientQuoteSummary,
} from './QuoteClientItineraryView';

type QuoteItineraryViewPageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function getQuote(id: string, role: SessionRole | null): Promise<ClientQuoteSummary | null> {
  // CP-N3b2b: main detail routed by the cost axis (cost-visible → raw, else
  // operational). No raw fallback on failure.
  return adminPageFetchJson<ClientQuoteSummary | null>(quoteDetailPath(id, role), 'Quote itinerary view quote', {
    cache: 'no-store',
    allow404: true,
  });
}

async function getQuoteItinerary(id: string, role: SessionRole | null): Promise<ClientQuoteItineraryResponse> {
  // CP-N3b2b: itinerary routed by the cost axis (operational drops provenance).
  return adminPageFetchJson<ClientQuoteItineraryResponse>(quoteItineraryPath(id, role), 'Quote itinerary view itinerary', {
    cache: 'no-store',
  });
}

export default async function QuoteItineraryViewPage({ params }: QuoteItineraryViewPageProps) {
  const { id } = await params;
  const sessionToken = (await cookies()).get('dmc_session')?.value || '';
  const role = readSessionActor(sessionToken)?.role ?? null;
  const [quote, itinerary] = await Promise.all([getQuote(id, role), getQuoteItinerary(id, role)]);

  if (!quote) {
    notFound();
  }

  return <QuoteClientItineraryView quote={quote} itinerary={itinerary} />;
}
