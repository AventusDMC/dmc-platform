import { NextRequest, NextResponse } from 'next/server';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const token = request.cookies.get('dmc_session')?.value;
  const response = await fetch(`${API_BASE_URL}/quotes/${id}/proposal-v3.pdf${request.nextUrl.search}`, {
    method: 'GET',
    headers: {
      ...buildActorHeaders(request),
      ...(token ? { Cookie: `dmc_session=${token}` } : {}),
    },
    cache: 'no-store',
    redirect: 'manual',
  });

  if (response.status === 204 || response.status === 205) {
    return new NextResponse(null, { status: response.status });
  }

  const body = await response.arrayBuffer();
  const headers = new Headers();

  for (const headerName of ['content-disposition', 'content-length', 'cache-control']) {
    const value = response.headers.get(headerName);

    if (value) {
      headers.set(headerName, value);
    }
  }

  headers.set('content-type', 'application/pdf');

  return new NextResponse(body, {
    status: response.status,
    headers,
  });
}
