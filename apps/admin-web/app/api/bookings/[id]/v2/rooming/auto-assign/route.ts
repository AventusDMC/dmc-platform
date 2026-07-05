import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../../proxy-response';

// PR-2c-2 — V2 JSON proxy for AUTO-ASSIGN rooming. Forwards to the existing
// backend POST /bookings/:id/rooming/auto-assign and returns JSON (never a
// redirect). No body. The Classic form-post/redirect proxy at
// ../../rooming/auto-assign/route.ts is untouched.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const response = await fetch(`${API_BASE_URL}/bookings/${id}/rooming/auto-assign`, {
      method: 'POST',
      headers: buildActorHeaders(request),
      cache: 'no-store',
      redirect: 'manual',
    });
    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error);
  }
}
