import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// Streaming binary proxy for the .xlsx download — proxyRequest is JSON-
// oriented so we hand-roll fetch + passthrough here. Matches the pattern
// used by other binary export proxies (vouchers/pdf, guarantee letter).
export async function GET(request: NextRequest) {
  const response = await fetch(`${API_BASE_URL}/route-standards/workbook/export`, {
    method: 'GET',
    headers: buildActorHeaders(request),
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return new Response(text || `Route Standards export failed with status ${response.status}`, {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(response.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="route-standards.xlsx"',
    },
  });
}
