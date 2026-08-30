import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

// Route modules throw at import time if NEXT_PUBLIC_API_URL is unset, and the value
// is read once at module load — so set it BEFORE requiring the routes (require, not
// ESM import, so the assignment is not hoisted above the load).
process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://backend.test';
const API_BASE = process.env.NEXT_PUBLIC_API_URL;

const mainRoute = require('./route') as typeof import('./route');
const itineraryRoute = require('./itinerary/route') as typeof import('./itinerary/route');
const passengersRoute = require('./passengers/route') as typeof import('./passengers/route');
const roomingRoute = require('./rooming/route') as typeof import('./rooming/route');

// The four CP-N3b2b operational proxies + the exact backend operational path each
// must forward to. `raw` is the corresponding raw endpoint a fail-closed proxy must
// NEVER call as a fallback.
const PROXIES = [
  { name: 'main', mod: mainRoute as Record<string, unknown>, backend: `${API_BASE}/quotes/q1/operational`, raw: `${API_BASE}/quotes/q1`, search: '' },
  { name: 'itinerary', mod: itineraryRoute as Record<string, unknown>, backend: `${API_BASE}/quotes/q1/operational/itinerary`, raw: `${API_BASE}/quotes/q1/itinerary`, search: '' },
  { name: 'passengers', mod: passengersRoute as Record<string, unknown>, backend: `${API_BASE}/quotes/q1/operational/passengers`, raw: `${API_BASE}/quotes/q1/passengers`, search: '' },
  { name: 'rooming', mod: roomingRoute as Record<string, unknown>, backend: `${API_BASE}/quotes/q1/operational/rooming`, raw: `${API_BASE}/quotes/q1/rooming`, search: '' },
] as const;

const SESSION_TOKEN = 'v1.SYNTHETIC_SESSION_TOKEN';
const AUTH_HEADER = 'Bearer SYNTHETIC_BEARER';

function makeRequest(search = '') {
  return new NextRequest(`http://app.test/api/quotes/q1/operational${search}`, {
    headers: {
      cookie: `dmc_session=${SESSION_TOKEN}`,
      authorization: AUTH_HEADER,
    },
  });
}

// Install a fetch spy that records every upstream call and returns a chosen response.
function withFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function captureConsole() {
  const logs: string[] = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const originals = methods.map((m) => console[m]);
  for (const m of methods) {
    (console as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
  }
  return { logs, restore: () => methods.forEach((m, i) => { (console as unknown as Record<string, unknown>)[m] = originals[i]; }) };
}

test('each operational proxy exports GET only — no mutation verbs', () => {
  for (const p of PROXIES) {
    assert.equal(typeof p.mod.GET, 'function', `${p.name}: GET must be exported`);
    for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      assert.equal(p.mod[verb], undefined, `${p.name}: must NOT export ${verb}`);
    }
  }
});

test('each proxy forwards GET to its EXACT backend operational path (never the raw path)', async () => {
  for (const p of PROXIES) {
    const { calls, restore } = withFetch(200, { ok: true });
    try {
      const res = await (p.mod.GET as (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>)(
        makeRequest(),
        { params: Promise.resolve({ id: 'q1' }) },
      );
      assert.equal(calls.length, 1, `${p.name}: exactly one upstream call`);
      assert.equal(calls[0].url, p.backend, `${p.name}: forwards to backend operational path`);
      assert.notEqual(calls[0].url, p.raw, `${p.name}: must not call the raw path`);
      // GET only: no method override (fetch defaults to GET) and no body.
      const method = (calls[0].init?.method ?? 'GET').toUpperCase();
      assert.equal(method, 'GET', `${p.name}: upstream call is GET`);
      assert.equal(calls[0].init?.body ?? null, null, `${p.name}: no request body`);
      assert.equal(res.status, 200);
    } finally {
      restore();
    }
  }
});

test('each proxy forwards actor/session headers via buildActorHeaders', async () => {
  for (const p of PROXIES) {
    const { calls, restore } = withFetch(200, { ok: true });
    try {
      await (p.mod.GET as (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>)(
        makeRequest(),
        { params: Promise.resolve({ id: 'q1' }) },
      );
      const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
      // The raw Cookie header (carrying dmc_session) and the inbound Authorization are
      // forwarded verbatim by buildActorHeaders — the primary session/actor signals.
      assert.equal(headers.Cookie, `dmc_session=${SESSION_TOKEN}`, `${p.name}: forwards Cookie`);
      assert.equal(headers.Authorization, AUTH_HEADER, `${p.name}: forwards Authorization`);
      // x-dmc-session is derived from the parsed dmc_session cookie; when present it
      // must equal the session token (NextRequest cookie parsing is runtime-dependent,
      // so only assert correctness-on-presence here, not presence itself).
      if (headers['x-dmc-session'] !== undefined) {
        assert.equal(headers['x-dmc-session'], SESSION_TOKEN, `${p.name}: x-dmc-session equals the session token`);
      }
    } finally {
      restore();
    }
  }
});

test('main proxy preserves the query string on forward', async () => {
  const { calls, restore } = withFetch(200, { ok: true });
  try {
    await (mainRoute.GET as (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>)(
      makeRequest('?scope=full'),
      { params: Promise.resolve({ id: 'q1' }) },
    );
    assert.equal(calls[0].url, `${API_BASE}/quotes/q1/operational?scope=full`);
  } finally {
    restore();
  }
});

test('safe 401 / 403 / 404 are forwarded with the same status and NO raw fallback', async () => {
  for (const status of [401, 403, 404]) {
    for (const p of PROXIES) {
      const { calls, restore } = withFetch(status, { message: 'blocked' });
      try {
        const res = await (p.mod.GET as (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>)(
          makeRequest(),
          { params: Promise.resolve({ id: 'q1' }) },
        );
        assert.equal(res.status, status, `${p.name}: forwards ${status}`);
        // Fail-closed: exactly one upstream call, and it is NEVER the raw endpoint.
        assert.equal(calls.length, 1, `${p.name}: no retry on ${status}`);
        assert.equal(calls[0].url, p.backend, `${p.name}: ${status} did not fall back to raw`);
      } finally {
        restore();
      }
    }
  }
});

test('proxies log no response body, credential, cookie, authorization, token, PII, or URL', async () => {
  for (const status of [200, 403]) {
    for (const p of PROXIES) {
      const { restore } = withFetch(status, { secretPassenger: 'SENTINEL_PII', accessToken: 'SENTINEL_TOKEN' });
      const console_ = captureConsole();
      try {
        await (p.mod.GET as (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>)(
          makeRequest('?x=1'),
          { params: Promise.resolve({ id: 'q1' }) },
        );
      } finally {
        console_.restore();
        restore();
      }
      const joined = console_.logs.join('\n');
      for (const sensitive of ['SENTINEL_PII', 'SENTINEL_TOKEN', SESSION_TOKEN, AUTH_HEADER, 'dmc_session', p.backend, '?x=1']) {
        assert.equal(joined.includes(sensitive), false, `${p.name} (${status}): must not log ${sensitive}`);
      }
    }
  }
});
