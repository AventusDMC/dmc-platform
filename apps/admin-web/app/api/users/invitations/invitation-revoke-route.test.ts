const test = require('node:test');
const assert = require('node:assert/strict');

// Route modules throw at import time if NEXT_PUBLIC_API_URL is unset. Use
// CommonJS require() (not ESM import) so we can set the env var first; ESM
// imports get hoisted above the env assignment.
process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const { DELETE } = require('./[id]/route') as typeof import('./[id]/route');

// Synthetic placeholders only — never a real invitation id, email, or token.
const SYNTHETIC_INVITE_ID = 'synthetic-invite-0000';
const SYNTHETIC_SESSION_TOKEN = 'SYNTHETIC-SESSION-TOKEN';

function makeRequest(opts: { cookie?: string; sessionToken?: string; authorization?: string } = {}) {
  const headers = new Headers();
  if (opts.cookie) headers.set('cookie', opts.cookie);
  if (opts.authorization) headers.set('authorization', opts.authorization);
  return {
    headers,
    cookies: {
      get: (name: string) => (name === 'dmc_session' && opts.sessionToken ? { value: opts.sessionToken } : undefined),
    },
  } as any;
}

test('invitation revoke proxy forwards DELETE to the backend revoke route with forwarded auth', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let method = '';
  let authorizationHeader = '';
  let cookieHeader = '';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    method = String(init?.method || '');
    const h = new Headers(init?.headers);
    authorizationHeader = h.get('authorization') || '';
    cookieHeader = h.get('cookie') || '';
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const request = makeRequest({ cookie: `dmc_session=${SYNTHETIC_SESSION_TOKEN}`, sessionToken: SYNTHETIC_SESSION_TOKEN });
    const response = await DELETE(request, { params: Promise.resolve({ id: SYNTHETIC_INVITE_ID }) });
    const bodyText = await response.text();

    assert.equal(requestedUrl, `http://localhost:3001/users/invitations/${SYNTHETIC_INVITE_ID}`);
    assert.equal(method, 'DELETE');
    assert.equal(authorizationHeader, `Bearer ${SYNTHETIC_SESSION_TOKEN}`);
    assert.equal(cookieHeader, `dmc_session=${SYNTHETIC_SESSION_TOKEN}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.equal(bodyText, JSON.stringify({ ok: true }));

    // No credential/token leakage: the forwarded RESPONSE must not echo the session token.
    assert.equal(bodyText.includes(SYNTHETIC_SESSION_TOKEN), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invitation revoke proxy URL-encodes the id path parameter', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response(null, { status: 204, statusText: 'No Content' });
  }) as typeof fetch;

  try {
    const request = makeRequest();
    // Deliberately malformed / special-character id must be encoded, never interpolated raw.
    const response = await DELETE(request, { params: Promise.resolve({ id: 'a b/c%2' }) });

    assert.equal(requestedUrl, 'http://localhost:3001/users/invitations/a%20b%2Fc%252');
    // 204 No Content is forwarded verbatim with an empty body.
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invitation revoke proxy forwards a backend 404 (already consumed / missing) with its body', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: 'Invitation not found' }), {
      status: 404,
      statusText: 'Not Found',
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

  try {
    const response = await DELETE(makeRequest(), { params: Promise.resolve({ id: SYNTHETIC_INVITE_ID }) });
    assert.equal(response.status, 404);
    assert.equal(JSON.parse(await response.text()).message, 'Invitation not found');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invitation revoke proxy forwards a backend 401 unauthorized status', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

  try {
    const response = await DELETE(makeRequest(), { params: Promise.resolve({ id: SYNTHETIC_INVITE_ID }) });
    assert.equal(response.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invitation revoke proxy returns a safe JSON error and never leaks a non-JSON (HTML) backend body', async () => {
  const originalFetch = globalThis.fetch;
  const htmlBody = '<html><body>Internal Server Error stack trace</body></html>';

  globalThis.fetch = (async () =>
    new Response(htmlBody, {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'text/html' },
    })) as typeof fetch;

  try {
    const response = await DELETE(makeRequest(), { params: Promise.resolve({ id: SYNTHETIC_INVITE_ID }) });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('content-type'), 'application/json');
    const bodyText = await response.text();
    // The raw HTML body must not be leaked to the client.
    assert.equal(bodyText.includes('<html>'), false);
    assert.equal(bodyText.includes('stack trace'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
