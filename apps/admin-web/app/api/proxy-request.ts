import { NextRequest } from 'next/server';

import { buildActorHeaders } from './bookings/actorHeaders';
import { forwardProxyJsonResponse } from './proxy-response';

type ProxyMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function proxyRequest(request: NextRequest, url: string, method: ProxyMethod) {
  console.log('FETCH URL:', url);
  const headers = new Headers(buildActorHeaders(request));
  const init: RequestInit = {
    method,
    headers,
    cache: 'no-store',
    redirect: 'manual',
  };

  if (!['GET', 'HEAD'].includes(method)) {
    headers.set('Content-Type', request.headers.get('content-type') || 'application/json');
    const body = await request.text().catch(() => '');

    if (body || ['POST', 'PATCH', 'PUT'].includes(method)) {
      init.body = body || '{}';
    }
  }

  const response = await fetch(url, init);
  return forwardProxyJsonResponse(response);
}
