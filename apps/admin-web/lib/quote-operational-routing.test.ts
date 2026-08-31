import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  quoteDetailEndpoint,
  quoteItineraryEndpoint,
  quotePassengersEndpoint,
  quoteRoomingEndpoint,
  quoteDetailPath,
  quoteItineraryPath,
  quotePassengersPath,
  quoteRoomingPath,
} from './quote-operational-routing';
import type { SessionRole } from '../app/lib/auth-session';

// CP-N3b2c2b main-detail migration: cost-visible main now routes to finance-detail
// (never raw main). Secondary routing unchanged. Version-detail routing intentionally
// excluded — deferred to CP-N3b2c3.
//                 admin/super    | finance        | operations | viewer      | agent/…/missing/unknown/future
// Main detail     finance-detail | finance-detail | operational| operational | operational (→ backend 403)
// Itinerary       raw            | raw            | operational| operational | operational
// Passengers      raw            | operational    | raw        | operational | operational
// Rooming         operational    | operational    | operational| operational | operational
type Row = {
  role: SessionRole | null | undefined;
  detail: 'finance-detail' | 'operational';
  itinerary: 'raw' | 'operational';
  passengers: 'raw' | 'operational';
  rooming: 'operational';
};

const MATRIX: Row[] = [
  { role: 'admin', detail: 'finance-detail', itinerary: 'raw', passengers: 'raw', rooming: 'operational' },
  { role: 'super_admin', detail: 'finance-detail', itinerary: 'raw', passengers: 'raw', rooming: 'operational' },
  { role: 'finance', detail: 'finance-detail', itinerary: 'raw', passengers: 'operational', rooming: 'operational' },
  { role: 'operations', detail: 'operational', itinerary: 'operational', passengers: 'raw', rooming: 'operational' },
  { role: 'viewer', detail: 'operational', itinerary: 'operational', passengers: 'operational', rooming: 'operational' },
  // Non-authorized roles must NEVER select raw OR finance-detail for main detail.
  { role: 'agent', detail: 'operational', itinerary: 'operational', passengers: 'operational', rooming: 'operational' },
  { role: 'agent_admin', detail: 'operational', itinerary: 'operational', passengers: 'operational', rooming: 'operational' },
  { role: null, detail: 'operational', itinerary: 'operational', passengers: 'operational', rooming: 'operational' },
  { role: undefined, detail: 'operational', itinerary: 'operational', passengers: 'operational', rooming: 'operational' },
  { role: 'some-unknown-future-role' as SessionRole, detail: 'operational', itinerary: 'operational', passengers: 'operational', rooming: 'operational' },
];

for (const row of MATRIX) {
  const label = row.role ?? 'missing';
  test(`selector matrix: role "${label}"`, () => {
    assert.equal(quoteDetailEndpoint(row.role), row.detail);
    assert.equal(quoteItineraryEndpoint(row.role), row.itinerary);
    assert.equal(quotePassengersEndpoint(row.role), row.passengers);
    assert.equal(quoteRoomingEndpoint(row.role), row.rooming);
  });
}

