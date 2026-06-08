import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildTailorMadeJordanDraft, deriveOvernightStays, deriveOvernightCityFromDay } from './tailor-made-draft';

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

// ---- Phase R.2: overnight-stay grouping (read-only hotel suggestions) ----

// Map a generated draft into the day shells as APPLY persists them
// (title + notes=narrative), to prove grouping works on stored rows.
function persistedDays(input: any) {
  return buildTailorMadeJordanDraft(input).days.map((d) => ({
    dayNumber: d.dayNumber,
    title: d.title,
    notes: d.narrative,
    isActive: true,
  }));
}

test('R.2: standard 8-day draft groups into Amman×2, Petra×1, Wadi Rum×1, Dead Sea×3', () => {
  const stays = deriveOvernightStays(persistedDays(CLASSIC), '4-star');
  assert.deepEqual(
    stays.map((s) => `${s.city} x${s.nights} (D${s.startDay}-${s.endDay})`),
    ['Amman x2 (D1-2)', 'Petra x1 (D3-3)', 'Wadi Rum x1 (D4-4)', 'Dead Sea x3 (D5-7)'],
  );
  // hotel category echoed, candidates intentionally empty (grouping-only), no pricing fields
  assert.ok(stays.every((s) => s.hotelCategory === '4-star'));
  assert.ok(stays.every((s) => Array.isArray(s.candidateHotels) && s.candidateHotels.length === 0));
  assert.doesNotMatch(JSON.stringify(stays), /price|cost|total|amount|rate/i);
});

test('R.2: the departure day produces no stay', () => {
  const stays = deriveOvernightStays(persistedDays(CLASSIC));
  const totalNights = stays.reduce((n, s) => n + s.nights, 0);
  assert.equal(totalNights, 7, '7 overnight nights across 8 days');
  assert.ok(!stays.some((s) => /departure/i.test(s.city)));
});

test('R.2: overnight city derives from narrative, falling back to the title', () => {
  assert.equal(deriveOvernightCityFromDay({ dayNumber: 1, title: 'Arrival Amman', notes: 'Meet & assist at QAIA, transfer to Amman, overnight Amman.' }), 'Amman');
  assert.equal(deriveOvernightCityFromDay({ dayNumber: 6, title: 'Dead Sea', notes: 'Free day at the Dead Sea, overnight Dead Sea.' }), 'Dead Sea');
  // title fallback when notes carry no "overnight" sentence
  assert.equal(deriveOvernightCityFromDay({ dayNumber: 4, title: 'Petra Visit / Wadi Rum', notes: 'Edited note without overnight keyword' }), 'Wadi Rum');
  // departure day → no overnight
  assert.equal(deriveOvernightCityFromDay({ dayNumber: 8, title: 'Departure', notes: 'Transfer from Dead Sea to QAIA for your departure flight.' }), null);
});

test('R.2: consecutive same-city days merge; non-consecutive do not', () => {
  const days = [
    { dayNumber: 1, title: 'Amman', notes: 'overnight Amman.', isActive: true },
    { dayNumber: 2, title: 'Petra', notes: 'overnight Petra.', isActive: true },
    { dayNumber: 3, title: 'Amman', notes: 'overnight Amman.', isActive: true },
  ];
  const stays = deriveOvernightStays(days);
  // Amman on D1 and D3 are NOT consecutive → two separate Amman stays
  assert.deepEqual(stays.map((s) => `${s.city}:${s.startDay}-${s.endDay}`), ['Amman:1-1', 'Petra:2-2', 'Amman:3-3']);
});

test('R.2: narrative fallback derives the city when the title is blank', () => {
  const days = [
    { dayNumber: 1, title: '', notes: 'Arrival and transfer, overnight Amman.', isActive: true },
    { dayNumber: 2, title: '', notes: 'Leisure day, overnight Amman.', isActive: true },
  ];
  // blank titles → narrative "…, overnight Amman." fallback → one merged 2-night stay
  assert.deepEqual(deriveOvernightStays(days).map((s) => `${s.city}:${s.nights}`), ['Amman:2']);
});

test('R.2: no days → empty stays (clear empty state, no throw)', () => {
  assert.deepEqual(deriveOvernightStays([]), []);
  assert.deepEqual(deriveOvernightStays([{ dayNumber: 1, title: 'Departure', notes: '' }]), []);
});

test('R.2: inactive days are ignored', () => {
  const days = [
    { dayNumber: 1, title: 'Amman', notes: 'overnight Amman.', isActive: false },
    { dayNumber: 2, title: 'Petra', notes: 'overnight Petra.', isActive: true },
  ];
  assert.deepEqual(deriveOvernightStays(days).map((s) => s.city), ['Petra']);
});
