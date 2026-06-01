import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// GET proxy for the quote's items. Without this, GET /api/quotes/:id/items
// returned 405, so the auto-builder's getExistingQuoteItems silently received
// [] and re-generate could never dedupe — it piled up duplicate transport /
// hotel rows on every run.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/quotes/${id}/items`, {
      method: 'GET',
      headers: {
        ...buildActorHeaders(request),
      },
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch (error) {
    return proxyFetchErrorResponse(error, 'Could not reach API server while loading quote items.');
  }

  return forwardProxyJsonResponse(response);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/quotes/${id}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildActorHeaders(request),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch (error) {
    return proxyFetchErrorResponse(error, 'Could not reach API server while saving quote item.');
  }

  return forwardProxyJsonResponse(response);
}
