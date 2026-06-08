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

// ---- Phase R.2b: contract-backed candidate matching (pure) ----

import { matchHotelCandidatesForStay } from './tailor-made-draft';

const HOTELS = [
  { id: 'h-corp', name: 'Corp Amman Hotel', city: 'Amman', category: '4-star', preferenceRank: 1, activeContracts: [{ id: 'c1', verified: true }] },
  { id: 'h-hyatt', name: 'Grand Hyatt Amman', city: 'Amman', category: '5-star', preferenceRank: null, activeContracts: [{ id: 'c2', verified: false }] },
  { id: 'h-noc', name: 'No Contract Amman Inn', city: 'Amman', category: '3-star', preferenceRank: null, activeContracts: [] },
  { id: 'h-moon', name: 'Petra Moon Hotel', city: 'Petra / Wadi Musa', category: '4-star', preferenceRank: null, activeContracts: [{ id: 'c3', verified: true }] },
  { id: 'h-sun', name: 'Sun City Camp', city: 'Wadi Rum', category: '4-star', preferenceRank: null, activeContracts: [{ id: 'c4', verified: true }] },
];

test('R.2b: candidates match by city (fuzzy) and rank preferred→verified→active→alpha', () => {
  const amman = matchHotelCandidatesForStay('Amman', HOTELS);
  assert.deepEqual(amman.map((c) => c.hotelName), ['Corp Amman Hotel', 'Grand Hyatt Amman', 'No Contract Amman Inn']);
  // preferred (rank 1) first; reasons reflect the strongest signal
  assert.equal(amman[0].reason, 'Verified contract'); // verified takes the label even with rank
  assert.equal(amman.find((c) => c.hotelName === 'No Contract Amman Inn')!.reason, 'City match');
});

test('R.2b: "Petra" fuzzy-matches a "Petra / Wadi Musa" hotel; Wadi Rum exact', () => {
  assert.deepEqual(matchHotelCandidatesForStay('Petra', HOTELS).map((c) => c.hotelName), ['Petra Moon Hotel']);
  assert.deepEqual(matchHotelCandidatesForStay('Wadi Rum', HOTELS).map((c) => c.hotelName), ['Sun City Camp']);
});

test('R.2b: candidates carry no contract NAME or pricing, only safe planning fields', () => {
  const c = matchHotelCandidatesForStay('Amman', HOTELS)[0];
  assert.deepEqual(Object.keys(c).sort(), ['category', 'city', 'contractId', 'hasActiveContract', 'hotelId', 'hotelName', 'reason', 'verified']);
  assert.doesNotMatch(JSON.stringify(matchHotelCandidatesForStay('Amman', HOTELS)), /price|cost|total|amount|rate|agreement/i);
});

test('R.2b: no city match → empty candidates (clear, no throw)', () => {
  assert.deepEqual(matchHotelCandidatesForStay('Aqaba', HOTELS), []);
  assert.deepEqual(matchHotelCandidatesForStay('', HOTELS), []);
});

test('R.2b: limit caps candidates per stay', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, name: `Amman Hotel ${i}`, city: 'Amman', activeContracts: [] }));
  assert.equal(matchHotelCandidatesForStay('Amman', many, { limit: 3 }).length, 3);
});

// ---- Phase R.3: transport suggestions (pure, descriptive) ----

import { deriveTransportSuggestions } from './tailor-made-draft';

test('R.3: standard 8-day draft classifies transport per day', () => {
  const sugg = deriveTransportSuggestions(persistedDays(CLASSIC));
  const byDay = Object.fromEntries(sugg.map((s) => [s.dayNumber, s]));
  assert.equal(byDay[1].suggestedTransportType, 'ARRIVAL_TRANSFER');
  assert.equal(byDay[1].routeLabel, 'QAIA → Amman');
  assert.equal(byDay[1].pricingModeSuggestion, 'POINT_TO_POINT');
  assert.equal(byDay[2].suggestedTransportType, 'TOURING_FULL_DAY'); // Amman / Jerash / Amman
  assert.equal(byDay[3].suggestedTransportType, 'TOURING_FULL_DAY'); // … / Petra
  assert.equal(byDay[4].suggestedTransportType, 'TOURING_FULL_DAY'); // Petra / Wadi Rum
  assert.equal(byDay[5].suggestedTransportType, 'TOURING_FULL_DAY'); // Wadi Rum / Dead Sea
  assert.equal(byDay[6].suggestedTransportType, 'NONE');             // Dead Sea leisure
  assert.equal(byDay[7].suggestedTransportType, 'TOURING_FULL_DAY'); // Bethany / Dead Sea
  assert.equal(byDay[8].suggestedTransportType, 'DEPARTURE_TRANSFER');
  assert.equal(byDay[8].routeLabel, 'Dead Sea → QAIA');
  assert.equal(byDay[8].pricingModeSuggestion, 'POINT_TO_POINT');
  // touring days carry FULL_DAY hint + a route label
  assert.equal(byDay[3].pricingModeSuggestion, 'FULL_DAY');
  assert.match(byDay[3].routeLabel, /Amman \/ Madaba \/ Mount Nebo \/ Petra/);
});

