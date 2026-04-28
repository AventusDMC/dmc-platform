import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const ADMIN_API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

type AdminPageFetchInit = RequestInit & {
  allowAnonymous?: boolean;
  allow404?: boolean;
};

export class AdminForbiddenError extends Error {
  readonly status = 403;

  constructor(message = 'Admin API request is forbidden') {
    super(message);
    this.name = 'AdminForbiddenError';
  }
}

export function isAdminForbiddenError(error: unknown): error is AdminForbiddenError {
  return error instanceof AdminForbiddenError || (error instanceof Error && error.name === 'AdminForbiddenError');
}

export function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== 'object' || !('digest' in error)) {
    return false;
  }

  return String((error as { digest?: unknown }).digest || '').startsWith('NEXT_REDIRECT');
}

function buildLoginRedirectPath(pathname: string) {
  return `/login?reason=session-expired&next=${encodeURIComponent(pathname || '/')}`;
}

function isHtmlResponse(contentType: string) {
  return contentType.toLowerCase().includes('text/html');
}

function isJsonResponse(contentType: string) {
  return contentType.toLowerCase().includes('application/json');
}

function buildSessionExpiredRedirectTarget(response: Response, pathname: string) {
  if (pathname && !pathname.startsWith('/api/')) {
    return buildLoginRedirectPath(pathname);
  }

  const responseUrl = response.url ? new URL(response.url) : null;

  if (responseUrl && responseUrl.pathname.startsWith('/login')) {
    return `${responseUrl.pathname}${responseUrl.search}`;
  }

  return buildLoginRedirectPath(pathname);
}

export function getRequestOrigin(requestHeaders: Headers) {
  const protocol = requestHeaders.get('x-forwarded-proto') || 'http';
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
}

function normalizeAdminApiInput(input: string | URL, requestHeaders: Headers) {
  const origin = getRequestOrigin(requestHeaders);
  const raw = String(input);

  if (raw.startsWith('/api/')) {
    return new URL(raw, origin);
  }

  if (raw.startsWith(ADMIN_API_BASE_URL)) {
    const backendUrl = new URL(raw);
    return new URL(`/api${backendUrl.pathname}${backendUrl.search}`, origin);
  }

  if (raw.startsWith('/')) {
    return new URL(raw, origin);
  }

  return input;
}

export async function adminPageFetch(input: string | URL, init: AdminPageFetchInit = {}) {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const pathname = requestHeaders.get('x-dmc-pathname') || '/';
  const sessionToken = cookieStore.get('dmc_session')?.value || '';

  if (!sessionToken && !init.allowAnonymous) {
    redirect(buildLoginRedirectPath(pathname));
  }

  const nextHeaders = new Headers(init.headers);
  if (sessionToken && !nextHeaders.has('Authorization')) {
    nextHeaders.set('Authorization', `Bearer ${sessionToken}`);
  }
  if (sessionToken && !nextHeaders.has('Cookie')) {
    nextHeaders.set('Cookie', `dmc_session=${sessionToken}`);
  }

  const response = await fetch(normalizeAdminApiInput(input, requestHeaders), {
    ...init,
    headers: nextHeaders,
    cache: init.cache ?? 'no-store',
  });

  if (response.status === 401) {
    redirect(buildLoginRedirectPath(pathname));
  }

  if (response.status === 403) {
    throw new AdminForbiddenError(`Admin API request is forbidden: ${String(input)}`);
  }

  return response;
}

export async function adminPageFetchJson<T>(input: string | URL, label: string, init: AdminPageFetchInit = {}): Promise<T> {
  const response = await adminPageFetch(input, init);
  const contentType = response.headers.get('content-type') || '';
  const requestHeaders = await headers();
  const pathname = requestHeaders.get('x-dmc-pathname') || '/';

  if (response.redirected || isHtmlResponse(contentType)) {
    console.error(
      `[adminPageFetchJson] ${label}: url=${response.url || String(input)} status=${response.status} contentType=${
        contentType || 'unknown'
      }`,
    );

    if (!init.allowAnonymous) {
      redirect(buildSessionExpiredRedirectTarget(response, pathname));
    }

    const htmlPreview = await response.text();
    throw new Error(
      `${label} API returned HTML instead of JSON. ` +
        `URL: ${response.url || String(input)}. ` +
        `Body: ${htmlPreview.slice(0, 200) || 'empty body'}`,
    );
  }

  if (!isJsonResponse(contentType)) {
    const bodyPreview = await response.text();
    console.error(
      `[adminPageFetchJson] ${label}: url=${response.url || String(input)} status=${response.status} contentType=${
        contentType || 'unknown'
      }`,
    );
    throw new Error(
      `${label} API returned unexpected content-type: ${contentType || 'unknown'}. ` +
        `Expected JSON but received ${bodyPreview.slice(0, 200) || 'empty body'}`,
    );
  }

  const bodyText = await response.text();

  if (response.status === 404 && init.allow404) {
    return null as T;
  }

  if (!response.ok) {
    console.error(
      `[adminPageFetchJson] ${label}: url=${response.url || String(input)} status=${response.status} contentType=${
        contentType || 'unknown'
      }`,
    );
    throw new Error(`${label} API failed: ${response.status} ${bodyText || response.statusText}`);
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown JSON parse error';
    throw new Error(`${label} API returned invalid JSON: ${reason}. Body: ${bodyText.slice(0, 300)}`);
  }
}
