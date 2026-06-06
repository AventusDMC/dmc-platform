import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assignGeneratedItineraryCities,
  assignGeneratedItineraryCitiesByNights,
  buildItineraryApplyMessage,
  classifyDailyDayType,
  classifyOvernightCity,
  computeOvernightRuns,
  deriveTouringRouteBaseCities,
  expandNightStopsToDayCities,
  generateItineraryDays,
  getAutoItineraryDayTitle,
  isMiddleDay,
  mergeExistingItineraryDays,
  partitionTouringRoutePoisToDays,
  reconstructNightStopsFromDayTitles,
  buildTouringRoutePreview,
  movePreviewPoi,
  reorderPreviewPoi,
  removePreviewPoi,
  buildTouringRouteApplyPlan,
  findHotelSetup,
  deriveOvernightNights,
  buildOvernightHotelSuggestions,
  executeTouringRouteApply,
  buildHotelItemPayload,
  type TouringRouteForGen,
  type TouringRouteDetailForGen,
  type Hotel,
  type HotelContract,
  type HotelRate,
} from './QuoteAutoItineraryBuilder.logic';

describe('quote auto itinerary builder logic', () => {
  it('generates one more day than the stored night count', () => {
    assert.deepEqual(
      [1, 2, 3, 4].map((nightCount) => generateItineraryDays('2026-05-10', nightCount).length),
      [2, 3, 4, 5],
    );
  });

  it('generates exactly four days for three nights', () => {
    const days = generateItineraryDays('2026-05-10', 3);

    assert.equal(days.length, 4);
    assert.deepEqual(
      days.map((day) => day.dayNumber),
      [1, 2, 3, 4],
    );
    assert.deepEqual(
      days.map((day) => day.date),
      ['2026-05-10', '2026-05-11', '2026-05-12', '2026-05-13'],
    );
  });

  it('generates one day for zero nights', () => {
    const days = generateItineraryDays('2026-05-10', 0);

    assert.equal(days.length, 1);
    assert.equal(days[0].dayNumber, 1);
    assert.equal(days[0].date, '2026-05-10');
  });

  it('does not append unprovided destinations when assigning generated day cities', () => {
    const days = generateItineraryDays('2026-05-10', 3);
    const assignedDays = assignGeneratedItineraryCities(days, ['Amman', 'Petra', 'Wadi Rum']);

    assert.equal(assignedDays.length, 4);
    assert.deepEqual(
      assignedDays.map((day) => day.city),
      ['Amman', 'Petra', 'Wadi Rum', 'Wadi Rum'],
    );
    assert.equal(assignedDays.some((day) => day.city === 'Dead Sea'), false);
  });

  it('interleaves the assigned city into each generated day title as a journey', () => {
    const days = generateItineraryDays('2026-05-10', 3);
    const assignedDays = assignGeneratedItineraryCities(days, ['Amman', 'Petra', 'Wadi Rum']);

    // Mid-trip "Day N" titles become just the city (formatDayHeading already
    // prepends "Day 02 -"), while Arrival/Departure markers keep their label
    // with the city appended for context.
    assert.deepEqual(
      assignedDays.map((day) => day.title),
      ['Arrival · Amman', 'Petra', 'Wadi Rum', 'Departure · Wadi Rum'],
    );
  });

  it('leaves the title untouched when no cities are provided', () => {
    const days = generateItineraryDays('2026-05-10', 3);
    const assignedDays = assignGeneratedItineraryCities(days, []);

    assert.deepEqual(
      assignedDays.map((day) => day.title),
      ['Arrival', 'Day 2', 'Day 3', 'Departure'],
    );
  });

  it('leaves generated day cities blank when no destinations are provided', () => {
    const days = assignGeneratedItineraryCities(generateItineraryDays('2026-05-10', 3), []);

    assert.deepEqual(
      days.map((day) => day.city),
      ['', '', '', ''],
    );
  });

  it('4 nights creates 5 days via the draft generator', () => {
    const days = generateItineraryDays('2026-05-10', 4);

    assert.deepEqual(
      days.map((day) => day.title),
      ['Arrival', 'Day 2', 'Day 3', 'Day 4', 'Departure'],
    );
    assert.deepEqual(
      days.map((day) => day.date),
      ['2026-05-10', '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14'],
    );
    assert.equal(buildItineraryApplyMessage(days.length, days.length), '5 itinerary days ready.');
  });

  it('existing Day 1 does not block generation of missing days', () => {
    const existingDays = mergeExistingItineraryDays([{ id: 'day-1', dayNumber: 1, title: 'Custom arrival' }]);
    const generatedDays = generateItineraryDays('2026-05-10', 4);
    const missingDays = generatedDays.filter((day) => !existingDays.has(day.dayNumber));

    assert.equal(existingDays.get(1)?.title, 'Custom arrival');
    assert.deepEqual(
      missingDays.map((day) => day.dayNumber),
      [2, 3, 4, 5],
    );
    assert.equal(buildItineraryApplyMessage(generatedDays.length, missingDays.length), '5 itinerary days ready.');
  });

  it('preserves customized day labels when merging existing itinerary days', () => {
    const existingDays = mergeExistingItineraryDays([
      { id: 'day-1', dayNumber: 1, title: 'VIP arrival and gala' },
      { id: 'day-2', dayNumber: 2, title: 'Petra leadership retreat' },
    ]);

    assert.equal(existingDays.get(1)?.title, 'VIP arrival and gala');
    assert.equal(existingDays.get(2)?.title, 'Petra leadership retreat');
  });

  it('does not duplicate days when the builder is run again', () => {
    const existingDays = mergeExistingItineraryDays(
      [{ id: 'legacy-day-1', dayNumber: 1, title: 'Legacy arrival' }],
      [
        { id: 'structured-day-1', dayNumber: 1, title: 'Structured arrival' },
        { id: 'structured-day-2', dayNumber: 2, title: 'Day 2' },
      ],
    );

    assert.equal(existingDays.size, 2);
    assert.equal(existingDays.get(1)?.id, 'legacy-day-1');
    assert.equal(buildItineraryApplyMessage(5, 0), '5 itinerary days ready.');
  });

  it('works without pricing, services, or cost data', () => {
    const days = generateItineraryDays(null, 4);

    assert.equal(days.length, 5);
    assert.deepEqual(Object.keys(days[0]).sort(), ['date', 'dayNumber', 'title']);
    assert.equal(days[0].date, null);
    assert.equal(days[4].title, 'Departure');
  });

  it('still exposes the individual title helper used by generated days', () => {
    assert.equal(getAutoItineraryDayTitle(1, 5), 'Arrival');
    assert.equal(getAutoItineraryDayTitle(5, 5), 'Departure');
  });

  it('expands per-city night stops to per-day cities for the Guided Builder handoff', () => {
    const expanded = expandNightStopsToDayCities([
      { name: 'Amman', nights: 3 },
      { name: 'Petra', nights: 2 },
      { name: 'Wadi Rum', nights: 1 },
      { name: 'Dead Sea', nights: 1 },
    ]);

    // 3 + 2 + 1 + 1 = 7 nights -> 7 nightly entries plus one Departure-day
    // entry that shares the last city.
    assert.deepEqual(expanded, ['Amman', 'Amman', 'Amman', 'Petra', 'Petra', 'Wadi Rum', 'Dead Sea', 'Dead Sea']);
  });

  it('drops zero-night and empty-name stops while expanding', () => {
    const expanded = expandNightStopsToDayCities([
      { name: 'Amman', nights: 2 },
      { name: '', nights: 3 },
      { name: 'Petra', nights: 0 },
      { name: 'Aqaba', nights: 1 },
    ]);

    assert.deepEqual(expanded, ['Amman', 'Amman', 'Aqaba', 'Aqaba']);
  });

  it('returns an empty array when no stops have nights', () => {
    assert.deepEqual(expandNightStopsToDayCities([]), []);
    assert.deepEqual(
      expandNightStopsToDayCities([
        { name: 'Amman', nights: 0 },
        { name: 'Petra', nights: 0 },
      ]),
      [],
    );
  });

  it('assigns generated days to cities by per-city night distribution', () => {
    const days = generateItineraryDays('2026-05-10', 7);
    const assigned = assignGeneratedItineraryCitiesByNights(days, [
      { name: 'Amman', nights: 3 },
      { name: 'Petra', nights: 2 },
      { name: 'Wadi Rum', nights: 1 },
      { name: 'Dead Sea', nights: 1 },
    ]);

    // 7 nights -> 8 day cards (arrival + 6 mid + departure).
    assert.deepEqual(
      assigned.map((day) => day.city),
      ['Amman', 'Amman', 'Amman', 'Petra', 'Petra', 'Wadi Rum', 'Dead Sea', 'Dead Sea'],
    );

    // Mid-trip "Day N" titles become the city name; bookends keep the
    // marker with the city appended.
    assert.equal(assigned[0].title, 'Arrival · Amman');
    assert.equal(assigned[3].title, 'Petra');
    assert.equal(assigned[7].title, 'Departure · Dead Sea');
  });

  it('reconstructs night stops from PR-#74-style saved day titles', () => {
    const stops = reconstructNightStopsFromDayTitles([
      { dayNumber: 1, title: 'Arrival · Amman' },
      { dayNumber: 2, title: 'Amman' },
      { dayNumber: 3, title: 'Amman' },
      { dayNumber: 4, title: 'Petra' },
      { dayNumber: 5, title: 'Petra' },
      { dayNumber: 6, title: 'Wadi Rum' },
      { dayNumber: 7, title: 'Dead Sea' },
      { dayNumber: 8, title: 'Departure · Dead Sea' },
    ]);

    assert.deepEqual(stops, [
      { name: 'Amman', nights: 3 },
      { name: 'Petra', nights: 2 },
      { name: 'Wadi Rum', nights: 1 },
      { name: 'Dead Sea', nights: 1 },
    ]);
  });

  it('reconstruction handles "Day N · City" prefixed titles', () => {
    const stops = reconstructNightStopsFromDayTitles([
      { dayNumber: 1, title: 'Arrival · Amman' },
      { dayNumber: 2, title: 'Day 2 · Amman' },
      { dayNumber: 3, title: 'Day 3 · Petra' },
      { dayNumber: 4, title: 'Departure · Petra' },
    ]);

    assert.deepEqual(stops, [
      { name: 'Amman', nights: 2 },
      { name: 'Petra', nights: 1 },
    ]);
  });

  it('reconstruction returns null when titles are bare "Day N" only (pre-#74)', () => {
    const stops = reconstructNightStopsFromDayTitles([
      { dayNumber: 1, title: 'Arrival' },
      { dayNumber: 2, title: 'Day 2' },
      { dayNumber: 3, title: 'Day 3' },
      { dayNumber: 4, title: 'Departure' },
    ]);

    assert.equal(stops, null);
  });

  it('reconstruction returns null on empty input', () => {
    assert.equal(reconstructNightStopsFromDayTitles([]), null);
  });

  it('classifies driver-overnight cities by policy', () => {
    assert.equal(classifyOvernightCity('Petra'), 'standard');
    assert.equal(classifyOvernightCity('Wadi Rum'), 'standard');
    assert.equal(classifyOvernightCity('wadirum'), 'standard');
    assert.equal(classifyOvernightCity('Aqaba'), 'standard');
    assert.equal(classifyOvernightCity('Amman'), 'none');
    assert.equal(classifyOvernightCity(''), 'none');
    // Dead Sea is optional — none unless the operator opts in
    assert.equal(classifyOvernightCity('Dead Sea'), 'none');
    assert.equal(classifyOvernightCity('Dead Sea', { includeOptional: true }), 'optional');
  });

  it('classifies daily-package day type by move/stay and city policy', () => {
    // A move (different city) is always a full touring day, regardless of dest.
    assert.equal(classifyDailyDayType(true, 'Petra'), 'full');
    assert.equal(classifyDailyDayType(true, 'Dead Sea'), 'full');
    assert.equal(classifyDailyDayType(true, 'Amman'), 'full');
    // A stay at an overnight base is stationary (vehicle on local standby).
    assert.equal(classifyDailyDayType(false, 'Petra'), 'stationary');
    assert.equal(classifyDailyDayType(false, 'Wadi Rum'), 'stationary');
    assert.equal(classifyDailyDayType(false, 'Aqaba'), 'stationary');
    // An Amman stay is a full day (city tour).
    assert.equal(classifyDailyDayType(false, 'Amman'), 'full');
    // A Dead Sea stay is a free day (no vehicle) unless opted in → stationary.
    assert.equal(classifyDailyDayType(false, 'Dead Sea'), 'skip');
    assert.equal(classifyDailyDayType(false, 'Dead Sea', { includeDeadSea: true }), 'stationary');
    // Unknown stay city defaults to full (assume a touring day).
    assert.equal(classifyDailyDayType(false, 'Madaba'), 'full');
  });

  it('identifies middle days (not arrival, not departure)', () => {
    assert.equal(isMiddleDay(1, 5), false);
    assert.equal(isMiddleDay(2, 5), true);
    assert.equal(isMiddleDay(4, 5), true);
    assert.equal(isMiddleDay(5, 5), false);
  });

  it('groups consecutive driver-overnight nights into runs anchored on the first sleep day', () => {
    // 6 nights: Amman, Amman, Petra, Petra, Wadi Rum, Dead Sea (+ departure dup)
    const dayCities = ['Amman', 'Amman', 'Petra', 'Petra', 'Wadi Rum', 'Dead Sea', 'Dead Sea'];
    assert.deepEqual(computeOvernightRuns(dayCities), [
      { dayNumber: 3, city: 'Petra', nights: 2 },
      { dayNumber: 5, city: 'Wadi Rum', nights: 1 },
    ]);
    // With Dead Sea opted in, the final night is added
    assert.deepEqual(computeOvernightRuns(dayCities, { includeOptional: true }), [
      { dayNumber: 3, city: 'Petra', nights: 2 },
      { dayNumber: 5, city: 'Wadi Rum', nights: 1 },
      { dayNumber: 6, city: 'Dead Sea', nights: 1 },
    ]);
  });

  it('produces no overnight runs when no stop qualifies', () => {
    assert.deepEqual(computeOvernightRuns(['Amman', 'Amman', 'Amman']), []);
    assert.deepEqual(computeOvernightRuns([]), []);
  });
});

