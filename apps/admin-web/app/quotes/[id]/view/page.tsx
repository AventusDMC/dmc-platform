import { notFound } from 'next/navigation';
import { adminPageFetchJson } from '../../../lib/admin-server';
import {
  QuoteClientItineraryView,
  type ClientQuoteItineraryResponse,
  type ClientQuoteSummary,
} from './QuoteClientItineraryView';

const DATA_API_BASE_URL = '/api';

type QuoteItineraryViewPageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function getQuote(id: string): Promise<ClientQuoteSummary | null> {
  return adminPageFetchJson<ClientQuoteSummary | null>(`${DATA_API_BASE_URL}/quotes/${id}`, 'Quote itinerary view quote', {
    cache: 'no-store',
    allow404: true,
  });
}

async function getQuoteItinerary(id: string): Promise<ClientQuoteItineraryResponse> {
  return adminPageFetchJson<ClientQuoteItineraryResponse>(`${DATA_API_BASE_URL}/quotes/${id}/itinerary`, 'Quote itinerary view itinerary', {
    cache: 'no-store',
  });
}

export default async function QuoteItineraryViewPage({ params }: QuoteItineraryViewPageProps) {
  const { id } = await params;
  const [quote, itinerary] = await Promise.all([getQuote(id), getQuoteItinerary(id)]);

  if (!quote) {
    notFound();
  }

  return <QuoteClientItineraryView quote={quote} itinerary={itinerary} />;
}
