import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../actorHeaders';
import { forwardProxyJsonResponse } from '../../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// Phase O.2B-2C — gated supplier-confirmation send proxy. POST forwards the scope
// body ({ supplierId, serviceId? }) — never a recipient email. The backend resolves
// the recipient + content and mutates status/audit only on a successful send.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.text();
  const response = await fetch(`${API_BASE_URL}/bookings/${id}/supplier-confirmation/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body,
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