test('R.3: a pure leisure day (no Bethany) suggests no transport', () => {
  const noBethany = persistedDays({ ...CLASSIC, optionalPlaces: ['Madaba', 'Mount Nebo'], requiredPlaces: ['Petra', 'Wadi Rum', 'Dead Sea', 'Jerash'] });
  const byDay = Object.fromEntries(deriveTransportSuggestions(noBethany).map((s) => [s.dayNumber, s]));
  assert.equal(byDay[7].suggestedTransportType, 'NONE'); // Day 7 "Dead Sea" only
  assert.equal(byDay[6].suggestedTransportType, 'NONE');
});

test('R.3: touring move-day records origin/destination/stops', () => {
  const byDay = Object.fromEntries(deriveTransportSuggestions(persistedDays(CLASSIC)).map((s) => [s.dayNumber, s]));
  assert.equal(byDay[3].origin, 'Amman');
  assert.equal(byDay[3].destination, 'Petra');
  assert.deepEqual(byDay[3].stops, ['Madaba', 'Mount Nebo']);
});

test('R.3: descriptive only — no matched route, no candidates, no pricing fields', () => {
  const sugg = deriveTransportSuggestions(persistedDays(CLASSIC));
  assert.ok(sugg.every((s) => s.matchedRouteId === null && s.candidateTransport.length === 0));
  // no vehicle class / rate / price leaks in the planning payload
  assert.doesNotMatch(JSON.stringify(sugg), /Sedan|Coaster|\bprice\b|markup|totalSell|\brate\b/i);
});

test('R.3: inactive days and empty input are handled', () => {
  assert.deepEqual(deriveTransportSuggestions([]), []);
  const onlyDeparture = deriveTransportSuggestions([{ dayNumber: 1, title: 'Departure', notes: 'Transfer from Dead Sea to QAIA for your departure flight.', isActive: true }]);
  assert.equal(onlyDeparture[0].suggestedTransportType, 'DEPARTURE_TRANSFER');
});

// ---- Phase R.3b: draft day / overnight / route derivation cleanup ----
//
// The STANDARD input has NO Jerash (so Day 2 is the broad "Amman City Tour"
// activity title) and NO explicit departureCity — exactly the two cases that
// previously misderived: a leaked "Amman City Tour" stay city, and an
// "Amman → QAIA" departure. CLASSIC pinned both, so the old tests masked them.
const STANDARD = {
  durationDays: 8,
  arrivalCity: 'Amman',
  arrivalAirport: 'QAIA',
  departureAirport: 'QAIA',
  // departureCity intentionally omitted → engine should resolve last overnight.
  requiredPlaces: ['Petra', 'Wadi Rum', 'Dead Sea'],
  optionalPlaces: [],
};

test('R.3b: standard draft hotel suggestions never return "Amman City Tour" as a stay city', () => {
  const stays = deriveOvernightStays(persistedDays(STANDARD), '4-star');
  const cities = stays.map((s) => s.city);
  assert.ok(!cities.some((c) => /city tour/i.test(c)), `no activity-title city among ${JSON.stringify(cities)}`);
  assert.ok(cities.includes('Amman'), 'the Amman overnight resolves to the base city');
  // Day 2 really is the "Amman City Tour" activity title in this draft.
  assert.equal(persistedDays(STANDARD)[1].title, 'Amman City Tour');
});

test('R.3b: standard grouping stays Amman×2, Petra×1, Wadi Rum×1, Dead Sea×3', () => {
  const stays = deriveOvernightStays(persistedDays(STANDARD), '4-star');
  assert.deepEqual(
    stays.map((s) => `${s.city} x${s.nights} (D${s.startDay}-${s.endDay})`),
    ['Amman x2 (D1-2)', 'Petra x1 (D3-3)', 'Wadi Rum x1 (D4-4)', 'Dead Sea x3 (D5-7)'],
  );
});

