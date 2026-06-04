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
  reconstructNightStopsFromDayTitles,
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

describe('deriveTouringRouteBaseCities', () => {
  it('collapses a round-trip day-anchor route to a single base day', () => {
    // "Amman - Amman City Tour - Jerash - Amman", 1 day → one Amman base.
    const result = deriveTouringRouteBaseCities({
      startCity: 'Amman',
      durationDays: 1,
      mainDestinations: ['Amman City Tour', 'Jerash'],
    });
    assert.deepEqual(result.cities, ['Amman']);
    assert.equal(result.dayCount, 1);
  });

  it('maps one distinct base per day for a linear multi-city route', () => {
    const result = deriveTouringRouteBaseCities({
      startCity: 'Amman',
      durationDays: 4,
      mainDestinations: ['Petra', 'Wadi Rum', 'Aqaba'],
    });
    assert.deepEqual(result.cities, ['Amman', 'Petra', 'Wadi Rum', 'Aqaba']);
    assert.equal(result.dayCount, 4);
    assert.equal(result.notes.length, 0);
  });

  it('assigns extra nights to overnight-eligible bases when days exceed bases', () => {
    // 5 days, bases Amman + Petra + Wadi Rum (3) → 2 extra nights go to the
    // overnight-eligible bases (Petra, Wadi Rum), not Amman.
    const result = deriveTouringRouteBaseCities({
      startCity: 'Amman',
      durationDays: 5,
      mainDestinations: ['Petra', 'Wadi Rum'],
    });
    assert.equal(result.cities.length, 5);
    assert.equal(result.cities.filter((c) => c === 'Amman').length, 1);
    assert.equal(result.cities.filter((c) => c === 'Petra').length, 2);
    assert.equal(result.cities.filter((c) => c === 'Wadi Rum').length, 2);
    assert.ok(result.notes.length >= 1);
  });

  it('clamps and warns when there are more bases than days', () => {
    const result = deriveTouringRouteBaseCities({
      startCity: 'Amman',
      durationDays: 2,
      mainDestinations: ['Petra', 'Wadi Rum', 'Aqaba'],
    });
    assert.equal(result.cities.length, 2);
    assert.deepEqual(result.cities, ['Amman', 'Petra']);
    assert.ok(result.notes.length >= 1);
  });

  it('falls back to the start city when destinations are empty, clamps duration to >=1', () => {
    const result = deriveTouringRouteBaseCities({ startCity: 'Amman', durationDays: 0, mainDestinations: [] });
    assert.deepEqual(result.cities, ['Amman']);
    assert.equal(result.dayCount, 1);
  });
});
