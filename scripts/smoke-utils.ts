type RequestJsonResult<T = unknown> = {
  response: Response;
  text: string;
  json: T | null;
};

export class SmokeFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmokeFailure';
  }
}

export class CookieJar {
  private readonly cookies = new Map<string, string>();

  addFromResponse(response: Response) {
    const responseHeaders = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const setCookies =
      typeof responseHeaders.getSetCookie === 'function'
        ? responseHeaders.getSetCookie()
        : response.headers.get('set-cookie')
          ? [String(response.headers.get('set-cookie'))]
          : [];

    for (const rawCookie of setCookies) {
      const cookiePair = rawCookie.split(';', 1)[0];
      const separatorIndex = cookiePair.indexOf('=');

      if (separatorIndex <= 0) {
        continue;
      }

      const name = cookiePair.slice(0, separatorIndex).trim();
      const value = cookiePair.slice(separatorIndex + 1).trim();

      if (!name) {
        continue;
      }

      this.cookies.set(name, value);
    }
  }

  toHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

export function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new SmokeFailure(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getOptionalEnv(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function buildUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString();
}

export function logStep(message: string) {
  console.log(`\n[STEP] ${message}`);
}

export function logPass(message: string) {
  console.log(`[PASS] ${message}`);
}

export function logWarn(message: string) {
  console.warn(`[WARN] ${message}`);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new SmokeFailure(message);
  }
}

export async function requestJson<T = unknown>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  cookieJar?: CookieJar,
): Promise<RequestJsonResult<T>> {
  const headers = new Headers(init.headers);
  const cookieHeader = cookieJar?.toHeader();

  if (cookieHeader && !headers.has('Cookie')) {
    headers.set('Cookie', cookieHeader);
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(buildUrl(baseUrl, path), {
    ...init,
    headers,
    redirect: init.redirect ?? 'manual',
  });

  cookieJar?.addFromResponse(response);

  const text = await response.text();
  let json: T | null = null;

  if (text) {
    try {
      json = JSON.parse(text) as T;
    } catch {
      json = null;
    }
  }

  return {
    response,
    text,
    json,
  };
}

export function ensureOk(
  response: Response,
  bodyText: string,
  step: string,
  allowedStatuses: number[] = [200],
) {
  if (!allowedStatuses.includes(response.status)) {
    throw new SmokeFailure(`${step} failed with ${response.status}: ${bodyText || response.statusText}`);
  }
}

export async function requestHtml(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  cookieJar?: CookieJar,
) {
  const headers = new Headers(init.headers);
  const cookieHeader = cookieJar?.toHeader();

  if (cookieHeader && !headers.has('Cookie')) {
    headers.set('Cookie', cookieHeader);
  }

  const response = await fetch(buildUrl(baseUrl, path), {
    ...init,
    headers,
    redirect: init.redirect ?? 'manual',
  });

  cookieJar?.addFromResponse(response);

  const text = await response.text();
  return { response, text };
}

export function chooseAlternateQuoteCurrency(current: string) {
  const allowed = ['USD', 'EUR', 'JOD'];
  return allowed.find((currency) => currency !== current) || 'USD';
}
