'use client';

export type ApiValidationError = {
  code: string;
  path: string;
  message: string;
};

function clearSessionCookie() {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = 'dmc_session=; Max-Age=0; path=/; SameSite=None; Secure';
}

function redirectToLogin() {
  if (typeof window === 'undefined') {
    return;
  }

  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?reason=session-expired&next=${encodeURIComponent(next)}`);
}

export async function getApiError(response: Response, fallback: string) {
  if (response.status === 401) {
    clearSessionCookie();
    redirectToLogin();

    return {
      message: 'Your session expired. Redirecting to login.',
      errors: [] as ApiValidationError[],
    };
  }

  if (response.status === 403) {
    return {
      message: 'You are signed in, but your account does not have permission to do that.',
      errors: [] as ApiValidationError[],
    };
  }

  try {
    const data = await readJsonResponse<Record<string, unknown>>(response, fallback);
    return {
      message:
        typeof data?.message === 'string'
          ? data.message
          : Array.isArray(data?.message)
            ? data.message.join(', ')
            : fallback,
      errors: Array.isArray(data?.errors)
        ? data.errors.filter(
            (error: unknown): error is ApiValidationError =>
              Boolean(error) &&
              typeof (error as Record<string, unknown>).code === 'string' &&
              typeof (error as Record<string, unknown>).path === 'string' &&
              typeof (error as Record<string, unknown>).message === 'string',
          )
        : [],
    };
  } catch {
    return {
      message: fallback,
      errors: [] as ApiValidationError[],
    };
  }
}

export async function getErrorMessage(response: Response, fallback: string) {
  const error = await getApiError(response, fallback);
  return error.message;
}

export function logFetchUrl(url: string | URL) {
  const normalizedUrl = String(url);
  console.log('FETCH URL:', normalizedUrl);

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedUrl.trim())) {
    throw new Error(`Invalid fetch URL: received raw ID "${normalizedUrl}" instead of an /api route.`);
  }

  return normalizedUrl;
}

export async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    const bodyPreview = await response.text();
    throw new Error(
      `${label} Expected JSON but received ${contentType || 'unknown'}: ${bodyPreview.slice(0, 200) || 'empty body'}`,
    );
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown JSON parse error';
    throw new Error(`${label} Invalid JSON response: ${reason}`);
  }
}

export async function readJsonResponseIfPresent<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