// Phase 3D.1A — POI-aware touring-route → quote generation helpers.
function poiStop(order: number, city: string, code: string, name: string, enTitle?: string): any {
  return {
    id: `stop-${order}`,
    order,
    city,
    poiId: `poi-${code}`,
    pointOfInterest: { id: `poi-${code}`, code, name, translations: enTitle ? [{ locale: 'en', title: enTitle }] : [] },
  };
}
function baseStop(order: number, city: string): any {
  return { id: `stop-${order}`, order, city, poiId: null, pointOfInterest: null };
}

describe('deriveTouringRouteBaseCities', () => {
  it('uses mainDestinations as the base sequence when present', () => {
    const route: TouringRouteForGen = { id: 'r', durationDays: 3, mainDestinations: ['Amman', 'Petra', 'Wadi Rum'], stops: [] };
    assert.deepEqual(deriveTouringRouteBaseCities(route), ['Amman', 'Petra', 'Wadi Rum']);
  });

  it('collapses a round-trip day route to a single base city', () => {
    const route: TouringRouteForGen = {
      id: 'r', durationDays: 1, stops: [baseStop(1, 'Amman'), poiStop(2, 'Jerash', 'JERASH', 'Jerash'), baseStop(3, 'Amman')],
    };
    assert.deepEqual(deriveTouringRouteBaseCities(route), ['Amman']);
  });

  it('pads with the last base when fewer destinations than days', () => {
    const route: TouringRouteForGen = { id: 'r', durationDays: 3, mainDestinations: ['Amman', 'Petra'], stops: [] };
    assert.deepEqual(deriveTouringRouteBaseCities(route), ['Amman', 'Petra', 'Petra']);
  });

  it('falls back to startCity when nothing else is available', () => {
    const route: TouringRouteForGen = { id: 'r', durationDays: 1, startCity: 'Amman', stops: [] };
    assert.deepEqual(deriveTouringRouteBaseCities(route), ['Amman']);
  });
});

