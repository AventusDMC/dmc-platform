import { NextRequest, NextResponse } from 'next/server';

import { buildActorHeaders } from '../../bookings/actorHeaders';
import { forwardProxyJsonResponse } from '../../proxy-response';

const TOURING_WORKBOOK_PROXY_TIMEOUT_MS = 30000;

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

export async function proxyTouringWorkbookUpload(request: NextRequest, upstreamUrl: string, action: 'preview' | 'import') {
  const startedAt = Date.now();
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    console.warn(`[touring-workbook-proxy] ${action} proxy received file=no`);
    console.warn(`[touring-workbook-proxy] ${action} proxy response sent status=400 elapsedMs=${Date.now() - startedAt}`);
    return NextResponse.json({ message: 'Touring route workbook is required' }, { status: 400 });
  }

  console.log(`[touring-workbook-proxy] ${action} proxy received file=yes`);
  console.log(
    `[touring-workbook-proxy] ${action} file name=${file.name || 'unknown'} size=${file.size} type=${file.type || 'unknown'}`,
  );

  const outboundFormData = new FormData();
  outboundFormData.set('file', file, file.name || 'touring-workbook.xlsx');

  const headers = new Headers(buildActorHeaders(request));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOURING_WORKBOOK_PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: outboundFormData,
      cache: 'no-store',
      signal: controller.signal,
    });
    console.log(
      `[touring-workbook-proxy] ${action} backend response status=${response.status} elapsedMs=${Date.now() - startedAt}`,
    );

    const result = await forwardProxyJsonResponse(response);
    console.log(
      `[touring-workbook-proxy] ${action} proxy response sent status=${result.status} elapsedMs=${Date.now() - startedAt}`,
    );
    return result;
  } catch (error) {
    const timedOut = isAbortError(error);
    console.error(
      `[touring-workbook-proxy] ${action} proxy response sent status=${timedOut ? 504 : 502} elapsedMs=${
        Date.now() - startedAt
      } message=${error instanceof Error ? error.message : String(error)}`,
    );
    return NextResponse.json(
      { message: timedOut ? 'Touring workbook upload timed out.' : 'Could not reach API server.' },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
