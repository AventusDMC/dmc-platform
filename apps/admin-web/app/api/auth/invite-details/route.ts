import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/auth/invite-details`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ message: 'Invitation service is unavailable.' }, { status: 502 });
  }

  const payload = await response.json().catch(() => null);

  return NextResponse.json(payload || { message: 'Invitation not found.' }, { status: response.status || 200 });
}