describe('partitionTouringRoutePoisToDays', () => {
  it('one-day Amman City route → all content POIs on day 1', () => {
    const route: TouringRouteForGen = {
      id: 'amman-city', durationDays: 1, startCity: 'Amman',
      stops: [
        poiStop(1, 'Amman', 'AMMAN_CITADEL', 'Amman Citadel', 'Amman Citadel'),
        poiStop(2, 'Amman', 'ROMAN_THEATRE', 'Roman Theatre', 'Roman Theatre'),
        poiStop(3, 'Amman', 'DOWNTOWN_AMMAN', 'Downtown Amman', 'Downtown Amman'),
      ],
    };
    const r = partitionTouringRoutePoisToDays(route);
    assert.equal(r.days.length, 1);
    assert.deepEqual(r.days[0].pois.map((p) => p.code), ['AMMAN_CITADEL', 'ROMAN_THEATRE', 'DOWNTOWN_AMMAN']);
    assert.equal(r.days[0].pois[0].title, 'Amman Citadel');
    assert.equal(r.totalPois, 3);
    assert.equal(r.skippedStops, 0);
    assert.equal(r.ambiguous, false);
    assert.equal(r.hasUsablePois, true);
  });

  it('Jerash & Ajloun day route → both POIs on the single day, base stop skipped', () => {
    const route: TouringRouteForGen = {
      id: 'jerash-ajloun', durationDays: 1, startCity: 'Amman',
      stops: [baseStop(1, 'Amman'), poiStop(2, 'Jerash', 'JERASH', 'Jerash'), poiStop(3, 'Ajloun', 'AJLOUN_CASTLE', 'Ajloun Castle'), baseStop(4, 'Amman')],
    };
    const r = partitionTouringRoutePoisToDays(route);
    assert.equal(r.days.length, 1);
    assert.deepEqual(r.days[0].pois.map((p) => p.code), ['JERASH', 'AJLOUN_CASTLE']);
    assert.equal(r.skippedStops, 2); // two Amman base stops
    assert.equal(r.ambiguous, false);
  });

  it('Amman → Dana → Petra multi-day → ordered partition by base city; flagged as a suggestion', () => {
    const route: TouringRouteForGen = {
      id: 'amman-dana-petra', durationDays: 3, mainDestinations: ['Amman', 'Dana', 'Petra'], startCity: 'Amman',
      stops: [
        poiStop(1, 'Amman', 'AMMAN_CITADEL', 'Amman Citadel'),
        poiStop(2, 'Dana', 'DANA_BIOSPHERE_RESERVE', 'Dana Biosphere Reserve'),
        poiStop(3, 'Petra', 'PETRA_ARCHAEOLOGICAL_CITY', 'Petra Archaeological City'),
      ],
    };
    const r = partitionTouringRoutePoisToDays(route);
    assert.equal(r.days.length, 3);
    assert.deepEqual(r.days.map((d) => d.pois.map((p) => p.code)), [['AMMAN_CITADEL'], ['DANA_BIOSPHERE_RESERVE'], ['PETRA_ARCHAEOLOGICAL_CITY']]);
    assert.equal(r.ambiguous, true); // multi-day is always a reviewable suggestion
    assert.ok(r.ambiguityReasons.some((m) => /suggestion/i.test(m)));
  });

  it('Petra → Wadi Rum → Aqaba multi-day → one POI per matching base day', () => {
    const route: TouringRouteForGen = {
      id: 'petra-rum-aqaba', durationDays: 3, mainDestinations: ['Petra', 'Wadi Rum', 'Aqaba'], startCity: 'Petra',
      stops: [
        poiStop(1, 'Petra', 'PETRA_ARCHAEOLOGICAL_CITY', 'Petra Archaeological City'),
        poiStop(2, 'Wadi Rum', 'WADI_RUM_PROTECTED_AREA', 'Wadi Rum Protected Area'),
        poiStop(3, 'Aqaba', 'AQABA_MARINE_PARK', 'Aqaba Marine Park'),
      ],
    };
    const r = partitionTouringRoutePoisToDays(route);
    assert.deepEqual(r.days.map((d) => d.baseCity), ['Petra', 'Wadi Rum', 'Aqaba']);
    assert.deepEqual(r.days.map((d) => d.pois.length), [1, 1, 1]);
    assert.equal(r.days.every((d) => d.hasUsablePois), true);
  });

  it('no-POI route → no assignments, flagged, days fall back to manual notes', () => {
    const route: TouringRouteForGen = {
      id: 'no-poi', durationDays: 2, startCity: 'Amman',
      stops: [baseStop(1, 'Amman'), baseStop(2, 'Petra')],
    };
    const r = partitionTouringRoutePoisToDays(route);
    assert.equal(r.totalPois, 0);
    assert.equal(r.hasUsablePois, false);
    assert.equal(r.skippedStops, 2);
    assert.equal(r.days.every((d) => d.pois.length === 0 && !d.hasUsablePois), true);
    assert.ok(r.ambiguityReasons.some((m) => /no POI-linked stops/i.test(m)));
  });

  it('mixed base/null stops + content POI stops → only content POIs become assignments', () => {
    const route: TouringRouteForGen = {
      id: 'mixed', durationDays: 1, startCity: 'Amman',
      stops: [
        baseStop(1, 'Amman'),                                   // base, skipped
        poiStop(2, 'Madaba', 'MADABA', 'Madaba'),               // content
        baseStop(3, 'Lunch stop'),                              // operational, skipped
        poiStop(4, 'Mount Nebo', 'MOUNT_NEBO', 'Mount Nebo'),   // content
      ],
    };
    const r = partitionTouringRoutePoisToDays(route);
    assert.deepEqual(r.days[0].pois.map((p) => p.code), ['MADABA', 'MOUNT_NEBO']);
    assert.equal(r.totalPois, 2);
    assert.equal(r.skippedStops, 2);
  });
});

// Phase 3D.1B — preview model + local-edit reducers (no DB writes).
const PRICINGS = [
  { id: 'pr-van', currency: 'USD', baseCost: 190, pricingBasis: 'PER_VEHICLE', active: true, vehicle: { name: 'Mini Van 6' } },
  { id: 'pr-coaster', currency: 'USD', baseCost: 320, pricingBasis: 'PER_VEHICLE', active: true, vehicle: { name: 'Coaster 17' } },
];

describe('buildTouringRoutePreview', () => {
  it('renders one-day Amman City route with all linked POIs on day 1 + transport line', () => {
    const route: TouringRouteDetailForGen = {
      id: 'amman-city', name: 'Amman City Sites', durationDays: 1, startCity: 'Amman', pricings: PRICINGS,
      stops: [
        poiStop(1, 'Amman', 'AMMAN_CITADEL', 'Amman Citadel', 'Amman Citadel'),
        poiStop(2, 'Amman', 'ROMAN_THEATRE', 'Roman Theatre', 'Roman Theatre'),
        poiStop(3, 'Amman', 'DOWNTOWN_AMMAN', 'Downtown Amman', 'Downtown Amman'),
      ],
    };
    const p = buildTouringRoutePreview(route, { pricingRowId: 'pr-van', startDate: '2026-06-01' });
    assert.equal(p.days.length, 1);
    assert.deepEqual(p.days[0].pois.map((x) => x.code), ['AMMAN_CITADEL', 'ROMAN_THEATRE', 'DOWNTOWN_AMMAN']);
    assert.equal(p.days[0].date, '2026-06-01');
    assert.equal(p.ambiguous, false);
    assert.ok(p.transport);
    assert.equal(p.transport!.pricingRowId, 'pr-van');
    assert.equal(p.transport!.cost, 190);
    assert.equal(p.transport!.dayCount, 1);
    assert.match(p.transport!.pricingLabel, /Mini Van 6 \| PER_VEHICLE \| USD 190\.00/);
  });

  it('renders Jerash & Ajloun route with content POIs and skipped Amman bookends', () => {
    const route: TouringRouteDetailForGen = {
      id: 'jerash-ajloun', name: 'Ajloun & Jerash', durationDays: 1, startCity: 'Amman', pricings: PRICINGS,
      stops: [baseStop(1, 'Amman'), poiStop(2, 'Jerash', 'JERASH', 'Jerash'), poiStop(3, 'Ajloun', 'AJLOUN_CASTLE', 'Ajloun Castle'), baseStop(4, 'Amman')],
    };
    const p = buildTouringRoutePreview(route, {});
    assert.deepEqual(p.days[0].pois.map((x) => x.code), ['JERASH', 'AJLOUN_CASTLE']);
    assert.equal(p.skippedStops, 2);
  });

  it('renders Amman → Dana → Petra multi-day with ambiguity warning', () => {
    const route: TouringRouteDetailForGen = {
      id: 'amman-dana-petra', name: 'Amman → Dana → Petra', durationDays: 3, mainDestinations: ['Amman', 'Dana', 'Petra'], pricings: PRICINGS,
      stops: [poiStop(1, 'Amman', 'AMMAN_CITADEL', 'Amman Citadel'), poiStop(2, 'Dana', 'DANA', 'Dana Reserve'), poiStop(3, 'Petra', 'PETRA', 'Petra')],
    };
    const p = buildTouringRoutePreview(route, { startDate: '2026-06-01' });
    assert.equal(p.days.length, 3);
    assert.deepEqual(p.days.map((d) => d.date), ['2026-06-01', '2026-06-02', '2026-06-03']);
    assert.equal(p.ambiguous, true);
    assert.ok(p.ambiguityReasons.length > 0);
  });

  it('renders Petra → Wadi Rum → Aqaba multi-day', () => {
    const route: TouringRouteDetailForGen = {
      id: 'petra-rum-aqaba', name: 'Petra → Wadi Rum → Aqaba', durationDays: 3, mainDestinations: ['Petra', 'Wadi Rum', 'Aqaba'], pricings: PRICINGS,
      stops: [poiStop(1, 'Petra', 'PETRA', 'Petra'), poiStop(2, 'Wadi Rum', 'WADI_RUM', 'Wadi Rum'), poiStop(3, 'Aqaba', 'AQABA', 'Aqaba')],
    };
    const p = buildTouringRoutePreview(route, {});
    assert.deepEqual(p.days.map((d) => d.baseCity), ['Petra', 'Wadi Rum', 'Aqaba']);
    assert.deepEqual(p.days.map((d) => d.pois.length), [1, 1, 1]);
  });

  it('handles a no-POI route with a clear warning and no usable POIs', () => {
    const route: TouringRouteDetailForGen = {
      id: 'no-poi', name: 'No POI route', durationDays: 2, startCity: 'Amman', pricings: PRICINGS,
      stops: [baseStop(1, 'Amman'), baseStop(2, 'Petra')],
    };
    const p = buildTouringRoutePreview(route, {});
    assert.equal(p.hasUsablePois, false);
    assert.equal(p.totalPois, 0);
    assert.ok(p.ambiguityReasons.some((m) => /no POI-linked stops/i.test(m)));
    assert.ok(p.transport); // transport line still previewable
  });
});

