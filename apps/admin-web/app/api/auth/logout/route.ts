import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '../session-cookie';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  return clearSessionCookie(response, request);
}
