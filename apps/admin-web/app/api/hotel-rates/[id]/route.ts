import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getSessionToken(request: NextRequest) {
  return request.cookies.get('dmc_session')?.value || null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json();
  const sessionToken = getSessionToken(request);

  const response = await fetch(`${API_BASE_URL}/hotel-rates/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  return NextResponse.json(data, { status: response.status });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const sessionToken = getSessionToken(request);

  const response = await fetch(`${API_BASE_URL}/hotel-rates/${id}`, {
    method: 'DELETE',
    headers: {
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
  });

  const data = await response.json().catch(() => null);

  return NextResponse.json(data, { status: response.status });
}
