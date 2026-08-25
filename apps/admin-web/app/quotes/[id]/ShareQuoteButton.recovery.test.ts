import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchCurrentPublicToken } from './ShareQuoteButton';

// CP-Tb Classic share-control recovery. The authenticated quote hydration no
// longer carries publicToken; `fetchCurrentPublicToken` decides whether to
// recover the current token for an already-enabled link via the idempotent
// enable-public-link endpoint. SYNTHETIC placeholder token only.
const SYNTHETIC_TOKEN = 'SYNTHETIC-CP-TB-CLASSIC-TOKEN';
const BASE = 'https://api.example.test';
const QID = 'quote-xyz';

type Call = { url: string; init: any };
function mockFetch(impl: (url: string, init: any) => Promise<any>) {
  const calls: Call[] = [];
  const fn: any = async (url: string, init: any) => {
    calls.push({ url, init });
    return impl(url, init);
  };
  fn.calls = calls;
  return fn;
}
function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as any;
}

describe('ShareQuoteButton CP-Tb recovery (fetchCurrentPublicToken)', () => {
  it('publicEnabled=true + no token: exactly one idempotent enable-public-link POST returning the token', async () => {
    const f = mockFetch(async () => jsonResponse({ publicEnabled: true, publicToken: SYNTHETIC_TOKEN }));
    const token = await fetchCurrentPublicToken({ apiBaseUrl: BASE, quoteId: QID, isPublicEnabled: true, hasToken: false, fetchImpl: f });
    assert.equal(token, SYNTHETIC_TOKEN);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, `${BASE}/quotes/${QID}/enable-public-link`);
    assert.equal(f.calls[0].init.method, 'POST');
    // Request shape: no arbitrary body fields, no new route.
    assert.equal(f.calls[0].init.body, undefined);
  });

  it('publicEnabled=false + no token: zero requests (never auto-enables a disabled link)', async () => {
    const f = mockFetch(async () => {
      throw new Error('must not fetch for a disabled link');
    });
    const token = await fetchCurrentPublicToken({ apiBaseUrl: BASE, quoteId: QID, isPublicEnabled: false, hasToken: false, fetchImpl: f });
    assert.equal(token, null);
    assert.equal(f.calls.length, 0);
  });

  it('publicEnabled=true + token already present: zero requests (models no duplicate after re-render)', async () => {
    const f = mockFetch(async () => {
      throw new Error('must not fetch when a token is already held');
    });
    const token = await fetchCurrentPublicToken({ apiBaseUrl: BASE, quoteId: QID, isPublicEnabled: true, hasToken: true, fetchImpl: f });
    assert.equal(token, null);
    assert.equal(f.calls.length, 0);
  });

  it('recovery error (non-ok): returns null, single call, no retry loop, no token surfaced', async () => {
    const f = mockFetch(async () => jsonResponse({}, false));
    const token = await fetchCurrentPublicToken({ apiBaseUrl: BASE, quoteId: QID, isPublicEnabled: true, hasToken: false, fetchImpl: f });
    assert.equal(token, null);
    assert.equal(f.calls.length, 1);
  });

  it('recovery error (thrown): returns null, single call, no throw propagated', async () => {
    const f = mockFetch(async () => {
      throw new Error('network');
    });
    const token = await fetchCurrentPublicToken({ apiBaseUrl: BASE, quoteId: QID, isPublicEnabled: true, hasToken: false, fetchImpl: f });
    assert.equal(token, null);
    assert.equal(f.calls.length, 1);
  });

  it('response reports link disabled (publicEnabled=false in body): returns null', async () => {
    const f = mockFetch(async () => jsonResponse({ publicEnabled: false, publicToken: null }));
    const token = await fetchCurrentPublicToken({ apiBaseUrl: BASE, quoteId: QID, isPublicEnabled: true, hasToken: false, fetchImpl: f });
    assert.equal(token, null);
  });
});
