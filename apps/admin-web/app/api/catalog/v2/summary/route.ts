import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';
import { forwardProxyJsonResponse, proxyFetchErrorResponse } from '../../../proxy-response';

// Product Catalog V2 — Slice 2 read-only summary proxy.
// GET only. Forwards to the backend read-only aggregator (which re-enforces the
// fail-closed CATALOG_V2_ENABLED flag and role-based pricing redaction) and
// returns the JSON as-is. No body, no mutation, no writes. Never a redirect.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${API_BASE_URL}/catalog/v2/summary`, {
      method: 'GET',
      headers: { ...buildActorHeaders(request) },
      cache: 'no-store',
      redirect: 'manual',
    });
    return forwardProxyJsonResponse(response);
  } catch (error) {
    return proxyFetchErrorResponse(error);
  }
}