describe('preview local-edit reducers (no DB writes)', () => {
  function multiDayPreview() {
    const route: TouringRouteDetailForGen = {
      id: 'r', name: 'R', durationDays: 2, mainDestinations: ['Amman', 'Petra'], pricings: PRICINGS,
      stops: [
        poiStop(1, 'Amman', 'A1', 'A1'), poiStop(2, 'Amman', 'A2', 'A2'),
        poiStop(3, 'Petra', 'P1', 'P1'),
      ],
    };
    return buildTouringRoutePreview(route, {});
  }

  it('moves a POI from one day to another', () => {
    const before = multiDayPreview();
    assert.deepEqual(before.days[0].pois.map((p) => p.code), ['A1', 'A2']);
    const after = movePreviewPoi(before, 1, 0, 2); // move A1 to day 2
    assert.deepEqual(after.days[0].pois.map((p) => p.code), ['A2']);
    assert.deepEqual(after.days[1].pois.map((p) => p.code), ['P1', 'A1']);
    assert.equal(after.totalPois, 3);
    assert.notEqual(after, before); // immutable
    assert.deepEqual(before.days[0].pois.map((p) => p.code), ['A1', 'A2']); // original untouched
  });

  it('reorders POIs within a day', () => {
    const before = multiDayPreview();
    const after = reorderPreviewPoi(before, 1, 0, 1); // A1 <-> A2
    assert.deepEqual(after.days[0].pois.map((p) => p.code), ['A2', 'A1']);
  });

  it('drops a POI from a day and flags the day when emptied', () => {
    const before = multiDayPreview();
    const after = removePreviewPoi(before, 2, 0); // remove P1 from day 2
    assert.deepEqual(after.days[1].pois.map((p) => p.code), []);
    assert.equal(after.days[1].hasUsablePois, false);
    assert.equal(after.totalPois, 2);
  });

  it('ignores out-of-range edit indices (returns equivalent preview)', () => {
    const before = multiDayPreview();
    assert.equal(removePreviewPoi(before, 1, 99), before);
    assert.equal(movePreviewPoi(before, 1, 0, 1).totalPois, 3);
  });
});

// Phase 3D.1C — non-destructive apply plan.
describe('buildTouringRouteApplyPlan', () => {
  const SVC = 'transport-svc-1';
  function ammanCityPreview() {
    const route: TouringRouteDetailForGen = {
      id: 'amman-city', name: 'Amman City Sites', durationDays: 1, startCity: 'Amman', pricings: PRICINGS,
      stops: [
        poiStop(1, 'Amman', 'AMMAN_CITADEL', 'Amman Citadel'),
        poiStop(2, 'Amman', 'ROMAN_THEATRE', 'Roman Theatre'),
        baseStop(3, 'Amman'),
      ],
    };
    return buildTouringRoutePreview(route, { pricingRowId: 'pr-van', startDate: '2026-06-01' });
  }

  it('applies on an empty quote: correct day count + one transport item with the selected pricing/overrideCost', () => {
    const plan = buildTouringRouteApplyPlan(ammanCityPreview(), { pax: 3, transportServiceId: SVC, existingDayCount: 0, existingItemCount: 0 });
    assert.equal(plan.canApply, true);
    assert.equal(plan.blockedReason, null);
    assert.equal(plan.days.length, 1);
    assert.ok(plan.transport);
    assert.deepEqual(plan.transport, {
      serviceId: SVC,
      touringRouteId: 'amman-city',
      touringRoutePricingId: 'pr-van',
      currency: 'USD', // Phase 3D.1H: pricing-row currency now included for FX conversion
      overrideCost: 190,
      useOverride: true,
      dayCount: 1,
      paxCount: 3,
      attachToDayNumber: 1,
    });
  });

  it('creates ordered POI assignments and excludes base/null-POI stops', () => {
    const plan = buildTouringRouteApplyPlan(ammanCityPreview(), { pax: 2, transportServiceId: SVC });
    assert.deepEqual(plan.days[0].poiAssignments.map((a) => a.poiId), ['poi-AMMAN_CITADEL', 'poi-ROMAN_THEATRE']);
    assert.equal(plan.totalPoiAssignments, 2); // the base Amman stop contributes nothing
    assert.equal(plan.days[0].poiAssignments[0].sourceTouringRouteStopId, 'stop-1');
  });

  it('no-POI route can still apply days + transport but creates no POI assignments (with warning)', () => {
    const route: TouringRouteDetailForGen = {
      id: 'no-poi', name: 'No POI', durationDays: 2, startCity: 'Amman', pricings: PRICINGS,
      stops: [baseStop(1, 'Amman'), baseStop(2, 'Petra')],
    };
    const plan = buildTouringRouteApplyPlan(buildTouringRoutePreview(route, {}), { pax: 2, transportServiceId: SVC });
    assert.equal(plan.canApply, true);
    assert.equal(plan.totalPoiAssignments, 0);
    assert.ok(plan.transport);
    assert.ok(plan.warnings.some((w) => /no POI-linked stops/i.test(w)));
  });

  it('is BLOCKED when the quote already has itinerary days (never overwrites)', () => {
    const plan = buildTouringRouteApplyPlan(ammanCityPreview(), { pax: 2, transportServiceId: SVC, existingDayCount: 3 });
    assert.equal(plan.canApply, false);
    assert.match(plan.blockedReason || '', /already has 3 itinerary day/i);
    assert.equal(plan.transport, null);
  });

  it('is BLOCKED when existing POI assignments are present', () => {
    const plan = buildTouringRouteApplyPlan(ammanCityPreview(), { pax: 2, transportServiceId: SVC, existingDayCount: 0, existingPoiAssignmentCount: 4 });
    assert.equal(plan.canApply, false);
  });

  it('warns (but allows) when the quote has existing service items', () => {
    const plan = buildTouringRouteApplyPlan(ammanCityPreview(), { pax: 2, transportServiceId: SVC, existingItemCount: 5 });
    assert.equal(plan.canApply, true);
    assert.ok(plan.warnings.some((w) => /5 service item/i.test(w)));
  });

  it('is blocked without a transport service or pricing row', () => {
    const noSvc = buildTouringRouteApplyPlan(ammanCityPreview(), { pax: 2, transportServiceId: null });
    assert.equal(noSvc.canApply, false);
    assert.match(noSvc.blockedReason || '', /transport service/i);
  });

  it('is blocked with invalid pax', () => {
    const plan = buildTouringRouteApplyPlan(ammanCityPreview(), { pax: 0, transportServiceId: SVC });
    assert.equal(plan.canApply, false);
    assert.match(plan.blockedReason || '', /guests|pax/i);
  });

  it('flags multi-day partitions as a reviewable warning', () => {
    const route: TouringRouteDetailForGen = {
      id: 'm', name: 'M', durationDays: 3, mainDestinations: ['Amman', 'Dana', 'Petra'], pricings: PRICINGS,
      stops: [poiStop(1, 'Amman', 'A', 'A'), poiStop(2, 'Dana', 'D', 'D'), poiStop(3, 'Petra', 'P', 'P')],
    };
    const plan = buildTouringRouteApplyPlan(buildTouringRoutePreview(route, {}), { pax: 2, transportServiceId: SVC });
    assert.equal(plan.canApply, true);
    assert.ok(plan.warnings.some((w) => /suggestion/i.test(w)));
  });
});

