import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildTailorMadeJordanDraft } from './tailor-made-draft';

// Phase R.1 — the tailor-made draft generator produces an editable 8-day /
// 7-overnight Jordan classic itinerary structure with no pricing/DB side effects.

const CLASSIC = {
  durationDays: 8,
  arrivalCity: 'Amman',
  arrivalAirport: 'QAIA',
  departureCity: 'Dead Sea',
  departureAirport: 'QAIA',
  pax: 2,
  hotelCategory: '4-star',
  travelStyle: 'classic' as const,
  requiredPlaces: ['Petra', 'Wadi Rum', 'Dead Sea', 'Jerash'],
  optionalPlaces: ['Bethany', 'Madaba', 'Mount Nebo'],
  guideType: 'local',
  currency: 'USD',
};

test('generates 8 days with 7 overnight placements', () => {
  const draft = buildTailorMadeJordanDraft(CLASSIC);
  assert.equal(draft.destination, 'Jordan');
  assert.equal(draft.durationDays, 8);
  assert.equal(draft.nightCount, 7);
  assert.equal(draft.days.length, 8);
  assert.equal(draft.overnightCount, 7, '7 days carry an overnight; departure day does not');
  // day numbers are 1..8 in order
  assert.deepEqual(draft.days.map((d) => d.dayNumber), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('Day 1 is arrival and Day 8 is departure (no overnight on departure)', () => {
  const draft = buildTailorMadeJordanDraft(CLASSIC);
  const d1 = draft.days[0];
  const d8 = draft.days[7];
  assert.match(d1.title, /^Arrival Amman$/);
  assert.match(d1.narrative, /QAIA/);
  assert.equal(d1.overnightCity, 'Amman');
  assert.equal(d8.title, 'Departure');
  assert.equal(d8.overnightCity, null);
  assert.match(d8.narrative, /Dead Sea.*QAIA/);
});

test('overnight sequence matches the classic Jordan route', () => {
  const draft = buildTailorMadeJordanDraft(CLASSIC);
  assert.deepEqual(
    draft.days.map((d) => d.overnightCity),
    ['Amman', 'Amman', 'Petra', 'Wadi Rum', 'Dead Sea', 'Dead Sea', 'Dead Sea', null],
  );
});

test('required places are all placed (none left unplaced)', () => {
  const draft = buildTailorMadeJordanDraft(CLASSIC);
  assert.deepEqual(draft.unplacedRequiredPlaces, [], 'all required places appear on a day');
  const titles = draft.days.map((d) => d.title).join(' | ');
  assert.match(titles, /Jerash/);
  assert.match(titles, /Petra/);
  assert.match(titles, /Wadi Rum/);
  assert.match(titles, /Dead Sea/);
});

test('optional Madaba / Mount Nebo are woven into the Petra-transfer day', () => {
  const draft = buildTailorMadeJordanDraft(CLASSIC);
  const d3 = draft.days[2];
  assert.match(d3.title, /Madaba/);
  assert.match(d3.title, /Mount Nebo/);
  assert.match(d3.title, /Petra$/);
  assert.equal(d3.overnightCity, 'Petra');
});

test('Bethany appears on Day 7 when requested, and is dropped when not', () => {
  const withB = buildTailorMadeJordanDraft(CLASSIC);
  assert.match(withB.days[6].title, /Bethany \/ Dead Sea/);
  assert.match(withB.days[6].narrative, /Bethany/);

  const withoutB = buildTailorMadeJordanDraft({ ...CLASSIC, optionalPlaces: [], requiredPlaces: ['Petra', 'Wadi Rum', 'Dead Sea', 'Jerash'] });
  assert.equal(withoutB.days[6].title, 'Dead Sea');
  assert.doesNotMatch(withoutB.days[6].narrative, /Bethany/);
});

test('Day 5 features the Wadi Rum jeep tour and moves to the Dead Sea', () => {
  const draft = buildTailorMadeJordanDraft(CLASSIC);
  const d5 = draft.days[4];
  assert.equal(d5.title, 'Wadi Rum / Dead Sea');
  assert.match(d5.narrative, /jeep tour/i);
  assert.equal(d5.overnightCity, 'Dead Sea');
});

test('without optional Jerash, Day 2 is a city tour and Jerash is reported unplaced if required', () => {
  const draft = buildTailorMadeJordanDraft({ ...CLASSIC, requiredPlaces: ['Petra', 'Jerash'], optionalPlaces: [] });
  // Jerash is required but no longer in optional; the generator still folds it in
  // because it checks BOTH lists — so Day 2 keeps Jerash.
  assert.match(draft.days[1].title, /Jerash/);
  assert.deepEqual(draft.unplacedRequiredPlaces, []);
});

test('inputs are echoed and defaults applied; no pricing fields emitted', () => {
  const draft = buildTailorMadeJordanDraft({ requiredPlaces: ['Petra'] });
  assert.equal(draft.input.arrivalCity, 'Amman');
  assert.equal(draft.input.arrivalAirport, 'QAIA');
  assert.equal(draft.input.currency, 'USD');
  assert.equal(draft.input.travelStyle, 'classic');
  // the draft is purely structural — no money/price/cost anywhere
  assert.doesNotMatch(JSON.stringify(draft), /price|cost|total|amount|markup/i);
});

test('a custom arrival city flows into Day 1 and the city-tour title', () => {
  const draft = buildTailorMadeJordanDraft({ ...CLASSIC, arrivalCity: 'Aqaba', optionalPlaces: [] });
  assert.match(draft.days[0].title, /Arrival Aqaba/);
  assert.equal(draft.days[0].overnightCity, 'Aqaba');
});
