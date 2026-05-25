import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assignGeneratedItineraryCities,
  assignGeneratedItineraryCitiesByNights,
  buildItineraryApplyMessage,
  expandNightStopsToDayCities,
  generateItineraryDays,
  getAutoItineraryDayTitle,
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
});
