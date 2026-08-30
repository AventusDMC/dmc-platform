import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  quoteDetailEndpoint,
  quoteItineraryEndpoint,
  quotePassengersEndpoint,
  quoteRoomingEndpoint,
  quoteVersionEndpoint,
  quoteDetailPath,
  quoteItineraryPath,
  quotePassengersPath,
  quoteRoomingPath,
  quoteVersionPath,
} from './quote-operational-routing';
import type { SessionRole } from '../app/lib/auth-session';

// Corrected CP-N3b2b request matrix:
//                 admin/super | finance   | operations | viewer
// Main detail     raw         | raw       | operational| operational
// Itinerary       raw         | raw       | operational| operational
// Passengers      raw         | operational| raw       | operational
// Rooming         operational | operational| operational| operational
// Version detail  raw         | raw       | summary    | summary
type Row = {
  role: SessionRole | null | undefined;
  detail: 'raw' | 'operational';
  itinerary: 'raw' | 'operational';
  passengers: 'raw' | 'operational';
  rooming: 'operational';
  version: 'raw' | 'summary';
};

const MATRIX: Row[] = [
  { role: 'admin', detail: 'raw', itinerary: 'raw', passengers: 'raw', rooming: 'operational', version: 'raw' },
  { role: 'super_admin', detail: 'raw', itinerary: 'raw', passengers: 'raw', rooming: 'operational', version: 'raw' },
  { role: 'finance', detail: 'raw', itinerary: 'raw', passengers: 'operational', rooming: 'operational', version: 'raw' },
  { role: 'operations', detail: 'operational', itinerary: 'operational', passengers: 'raw', rooming: 'operational', version: 'summary' },
  { role: 'viewer', detail: 'operational', itinerary: 'operational', passengers: 'operational', rooming: 'operational', version: 'summary' },
  // Non-authorized roles must NEVER select a raw endpoint for any class.
  { role: 'agent', detail: 'operational', itinerary: 'operational', passengers: 'operational', rooming: 'operational', version: 'summary' },
  { role: 'agent_admin', detail: 'operational', itinerary: 'operational', passengers: 'operational', rooming: 'operational', version: 'summary' },
  { role: null, detail: 'operational', itinerary: 'operational', passengers: 'operational', rooming: 'operational', version: 'summary' },
  { role: undefined, detail: 'operational', itinerary: 'operational', passengers: 'operational', rooming: 'operational', version: 'summary' },
  { role: 'some-unknown-future-role' as SessionRole, detail: 'operational', itinerary: 'operational', passengers: 'operational', rooming: 'operational', version: 'summary' },
];

for (const row of MATRIX) {
  const label = row.role ?? 'missing';
  test(`selector matrix: role "${label}"`, () => {
    assert.equal(quoteDetailEndpoint(row.role), row.detail);
    assert.equal(quoteItineraryEndpoint(row.role), row.itinerary);
    assert.equal(quotePassengersEndpoint(row.role), row.passengers);
    assert.equal(quoteRoomingEndpoint(row.role), row.rooming);
    assert.equal(quoteVersionEndpoint(row.role), row.version);
  });
}

test('rooming is ALWAYS operational (no role gets raw rooming)', () => {
  for (const row of MATRIX) {
    assert.equal(quoteRoomingEndpoint(row.role), 'operational');
    assert.equal(quoteRoomingPath('q1', row.role), '/api/quotes/q1/operational/rooming');
  }
});

test('no non-authorized role selects any raw endpoint', () => {
  for (const role of ['agent', 'agent_admin', null, undefined, 'x-future' as SessionRole] as const) {
    assert.notEqual(quoteDetailEndpoint(role), 'raw');
    assert.notEqual(quoteItineraryEndpoint(role), 'raw');
    assert.notEqual(quotePassengersEndpoint(role), 'raw');
    assert.notEqual(quoteVersionEndpoint(role), 'raw');
  }
});

test('path builders resolve to the correct URLs (raw vs operational)', () => {
  // finance: raw detail + raw itinerary, operational passengers, operational rooming, raw version
  assert.equal(quoteDetailPath('q1', 'finance'), '/api/quotes/q1');
  assert.equal(quoteItineraryPath('q1', 'finance'), '/api/quotes/q1/itinerary');
  assert.equal(quotePassengersPath('q1', 'finance'), '/api/quotes/q1/operational/passengers');
  assert.equal(quoteVersionPath('q1', 'v1', 'finance'), '/api/quotes/q1/versions/v1');
  // operations: operational detail/itinerary, raw passengers, summary version
  assert.equal(quoteDetailPath('q1', 'operations'), '/api/quotes/q1/operational');
  assert.equal(quoteItineraryPath('q1', 'operations'), '/api/quotes/q1/operational/itinerary');
  assert.equal(quotePassengersPath('q1', 'operations'), '/api/quotes/q1/passengers');
  assert.equal(quoteVersionPath('q1', 'v1', 'operations'), '/api/quotes/q1/versions/v1/summary');
  // viewer: operational everything except version summary
  assert.equal(quoteDetailPath('q1', 'viewer'), '/api/quotes/q1/operational');
  assert.equal(quotePassengersPath('q1', 'viewer'), '/api/quotes/q1/operational/passengers');
  assert.equal(quoteVersionPath('q1', 'v1', 'viewer'), '/api/quotes/q1/versions/v1/summary');
  // admin: raw everything (rooming still operational)
  assert.equal(quoteDetailPath('q1', 'admin'), '/api/quotes/q1');
  assert.equal(quotePassengersPath('q1', 'admin'), '/api/quotes/q1/passengers');
  assert.equal(quoteRoomingPath('q1', 'admin'), '/api/quotes/q1/operational/rooming');
});
