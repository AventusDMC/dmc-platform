import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  isTransportDayItem,
  transportDayLabel,
  resolveDayTransportAndVisits,
} from '../../../lib/quote-v2-itinerary-transport';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const adapterSrc = read('../../../lib/quote-v2-adapter.ts');

describe('Quote Builder V2 — Day transport display (PR #572)', () => {
  // ---- 1. day item WITH appliedVehicleRate still shows transport assigned ----
  it('a vehicle-rate transport item shows transport assigned (route name preferred)', () => {
    const s = { appliedVehicleRate: { routeName: 'Amman → Amman', vehicle: { name: 'Sedan' } } };
    assert.equal(isTransportDayItem(s), true);
    assert.equal(transportDayLabel(s), 'Amman → Amman');
    const { transportAssigned } = resolveDayTransportAndVisits([s]);
    assert.equal(transportAssigned, 'Amman → Amman');
  });

  it('falls back to vehicle name when no route name', () => {
    const s = { appliedVehicleRate: { routeName: null, vehicle: { name: 'Coaster' } } };
    assert.equal(transportDayLabel(s), 'Coaster');
  });

  // ---- 2. service type TRANSPORT but NO appliedVehicleRate shows transport assigned ----
  it('a TRANSPORT-taxonomy item without a vehicle rate shows transport assigned (service name)', () => {
    const s = { service: { name: 'Airport Transfer', serviceType: { code: 'TRANSPORT' } }, appliedVehicleRate: null };
    assert.equal(isTransportDayItem(s), true);
    assert.equal(transportDayLabel(s), 'Airport Transfer');
    const { transportAssigned } = resolveDayTransportAndVisits([s]);
    assert.equal(transportAssigned, 'Airport Transfer');
  });

  // ---- 3. airport transfer without a vehicle rate does NOT appear as a visit ----
  it('a TRANSPORT item (no vehicle rate) is excluded from visits', () => {
    const transfer = { service: { name: 'Airport Transfer', serviceType: { code: 'TRANSPORT' } } };
    const { visits } = resolveDayTransportAndVisits([transfer]);
    assert.deepEqual(visits, []);
  });

  // ---- 4. non-transport items still appear as visits ----
  it('non-transport items still appear as visits; hotels never do', () => {
    const activity = { service: { name: 'Petra Visit', serviceType: { code: 'ACTIVITY' } } };
    const entrance = { activityName: 'Jerash Entrance' };
    const hotel = { hotel: { name: 'Movenpick' } };
    const { visits, transportAssigned } = resolveDayTransportAndVisits([activity, entrance, hotel]);
    assert.deepEqual(visits, ['Petra Visit', 'Jerash Entrance']);
    assert.equal(transportAssigned, null);
  });

  // ---- 5. the d29e6bbf… Day 1 pattern: hotel + QAIA→Amman airport transfer (no rate) ----
  it('reproduces Q-2026-0080 Day 1: airport transfer shows as transport, not a visit', () => {
    // Mirrors the real day payload: an imported hotel + an AIRPORT_TRANSFER
    // (serviceType.code TRANSPORT) with NO appliedVehicleRate, QAIA → Amman.
    const day1 = [
      { hotel: { name: 'Imported Hotel' } },
      { service: { name: 'Airport Transfer', serviceType: { code: 'TRANSPORT' } }, appliedVehicleRate: null },
    ];
    const { transportAssigned, visits } = resolveDayTransportAndVisits(day1);
    assert.equal(transportAssigned, 'Airport Transfer'); // was null (No transport assigned) before the fix
    assert.deepEqual(visits, []); // the transfer must NOT leak into visits
  });

  it('null/empty day services resolve safely', () => {
    assert.equal(isTransportDayItem(null), false);
    assert.equal(isTransportDayItem(undefined), false);
    const { transportAssigned, visits } = resolveDayTransportAndVisits([null, undefined]);
    assert.equal(transportAssigned, null);
    assert.deepEqual(visits, []);
  });

  // ---- adapter wiring: mapItinerary delegates to the pure resolver ----
  it('adapter mapItinerary uses resolveDayTransportAndVisits (not the old vehicle-rate-only check)', () => {
    assert.ok(
      adapterSrc.includes('resolveDayTransportAndVisits(items.map((di) => di.quoteService))'),
      'adapter should delegate per-day transport/visits to the pure resolver',
    );
    assert.ok(
      !adapterSrc.includes('items.find((di) => di.quoteService?.appliedVehicleRate)'),
      'adapter should no longer detect day transport by appliedVehicleRate alone',
    );
  });
});
