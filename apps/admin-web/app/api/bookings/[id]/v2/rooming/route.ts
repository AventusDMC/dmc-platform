import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../../proxy-response';
import { pickAllowedRoomFields } from '../../../../../operations/v2/ops-rooming-request';

// PR-2c-1 — V2 JSON proxy for rooming-entry CREATE. Forwards JSON to the existing
// backend POST /bookings/:id/rooming and returns JSON (never a redirect). The
// Classic form-post/redirect proxy at ../../rooming/route.ts is untouched. Only
// the allowlisted room fields (roomType / occupancy / notes / sortOrder) are
// forwarded.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const body = pickAllowedRoomFields(raw);

  try {
    const response = await fetch(`${API_BASE_URL}/bookings/${id}/rooming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildActorHeaders(request) },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'manual',
    });
    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error);
  }
}
