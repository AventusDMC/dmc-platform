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

  it('passenger PII editing — edit/save/cancel exist; NO add/delete/rooming/pax-count controls', () => {
    // Passenger edit affordances present.
    contains(stepSrc, [
      'PassengerEditForm',
      'onUpdatePassenger',
      'Limited editing',
      'setEditing(true)',
      'First name',
      'Last name',
      'Passport expiry',
      'Date of birth',
      "type=\"date\"",
      'Saving…',
      'Cancel',
      "role=\"alert\"", // inline error
    ]);
    // No passenger add/delete, no pax/room-count/FOC/pricing edits in the step.
    // (Rooming ASSIGNMENT add/remove is allowed and tested separately.)
    excludes(stepSrc, [
      'Delete passenger',
      'onUpdateRooming',
      'createRoomingGroup',
      'deleteRoomingGroup',
      'Delete room',
      'Add room',
      'setRoomType',
      'setOccupancy',
      'roomCount',
      'Single supplement',
      'singleSupplement',
      'totalCost',
      'totalSell',
    ]);
  });

  it('rooming ASSIGNMENT editing only — add/remove existing passenger; NO group/type/occupancy/count edits', () => {
    contains(stepSrc, [
      'onAssign',
      'onUnassign',
      'assignedPassengers',
      'Add passenger', // the add-to-room select placeholder
      'Rooming assignment only',
      'Room counts, room types, occupancy, and pricing are managed in Classic',
      'available', // filters passengers not already in this room
      'Remove ${p.name}',
      'roomingEditable',
    ]);
    // Rooming edits are limited to assignment — NOT group lifecycle / type / occupancy / counts.
    excludes(stepSrc, [
      'createRoomingGroup',
      'deleteRoomingGroup',
      'Delete room',
      'Add room',
      'New room',
      'setRoomType',
      'setOccupancy',
      'setGuide',
      'setLeader',
      'roomCount',
      'Single supplement',
      'singleSupplement',
    ]);
  });

  it('orchestrator wires passenger-edit + rooming-assignment + classic link', () => {
    contains(builderSrc, [
      'PassengersStep',
      'case "passengers"',
      'passengers={quote.passengers}',
      'roomingGroups={quote.roomingGroups}',
      'passengersError={quote.passengersLoadError}',
      'roomingError={quote.roomingLoadError}',
      'onUpdatePassenger={onUpdatePassenger}',
      'onAssignRoom={onAssignRoom}',
      'onUnassignRoom={onUnassignRoom}',
      'classicHref={`/quotes/${quote.id}/classic`}',
    ]);
  });

  it('rooming assignment uses ONLY the existing assignment POST/DELETE endpoints (gated, pricing-inert)', () => {
    const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
    contains(clientSrc, [
      'handleAssignRoom',
      'handleUnassignRoom',
      '/api/quotes/${quote.id}/rooming/${roomingGroupId}/assignments',
      '/api/quotes/${quote.id}/rooming/${roomingGroupId}/assignments/${passengerId}',
      'method: "POST"',
      'method: "DELETE"',
      'quotePassengerId: passengerId',
      'onAssignRoom={canEditRooming ? handleAssignRoom : undefined}',
      'onUnassignRoom={canEditRooming ? handleUnassignRoom : undefined}',
    ]);
    // No room create/edit/delete or pricing writes.
    excludes(clientSrc, ['createRoomingGroup', 'deleteRoomingGroup', 'recalculateQuoteTotals', 'roomCount', 'singleSupplement']);
  });

  it('passenger edit uses the EXISTING PATCH passengers endpoint (pricing-inert, no recalc)', () => {
    const clientSrc = readFileSync(
      new URL('./builder-v2/builder-v2-client.tsx', import.meta.url),
      'utf8',
    );
    contains(clientSrc, [
      'handleUpdatePassenger',
      '/api/quotes/${quote.id}/passengers/${passengerId}',
      'method: "PATCH"',
      'router.refresh()',
      'onUpdatePassenger={canEditPassengers ? handleUpdatePassenger : undefined}',
    ]);
    // No pax-count / room-count / pricing writes anywhere in the client.
    excludes(clientSrc, ['roomCount', 'singleSupplement', 'recalculateQuoteTotals']);
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

  it('gates the passenger Edit affordance by role (reuses existing session signal; mirrors backend)', () => {
    const pageSrc = readFileSync(new URL('./builder-v2/page.tsx', import.meta.url), 'utf8');
    const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
    // Page reuses the existing session-role helper and mirrors the backend allow-list.
    contains(pageSrc, [
      'readSessionActor',
      'hasRequiredRole',
      '["admin", "operations", "viewer"]',
      'canEditPassengers',
      'canEditPassengers={canEditPassengers}',
      'canEditRooming',
      'canEditRooming={canEditRooming}',
    ]);
    // Client only wires the mutation callbacks when the role is allowed.
    contains(clientSrc, [
      'canEditPassengers',
      'onUpdatePassenger={canEditPassengers ? handleUpdatePassenger : undefined}',
      'canEditRooming',
      'onAssignRoom={canEditRooming ? handleAssignRoom : undefined}',
    ]);
  });

  it('adapter surfaces assigned passenger ids for rooming (needed to unassign/filter)', () => {
    contains(adapterSrc, ['assignedPassengers', 'a.quotePassenger?.id']);
    contains(typesSrc, ['assignedPassengers: { id: string; name: string }[]']);
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
