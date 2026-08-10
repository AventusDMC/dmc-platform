import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Ops-DG-2: the V2 board must read the V2-scoped redacted grid via a V2-only proxy that
// forwards ONLY to the backend V2 route — never the shared/Classic operations-grid route.

const proxySrc = readFileSync(new URL('../../api/bookings/[id]/v2/operations-grid/route.ts', import.meta.url), 'utf8');
const classicProxySrc = readFileSync(new URL('../../api/bookings/[id]/operations-grid/route.ts', import.meta.url), 'utf8');
const pageSrc = readFileSync(new URL('./[bookingId]/page.tsx', import.meta.url), 'utf8');

describe('Ops-DG-2 — V2 redacted operations-grid wiring', () => {
  it('the V2 proxy forwards ONLY to the backend V2 route (GET-only)', () => {
    assert.ok(proxySrc.includes('export async function GET('), 'V2 proxy is GET');
    assert.ok(proxySrc.includes('/bookings/${id}/v2/operations-grid'), 'V2 proxy targets the backend V2 route');
    // It must NOT call the shared/Classic route (/bookings/:id/operations-grid without /v2).
    assert.ok(
      !/\/bookings\/\$\{id\}\/operations-grid/.test(proxySrc),
      'V2 proxy must not call the shared Classic route',
    );
    // GET-only — no write verbs.
    assert.ok(!/export async function (POST|PATCH|PUT|DELETE)\(/.test(proxySrc), 'V2 proxy is GET-only');
  });

  it('the Ops V2 page fetches the V2 proxy, not the shared Classic proxy', () => {
    assert.ok(pageSrc.includes('`/api/bookings/${id}/v2/operations-grid`'), 'V2 page uses the V2 proxy');
    assert.ok(
      !/`\/api\/bookings\/\$\{id\}\/operations-grid`/.test(pageSrc),
      'V2 page must not use the shared Classic proxy for the board grid',
    );
  });

  it('the Classic proxy is unchanged (still targets the shared route)', () => {
    assert.ok(classicProxySrc.includes('/bookings/${id}/operations-grid'), 'Classic proxy still targets the shared route');
    assert.ok(!classicProxySrc.includes('/v2/operations-grid'), 'Classic proxy must not point at the V2 route');
  });
});
