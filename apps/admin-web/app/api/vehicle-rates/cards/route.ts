import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../bookings/actorHeaders';

const ROUTE_LABEL = '[vehicle-rates/cards]';

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || '';
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

export async function GET(request: NextRequest) {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return buildErrorResponse(500, apiBaseUrl, 'NEXT_PUBLIC_API_URL or API_URL is required for vehicle rate cards proxy.');
  }

  const upstreamUrl = `${apiBaseUrl}/vehicle-rates/cards${request.nextUrl.search}`;

  let response: Response;
  try {
    response = await fetch(upstreamUrl, {
      method: 'GET',
      headers: new Headers(buildActorHeaders(request)),
      credentials: 'include',
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Could not reach upstream vehicle rate cards endpoint.';
    return buildErrorResponse(502, apiBaseUrl, message);
  }

  const bodyText = await response.text().catch(() => '');

  if (!bodyText.trim()) {
    const message = response.ok
      ? 'Upstream vehicle rate cards endpoint returned an empty response.'
      : `Upstream vehicle rate cards endpoint returned ${response.status} with an empty response.`;
    return buildErrorResponse(response.ok ? 502 : response.status, apiBaseUrl, message, response.status);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return buildErrorResponse(
      response.ok ? 502 : response.status,
      apiBaseUrl,
      `Upstream vehicle rate cards endpoint returned invalid JSON with status ${response.status}.`,
      response.status,
    );
  }

  if (!response.ok) {
    return buildErrorResponse(
      response.status,
      apiBaseUrl,
      parseUpstreamError(payload, `Upstream vehicle rate cards endpoint returned ${response.status}.`),
      response.status,
    );
  }

  return NextResponse.json(payload, { status: response.status });
}
