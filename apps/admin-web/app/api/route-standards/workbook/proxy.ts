import { NextRequest, NextResponse } from 'next/server';

import { buildActorHeaders } from '../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../proxy-response';

const PROXY_TIMEOUT_MS = 30000;

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Multipart upload proxy for Route Standards Excel import. Mirrors the
 * touring-routes workbook proxy — extracted from the request, repacked
 * into a fresh FormData for the upstream Nest controller. The Nest side
 * uses FileInterceptor + memoryStorage to receive the buffer.
 */
export async function proxyRouteStandardsWorkbookUpload(request: NextRequest, upstreamUrl: string, action: 'preview' | 'import') {
  const startedAt = Date.now();
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'Route Standards workbook is required' }, { status: 400 });
  }

  const outboundFormData = new FormData();
  outboundFormData.set('file', file, file.name || 'route-standards.xlsx');

  const headers = new Headers(buildActorHeaders(request));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: outboundFormData,
      cache: 'no-store',
      signal: controller.signal,
    });
    return await forwardProxyJsonResponse(response);
  } catch (error) {
    const timedOut = isAbortError(error);
    console.error(
      `[route-standards-workbook-proxy] ${action} proxy error status=${timedOut ? 504 : 502} elapsedMs=${
        Date.now() - startedAt
      } message=${error instanceof Error ? error.message : String(error)}`,
    );
    return NextResponse.json(
      { message: timedOut ? 'Route Standards workbook upload timed out.' : 'Could not reach API server.' },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
