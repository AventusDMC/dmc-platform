import { NextRequest } from 'next/server';

export function buildActorHeaders(request: NextRequest) {
  const headers: Record<string, string> = {};
  const authorization = request.headers.get('authorization');

  if (authorization) {
    headers.Authorization = authorization;
    return headers;
  }

  const token = request.cookies.get('dmc_session')?.value;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}
