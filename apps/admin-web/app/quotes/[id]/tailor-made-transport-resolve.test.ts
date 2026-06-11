import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TRANSPORT_DEFAULT_MARKUP,
  computeTransportSell,
  resolveTransportPlan,
  type TransportServiceTypeOption,
} from './tailor-made-transport-resolve';
import type { RouteOption } from '../../lib/routes';

function place(name: string, city = name) {
  return { id: name, name, city, country: 'Jordan' } as RouteOption['fromPlace'];
}
function route(partial: Partial<RouteOption> & { id: string; from: string; to: string }): RouteOption {
  return {
    id: partial.id,
    fromPlaceId: partial.from,
    toPlaceId: partial.to,
    name: partial.name ?? `${partial.from} -> ${partial.to}`,
    normalizedKey: partial.normalizedKey ?? `${partial.from} ${partial.to}`.toLowerCase(),
    routeType: partial.routeType ?? 'TRANSFER_ROUTE',
    durationMinutes: null,
    distanceKm: null,
    notes: null,
    isActive: partial.isActive ?? true,
    fromPlace: place(partial.from),
    toPlace: place(partial.to),
    canonicalRouteType: partial.canonicalRouteType ?? 'TRANSFER_ROUTE',
  } as RouteOption;
}

const SERVICE_TYPES: TransportServiceTypeOption[] = [
  { id: 'st-airport', name: 'Airport Transfer', code: 'AIRPORT_TRANSFER' },
  { id: 'st-p2p', name: 'Point to Point', code: 'POINT_TO_POINT' },
  { id: 'st-daily', name: 'Daily Full Day', code: 'DAILY_FULL_DAY' },
  { id: 'st-border', name: 'Border Transfer', code: 'BORDER' },
];

const ROUTES: RouteOption[] = [
  route({ id: 'r-qaia-amman', from: 'Queen Alia International Airport', to: 'Amman', name: 'QAIA Airport -> Amman' }),
  route({ id: 'r-amman-petra', from: 'Amman', to: 'Petra' }),
  route({ id: 'r-petra-wadirum', from: 'Petra', to: 'Wadi Rum' }),
  route({ id: 'r-wadirum-deadsea', from: 'Wadi Rum', to: 'Dead Sea' }),
  route({ id: 'r-amman-amman', from: 'Amman', to: 'Amman', normalizedKey: 'amman amman' }),
];

