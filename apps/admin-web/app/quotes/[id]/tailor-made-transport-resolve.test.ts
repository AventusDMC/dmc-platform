import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TRANSPORT_DEFAULT_MARKUP,
  computeTransportSell,
  resolveTransportPlan,
  classifyPackageTransportPolicy,
  buildTransportAddOnPreview,
  cleanVehicleClassName,
  PACKAGE_FULL_DAY_MIN_TOURING_DAYS,
  type TransportServiceTypeOption,
  type TransportSuggestionLike,
  type TransportAddOnRate,
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

// Curated-template day transport classifications (only the field the policy reads).
const tt = (t: TransportSuggestionLike['suggestedTransportType']) => ({ suggestedTransportType: t });
const DAYS_4 = [tt('ARRIVAL_TRANSFER'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'), tt('DEPARTURE_TRANSFER')];
const DAYS_5 = [tt('ARRIVAL_TRANSFER'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'), tt('DEPARTURE_TRANSFER')];
const DAYS_6 = [tt('ARRIVAL_TRANSFER'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'), tt('DEPARTURE_TRANSFER')];
const DAYS_7 = [tt('ARRIVAL_TRANSFER'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'), tt('DEPARTURE_TRANSFER')];

describe('T.5B — classifyPackageTransportPolicy', () => {
  it('1. 4-day template → count 2, usePackageFullDay false (regular route rates)', () => {
    const p = classifyPackageTransportPolicy(DAYS_4);
    assert.equal(p.touringFullDayCount, 2);
    assert.equal(p.usePackageFullDay, false);
  });

  it('2. 5-day template → count 3, usePackageFullDay true', () => {
    const p = classifyPackageTransportPolicy(DAYS_5);
    assert.equal(p.touringFullDayCount, 3);
    assert.equal(p.usePackageFullDay, true);
  });

  it('3. 6-day template → count 4, usePackageFullDay true', () => {
    const p = classifyPackageTransportPolicy(DAYS_6);
    assert.equal(p.touringFullDayCount, 4);
    assert.equal(p.usePackageFullDay, true);
  });

  it('4. 7-day template → count 5, usePackageFullDay true', () => {
    const p = classifyPackageTransportPolicy(DAYS_7);
    assert.equal(p.touringFullDayCount, 5);
    assert.equal(p.usePackageFullDay, true);
  });

  it('5/6. arrival, departure and NONE/leisure days are excluded from the count', () => {
    const p = classifyPackageTransportPolicy([
      tt('ARRIVAL_TRANSFER'), tt('DEPARTURE_TRANSFER'), tt('NONE'), tt('NONE'),
    ]);
    assert.equal(p.touringFullDayCount, 0);
    assert.equal(p.usePackageFullDay, false);
  });

  it('7/8. same-base AND intercity touring days both count (both classify TOURING_FULL_DAY)', () => {
    // Amman/Jerash/Amman (same-base) + Amman/Madaba/Nebo/Petra (intercity) + Wadi Rum/Dead Sea (intercity).
    const p = classifyPackageTransportPolicy([
      tt('ARRIVAL_TRANSFER'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'),
    ]);
    assert.equal(p.touringFullDayCount, 3);
    assert.equal(p.usePackageFullDay, true);
  });

  it('threshold boundary: exactly 2 → false, exactly 3 → true', () => {
    assert.equal(classifyPackageTransportPolicy([tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY')]).usePackageFullDay, false);
    assert.equal(classifyPackageTransportPolicy([tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY'), tt('TOURING_FULL_DAY')]).usePackageFullDay, true);
    assert.equal(PACKAGE_FULL_DAY_MIN_TOURING_DAYS, 3);
  });

  it('empty / null input is safe (count 0, false)', () => {
    assert.equal(classifyPackageTransportPolicy([]).touringFullDayCount, 0);
    assert.equal(classifyPackageTransportPolicy(null).usePackageFullDay, false);
    assert.equal(classifyPackageTransportPolicy(undefined).touringFullDayCount, 0);
  });

  it('deterministic + carries an admin reason (never client text)', () => {
    const a = classifyPackageTransportPolicy(DAYS_6);
    const b = classifyPackageTransportPolicy(DAYS_6);
    assert.equal(a.reason, b.reason);
    assert.match(a.reason, /full touring days/i);
  });
});

describe('T.5D-1 — resolveTransportPlan package full-day pricing basis', () => {
  const touring = (origin: string, destination: string, routeLabel?: string): TransportSuggestionLike => ({
    dayNumber: 3, suggestedTransportType: 'TOURING_FULL_DAY', origin, destination, routeLabel, pricingModeSuggestion: 'FULL_DAY',
  });

  it('1. usePackageFullDay false: intercity touring day stays ROUTE_RATE on its real route', () => {
    const plan = resolveTransportPlan(touring('Petra', 'Wadi Rum', 'Petra / Wadi Rum'), ROUTES, SERVICE_TYPES, { usePackageFullDay: false });
    assert.equal(plan.pricingBasis, 'ROUTE_RATE');
    assert.equal(plan.routeId, 'r-petra-wadirum');
    assert.equal(plan.serviceTypeId, 'st-p2p');
    assert.equal(plan.routeLabel, 'Petra / Wadi Rum');
  });

  it('2-4. usePackageFullDay true: touring day → PACKAGE_FULL_DAY on the disposal route + DAILY_FULL_DAY, real label kept', () => {
    const plan = resolveTransportPlan(touring('Petra', 'Wadi Rum', 'Petra / Wadi Rum'), ROUTES, SERVICE_TYPES, { usePackageFullDay: true });
    assert.equal(plan.pricingBasis, 'PACKAGE_FULL_DAY');
    assert.equal(plan.routeId, 'r-amman-amman', 'prices against the canonical Amman-disposal route');
    assert.equal(plan.serviceTypeId, 'st-daily', 'DAILY_FULL_DAY service type');
    assert.equal(plan.routeLabel, 'Petra / Wadi Rum', 'real day route label preserved (never the disposal route name)');
  });

  it('package mode composes a real label from origin/destination when routeLabel is absent (never disposal name)', () => {
    const plan = resolveTransportPlan(
      { dayNumber: 4, suggestedTransportType: 'TOURING_FULL_DAY', origin: 'Wadi Rum', destination: 'Dead Sea' },
      ROUTES, SERVICE_TYPES, { usePackageFullDay: true },
    );
    assert.equal(plan.pricingBasis, 'PACKAGE_FULL_DAY');
    assert.equal(plan.routeLabel, 'Wadi Rum / Dead Sea');
    assert.notEqual(plan.routeLabel, 'Amman -> Amman');
  });

  it('5. arrival/departure unchanged even in package mode; basis is the transfer label', () => {
    const arrival = resolveTransportPlan(
      { dayNumber: 1, suggestedTransportType: 'ARRIVAL_TRANSFER', origin: 'QAIA', destination: 'Amman', routeLabel: 'QAIA → Amman' },
      ROUTES, SERVICE_TYPES, { usePackageFullDay: true },
    );
    assert.equal(arrival.pricingBasis, 'ARRIVAL_TRANSFER');
    assert.equal(arrival.routeId, 'r-qaia-amman');
    assert.equal(arrival.serviceTypeId, 'st-airport');
    const departure = resolveTransportPlan(
      { dayNumber: 8, suggestedTransportType: 'DEPARTURE_TRANSFER', origin: 'Dead Sea', destination: 'Airport', routeLabel: 'Dead Sea → Airport' },
      [...ROUTES, route({ id: 'r-deadsea-qaia', from: 'Dead Sea', to: 'Queen Alia International Airport', name: 'Dead Sea -> QAIA Airport' })],
      SERVICE_TYPES, { usePackageFullDay: true },
    );
    assert.equal(departure.pricingBasis, 'DEPARTURE_TRANSFER');
  });

  it('6. NONE/leisure day → NO_TRANSPORT basis, unchanged', () => {
    const plan = resolveTransportPlan({ dayNumber: 5, suggestedTransportType: 'NONE' }, ROUTES, SERVICE_TYPES, { usePackageFullDay: true });
    assert.equal(plan.status, 'NO_ROUTE');
    assert.equal(plan.pricingBasis, 'NO_TRANSPORT');
  });

  it('7. same-base Amman/Jerash/Amman: full-day disposal in both modes (no regress), basis flips with the package flag', () => {
    const sameBase = (opts: { usePackageFullDay: boolean }) => resolveTransportPlan(
      { dayNumber: 2, suggestedTransportType: 'TOURING_FULL_DAY', origin: 'Amman', destination: 'Amman', routeLabel: 'Amman / Jerash / Amman', pricingModeSuggestion: 'FULL_DAY' },
      ROUTES, SERVICE_TYPES, opts,
    );
    const regular = sameBase({ usePackageFullDay: false });
    assert.equal(regular.routeId, 'r-amman-amman');
    assert.equal(regular.serviceTypeId, 'st-daily');
    assert.equal(regular.pricingBasis, 'ROUTE_RATE');
    assert.equal(regular.routeLabel, 'Amman / Jerash / Amman');
    const pkg = sameBase({ usePackageFullDay: true });
    assert.equal(pkg.routeId, 'r-amman-amman');
    assert.equal(pkg.serviceTypeId, 'st-daily');
    assert.equal(pkg.pricingBasis, 'PACKAGE_FULL_DAY');
    assert.equal(pkg.routeLabel, 'Amman / Jerash / Amman');
  });

  it('default (no options arg) preserves pre-T.5D behaviour + basis ROUTE_RATE for touring', () => {
    const plan = resolveTransportPlan(touring('Petra', 'Wadi Rum', 'Petra / Wadi Rum'), ROUTES, SERVICE_TYPES);
    assert.equal(plan.pricingBasis, 'ROUTE_RATE');
    assert.equal(plan.routeId, 'r-petra-wadirum');
    assert.equal(plan.serviceTypeId, 'st-p2p');
  });
});

// ---------------------------------------------------------------------------
// T.5D-2 — PRICE PREVIEW wiring: the panel feeds policy.usePackageFullDay into
// resolveTransportPlan, so each day's resolved (routeId, serviceTypeId) — and
// therefore its priced rate — follows the package policy. These tests model that
// end-to-end at the pure layer: classify → resolve every day → look the priced
// net up in a fixture rate table that mirrors the -4gu9 pax-2 Sedan rates, and
// assert both the per-day pricing basis sequence AND the package net total.
// (Apply is NOT wired to the policy yet — that's T.5D-3.)
// ---------------------------------------------------------------------------
describe('T.5D-2 — price preview uses package full-day basis (pax-2 sedan net totals)', () => {
  // Routes extended with the legs the curated 4/5/6/7-day packages use.
  const PREVIEW_ROUTES: RouteOption[] = [
    ...ROUTES,
    route({ id: 'r-petra-deadsea', from: 'Petra', to: 'Dead Sea' }),
    route({ id: 'r-deadsea-qaia', from: 'Dead Sea', to: 'Queen Alia International Airport', name: 'Dead Sea -> QAIA Airport' }),
  ];

  // Net JOD per (routeId|serviceTypeId), pax-2 Sedan — mirrors the documented
  // -4gu9 rates: arrival 20, Amman→Petra 90, Petra→Dead Sea 100, departure 35,
  // and the canonical Amman-disposal DAILY_FULL_DAY Sedan 75.
  const NET: Record<string, number> = {
    'r-qaia-amman|st-airport': 20,
    'r-amman-petra|st-p2p': 90,
    'r-petra-deadsea|st-p2p': 100,
    'r-deadsea-qaia|st-airport': 35,
    'r-amman-amman|st-daily': 75,
  };
  const netFor = (plan: ReturnType<typeof resolveTransportPlan>) => {
    const key = `${plan.routeId}|${plan.serviceTypeId}`;
    const value = NET[key];
    assert.ok(value !== undefined, `no fixture net rate for resolved ${key}`);
    return value;
  };

  type Day = {
    type: TransportSuggestionLike['suggestedTransportType'];
    origin?: string;
    destination?: string;
    routeLabel?: string;
  };
  const ARRIVAL: Day = { type: 'ARRIVAL_TRANSFER', origin: 'QAIA', destination: 'Amman', routeLabel: 'QAIA → Amman' };
  const DEPARTURE: Day = { type: 'DEPARTURE_TRANSFER', origin: 'Dead Sea', destination: 'Airport', routeLabel: 'Dead Sea → Airport' };
  const AMMAN_PETRA: Day = { type: 'TOURING_FULL_DAY', origin: 'Amman', destination: 'Petra', routeLabel: 'Amman / Petra' };
  const PETRA_DEADSEA: Day = { type: 'TOURING_FULL_DAY', origin: 'Petra', destination: 'Dead Sea', routeLabel: 'Petra / Dead Sea' };
  // Generic touring day — in package mode every touring day prices at the
  // disposal full-day rate regardless of its real legs.
  const TOUR: Day = { type: 'TOURING_FULL_DAY', origin: 'Petra', destination: 'Wadi Rum', routeLabel: 'Petra / Wadi Rum' };

  // Resolve a whole package the way the panel does: classify all days, then feed
  // policy.usePackageFullDay into every per-day resolve.
  const pricePackage = (days: Day[]) => {
    const policy = classifyPackageTransportPolicy(days.map((d) => tt(d.type)));
    const plans = days.map((d, i) =>
      resolveTransportPlan(
        { dayNumber: i + 1, suggestedTransportType: d.type, origin: d.origin, destination: d.destination, routeLabel: d.routeLabel },
        PREVIEW_ROUTES,
        SERVICE_TYPES,
        { usePackageFullDay: policy.usePackageFullDay },
      ),
    );
    const bases = plans.map((p) => p.pricingBasis);
    const total = plans.reduce((sum, p) => sum + netFor(p), 0);
    return { policy, plans, bases, total };
  };

  it('2/8. 4-day: usePackageFullDay false → touring days stay ROUTE_RATE, total 245 JOD', () => {
    const { policy, bases, total } = pricePackage([ARRIVAL, AMMAN_PETRA, PETRA_DEADSEA, DEPARTURE]);
    assert.equal(policy.usePackageFullDay, false);
    assert.deepEqual(bases, ['ARRIVAL_TRANSFER', 'ROUTE_RATE', 'ROUTE_RATE', 'DEPARTURE_TRANSFER']);
    assert.equal(total, 245); // 20 + 90 + 100 + 35
  });

  it('3/8. 5-day: usePackageFullDay true → all 3 touring days PACKAGE_FULL_DAY, total 280 JOD', () => {
    const { policy, bases, total } = pricePackage([ARRIVAL, TOUR, TOUR, TOUR, DEPARTURE]);
    assert.equal(policy.usePackageFullDay, true);
    assert.deepEqual(bases, ['ARRIVAL_TRANSFER', 'PACKAGE_FULL_DAY', 'PACKAGE_FULL_DAY', 'PACKAGE_FULL_DAY', 'DEPARTURE_TRANSFER']);
    assert.equal(total, 280); // 20 + 3×75 + 35
  });

  it('4/8. 6-day: usePackageFullDay true → all 4 touring days PACKAGE_FULL_DAY, total 355 JOD', () => {
    const { policy, bases, total } = pricePackage([ARRIVAL, TOUR, TOUR, TOUR, TOUR, DEPARTURE]);
    assert.equal(policy.usePackageFullDay, true);
    assert.deepEqual(bases, ['ARRIVAL_TRANSFER', 'PACKAGE_FULL_DAY', 'PACKAGE_FULL_DAY', 'PACKAGE_FULL_DAY', 'PACKAGE_FULL_DAY', 'DEPARTURE_TRANSFER']);
    assert.equal(total, 355); // 20 + 4×75 + 35
  });

  it('5/8. 7-day: usePackageFullDay true → all 5 touring days PACKAGE_FULL_DAY, total 430 JOD', () => {
    const { policy, bases, total } = pricePackage([ARRIVAL, TOUR, TOUR, TOUR, TOUR, TOUR, DEPARTURE]);
    assert.equal(policy.usePackageFullDay, true);
    assert.deepEqual(bases, ['ARRIVAL_TRANSFER', 'PACKAGE_FULL_DAY', 'PACKAGE_FULL_DAY', 'PACKAGE_FULL_DAY', 'PACKAGE_FULL_DAY', 'PACKAGE_FULL_DAY', 'DEPARTURE_TRANSFER']);
    assert.equal(total, 430); // 20 + 5×75 + 35
  });

  it('6. arrival/departure keep transfer basis under package policy (not full-day)', () => {
    const { plans } = pricePackage([ARRIVAL, TOUR, TOUR, TOUR, DEPARTURE]);
    assert.equal(plans[0].pricingBasis, 'ARRIVAL_TRANSFER');
    assert.equal(plans[0].serviceTypeId, 'st-airport');
    assert.equal(plans[4].pricingBasis, 'DEPARTURE_TRANSFER');
    assert.equal(plans[4].serviceTypeId, 'st-airport');
  });

  it('7. NONE/leisure day in a package still resolves to no transport (no pricing)', () => {
    const policy = classifyPackageTransportPolicy([ARRIVAL, TOUR, TOUR, TOUR, DEPARTURE].map((d) => tt(d.type)));
    const leisure = resolveTransportPlan(
      { dayNumber: 3, suggestedTransportType: 'NONE' },
      PREVIEW_ROUTES,
      SERVICE_TYPES,
      { usePackageFullDay: policy.usePackageFullDay },
    );
    assert.equal(leisure.status, 'NO_ROUTE');
    assert.equal(leisure.pricingBasis, 'NO_TRANSPORT');
  });
});

// ---------------------------------------------------------------------------
// T.5F — buildTransportAddOnPreview (driver overnight + stationary, PREVIEW only)
// ---------------------------------------------------------------------------
describe('T.5F — buildTransportAddOnPreview', () => {
  const RATES: TransportAddOnRate[] = [
    { rateId: 'ov-petra', addOnType: 'DRIVER_OVERNIGHT', name: 'Petra Overnight', unitCost: 15, currency: 'JOD' },
    { rateId: 'ov-rum', addOnType: 'DRIVER_OVERNIGHT', name: 'Wadi Rum Overnight', unitCost: 15, currency: 'JOD' },
    { rateId: 'ov-aqaba', addOnType: 'DRIVER_OVERNIGHT', name: 'Aqaba Overnight', unitCost: 15, currency: 'JOD' },
    { rateId: 'ov-deadsea', addOnType: 'DRIVER_OVERNIGHT', name: 'Dead Sea Overnight', unitCost: 15, currency: 'JOD' },
    { rateId: 'stationary', addOnType: 'STATIONARY_WAITING', name: 'Stationary / Waiting', unitCost: 40, currency: 'JOD' },
  ];
  const STAYS_6D = [
    { city: 'Amman', nights: 2 },
    { city: 'Petra', nights: 1 },
    { city: 'Wadi Rum', nights: 1 },
    { city: 'Dead Sea', nights: 1 },
  ];

  it('1. package-mode Sedan suggests Petra/Wadi Rum overnight (auto cities present)', () => {
    const r = buildTransportAddOnPreview({ usePackageFullDay: true, vehicleName: 'Sedan 2', overnightStays: STAYS_6D, addOnRates: RATES });
    const suggested = r.driverOvernight.filter((l) => l.status === 'suggested').map((l) => l.city);
    assert.deepEqual(suggested, ['Petra', 'Wadi Rum']);
    assert.ok(r.driverOvernight.find((l) => l.city === 'Petra')?.label === 'Driver overnight — Petra');
  });

  it('1b. Aqaba overnight is auto-suggested for an eligible vehicle when present', () => {
    const r = buildTransportAddOnPreview({
      usePackageFullDay: true, vehicleName: 'Mini Van 5',
      overnightStays: [{ city: 'Aqaba', nights: 1 }], addOnRates: RATES,
    });
    assert.equal(r.driverOvernight.length, 1);
    assert.equal(r.driverOvernight[0].status, 'suggested');
    assert.equal(r.driverOvernight[0].label, 'Driver overnight — Aqaba');
    assert.equal(r.suggestedOvernightTotal, 15);
  });

  it('2. Dead Sea is NOT auto-suggested — shown as optional / operator-confirm', () => {
    const r = buildTransportAddOnPreview({ usePackageFullDay: true, vehicleName: 'Sedan 2', overnightStays: STAYS_6D, addOnRates: RATES });
    const deadSea = r.driverOvernight.find((l) => l.city === 'Dead Sea');
    assert.ok(deadSea, 'Dead Sea line present');
    assert.equal(deadSea?.status, 'optional');
  });

  it('3. Amman (base) is excluded entirely', () => {
    const r = buildTransportAddOnPreview({ usePackageFullDay: true, vehicleName: 'Sedan 2', overnightStays: STAYS_6D, addOnRates: RATES });
    assert.equal(r.driverOvernight.some((l) => /amman/i.test(l.city)), false);
  });

  it('4. 4-day / regular-route mode (usePackageFullDay false) shows NO driver overnight', () => {
    const r = buildTransportAddOnPreview({ usePackageFullDay: false, vehicleName: 'Sedan 2', overnightStays: STAYS_6D, addOnRates: RATES });
    assert.equal(r.driverOvernight.length, 0);
    assert.equal(r.suggestedOvernightTotal, 0);
  });

  it('5. bus/coach is NOT eligible for driver overnight (even in package mode)', () => {
    const r = buildTransportAddOnPreview({ usePackageFullDay: true, vehicleName: 'Coaster 17', overnightStays: STAYS_6D, addOnRates: RATES });
    assert.equal(r.eligibleForDriverOvernight, false);
    assert.equal(r.driverOvernight.length, 0);
  });

  it('6. stationary/waiting is an optional add-on for any class (incl. bus), off by default', () => {
    const car = buildTransportAddOnPreview({ usePackageFullDay: true, vehicleName: 'Sedan 2', overnightStays: STAYS_6D, addOnRates: RATES });
    const bus = buildTransportAddOnPreview({ usePackageFullDay: true, vehicleName: 'Coaster 17', overnightStays: STAYS_6D, addOnRates: RATES });
    assert.equal(car.stationary?.status, 'optional');
    assert.equal(car.stationary?.label, 'Stationary / waiting');
    assert.equal(bus.stationary?.status, 'optional', 'bus still gets the optional stationary line');
    assert.equal(bus.stationary?.unitCost, 40);
  });

  it('7. suggested driver overnight total = sum of suggested only (6-day Petra+Wadi Rum = 30)', () => {
    const r = buildTransportAddOnPreview({ usePackageFullDay: true, vehicleName: 'Sedan 2', overnightStays: STAYS_6D, addOnRates: RATES });
    assert.equal(r.suggestedOvernightTotal, 30); // Petra 15 + Wadi Rum 15; Dead Sea optional excluded
  });

  it('8. stationary is never folded into the suggested total', () => {
    const r = buildTransportAddOnPreview({
      usePackageFullDay: true, vehicleName: 'Sedan 2',
      overnightStays: [{ city: 'Petra', nights: 1 }], addOnRates: RATES,
    });
    assert.equal(r.suggestedOvernightTotal, 15); // Petra only — the 40 stationary is NOT added
  });

  it('multi-night overnight multiplies by nights', () => {
    const r = buildTransportAddOnPreview({
      usePackageFullDay: true, vehicleName: 'Van 9',
      overnightStays: [{ city: 'Petra', nights: 2 }], addOnRates: RATES,
    });
    assert.equal(r.driverOvernight[0].nights, 2);
    assert.equal(r.driverOvernight[0].total, 30);
    assert.equal(r.suggestedOvernightTotal, 30);
  });

  it('no labels leak raw service-type codes', () => {
    const r = buildTransportAddOnPreview({ usePackageFullDay: true, vehicleName: 'Sedan 2', overnightStays: STAYS_6D, addOnRates: RATES });
    const labels = [...r.driverOvernight.map((l) => l.label), r.stationary?.label ?? ''];
    for (const label of labels) {
      assert.ok(!/OVERNIGHT|STATIONARY_WAITING|ADD_ON|_/.test(label), `clean label: ${label}`);
    }
  });
});

// ---------------------------------------------------------------------------
// T.6 — cleanVehicleClassName (operator-safe vehicle label, display only)
// ---------------------------------------------------------------------------
describe('T.6 — cleanVehicleClassName', () => {
  it('strips the trailing capacity number from the class name', () => {
    assert.equal(cleanVehicleClassName('Sedan 2'), 'Sedan');
    assert.equal(cleanVehicleClassName('SUV 4'), 'SUV');
    assert.equal(cleanVehicleClassName('Mini Van 5'), 'Mini Van');
    assert.equal(cleanVehicleClassName('Van 9'), 'Van');
    assert.equal(cleanVehicleClassName('Coaster 17'), 'Coaster');
  });
  it('handles a capacity range and extra spacing', () => {
    assert.equal(cleanVehicleClassName('Large VIP 31-33'), 'Large VIP');
    assert.equal(cleanVehicleClassName('  Van 10  '), 'Van');
  });
  it('returns null for empty/nullish input and keeps a name with no capacity token', () => {
    assert.equal(cleanVehicleClassName(null), null);
    assert.equal(cleanVehicleClassName(''), null);
    assert.equal(cleanVehicleClassName('Sedan'), 'Sedan');
  });
});
