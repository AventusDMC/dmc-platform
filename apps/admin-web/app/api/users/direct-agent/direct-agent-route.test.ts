const test = require('node:test');
const assert = require('node:assert/strict');

// Route modules throw at import time if NEXT_PUBLIC_API_URL is unset. Use
// require() (not ESM import) so the env var is set first.
process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const { POST } = require('./route') as typeof import('./route');

// Synthetic placeholders only — never a real email/password/credential.
const SYNTH_EMAIL = 'uat-agent@uat.staging.invalid';
const SYNTH_PASSWORD = 'SYNTHETIC-Passw0rd!';
const FLAG = 'ENABLE_STAGING_DIRECT_AGENT_CREATE';

function makeRequest(body: unknown, opts: { sessionToken?: string } = {}) {
  return {
    headers: new Headers({ 'content-type': 'application/json' }),
    cookies: { get: (name: string) => (name === 'dmc_session' && opts.sessionToken ? { value: opts.sessionToken } : undefined) },
    json: async () => body,
  } as any;
}

function withFlag(value: string | undefined, fn: () => Promise<void>) {
  return async () => {
    const prev = process.env[FLAG];
    if (value === undefined) delete process.env[FLAG];
    else process.env[FLAG] = value;
    try {
      await fn();
    } finally {
      if (prev === undefined) delete process.env[FLAG];
      else process.env[FLAG] = prev;
    }
  };
}

test('flag OFF (absent): route returns 404 and never calls the backend', withFlag(undefined, async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response('{}', { status: 200 }); }) as typeof fetch;
  try {
    const response = await POST(makeRequest({ name: 'X', email: SYNTH_EMAIL, password: SYNTH_PASSWORD, confirmPassword: SYNTH_PASSWORD }));
    assert.equal(response.status, 404);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

test('flag set to a non-"true" value: still 404, no backend call', withFlag('TRUE', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response('{}', { status: 200 }); }) as typeof fetch;
  try {
    const response = await POST(makeRequest({ name: 'X', email: SYNTH_EMAIL, password: SYNTH_PASSWORD, confirmPassword: SYNTH_PASSWORD }));
    assert.equal(response.status, 404);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

test('flag ON: forwards to POST /users with role=agent, active=true, NO companyId, password in body, auth forwarded', withFlag('true', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let method = '';
  let authHeader = '';
  let forwardedBody: any = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    method = String(init?.method || '');
    authHeader = new Headers(init?.headers).get('authorization') || '';
    forwardedBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ id: 'user-new', role: 'agent', active: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    const response = await POST(
      makeRequest(
        { name: 'UAT Agent', email: SYNTH_EMAIL, password: SYNTH_PASSWORD, confirmPassword: SYNTH_PASSWORD },
        { sessionToken: 'SYNTH-SESSION' },
      ),
    );
    assert.equal(requestedUrl, 'http://localhost:3001/users');
    assert.equal(method, 'POST');
    assert.equal(authHeader, 'Bearer SYNTH-SESSION');
    // role forced, active forced, company derived (no companyId), password forwarded, confirmPassword stripped.
    assert.equal(forwardedBody.role, 'agent');
    assert.equal(forwardedBody.active, true);
    assert.equal('companyId' in forwardedBody, false);
    assert.equal(forwardedBody.password, SYNTH_PASSWORD);
    assert.equal('confirmPassword' in forwardedBody, false);
    assert.equal(forwardedBody.email, SYNTH_EMAIL);
    assert.equal(response.status, 201);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

test('flag ON: client attempts to override role/company/active are ignored', withFlag('true', async () => {
  const originalFetch = globalThis.fetch;
  let forwardedBody: any = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    forwardedBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ id: 'user-new' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    await POST(
      makeRequest({
        name: 'UAT Agent',
        email: SYNTH_EMAIL,
        password: SYNTH_PASSWORD,
        confirmPassword: SYNTH_PASSWORD,
        role: 'admin',
        companyId: 'attacker-company-id',
        active: false,
      }),
    );
    assert.equal(forwardedBody.role, 'agent');
    assert.equal(forwardedBody.active, true);
    assert.equal('companyId' in forwardedBody, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

test('flag ON: missing password is rejected 400 before any backend call, no password echoed', withFlag('true', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response('{}', { status: 200 }); }) as typeof fetch;
  try {
    const response = await POST(makeRequest({ name: 'UAT Agent', email: SYNTH_EMAIL }));
    assert.equal(response.status, 400);
    assert.equal(called, false);
    const bodyText = await response.text();
    assert.equal(bodyText.includes(SYNTH_PASSWORD), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

test('flag ON: blank (whitespace) password is rejected 400 before backend call', withFlag('true', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response('{}', { status: 200 }); }) as typeof fetch;
  try {
    const response = await POST(makeRequest({ name: 'UAT Agent', email: SYNTH_EMAIL, password: '   ', confirmPassword: '   ' }));
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

test('flag ON: mismatched confirmation is rejected 400 before backend call', withFlag('true', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response('{}', { status: 200 }); }) as typeof fetch;
  try {
    const response = await POST(
      makeRequest({ name: 'UAT Agent', email: SYNTH_EMAIL, password: SYNTH_PASSWORD, confirmPassword: `${SYNTH_PASSWORD}-different` }),
    );
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

test('flag ON: backend error status is forwarded safely', withFlag('true', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: 'Email already in use' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
  try {
    const response = await POST(
      makeRequest({ name: 'UAT Agent', email: SYNTH_EMAIL, password: SYNTH_PASSWORD, confirmPassword: SYNTH_PASSWORD }),
    );
    assert.equal(response.status, 400);
    const bodyText = await response.text();
    assert.equal(JSON.parse(bodyText).message, 'Email already in use');
    // The submitted password must never be echoed back in the response.
    assert.equal(bodyText.includes(SYNTH_PASSWORD), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

export {};
