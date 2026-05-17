import { NextRequest, NextResponse } from 'next/server';
import { forwardProxyJsonResponse } from '../../../proxy-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(request: NextRequest) {
  const response = await fetch(`${API_BASE_URL}/auth/password-reset/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: await request.text(),
  });

  if (!response.ok) {
    return forwardProxyJsonResponse(response);
  }

  const payload = await response.json();
  const nextResponse = NextResponse.json(payload);
  if (payload?.token) {
    nextResponse.cookies.set('dmc_session', payload.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }

  return nextResponse;
}