describe('R.6B-0 — resolveTransportPlan', () => {
  it('D1 arrival QAIA → Amman resolves the airport route + AIRPORT_TRANSFER type', () => {
    const plan = resolveTransportPlan(
      { dayNumber: 1, suggestedTransportType: 'ARRIVAL_TRANSFER', origin: 'QAIA', destination: 'Amman', routeLabel: 'QAIA → Amman', pricingModeSuggestion: 'POINT_TO_POINT' },
      ROUTES,
      SERVICE_TYPES,
    );
    assert.equal(plan.status, 'OK');
    assert.equal(plan.routeId, 'r-qaia-amman');
    assert.equal(plan.serviceTypeId, 'st-airport');
    assert.equal(plan.pricingModeHint, 'POINT_TO_POINT');
  });

  it('D8 departure Dead Sea → QAIA resolves the airport route (departure direction)', () => {
    const routes = [...ROUTES, route({ id: 'r-deadsea-qaia', from: 'Dead Sea', to: 'Queen Alia International Airport', name: 'Dead Sea -> QAIA Airport' })];
    const plan = resolveTransportPlan(
      { dayNumber: 8, suggestedTransportType: 'DEPARTURE_TRANSFER', origin: 'Dead Sea', destination: 'Airport', routeLabel: 'Dead Sea → Airport', pricingModeSuggestion: 'POINT_TO_POINT' },
      routes,
      SERVICE_TYPES,
    );
    assert.equal(plan.status, 'OK');
    assert.equal(plan.routeId, 'r-deadsea-qaia');
    assert.equal(plan.serviceTypeId, 'st-airport');
  });

  it('D2 same-base day-trip (Amman/Jerash/Amman) → daily-disposal route + DAILY_FULL_DAY type', () => {
    const plan = resolveTransportPlan(
      { dayNumber: 2, suggestedTransportType: 'TOURING_FULL_DAY', origin: 'Amman', destination: 'Amman', routeLabel: 'Amman / Jerash / Amman', pricingModeSuggestion: 'FULL_DAY' },
      ROUTES,
      SERVICE_TYPES,
    );
    assert.equal(plan.status, 'OK');
    assert.equal(plan.routeId, 'r-amman-amman');
    assert.equal(plan.serviceTypeId, 'st-daily');
    assert.equal(plan.pricingModeHint, 'FULL_DAY');
  });

  it('D4 intercity touring leg (Petra → Wadi Rum) → directional route + general transfer type', () => {
    const plan = resolveTransportPlan(
      { dayNumber: 4, suggestedTransportType: 'TOURING_FULL_DAY', origin: 'Petra', destination: 'Wadi Rum', routeLabel: 'Petra / Wadi Rum', pricingModeSuggestion: 'FULL_DAY' },
      ROUTES,
      SERVICE_TYPES,
    );
    assert.equal(plan.status, 'OK');
    assert.equal(plan.routeId, 'r-petra-wadirum');
    assert.equal(plan.serviceTypeId, 'st-p2p');
  });

  it('intercity leg matches a reverse-direction catalog route', () => {
    const plan = resolveTransportPlan(
      { dayNumber: 4, suggestedTransportType: 'TOURING_FULL_DAY', origin: 'Wadi Rum', destination: 'Petra' },
      ROUTES,
      SERVICE_TYPES,
    );
    assert.equal(plan.status, 'OK');
    assert.equal(plan.routeId, 'r-petra-wadirum'); // stored Petra->Wadi Rum, matched in reverse
  });

  it('returns NO_ROUTE when no route matches the leg', () => {
    const plan = resolveTransportPlan(
      { dayNumber: 4, suggestedTransportType: 'TOURING_FULL_DAY', origin: 'Aqaba', destination: 'Salt' },
      [route({ id: 'r-x', from: 'Amman', to: 'Petra' })],
      SERVICE_TYPES,
    );
    assert.equal(plan.status, 'NO_ROUTE');
    assert.equal(plan.routeId, null);
  });

  it('never selects a niche (Border) service type for an intercity leg', () => {
    const plan = resolveTransportPlan(
      { dayNumber: 4, suggestedTransportType: 'TOURING_FULL_DAY', origin: 'Petra', destination: 'Wadi Rum' },
      ROUTES,
      [{ id: 'st-border', name: 'Border Transfer', code: 'BORDER' }, { id: 'st-p2p', name: 'Point to Point', code: 'POINT_TO_POINT' }],
    );
    assert.equal(plan.serviceTypeId, 'st-p2p');
  });

  it('NONE day yields NO_ROUTE with a no-transport reason', () => {
    const plan = resolveTransportPlan({ dayNumber: 6, suggestedTransportType: 'NONE' }, ROUTES, SERVICE_TYPES);
    assert.equal(plan.status, 'NO_ROUTE');
    assert.match(plan.reason, /no transport/i);
  });

  it('T.2: arrival/departure legs carry a POINT_TO_POINT fallback service type', () => {
    const arrival = resolveTransportPlan(
      { dayNumber: 1, suggestedTransportType: 'ARRIVAL_TRANSFER', origin: 'QAIA', destination: 'Amman' },
      ROUTES,
      SERVICE_TYPES,
    );
    assert.equal(arrival.serviceTypeId, 'st-airport');
    assert.equal(arrival.fallbackServiceTypeId, 'st-p2p', 'airport leg falls back to point-to-point');
    assert.equal(arrival.fallbackServiceTypeName, 'Point to Point');

    const departure = resolveTransportPlan(
      { dayNumber: 8, suggestedTransportType: 'DEPARTURE_TRANSFER', origin: 'Dead Sea', destination: 'Airport' },
      [...ROUTES, route({ id: 'r-deadsea-qaia', from: 'Dead Sea', to: 'Queen Alia International Airport', name: 'Dead Sea -> QAIA Airport' })],
      SERVICE_TYPES,
    );
    assert.equal(departure.serviceTypeId, 'st-airport');
    assert.equal(departure.fallbackServiceTypeId, 'st-p2p', 'departure leg falls back to point-to-point');
  });

  it('T.2: intercity touring + same-base legs have NO fallback (primary only)', () => {
    const intercity = resolveTransportPlan(
      { dayNumber: 4, suggestedTransportType: 'TOURING_FULL_DAY', origin: 'Petra', destination: 'Wadi Rum' },
      ROUTES,
      SERVICE_TYPES,
    );
    assert.equal(intercity.fallbackServiceTypeId, null);

    const sameBase = resolveTransportPlan(
      { dayNumber: 2, suggestedTransportType: 'TOURING_FULL_DAY', origin: 'Amman', destination: 'Amman' },
      ROUTES,
      SERVICE_TYPES,
    );
    assert.equal(sameBase.fallbackServiceTypeId, null);
  });

  it('T.2: no duplicate fallback when AIRPORT_TRANSFER is the only/general transfer type', () => {
    // When the catalog has no distinct point-to-point type, airportTransferType
    // and generalTransferType resolve to the same option → fallback must be null.
    const onlyAirport: TransportServiceTypeOption[] = [{ id: 'st-airport', name: 'Airport Transfer', code: 'AIRPORT_TRANSFER' }];
    const plan = resolveTransportPlan(
      { dayNumber: 1, suggestedTransportType: 'ARRIVAL_TRANSFER', origin: 'QAIA', destination: 'Amman' },
      ROUTES,
      onlyAirport,
    );
    assert.equal(plan.serviceTypeId, 'st-airport');
    assert.equal(plan.fallbackServiceTypeId, null, 'no fallback when it would equal the primary');
  });

  it('T.2: NO_ROUTE plans expose null fallback fields', () => {
    const plan = resolveTransportPlan(
      { dayNumber: 4, suggestedTransportType: 'TOURING_FULL_DAY', origin: 'Aqaba', destination: 'Salt' },
      [route({ id: 'r-x', from: 'Amman', to: 'Petra' })],
      SERVICE_TYPES,
    );
    assert.equal(plan.status, 'NO_ROUTE');
    assert.equal(plan.fallbackServiceTypeId, null);
    assert.equal(plan.fallbackServiceTypeName, null);
  });

  it('markup constant is 20 and sell = cost × 1.20 rounded to cents', () => {
    assert.equal(TRANSPORT_DEFAULT_MARKUP, 20);
    assert.equal(computeTransportSell(100), 120);
    assert.equal(computeTransportSell(4300), 5160);
  });
});