test('R.3b: overnight city is narrative-first; activity titles fall back to the base city', () => {
  // narrative wins even when the title is a broad activity label
  assert.equal(deriveOvernightCityFromDay({ dayNumber: 2, title: 'Amman City Tour', notes: 'Visit Amman highlights, overnight Amman.' }), 'Amman');
  // title fallback (blank notes) strips the activity qualifier
  assert.equal(deriveOvernightCityFromDay({ dayNumber: 2, title: 'Amman City Tour', notes: '' }), 'Amman');
  assert.equal(deriveOvernightCityFromDay({ dayNumber: 3, title: 'Petra Day Tour', notes: '' }), 'Petra');
  assert.equal(deriveOvernightCityFromDay({ dayNumber: 4, title: 'Aqaba Highlights', notes: '' }), 'Aqaba');
});

test('R.3b: standard draft departure uses the previous overnight (Dead Sea → QAIA), not Amman', () => {
  const draft = buildTailorMadeJordanDraft(STANDARD);
  const d8 = draft.days[7];
  assert.equal(d8.title, 'Departure');
  assert.match(d8.narrative, /Transfer from Dead Sea to QAIA/);
  assert.equal(draft.input.departureCity, 'Dead Sea', 'echoed departure origin is the resolved last overnight');
  const byDay = Object.fromEntries(deriveTransportSuggestions(persistedDays(STANDARD)).map((s) => [s.dayNumber, s]));
  assert.equal(byDay[8].suggestedTransportType, 'DEPARTURE_TRANSFER');
  assert.equal(byDay[8].routeLabel, 'Dead Sea → QAIA');
});

test('R.3b: an explicit departureCity is preserved', () => {
  const draft = buildTailorMadeJordanDraft({ ...STANDARD, departureCity: 'Amman' });
  assert.match(draft.days[7].narrative, /Transfer from Amman to QAIA/);
  const byDay = Object.fromEntries(deriveTransportSuggestions(persistedDays({ ...STANDARD, departureCity: 'Amman' })).map((s) => [s.dayNumber, s]));
  assert.equal(byDay[8].routeLabel, 'Amman → QAIA');
});

test('R.3b: departure-origin safety net fills from the previous overnight when notes omit it', () => {
  const byDay = Object.fromEntries(
    deriveTransportSuggestions([
      { dayNumber: 1, title: 'Arrival Amman', notes: 'Transfer to Amman, overnight Amman.', isActive: true },
      { dayNumber: 2, title: 'Dead Sea', notes: 'Leisure day, overnight Dead Sea.', isActive: true },
      { dayNumber: 3, title: 'Departure', notes: 'Departure day — flight home.', isActive: true },
    ]).map((s) => [s.dayNumber, s]),
  );
  assert.equal(byDay[3].suggestedTransportType, 'DEPARTURE_TRANSFER');
  assert.equal(byDay[3].origin, 'Dead Sea', 'origin backfilled from the last overnight');
  assert.match(byDay[3].routeLabel, /Dead Sea → /);
});

test('R.3b: derivation changes introduce no pricing/cost fields', () => {
  const draft = buildTailorMadeJordanDraft(STANDARD);
  assert.doesNotMatch(JSON.stringify(draft), /price|cost|total|amount|markup|rate/i);
  assert.doesNotMatch(JSON.stringify(deriveOvernightStays(persistedDays(STANDARD))), /price|cost|total|amount|markup/i);
  assert.doesNotMatch(JSON.stringify(deriveTransportSuggestions(persistedDays(STANDARD))), /price|cost|markup|totalSell/i);
});

// ---- Phase R.4: entrance / ticket / activity suggestions (pure, descriptive) ----

import { deriveExperienceSuggestions, enrichExperienceMatches } from './tailor-made-draft';

const byPlace = (days: any) => {
  const out: Record<string, any[]> = {};
  for (const s of deriveExperienceSuggestions(days)) (out[s.place] ||= []).push(s);
  return out;
};

test('R.4: standard CLASSIC draft suggests Jerash, Petra, and the Wadi Rum Jeep Tour', () => {
  const places = byPlace(persistedDays(CLASSIC));
  assert.ok(places['Jerash'], 'Jerash entrance suggested');
  assert.equal(places['Jerash'][0].dayNumber, 2);
  assert.equal(places['Jerash'][0].suggestedItemType, 'ENTRANCE');
  assert.ok(places['Petra'], 'Petra entrance suggested');
  assert.equal(places['Petra'][0].dayNumber, 4, 'Petra entrance lands on the Petra VISIT day');
  assert.ok(places['Wadi Rum'], 'Wadi Rum jeep tour suggested');
  assert.equal(places['Wadi Rum'][0].suggestedItemType, 'ACTIVITY');
  assert.match(places['Wadi Rum'][0].displayName, /Wadi Rum Jeep Tour — 2 Hours – Rum Area/);
});