// Phase 3D.1E — multi-day base-city refinement (content-stop fallback).
describe('deriveTouringRouteBaseCities — short mainDestinations refinement (3D.1E)', () => {
  it('multi-day route with short mainDestinations falls back to ordered content cities', () => {
    const route: TouringRouteForGen = {
      id: 'pwr', durationDays: 2, mainDestinations: ['Wadi Rum'], startCity: 'Petra',
      stops: [poiStop(1, 'Petra', 'PETRA', 'Petra'), poiStop(2, 'Wadi Rum', 'WADI_RUM', 'Wadi Rum')],
    };
    assert.deepEqual(deriveTouringRouteBaseCities(route), ['Petra', 'Wadi Rum']);
  });

  it('multi-day route with full mainDestinations is unchanged', () => {
    const route: TouringRouteForGen = {
      id: 'dp', durationDays: 2, mainDestinations: ['Dana', 'Petra'], startCity: 'Amman',
      stops: [baseStop(1, 'Amman'), poiStop(2, 'Dana', 'DANA', 'Dana'), poiStop(3, 'Petra', 'PETRA', 'Petra')],
    };
    assert.deepEqual(deriveTouringRouteBaseCities(route), ['Dana', 'Petra']);
  });
});

describe('partitionTouringRoutePoisToDays — 3D.1E multi-day splits', () => {
  it('Petra → Wadi Rum ON now splits [Petra], [Wadi Rum]', () => {
    const route: TouringRouteForGen = {
      id: 'pwr', durationDays: 2, mainDestinations: ['Wadi Rum'], startCity: 'Petra',
      stops: [poiStop(1, 'Petra', 'PETRA', 'Petra'), poiStop(2, 'Wadi Rum', 'WADI_RUM', 'Wadi Rum')],
    };
    const r = partitionTouringRoutePoisToDays(route);
    assert.deepEqual(r.days.map((d) => d.pois.map((p) => p.code)), [['PETRA'], ['WADI_RUM']]);
    assert.deepEqual(r.days.map((d) => d.hasUsablePois), [true, true]);
    assert.equal(r.ambiguous, true); // multi-day stays a reviewable suggestion
  });

  it('Amman → Dana → Petra ON remains [Dana], [Petra]', () => {
    const route: TouringRouteForGen = {
      id: 'dp', durationDays: 2, mainDestinations: ['Dana', 'Petra'], startCity: 'Amman',
      stops: [baseStop(1, 'Amman'), poiStop(2, 'Dana', 'DANA', 'Dana'), poiStop(3, 'Petra', 'PETRA', 'Petra')],
    };
    const r = partitionTouringRoutePoisToDays(route);
    assert.deepEqual(r.days.map((d) => d.pois.map((p) => p.code)), [['DANA'], ['PETRA']]);
    assert.equal(r.skippedStops, 1); // Amman base stop skipped
  });

  it('one-day Amman City still puts all POIs on day 1 (unchanged)', () => {
    const route: TouringRouteForGen = {
      id: 'ac', durationDays: 1, startCity: 'Amman',
      stops: [poiStop(1, 'Amman', 'AMMAN_CITADEL', 'Amman Citadel'), poiStop(2, 'Amman', 'ROMAN_THEATRE', 'Roman Theatre'), poiStop(3, 'Amman', 'DOWNTOWN_AMMAN', 'Downtown Amman')],
    };
    const r = partitionTouringRoutePoisToDays(route);
    assert.equal(r.days.length, 1);
    assert.deepEqual(r.days[0].pois.map((p) => p.code), ['AMMAN_CITADEL', 'ROMAN_THEATRE', 'DOWNTOWN_AMMAN']);
  });

  it('no-POI multi-day route still creates no assignments + stays flagged', () => {
    const route: TouringRouteForGen = {
      id: 'np', durationDays: 2, mainDestinations: ['Wadi Rum'], startCity: 'Petra',
      stops: [baseStop(1, 'Petra'), baseStop(2, 'Wadi Rum')],
    };
    const r = partitionTouringRoutePoisToDays(route);
    assert.equal(r.totalPois, 0);
    assert.equal(r.hasUsablePois, false);
    assert.ok(r.ambiguityReasons.some((m) => /no POI-linked stops/i.test(m)));
  });
});

describe('Phase 3D.2A findHotelSetup (lift-and-shift, byte-for-byte)', () => {
  const hotels: Hotel[] = [
    { id: 'h-petra', name: 'Petra Moon Hotel', city: 'Petra / Wadi Musa', category: '4 star', roomCategories: [] },
    { id: 'h-amman', name: 'Amman Inn', city: 'Amman', category: '3 star', roomCategories: [] },
  ];
  const contracts: HotelContract[] = [
    {
      id: 'c-petra', hotelId: 'h-petra', name: 'Petra 2026', currency: 'USD',
      validFrom: '2026-01-01', validTo: '2026-12-31', hotel: { id: 'h-petra', name: 'Petra Moon Hotel' },
    },
  ];
  const rates: HotelRate[] = [
    { id: 'r-dbl-hb', contractId: 'c-petra', seasonName: 'Std', roomCategoryId: 'rc1', occupancyType: 'DBL', mealPlan: 'HB', currency: 'USD', cost: 70, roomCategory: { id: 'rc1', name: 'Standard', code: null } },
    { id: 'r-dbl-bb', contractId: 'c-petra', seasonName: 'Std', roomCategoryId: 'rc1', occupancyType: 'DBL', mealPlan: 'BB', currency: 'USD', cost: 50, roomCategory: { id: 'rc1', name: 'Standard', code: null } },
  ];

  it('matches hotel/contract/rate by city, preferring DBL + BB', () => {
    const r = findHotelSetup({ city: 'Petra / Wadi Musa', travelDate: '2026-06-10', hotels, hotelContracts: contracts, hotelRates: rates, optimizationMode: 'cost' });
    assert.equal(r.hotel?.id, 'h-petra');
    assert.equal(r.contract?.id, 'c-petra');
    assert.equal(r.rate?.id, 'r-dbl-bb');
    assert.equal(r.rate?.mealPlan, 'BB');
    assert.equal(r.missingReason, null);
  });
  it('no hotel in the city -> missingReason no-hotel-in-city', () => {
    const r = findHotelSetup({ city: 'Aqaba', travelDate: null, hotels, hotelContracts: contracts, hotelRates: rates, optimizationMode: 'cost' });
    assert.equal(r.hotel, null);
    assert.equal(r.missingReason, 'no-hotel-in-city');
  });
  it('hotel present but no contract -> missingReason no-valid-contract', () => {
    const r = findHotelSetup({ city: 'Amman', travelDate: null, hotels, hotelContracts: contracts, hotelRates: rates, optimizationMode: 'cost' });
    assert.equal(r.hotel?.id, 'h-amman');
    assert.equal(r.contract, null);
    assert.equal(r.missingReason, 'no-valid-contract');
  });
});

