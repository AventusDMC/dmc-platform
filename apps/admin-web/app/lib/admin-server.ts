import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const ADMIN_API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';
const DEFAULT_PRODUCTION_APP_URL = 'https://dmc-platform-admin-web.vercel.app';

type AdminPageFetchInit = RequestInit & {
  allowAnonymous?: boolean;
  allow404?: boolean;
  // Server-side fetches MUST fail-fast when the backend hangs —
  // otherwise an `await` inside an async server component blocks
  // streaming forever and the browser eventually shows "Page
  // Unresponsive". Default 8s. Pass `timeoutMs: 0` to disable.
  timeoutMs?: number;
};

const DEFAULT_ADMIN_FETCH_TIMEOUT_MS = 8_000;

export class AdminFetchTimeoutError extends Error {
  readonly status = 504;

  constructor(label: string, timeoutMs: number) {
    super(`Admin API request "${label}" timed out after ${timeoutMs}ms`);
    this.name = 'AdminFetchTimeoutError';
  }
}

export function isAdminFetchTimeoutError(error: unknown): error is AdminFetchTimeoutError {
  return error instanceof AdminFetchTimeoutError || (error instanceof Error && error.name === 'AdminFetchTimeoutError');
}

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

// Used when a token IS present but the API rejected it (401). Routing through the
// session-expired endpoint clears the stale cookie before landing on /login,
// which is what prevents the /login <-> dashboard redirect loop.
function buildSessionExpiredPath(pathname: string) {
  return `/api/auth/session-expired?next=${encodeURIComponent(pathname || '/')}`;
}

function isHtmlResponse(contentType: string) {
  return contentType.toLowerCase().includes('text/html');
}

function isJsonResponse(contentType: string) {
  return contentType.toLowerCase().includes('application/json');
}

export function getRequestOrigin(requestHeaders: Headers) {
  const protocol = requestHeaders.get('x-forwarded-proto') || 'http';
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
}

export function getPublicAppBaseUrl() {
  const configured = (process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();

  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, '')}`;
  }

  if (process.env.NODE_ENV === 'production') {
    return DEFAULT_PRODUCTION_APP_URL;
  }

  return 'http://localhost:3000';
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
  const pathname = requestHeaders.get('x-dmc-pathname') || requestHeaders.get('next-url') || '/';
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

  // 8s timeout via AbortController so a hung backend can't block the
  // page render indefinitely. Caller-supplied signals are linked.
  const timeoutMs = init.timeoutMs ?? DEFAULT_ADMIN_FETCH_TIMEOUT_MS;
  const timeoutController = timeoutMs > 0 ? new AbortController() : null;
  const timeoutHandle = timeoutController
    ? setTimeout(() => timeoutController.abort(), timeoutMs)
    : null;
  if (timeoutController && init.signal) {
    if (init.signal.aborted) {
      timeoutController.abort();
    } else {
      init.signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
    }
  }

  const fetchInit: RequestInit = {
    ...init,
    headers: nextHeaders,
    cache: init.cache ?? 'no-store',
    signal: timeoutController ? timeoutController.signal : init.signal,
  };
  delete (fetchInit as { timeoutMs?: number }).timeoutMs;

  let response: Response;
  try {
    response = await fetch(normalizeAdminApiInput(input, requestHeaders), fetchInit);
  } catch (caughtError) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (caughtError instanceof Error && caughtError.name === 'AbortError') {
      if (init.signal?.aborted) {
        throw caughtError;
      }
      throw new AdminFetchTimeoutError(String(input), timeoutMs);
    }
    throw caughtError;
  }
  if (timeoutHandle) clearTimeout(timeoutHandle);

  if (response.status === 401) {
    redirect(buildSessionExpiredPath(pathname));
  }

  if (response.status === 403) {
    throw new AdminForbiddenError(`Admin API request is forbidden: ${String(input)}`);
  }

  return response;
}

export async function adminPageFetchJson<T>(input: string | URL, label: string, init: AdminPageFetchInit = {}): Promise<T> {
  const response = await adminPageFetch(input, init);
  const contentType = response.headers.get('content-type') || '';

  if (response.redirected || isHtmlResponse(contentType)) {
    console.error(
      `[adminPageFetchJson] ${label}: url=${response.url || String(input)} status=${response.status} contentType=${
        contentType || 'unknown'
      }`,
    );

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

  if (!bodyText.trim()) {
    throw new Error(`${label} API returned an empty response body.`);
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown JSON parse error';
    throw new Error(`${label} API returned invalid JSON: ${reason}. Body: ${bodyText.slice(0, 300)}`);
  }
}
