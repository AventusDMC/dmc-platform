import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../../bookings/actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; templateId: string }> },
) {
  const { id, templateId } = await context.params;
  const body = await request.json().catch(() => ({}));
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/quotes/${encodeURIComponent(id)}/excursion-templates/${encodeURIComponent(templateId)}/expand`, {
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
    return proxyFetchErrorResponse(error, 'Could not reach API server while adding excursion template to quote.');
  }

  return forwardProxyJsonResponse(response);
}