describe('Phase 3D.2A deriveOvernightNights', () => {
  const poi = (id: string) => ({ id, code: id, name: id });

  it('one-day route -> zero hotel nights (Ajloun & Jerash)', () => {
    const route: TouringRouteForGen = {
      id: 'r', name: 'Jerash & Ajloun', startCity: 'Amman', durationDays: 1,
      stops: [
        { order: 0, city: 'Amman', poiId: null, pointOfInterest: null },
        { order: 1, city: 'Jerash', poiId: 'p-jerash', pointOfInterest: poi('Jerash') },
        { order: 2, city: 'Ajloun', poiId: 'p-ajloun', pointOfInterest: poi('Ajloun') },
      ],
    };
    const r = deriveOvernightNights(route);
    assert.equal(r.nights.length, 0);
    assert.equal(r.ambiguous, false);
  });

  it('Amman -> Dana -> Petra ON -> one overnight, suggested Petra (not Dana), ambiguity surfaced', () => {
    const route: TouringRouteForGen = {
      id: 'r', name: 'Dana & Petra', startCity: 'Amman', durationDays: 2,
      stops: [
        { order: 0, city: 'Amman', poiId: 'p-amman', pointOfInterest: poi('Amman') },
        { order: 1, city: 'Dana', poiId: 'p-dana', pointOfInterest: poi('Dana') },
        { order: 2, city: 'Petra / Wadi Musa', poiId: 'p-petra', pointOfInterest: poi('Petra') },
        { order: 3, city: 'Amman', poiId: null, pointOfInterest: null },
      ],
    };
    const r = deriveOvernightNights(route);
    assert.equal(r.nights.length, 1);
    assert.match(r.nights[0].city, /Petra/);
    assert.doesNotMatch(r.nights[0].city, /Dana/);
    assert.equal(r.ambiguous, true);
  });

  it('Petra -> Wadi Rum ON -> one overnight, suggested Wadi Rum (origin Petra excluded)', () => {
    const route: TouringRouteForGen = {
      id: 'r', name: 'Petra & Wadi Rum', startCity: 'Petra', durationDays: 2,
      mainDestinations: ['Wadi Rum'],
      stops: [
        { order: 0, city: 'Petra', poiId: 'p-petra', pointOfInterest: poi('Petra') },
        { order: 1, city: 'Wadi Rum', poiId: 'p-wr', pointOfInterest: poi('Wadi Rum') },
      ],
    };
    const r = deriveOvernightNights(route);
    assert.equal(r.nights.length, 1);
    assert.match(r.nights[0].city, /Wadi Rum/);
    assert.equal(r.ambiguous, false);
  });

  it('base/null-POI stops only -> overnight has no confident city + ambiguity flag', () => {
    const route: TouringRouteForGen = {
      id: 'r', startCity: 'Amman', durationDays: 2,
      stops: [
        { order: 0, city: 'Amman', poiId: null, pointOfInterest: null },
        { order: 1, city: 'Transit Town', poiId: null, pointOfInterest: null },
      ],
    };
    const r = deriveOvernightNights(route);
    assert.equal(r.nights.length, 1);
    assert.equal(r.nights[0].city, '');
    assert.equal(r.nights[0].reason, 'no-destination-city');
    assert.equal(r.ambiguous, true);
  });
});

describe('Phase 3D.2B buildOvernightHotelSuggestions (preview only, pure)', () => {
  const poi = (id: string) => ({ id, code: id, name: id });
  const hotels: Hotel[] = [
    { id: 'h-petra', name: 'Petra Moon Hotel', city: 'Petra / Wadi Musa', category: '4 star', roomCategories: [] },
    { id: 'h-wr', name: 'Wadi Rum Bedouin Camp', city: 'Wadi Rum', category: 'camp', roomCategories: [] },
  ];
  const hotelContracts: HotelContract[] = [
    { id: 'c-petra', hotelId: 'h-petra', name: 'Petra 2026', currency: 'USD', validFrom: '2026-01-01', validTo: '2026-12-31', hotel: { id: 'h-petra', name: 'Petra Moon Hotel' } },
    { id: 'c-wr', hotelId: 'h-wr', name: 'WR 2026', currency: 'USD', validFrom: '2026-01-01', validTo: '2026-12-31', hotel: { id: 'h-wr', name: 'Wadi Rum Bedouin Camp' } },
  ];
  const hotelRates: HotelRate[] = [
    { id: 'r-petra', contractId: 'c-petra', seasonName: 'Std', roomCategoryId: 'rc1', occupancyType: 'DBL', mealPlan: 'BB', currency: 'USD', cost: 50, roomCategory: { id: 'rc1', name: 'Standard', code: null } },
    { id: 'r-wr', contractId: 'c-wr', seasonName: 'Std', roomCategoryId: 'rc2', occupancyType: 'DBL', mealPlan: 'HB', currency: 'USD', cost: 60, roomCategory: { id: 'rc2', name: 'Tent', code: null } },
  ];
  const opts = (overrides: Record<number, { city?: string | null; disabled?: boolean }> = {}) => ({
    hotels, hotelContracts, hotelRates, travelStartDate: '2026-06-10', overrides,
  });

  const danaPetra: TouringRouteForGen = {
    id: 'r', name: 'Dana & Petra', startCity: 'Amman', durationDays: 2,
    stops: [
      { order: 0, city: 'Amman', poiId: 'p-amman', pointOfInterest: poi('Amman') },
      { order: 1, city: 'Dana', poiId: 'p-dana', pointOfInterest: poi('Dana') },
      { order: 2, city: 'Petra / Wadi Musa', poiId: 'p-petra', pointOfInterest: poi('Petra') },
      { order: 3, city: 'Amman', poiId: null, pointOfInterest: null },
    ],
  };
  const petraWadiRum: TouringRouteForGen = {
    id: 'r2', name: 'Petra & Wadi Rum', startCity: 'Petra', durationDays: 2, mainDestinations: ['Wadi Rum'],
    stops: [
      { order: 0, city: 'Petra', poiId: 'p-petra', pointOfInterest: poi('Petra') },
      { order: 1, city: 'Wadi Rum', poiId: 'p-wr', pointOfInterest: poi('Wadi Rum') },
    ],
  };
  const ajlounJerash: TouringRouteForGen = {
    id: 'r3', name: 'Jerash & Ajloun', startCity: 'Amman', durationDays: 1,
    stops: [
      { order: 0, city: 'Jerash', poiId: 'p-j', pointOfInterest: poi('Jerash') },
      { order: 1, city: 'Ajloun', poiId: 'p-a', pointOfInterest: poi('Ajloun') },
    ],
  };
  const aqabaNoHotel: TouringRouteForGen = {
    id: 'r4', name: 'Aqaba', startCity: 'Amman', durationDays: 2,
    stops: [
      { order: 0, city: 'Amman', poiId: 'p-amman', pointOfInterest: poi('Amman') },
      { order: 1, city: 'Aqaba', poiId: 'p-aqaba', pointOfInterest: poi('Aqaba') },
    ],
  };

  it('Amman -> Dana -> Petra suggests the Petra hotel (not Dana)', () => {
    const { suggestions } = buildOvernightHotelSuggestions(danaPetra, opts());
    assert.equal(suggestions.length, 1);
    assert.match(suggestions[0].city, /Petra/);
    assert.doesNotMatch(suggestions[0].city, /Dana/);
    assert.equal(suggestions[0].hotelName, 'Petra Moon Hotel');
    assert.equal(suggestions[0].mealPlan, 'BB');
    assert.equal(suggestions[0].missingReason, null);
  });

  it('Petra -> Wadi Rum suggests the Wadi Rum camp', () => {
    const { suggestions } = buildOvernightHotelSuggestions(petraWadiRum, opts());
    assert.equal(suggestions.length, 1);
    assert.match(suggestions[0].city, /Wadi Rum/);
    assert.equal(suggestions[0].hotelName, 'Wadi Rum Bedouin Camp');
  });

  it('Ajloun & Jerash one-day route -> no hotel suggestions', () => {
    const { suggestions } = buildOvernightHotelSuggestions(ajlounJerash, opts());
    assert.equal(suggestions.length, 0);
  });

  it('no hotel in the overnight city -> No suitable hotel found (missingReason)', () => {
    const { suggestions } = buildOvernightHotelSuggestions(aqabaNoHotel, opts());
    assert.equal(suggestions.length, 1);
    assert.match(suggestions[0].city, /Aqaba/);
    assert.equal(suggestions[0].hotelName, null);
    assert.equal(suggestions[0].missingReason, 'no-hotel-in-city');
  });

  it('operator disables a suggestion -> no hotel for that night', () => {
    const { suggestions } = buildOvernightHotelSuggestions(danaPetra, opts({ 1: { disabled: true } }));
    assert.equal(suggestions[0].disabled, true);
    assert.equal(suggestions[0].hotelName, null);
  });

  it('operator changes the overnight city -> re-resolves to the new city hotel', () => {
    const { suggestions } = buildOvernightHotelSuggestions(danaPetra, opts({ 1: { city: 'Wadi Rum' } }));
    assert.equal(suggestions[0].city, 'Wadi Rum');
    assert.equal(suggestions[0].hotelName, 'Wadi Rum Bedouin Camp');
  });
});

