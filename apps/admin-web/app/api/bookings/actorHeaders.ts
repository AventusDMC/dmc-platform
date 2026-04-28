import { NextRequest } from 'next/server';

export function buildActorHeaders(request: NextRequest) {
  const headers: Record<string, string> = {};
  const authorization = request.headers.get('authorization');
  const cookie = request.headers.get('cookie') || '';
  const token = request.cookies.get('dmc_session')?.value;

  if (cookie) {
    headers.Cookie = cookie;
  }

  if (authorization) {
    headers.Authorization = authorization;
    return headers;
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['x-dmc-session'] = token;
  }

  return headers;
}