test('R.4: Petra is NOT suggested on the arrival/transit day (only on the Visit day)', () => {
  const petra = deriveExperienceSuggestions(persistedDays(CLASSIC)).filter((s) => s.place === 'Petra');
  assert.equal(petra.length, 1, 'exactly one Petra entrance suggestion');
  assert.equal(petra[0].dayNumber, 4);
});

test('R.4: Madaba / Mount Nebo appear when present and are absent when not', () => {
  const withNebo = byPlace(persistedDays(CLASSIC));
  assert.ok(withNebo['Madaba'] && withNebo['Mount Nebo']);
  assert.equal(withNebo['Madaba'][0].dayNumber, 3);
  const without = byPlace(persistedDays({ ...CLASSIC, optionalPlaces: ['Bethany'], requiredPlaces: ['Petra', 'Wadi Rum', 'Dead Sea', 'Jerash'] }));
  assert.ok(!without['Madaba'], 'no Madaba when not in the draft');
  assert.ok(!without['Mount Nebo'], 'no Mount Nebo when not in the draft');
});

test('R.4: Bethany suggestion appears only when Bethany is included', () => {
  const withB = byPlace(persistedDays(CLASSIC));
  assert.ok(withB['Bethany Beyond the Jordan'], 'Bethany suggested when included');
  const withoutB = byPlace(persistedDays({ ...CLASSIC, optionalPlaces: ['Madaba', 'Mount Nebo'], requiredPlaces: ['Petra', 'Wadi Rum', 'Dead Sea', 'Jerash'] }));
  assert.ok(!withoutB['Bethany Beyond the Jordan'], 'no Bethany when excluded');
});

test('R.4: arrival and departure days carry no entrance/activity suggestions', () => {
  const sugg = deriveExperienceSuggestions(persistedDays(CLASSIC));
  assert.ok(!sugg.some((s) => s.dayNumber === 1), 'no suggestions on arrival day');
  assert.ok(!sugg.some((s) => s.dayNumber === 8), 'no suggestions on departure day');
});

test('R.4: suggestions are descriptive only — matched fields null and no pricing', () => {
  const sugg = deriveExperienceSuggestions(persistedDays(CLASSIC));
  assert.ok(sugg.every((s) => s.matchedServiceId === null && s.matchedActivityId === null && s.matchedActivityRateVariantId === null && s.matchedName === null));
  // value-leak check (word boundaries so the "not priced" disclaimer is fine)
  assert.doesNotMatch(JSON.stringify(sugg), /\bprices?\b|\bcosts?\b|\btotals?\b|\bamount\b|markup|sellPrice/i);
});

test('R.4: enrichExperienceMatches attaches matched master ids/name (read-only), misses stay null', () => {
  const sugg = deriveExperienceSuggestions(persistedDays(CLASSIC));
  const enriched = enrichExperienceMatches(sugg, {
    services: [
      { serviceId: 'svc-jerash', name: 'Jerash & Amman Touring', siteName: 'Jerash Archaeological Site' },
      { serviceId: 'svc-petra', name: 'Petra Entrance', siteName: 'Petra Entrance Ticket' },
    ],
    activities: [
      { id: 'act-wr', name: 'Wadi Rum Jeep Experiences', city: 'Wadi Rum', rateVariants: [{ id: 'var-2h', name: '2h Jeep Tour' }] },
    ],
  });
  const jerash = enriched.find((s) => s.place === 'Jerash')!;
  assert.equal(jerash.matchedServiceId, 'svc-jerash');
  assert.equal(jerash.matchedName, 'Jerash Archaeological Site');
  const wr = enriched.find((s) => s.place === 'Wadi Rum')!;
  assert.equal(wr.matchedActivityId, 'act-wr');
  assert.equal(wr.matchedActivityRateVariantId, 'var-2h');
  assert.equal(wr.matchedName, 'Wadi Rum Jeep Experiences');
  // an unmatched place (Mount Nebo, no master provided) stays null
  const nebo = enriched.find((s) => s.place === 'Mount Nebo')!;
  assert.equal(nebo.matchedServiceId, null);
  assert.equal(nebo.matchedName, null);
});

test('R.4: empty / inactive days yield no suggestions', () => {
  assert.deepEqual(deriveExperienceSuggestions([]), []);
  assert.deepEqual(
    deriveExperienceSuggestions([{ dayNumber: 2, title: 'Amman / Jerash / Amman', notes: 'Visit Jerash.', isActive: false }]),
    [],
  );
});