describe('Phase 3D.2B/3D.2C-A apply plan creates NO hotel item without confirmation', () => {
  it('buildTouringRouteApplyPlan returns an empty hotels[] when no suggestions/confirmation are passed', () => {
    const route: TouringRouteForGen = {
      id: 'r', name: 'Amman City', startCity: 'Amman', durationDays: 1,
      stops: [{ order: 0, city: 'Amman', poiId: 'p1', pointOfInterest: { id: 'p1', code: 'AMM', name: 'Amman Citadel' } }],
    };
    const preview = buildTouringRoutePreview(route, { pricingRowId: null, startDate: null });
    const plan = buildTouringRouteApplyPlan(preview, { pax: 2, transportServiceId: 'svc-1', existingDayCount: 0, existingItemCount: 0 });
    // 3D.2C-A adds a hotels[] field to the plan, but with no confirmed suggestions
    // it stays empty — no hotel item is ever created without explicit confirmation.
    assert.deepEqual(plan.hotels, []);
    assert.ok(Array.isArray(plan.days));
  });
});

describe('Phase 3D.2C-A confirmed-hotel apply plan (pure; no writes)', () => {
  const SVC = 'transport-svc-1';
  const HSVC = 'hotel-svc-1';
  const hotels: Hotel[] = [
    { id: 'h-petra', name: 'Petra Moon Hotel', city: 'Petra / Wadi Musa', category: '4 star', roomCategories: [] },
    { id: 'h-wr', name: 'Wadi Rum Bedouin Camp', city: 'Wadi Rum', category: 'camp', roomCategories: [] },
  ];
  const hotelContracts: HotelContract[] = [
    { id: 'c-petra', hotelId: 'h-petra', name: 'Petra 2026', currency: 'USD', validFrom: '2026-01-01', validTo: '2026-12-31', hotel: { id: 'h-petra', name: 'Petra Moon Hotel' } },
    { id: 'c-wr', hotelId: 'h-wr', name: 'WR 2026', currency: 'USD', validFrom: '2026-01-01', validTo: '2026-12-31', hotel: { id: 'h-wr', name: 'Wadi Rum Bedouin Camp' } },
  ];
  const hotelRates: HotelRate[] = [
    { id: 'r-petra', contractId: 'c-petra', seasonName: 'Std', roomCategoryId: 'rc1', occupancyType: 'DBL', mealPlan: 'BB', currency: 'USD', cost: 50, roomCategory: { id: 'rc1', name: 'Standard', code: null } },
    { id: 'r-wr', contractId: 'c-wr', seasonName: 'Std', roomCategoryId: 'rc2', occupancyType: 'DBL', mealPlan: 'HB', currency: 'USD', cost: 60, roomCategory: { id: 'rc2', name: 'Tent', code: null } },
  ];

  // Routes mirror the live -4gu9 data (3D.2B verification): a 2-day Dana→Petra,
  // a 2-day Petra→Wadi Rum, and a 1-day Ajloun & Jerash. WITH pricings so the
  // transport package makes the plan applicable.
  const danaPetra: TouringRouteDetailForGen = {
    id: 'dana-petra', name: 'Amman -> Dana -> Petra ON', startCity: 'Amman', durationDays: 2,
    mainDestinations: ['Dana', 'Petra / Wadi Musa'], pricings: PRICINGS,
    stops: [baseStop(1, 'Amman'), poiStop(2, 'Dana', 'DANA', 'Dana'), poiStop(3, 'Petra / Wadi Musa', 'PETRA', 'Petra')],
  };
  const petraWadiRum: TouringRouteDetailForGen = {
    id: 'petra-wr', name: 'Petra -> Wadi Rum ON', startCity: 'Petra', durationDays: 2,
    mainDestinations: ['Wadi Rum'], pricings: PRICINGS,
    stops: [poiStop(1, 'Petra', 'PETRA', 'Petra'), poiStop(2, 'Wadi Rum', 'WR', 'Wadi Rum')],
  };
  const ajlounJerash: TouringRouteDetailForGen = {
    id: 'ajloun', name: 'Ajloun & Jerash', startCity: 'Ajloun', durationDays: 1,
    mainDestinations: ['Jerash'], pricings: PRICINGS,
    stops: [poiStop(1, 'Ajloun', 'AJL', 'Ajloun'), poiStop(2, 'Jerash', 'JER', 'Jerash')],
  };

  function planFor(
    route: TouringRouteDetailForGen,
    o: { confirmedNights?: Record<number, boolean>; overrides?: Record<number, { city?: string | null; disabled?: boolean }>; hotelServiceId?: string | null; pax?: number; roomCount?: number; existingDayCount?: number } = {},
  ) {
    const preview = buildTouringRoutePreview(route, { pricingRowId: 'pr-van', startDate: '2026-06-10' });
    const { suggestions } = buildOvernightHotelSuggestions(route, {
      hotels, hotelContracts, hotelRates, travelStartDate: '2026-06-10', overrides: o.overrides || {},
    });
    return buildTouringRouteApplyPlan(preview, {
      pax: o.pax ?? 2,
      transportServiceId: SVC,
      hotelServiceId: o.hotelServiceId === undefined ? HSVC : o.hotelServiceId,
      hotelSuggestions: suggestions,
      confirmedNights: o.confirmedNights || {},
      roomCount: o.roomCount,
      existingDayCount: o.existingDayCount ?? 0,
      existingItemCount: 0,
    });
  }

  it('confirmed Petra Moon on Amman -> Dana -> Petra produces exactly one ApplyPlanHotel with correct payload', () => {
    const plan = planFor(danaPetra, { confirmedNights: { 1: true }, pax: 4, roomCount: 2 });
    assert.equal(plan.hotels.length, 1);
    const h = plan.hotels[0];
    assert.equal(h.serviceId, HSVC);
    assert.equal(h.hotelId, 'h-petra');
    assert.equal(h.contractId, 'c-petra');
    assert.equal(h.roomCategoryId, 'rc1');
    assert.equal(h.occupancyType, 'DBL');
    assert.equal(h.seasonName, 'Std');
    assert.equal(h.mealPlan, 'BB');
    assert.equal(h.attachToDayNumber, 1);
    assert.equal(h.nightCount, 1);
    assert.equal(h.paxCount, 4);
    assert.equal(h.roomCount, 2);
    assert.equal(h.markupPercent, 20);
  });

  it('skip / add-later (disabled) produces hotels = []', () => {
    const plan = planFor(danaPetra, { confirmedNights: { 1: true }, overrides: { 1: { disabled: true } } });
    assert.deepEqual(plan.hotels, []);
  });

  it('missingReason (overnight city has no hotel) produces hotels = []', () => {
    const plan = planFor(danaPetra, { confirmedNights: { 1: true }, overrides: { 1: { city: 'Aqaba' } } });
    assert.deepEqual(plan.hotels, []);
  });

  it('unconfirmed suggestion produces hotels = []', () => {
    const plan = planFor(danaPetra, { confirmedNights: {} });
    assert.deepEqual(plan.hotels, []);
  });

  it('Ajloun & Jerash (one-day, zero nights) produces hotels = []', () => {
    const plan = planFor(ajlounJerash, { confirmedNights: { 1: true } });
    assert.deepEqual(plan.hotels, []);
  });

  it('Petra -> Wadi Rum confirmed produces one Wadi Rum hotel item', () => {
    const plan = planFor(petraWadiRum, { confirmedNights: { 1: true } });
    assert.equal(plan.hotels.length, 1);
    assert.equal(plan.hotels[0].hotelId, 'h-wr');
    assert.equal(plan.hotels[0].mealPlan, 'HB');
  });

  it('no hotel service wired -> hotels = [] even when confirmed', () => {
    const plan = planFor(danaPetra, { confirmedNights: { 1: true }, hotelServiceId: null });
    assert.deepEqual(plan.hotels, []);
  });

  it('confirmed but blocked quote (existing days) -> hotels = [] (empty-quote gate respected)', () => {
    const plan = planFor(danaPetra, { confirmedNights: { 1: true }, existingDayCount: 3 });
    assert.equal(plan.canApply, false);
    assert.deepEqual(plan.hotels, []);
  });

  it('transport stays exactly one item and days + POI assignments are unchanged when a hotel is confirmed', () => {
    const withHotel = planFor(danaPetra, { confirmedNights: { 1: true } });
    const without = planFor(danaPetra, { confirmedNights: {} });
    assert.deepEqual(withHotel.transport, without.transport); // transport identical, still one package
    assert.deepEqual(withHotel.days, without.days);           // days + POI assignments identical
    assert.equal(withHotel.totalPoiAssignments, without.totalPoiAssignments);
    assert.equal(withHotel.days.length, 2);
    assert.equal(withHotel.totalPoiAssignments, 2); // Dana + Petra POIs
  });
});

