import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const adapterSrc = readFileSync(new URL('../../../lib/quote-v2-adapter.ts', import.meta.url), 'utf8');
const typesSrc = readFileSync(new URL('../../../lib/quote-types.ts', import.meta.url), 'utf8');
const demoSrc = readFileSync(new URL('../../../lib/quote-demo-data.ts', import.meta.url), 'utf8');
const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/passengers-step.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
  }
}

describe('Quote Builder V2 — read-only Passengers & Rooming step', () => {
  it('defines passenger + rooming types and a passengers step id', () => {
    contains(typesSrc, [
      'export interface Passenger',
      'export interface RoomingGroupSummary',
      '"passengers"',
      'passengers: Passenger[]',
      'roomingGroups: RoomingGroupSummary[]',
    ]);
  });

  it('adapter maps passengers + rooming from EXISTING GET endpoints only (no new endpoint, no mutation)', () => {
    contains(adapterSrc, [
      'function mapPassengers',
      'function mapRooming',
      'passengers: mapPassengers(safeRaw)',
      'roomingGroups: mapRooming(safeRaw)',
      '/api/quotes/${id}/passengers',
      '/api/quotes/${id}/rooming',
      '"passengers"',
      'passengers: { label: "Passengers"',
    ]);
    // The adapter must not introduce any write to passengers/rooming.
    excludes(adapterSrc, [
      "method: 'POST'",
      "method: 'PATCH'",
      "method: 'DELETE'",
      'method: "POST"',
      'method: "PATCH"',
      'method: "DELETE"',
    ]);
  });

  it('passengers step renders passengers, rooming, labels and empty states', () => {
    contains(stepSrc, [
      'Passengers & Rooming',
      'Read only',
      'Edit in Classic Builder',
      '>Passengers<',
      '>Rooming<',
      'No passengers added yet.',
      'No rooming list created yet.',
      'passengers.map(',
      'roomingGroups.map(',
      'p.fullName',
      'p.passportNumber',
      'g.occupancyType',
      'g.passengers.join(',
    ]);
  });

  it('passengers step is strictly read-only — no mutation affordances', () => {
    excludes(stepSrc, [
      'fetch(',
      'onClick',
      'useState',
      'method:',
      '<button',
      '<input',
      '<textarea',
      'Add passenger',
      'Delete',
      'Save',
    ]);
  });

  it('orchestrator wires the read-only passengers step with a classic link', () => {
    contains(builderSrc, [
      'PassengersStep',
      'case "passengers"',
      'passengers={quote.passengers}',
      'roomingGroups={quote.roomingGroups}',
      'passengersError={quote.passengersLoadError}',
      'roomingError={quote.roomingLoadError}',
      'classicHref={`/quotes/${quote.id}/classic`}',
    ]);
  });

  it('distinguishes a FAILED GET from a true-empty list (item 9 hardening)', () => {
    // Adapter: tracks load errors separately and only the catch sets them true.
    contains(adapterSrc, [
      'passengersLoadError',
      'roomingLoadError',
      'passengersLoadError = true',
      'roomingLoadError = true',
      'passengersLoadError: asBool(safeRaw.passengersLoadError)',
    ]);
    // Types expose the flags.
    contains(typesSrc, ['passengersLoadError?: boolean', 'roomingLoadError?: boolean']);
    // Step shows a non-blocking warning that takes precedence over the empty state.
    contains(stepSrc, [
      'function LoadWarning',
      'passengersError ? (',
      'roomingError ? (',
      'Couldn’t load',
    ]);
  });

  it('demo data provides passengers + rooming + the step so empty/non-empty states render', () => {
    contains(demoSrc, [
      'passengers: [',
      'roomingGroups: [',
      "id: \"passengers\"",
      'passengers: [],',
      'roomingGroups: [],',
    ]);
  });
});