// CP-N3b2c2b source-wiring: the four identified main-detail consumers (Builder V2,
// Classic, Preview, Internal View) obtain their main response through quoteDetailPath,
// and none embeds a raw-main GET literal `/api/quotes/${...}` (no direct raw-main call
// and no raw-main fallback).
const SURFACES: Array<{ name: string; url: URL }> = [
  { name: 'Builder V2 adapter', url: new URL('./quote-v2-adapter.ts', import.meta.url) },
  { name: 'Classic', url: new URL('../app/quotes/[id]/ClassicQuoteWorkspace.tsx', import.meta.url) },
  { name: 'Preview', url: new URL('../app/quotes/[id]/preview/page.tsx', import.meta.url) },
  { name: 'Internal View', url: new URL('../app/quotes/[id]/view/page.tsx', import.meta.url) },
];
// Raw-main GET literal: /api/quotes/${anything} immediately closed by a backtick or a
// query — i.e. NOT followed by a `/sub-path`.
const RAW_MAIN_LITERAL = /\/api\/quotes\/\$\{[^}]+\}(`|\?|['"])/;

for (const surface of SURFACES) {
  const source = readFileSync(surface.url, 'utf8');
  test(`source-wiring: ${surface.name} routes main detail through quoteDetailPath`, () => {
    assert.equal(source.includes('quoteDetailPath('), true, `${surface.name} must call quoteDetailPath`);
  });
  test(`source-wiring: ${surface.name} embeds no raw-main GET literal`, () => {
    assert.equal(RAW_MAIN_LITERAL.test(source), false, `${surface.name} must not reference raw main /api/quotes/:id`);
  });
}

test('rooming is ALWAYS operational (no role gets raw rooming)', () => {
  for (const row of MATRIX) {
    assert.equal(quoteRoomingEndpoint(row.role), 'operational');
    assert.equal(quoteRoomingPath('q1', row.role), '/api/quotes/q1/operational/rooming');
  }
});

test('no non-authorized role selects raw OR finance-detail for main detail (and no raw secondary)', () => {
  for (const role of ['agent', 'agent_admin', null, undefined, 'x-future' as SessionRole] as const) {
    assert.equal(quoteDetailEndpoint(role), 'operational');
    assert.notEqual(quoteDetailEndpoint(role), 'finance-detail');
    assert.notEqual(quoteItineraryEndpoint(role), 'raw');
    assert.notEqual(quotePassengersEndpoint(role), 'raw');
    // never a raw-main path for any unauthorized role
    assert.equal(quoteDetailPath('q1', role), '/api/quotes/q1/operational');
  }
});

test('main-detail path never resolves to raw main /api/quotes/:id for any role', () => {
  for (const row of MATRIX) {
    assert.notEqual(quoteDetailPath('q1', row.role), '/api/quotes/q1');
  }
});

test('path builders resolve to the correct URLs (finance-detail vs operational)', () => {
  // cost-visible: finance-detail main; itinerary raw; passengers operational (finance) / raw (admin)
  assert.equal(quoteDetailPath('q1', 'finance'), '/api/quotes/q1/finance-detail');
  assert.equal(quoteItineraryPath('q1', 'finance'), '/api/quotes/q1/itinerary');
  assert.equal(quotePassengersPath('q1', 'finance'), '/api/quotes/q1/operational/passengers');
  assert.equal(quoteDetailPath('q1', 'admin'), '/api/quotes/q1/finance-detail');
  assert.equal(quoteDetailPath('q1', 'super_admin'), '/api/quotes/q1/finance-detail');
  assert.equal(quotePassengersPath('q1', 'admin'), '/api/quotes/q1/passengers');
  assert.equal(quoteRoomingPath('q1', 'admin'), '/api/quotes/q1/operational/rooming');
  // operations: operational main/itinerary, raw passengers
  assert.equal(quoteDetailPath('q1', 'operations'), '/api/quotes/q1/operational');
  assert.equal(quoteItineraryPath('q1', 'operations'), '/api/quotes/q1/operational/itinerary');
  assert.equal(quotePassengersPath('q1', 'operations'), '/api/quotes/q1/passengers');
  // viewer + unauthorized: operational main
  assert.equal(quoteDetailPath('q1', 'viewer'), '/api/quotes/q1/operational');
  assert.equal(quotePassengersPath('q1', 'viewer'), '/api/quotes/q1/operational/passengers');
  assert.equal(quoteDetailPath('q1', 'agent'), '/api/quotes/q1/operational');
  assert.equal(quoteDetailPath('q1', null), '/api/quotes/q1/operational');
  assert.equal(quoteDetailPath('q1', undefined), '/api/quotes/q1/operational');
});
