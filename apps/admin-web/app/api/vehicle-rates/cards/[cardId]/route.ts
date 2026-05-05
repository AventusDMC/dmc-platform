import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../../bookings/actorHeaders';

const ROUTE_LABEL = '[vehicle-rates/cards]';
const SYNTHETIC_ID_PREFIXES = ['rate_', 'local_', 'synthetic_', 'manual_', 'local-', 'manual-', 'synthetic-'];

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || '';
}

function isSyntheticCardId(cardId: string) {
  return SYNTHETIC_ID_PREFIXES.some((prefix) => cardId.startsWith(prefix));
}

function logCardsFailure(status: number, apiBaseUrl: string, message: string) {
  console.error(`${ROUTE_LABEL} failed`, {
    status,
    apiBaseUrl,
    message,
  });
}

function buildErrorResponse(status: number, apiBaseUrl: string, message: string, upstreamStatus?: number) {
  logCardsFailure(status, apiBaseUrl, message);

  return NextResponse.json(
    {
      message,
      upstreamStatus,
    },
    { status },
  );
}

function parseUpstreamError(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

export async function GET(request: NextRequest, context: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await context.params;

  if (isSyntheticCardId(cardId)) {
    return buildErrorResponse(400, getApiBaseUrl(), 'Synthetic vehicle rate card ids are not forwarded to the backend.');
  }

  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return buildErrorResponse(500, apiBaseUrl, 'NEXT_PUBLIC_API_URL or API_URL is required for vehicle rate card detail proxy.');
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/vehicle-rates/cards/${encodeURIComponent(cardId)}`, {
      method: 'GET',
      headers: new Headers(buildActorHeaders(request)),
      credentials: 'include',
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Could not reach upstream vehicle rate card detail endpoint.';
    return buildErrorResponse(502, apiBaseUrl, message);
  }

  const bodyText = await response.text().catch(() => '');

  if (!bodyText.trim()) {
    const message = response.ok
      ? 'Upstream vehicle rate card detail endpoint returned an empty response.'
      : `Upstream vehicle rate card detail endpoint returned ${response.status} with an empty response.`;
    return buildErrorResponse(response.ok ? 502 : response.status, apiBaseUrl, message, response.status);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return buildErrorResponse(
      response.ok ? 502 : response.status,
      apiBaseUrl,
      `Upstream vehicle rate card detail endpoint returned invalid JSON with status ${response.status}.`,
      response.status,
    );
  }

  if (!response.ok) {
    return buildErrorResponse(
      response.status,
      apiBaseUrl,
      parseUpstreamError(payload, `Upstream vehicle rate card detail endpoint returned ${response.status}.`),
      response.status,
    );
  }

  return NextResponse.json(payload, { status: response.status });
}
