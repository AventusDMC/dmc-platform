import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../../proxy-response';

// CP-N3b2c2b: same-origin GET-only proxy for the additive cost-visible finance-detail
// projection. Server-trusted auth is forwarded via buildActorHeaders (session cookie /
// bearer); the backend enforces the cost-visibility allowlist (admin/super_admin/finance)
// and 403s every other role. No mutation verbs. Never logs request/response bodies,
// credentials, cookies, authorization headers, tokens, PII, or URLs. Exactly one upstream
// request; no raw-main fallback on any status.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/finance-detail${request.nextUrl.search}`, {
    headers: buildActorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