describe('Phase 3D.2C-B executeTouringRouteApply (apply runner; injected executors, no DOM/network)', () => {
  const SVC = 'transport-svc-1';
  const HSVC = 'hotel-svc-1';
  const hotels: Hotel[] = [
    { id: 'h-petra', name: 'Petra Moon Hotel', city: 'Petra / Wadi Musa', category: '4 star', roomCategories: [] },
  ];
  const hotelContracts: HotelContract[] = [
    { id: 'c-petra', hotelId: 'h-petra', name: 'Petra 2026', currency: 'USD', validFrom: '2026-01-01', validTo: '2026-12-31', hotel: { id: 'h-petra', name: 'Petra Moon Hotel' } },
  ];
  const hotelRates: HotelRate[] = [
    { id: 'r-petra', contractId: 'c-petra', seasonName: 'Std', roomCategoryId: 'rc1', occupancyType: 'DBL', mealPlan: 'BB', currency: 'USD', cost: 50, roomCategory: { id: 'rc1', name: 'Standard', code: null } },
  ];
  const danaPetra: TouringRouteDetailForGen = {
    id: 'dana-petra', name: 'Amman -> Dana -> Petra ON', startCity: 'Amman', durationDays: 2,
    mainDestinations: ['Dana', 'Petra / Wadi Musa'], pricings: PRICINGS,
    stops: [baseStop(1, 'Amman'), poiStop(2, 'Dana', 'DANA', 'Dana'), poiStop(3, 'Petra / Wadi Musa', 'PETRA', 'Petra')],
  };
  const ajlounJerash: TouringRouteDetailForGen = {
    id: 'ajloun', name: 'Ajloun & Jerash', startCity: 'Ajloun', durationDays: 1,
    mainDestinations: ['Jerash'], pricings: PRICINGS,
    stops: [poiStop(1, 'Ajloun', 'AJL', 'Ajloun'), poiStop(2, 'Jerash', 'JER', 'Jerash')],
  };

  function planFor(
    route: TouringRouteDetailForGen,
    o: { confirmedNights?: Record<number, boolean>; overrides?: Record<number, { city?: string | null; disabled?: boolean }>; hotelServiceId?: string | null; pax?: number; roomCount?: number; existingDayCount?: number } = {},
  ) {
    const preview = buildTouringRoutePreview(route, { pricingRowId: 'pr-van', startDate: '2026-06-10' });
    const { suggestions } = buildOvernightHotelSuggestions(route, { hotels, hotelContracts, hotelRates, travelStartDate: '2026-06-10', overrides: o.overrides || {} });
    return buildTouringRouteApplyPlan(preview, {
      pax: o.pax ?? 2,
      transportServiceId: SVC,
      hotelServiceId: o.hotelServiceId === undefined ? HSVC : o.hotelServiceId,
      hotelSuggestions: suggestions,
      confirmedNights: o.confirmedNights || {},
      roomCount: o.roomCount,
      existingDayCount: o.existingDayCount ?? 0,
      existingItemCount: 0,
    });
  }

  // Recording fakes: day POSTs return an id keyed by dayNumber so transport/hotels
  // attach to the right created day. Only `post` (POST) and `putPois` (PUT) exist —
  // there is no delete/patch executor by construction.
  async function runWith(plan: ReturnType<typeof buildTouringRouteApplyPlan>) {
    const posts: Array<{ path: string; body: any }> = [];
    const poiPuts: Array<{ dayId: string; assignments: any[] }> = [];
    const result = await executeTouringRouteApply(
      plan,
      { quoteId: 'q1', dateByDay: { 1: '2026-06-10', 2: '2026-06-11' } },
      {
        post: async (path: string, body: any) => {
          posts.push({ path, body });
          return path.endsWith('/itinerary/day') ? { id: `day-${body.dayNumber}` } : {};
        },
        putPois: async (dayId: string, assignments: any[]) => { poiPuts.push({ dayId, assignments }); },
      },
    );
    const itemPosts = posts.filter((p) => p.path === '/quotes/q1/items');
    return {
      result, posts, poiPuts,
      dayPosts: posts.filter((p) => p.path === '/quotes/q1/itinerary/day'),
      transportPosts: itemPosts.filter((p) => p.body.touringRouteId),
      hotelPosts: itemPosts.filter((p) => p.body.hotelId),
    };
  }

  it('confirmed Petra Moon -> exactly ONE hotel POST with the existing payload shape', async () => {
    const plan = planFor(danaPetra, { confirmedNights: { 1: true }, pax: 4, roomCount: 2 });
    const { hotelPosts, transportPosts, dayPosts, poiPuts, result } = await runWith(plan);
    assert.equal(hotelPosts.length, 1);
    assert.deepEqual(hotelPosts[0].body, {
      serviceId: HSVC, itineraryId: 'day-1', quantity: 2, paxCount: 4, roomCount: 2,
      nightCount: 1, markupPercent: 20, hotelId: 'h-petra', contractId: 'c-petra',
      seasonName: 'Std', roomCategoryId: 'rc1', occupancyType: 'DBL', mealPlan: 'BB',
    });
    assert.equal(transportPosts.length, 1);   // transport still exactly once
    assert.equal(dayPosts.length, 2);          // 2 days created
    assert.ok(poiPuts.length >= 1);            // POI assignments still happen
    assert.equal(result.hotelsCreated, 1);
  });

  it('skip / add-later -> no hotel POST (transport still once)', async () => {
    const plan = planFor(danaPetra, { confirmedNights: { 1: true }, overrides: { 1: { disabled: true } } });
    const { hotelPosts, transportPosts } = await runWith(plan);
    assert.equal(hotelPosts.length, 0);
    assert.equal(transportPosts.length, 1);
  });

  it('missingReason (overnight city has no hotel) -> no hotel POST', async () => {
    const plan = planFor(danaPetra, { confirmedNights: { 1: true }, overrides: { 1: { city: 'Aqaba' } } });
    const { hotelPosts } = await runWith(plan);
    assert.equal(hotelPosts.length, 0);
  });

  it('unconfirmed default -> no hotel POST (transport + POIs still happen)', async () => {
    const plan = planFor(danaPetra, { confirmedNights: {} });
    const { hotelPosts, transportPosts, poiPuts } = await runWith(plan);
    assert.equal(hotelPosts.length, 0);
    assert.equal(transportPosts.length, 1);
    assert.ok(poiPuts.length >= 1);
  });

  it('Ajloun & Jerash (one-day, zero nights) -> no hotel POST', async () => {
    const plan = planFor(ajlounJerash, { confirmedNights: { 1: true } });
    const { hotelPosts } = await runWith(plan);
    assert.equal(hotelPosts.length, 0);
  });

  it('empty-quote gate (blocked plan) -> NO writes at all', async () => {
    const plan = planFor(danaPetra, { confirmedNights: { 1: true }, existingDayCount: 3 });
    const { posts, poiPuts, result } = await runWith(plan);
    assert.equal(posts.length, 0);
    assert.equal(poiPuts.length, 0);
    assert.deepEqual(result, { daysCreated: 0, transportCreated: 0, poiAssignmentsCreated: 0, hotelsCreated: 0 });
  });

  it('all writes are create-only (POST to /quotes/q1/...; POIs via PUT) — no delete/patch', async () => {
    const plan = planFor(danaPetra, { confirmedNights: { 1: true } });
    const { posts } = await runWith(plan);
    assert.ok(posts.length > 0);
    assert.ok(posts.every((p) => p.path.startsWith('/quotes/q1/')));
  });

  it('buildHotelItemPayload maps an ApplyPlanHotel to the exact existing item payload', () => {
    const plan = planFor(danaPetra, { confirmedNights: { 1: true }, pax: 3, roomCount: 2 });
    assert.equal(plan.hotels.length, 1);
    assert.deepEqual(buildHotelItemPayload(plan.hotels[0], 'day-1'), {
      serviceId: HSVC, itineraryId: 'day-1', quantity: 2, paxCount: 3, roomCount: 2,
      nightCount: 1, markupPercent: 20, hotelId: 'h-petra', contractId: 'c-petra',
      seasonName: 'Std', roomCategoryId: 'rc1', occupancyType: 'DBL', mealPlan: 'BB',
    });
  });
});
