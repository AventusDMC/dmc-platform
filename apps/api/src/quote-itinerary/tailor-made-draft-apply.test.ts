import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuoteItineraryService } from './quote-itinerary.service';

// Phase R.1b — preview/apply of the tailor-made draft create editable
// QuoteItineraryDay rows only: no QuoteItems, no pricing. A fake Prisma records
// every model call so we can assert exactly what was (and wasn't) written.

const ACTOR = { id: 'user-1', auditLabel: 'Operator', companyId: 'co-1' };

const INPUT = {
  durationDays: 8,
  arrivalCity: 'Amman',
  departureCity: 'Dead Sea',
  requiredPlaces: ['Petra', 'Wadi Rum', 'Dead Sea', 'Jerash'],
  optionalPlaces: ['Madaba', 'Mount Nebo', 'Bethany'],
};

function makeFakePrisma(existingDays: any[] = [], hotels: any[] = [], masters: { services?: any[]; activities?: any[] } = {}) {
  const calls = {
    dayCreate: [] as any[],
    dayDeleteMany: 0,
    auditCreate: [] as any[],
    quoteItemCalls: 0,
    pricingCalls: 0,
    hotelFindMany: 0,
    serviceFindMany: 0,
    activityFindMany: 0,
  };
  const store: any[] = [...existingDays];

  // Phase R.2b — read-only hotel master. The candidate lookup reads it; reading
  // the hotel master is allowed (it is NOT a pricing/QuoteItem access).
  const hotelModel = { findMany: async () => { calls.hotelFindMany += 1; return hotels.slice(); } };

  // Phase R.4 — read-only service/activity masters for entrance/activity matching.
  const serviceModel = { findMany: async () => { calls.serviceFindMany += 1; return (masters.services || []).slice(); } };
  const activityModel = { findMany: async () => { calls.activityFindMany += 1; return (masters.activities || []).slice(); } };

  const dayModel = {
    findMany: async () => store.slice(),
    create: async ({ data }: any) => {
      const row = { id: `day-${data.dayNumber}`, createdAt: new Date('2026-06-01T00:00:00.000Z'), updatedAt: new Date('2026-06-01T00:00:00.000Z'), dayItems: [], poiAssignments: [], ...data };
      calls.dayCreate.push(data);
      store.push(row);
      return row;
    },
    deleteMany: async () => {
      calls.dayDeleteMany += 1;
      store.length = 0;
      return { count: 0 };
    },
  };
  const auditModel = { create: async ({ data }: any) => { calls.auditCreate.push(data); return data; } };

  // A Proxy traps any access to a model we did NOT explicitly define and flags
  // it — so if the service ever touched quoteItem / pricing, the test would catch it.
  const base: any = {
    quote: { findUnique: async () => ({ id: 'quote-1' }), findFirst: async () => ({ id: 'quote-1' }) },
    quoteItineraryDay: dayModel,
    quoteItineraryAuditLog: auditModel,
    hotel: hotelModel,
    supplierService: serviceModel,
    activity: activityModel,
    $transaction: async (cb: any) => cb({ quoteItineraryDay: dayModel, quoteItineraryAuditLog: auditModel }),
  };
  const prisma = new Proxy(base, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'quoteItem' || prop === 'quoteService') { calls.quoteItemCalls += 1; }
      if (/pricing|hotelRate|vehicleRate|markup/i.test(prop)) { calls.pricingCalls += 1; }
      // Return a benign no-op model so an unexpected access doesn't crash but is counted.
      return new Proxy({}, { get: () => async () => { throw new Error(`Unexpected prisma access: ${prop}`); } });
    },
  });

  return { prisma, calls, store };
}

function activeDay(dayNumber: number) {
  return { id: `existing-${dayNumber}`, quoteId: 'quote-1', dayNumber, title: `Manual Day ${dayNumber}`, notes: 'manual', country: null, sortOrder: dayNumber - 1, isActive: true, dayItems: [], poiAssignments: [] };
}

// ---- PREVIEW ----

test('preview returns an 8-day / 7-overnight draft and writes nothing', async () => {
  const { prisma, calls } = makeFakePrisma();
  const service = new QuoteItineraryService(prisma as any);
  const draft = await service.previewTailorMadeDraft('quote-1', INPUT, { companyId: 'co-1' });
  assert.equal(draft.days.length, 8);
  assert.equal(draft.overnightCount, 7);
  assert.deepEqual(draft.unplacedRequiredPlaces, []);
  // no DB writes at all
  assert.equal(calls.dayCreate.length, 0, 'no days created');
  assert.equal(calls.dayDeleteMany, 0, 'no deletes');
  assert.equal(calls.auditCreate.length, 0, 'no audit writes');
  assert.equal(calls.quoteItemCalls, 0, 'no QuoteItem access');
  assert.equal(calls.pricingCalls, 0, 'no pricing access');
});

// ---- APPLY (empty quote) ----

test('apply on an empty quote creates 8 active QuoteItineraryDay rows with the right fields', async () => {
  const { prisma, calls } = makeFakePrisma([]);
  const service = new QuoteItineraryService(prisma as any);
  const result = await service.applyTailorMadeDraft('quote-1', INPUT, {}, ACTOR, { companyId: 'co-1' });

  assert.equal(calls.dayCreate.length, 8, '8 days created');
  assert.equal(calls.dayDeleteMany, 0, 'nothing deleted on an empty quote');
  // editable fields map correctly
  calls.dayCreate.forEach((data, i) => {
    assert.equal(data.dayNumber, i + 1);
    assert.equal(data.sortOrder, i, 'sortOrder = dayNumber - 1');
    assert.equal(data.country, 'Jordan');
    assert.equal(data.isActive, true);
    assert.equal(typeof data.title, 'string');
    assert.equal(typeof data.notes, 'string');
    assert.ok(data.notes.length > 0, 'narrative stored in notes');
  });
  assert.equal(calls.dayCreate[0].title, 'Arrival Amman');
  assert.equal(calls.dayCreate[7].title, 'Departure');
  // no QuoteItems / pricing touched
  assert.equal(calls.quoteItemCalls, 0);
  assert.equal(calls.pricingCalls, 0);
  // returns the saved itinerary + the draft echo
  assert.ok(result.draft);
  assert.equal(result.draft.days.length, 8);
  assert.equal(result.days.length, 8);
});

// ---- APPLY conflict ----

test('apply conflicts (409) when active days exist and replaceExisting is not set', async () => {
  const { prisma, calls } = makeFakePrisma([activeDay(1), activeDay(2), activeDay(3)]);
  const service = new QuoteItineraryService(prisma as any);
  await assert.rejects(
    () => service.applyTailorMadeDraft('quote-1', INPUT, {}, ACTOR, { companyId: 'co-1' }),
    /already has 3 itinerary day/i,
  );
  assert.equal(calls.dayCreate.length, 0, 'no days created on conflict');
  assert.equal(calls.dayDeleteMany, 0, 'nothing deleted on conflict');
});

// ---- APPLY replaceExisting ----

test('apply with replaceExisting:true replaces day rows (deleteMany) and creates 8, touching no QuoteItems', async () => {
  const { prisma, calls } = makeFakePrisma([activeDay(1), activeDay(2)]);
  const service = new QuoteItineraryService(prisma as any);
  await service.applyTailorMadeDraft('quote-1', INPUT, { replaceExisting: true }, ACTOR, { companyId: 'co-1' });

  assert.equal(calls.dayDeleteMany, 1, 'existing day rows deleted once');
  assert.equal(calls.dayCreate.length, 8, '8 new days created');
  assert.equal(calls.quoteItemCalls, 0, 'no QuoteItem access');
  assert.equal(calls.pricingCalls, 0, 'no pricing access');
  // each removed day was audited, each created day was audited
  const replaced = calls.auditCreate.filter((a) => a.action === 'DAY_REPLACED_BY_TAILOR_MADE_DRAFT');
  const created = calls.auditCreate.filter((a) => a.action === 'DAY_CREATED_FROM_TAILOR_MADE_DRAFT');
  assert.equal(replaced.length, 2);
  assert.equal(created.length, 8);
});

// ---- Phase R.2: hotel-stay SUGGESTIONS (read-only) ----

import { buildTailorMadeJordanDraft } from '../quotes/tailor-made-draft';

function persistedDayRows() {
  return buildTailorMadeJordanDraft(INPUT).days.map((d) => ({
    id: `day-${d.dayNumber}`, quoteId: 'quote-1', dayNumber: d.dayNumber,
    title: d.title, notes: d.narrative, country: 'Jordan', sortOrder: d.dayNumber - 1, isActive: true,
    dayItems: [], poiAssignments: [],
  }));
}

test('hotel suggestions group overnights into stays, read-only, no QuoteItems/pricing', async () => {
  const { prisma, calls } = makeFakePrisma(persistedDayRows());
  const service = new QuoteItineraryService(prisma as any);
  const result = await service.suggestTailorMadeHotels('quote-1', { hotelCategory: '4-star', currency: 'USD' }, { companyId: 'co-1' });

  assert.deepEqual(
    result.stays.map((s: any) => `${s.city} x${s.nights} (D${s.startDay}-${s.endDay})`),
    ['Amman x2 (D1-2)', 'Petra x1 (D3-3)', 'Wadi Rum x1 (D4-4)', 'Dead Sea x3 (D5-7)'],
  );
  assert.equal(result.totalNights, 7);
  assert.equal(result.hotelCategory, '4-star');
  assert.ok(result.stays.every((s: any) => s.candidateHotels.length === 0), 'grouping-only: no candidate hotels yet');
  // strictly read-only
  assert.equal(calls.dayCreate.length, 0);
  assert.equal(calls.dayDeleteMany, 0);
  assert.equal(calls.auditCreate.length, 0);
  assert.equal(calls.quoteItemCalls, 0, 'no QuoteItem access');
  assert.equal(calls.pricingCalls, 0, 'no pricing access');
});

test('hotel suggestions on a quote with no days return a clear empty state', async () => {
  const { prisma, calls } = makeFakePrisma([]);
  const service = new QuoteItineraryService(prisma as any);
  const result = await service.suggestTailorMadeHotels('quote-1', {}, { companyId: 'co-1' });
  assert.deepEqual(result.stays, []);
  assert.match(result.message, /no active itinerary days/i);
  assert.equal(calls.quoteItemCalls, 0);
  assert.equal(calls.pricingCalls, 0);
});

// ---- Phase R.2b: candidate hotels enrich each stay (read-only) ----

test('R.2b: each stay is enriched with city-matched candidate hotels, read-only, no contract names', async () => {
  const hotels = [
    { id: 'h-corp', name: 'Corp Amman Hotel', city: 'Amman', category: '4-star', preferenceRank: 1, contracts: [{ id: 'c1', confidence: 'VERIFIED' }] },
    { id: 'h-hyatt', name: 'Grand Hyatt Amman', city: 'Amman', category: '5-star', preferenceRank: null, contracts: [{ id: 'c2', confidence: 'IMPORTED_UNVERIFIED' }] },
    { id: 'h-moon', name: 'Petra Moon Hotel', city: 'Petra / Wadi Musa', category: '4-star', preferenceRank: null, contracts: [{ id: 'c3', confidence: 'VERIFIED' }] },
    { id: 'h-sun', name: 'Sun City Camp', city: 'Wadi Rum', category: '4-star', preferenceRank: null, contracts: [{ id: 'c4', confidence: 'VERIFIED' }] },
    { id: 'h-dss', name: 'Dead Sea Spa Hotel', city: 'Dead Sea', category: '4-star', preferenceRank: null, contracts: [{ id: 'c5', confidence: 'VERIFIED' }] },
    { id: 'h-secret', name: 'Should Not Appear', city: 'Aqaba', category: '5-star', preferenceRank: null, contracts: [{ id: 'c6', confidence: 'VERIFIED', name: 'TRAVEL AGENT AGREEMENT 2026' }] },
  ];
  const { prisma, calls } = makeFakePrisma(persistedDayRows(), hotels);
  const service = new QuoteItineraryService(prisma as any);
  const result = await service.suggestTailorMadeHotels('quote-1', { hotelCategory: '4-star' }, { companyId: 'co-1' });

  const byCity = Object.fromEntries(result.stays.map((s: any) => [s.city, s.candidateHotels.map((c: any) => c.hotelName)]));
  assert.deepEqual(byCity['Amman'], ['Corp Amman Hotel', 'Grand Hyatt Amman']);
  assert.deepEqual(byCity['Petra'], ['Petra Moon Hotel']);
  assert.deepEqual(byCity['Wadi Rum'], ['Sun City Camp']);
  assert.deepEqual(byCity['Dead Sea'], ['Dead Sea Spa Hotel']);
  // one read of the hotel master, strictly read-only
  assert.equal(calls.hotelFindMany, 1);
  assert.equal(calls.dayCreate.length, 0);
  assert.equal(calls.quoteItemCalls, 0, 'no QuoteItem access');
  assert.equal(calls.pricingCalls, 0, 'no pricing access');
  // no contract NAME / agreement leaks anywhere in the response
  assert.doesNotMatch(JSON.stringify(result), /AGREEMENT|price|markup|totalSell|totalCost|supplierCost/i);
  // candidate carries safe planning fields + a reason
  const corp = result.stays.find((s: any) => s.city === 'Amman').candidateHotels[0];
  assert.equal(corp.verified, true);
  assert.equal(corp.hasActiveContract, true);
  assert.equal(corp.reason, 'Verified contract');
});

// ---- Phase R.3: transport suggestions (read-only) ----

test('R.3: transport suggestions classify each day, read-only, no QuoteItems/pricing/hotel reads', async () => {
  const { prisma, calls } = makeFakePrisma(persistedDayRows());
  const service = new QuoteItineraryService(prisma as any);
  const result = await service.suggestTailorMadeTransport('quote-1', { companyId: 'co-1' });

  const byDay = Object.fromEntries(result.suggestions.map((s: any) => [s.dayNumber, s.suggestedTransportType]));
  assert.equal(byDay[1], 'ARRIVAL_TRANSFER');
  assert.equal(byDay[2], 'TOURING_FULL_DAY');
  assert.equal(byDay[3], 'TOURING_FULL_DAY');
  assert.equal(byDay[4], 'TOURING_FULL_DAY');
  assert.equal(byDay[5], 'TOURING_FULL_DAY');
  assert.equal(byDay[6], 'NONE');
  assert.equal(byDay[8], 'DEPARTURE_TRANSFER');
  assert.equal(result.transportDayCount, 7); // D1-D5 + D7 (Bethany) + D8; only D6 (leisure) excluded
  // strictly read-only — no writes, no hotel master read, no QuoteItem/pricing
  assert.equal(calls.dayCreate.length, 0);
  assert.equal(calls.dayDeleteMany, 0);
  assert.equal(calls.auditCreate.length, 0);
  assert.equal(calls.hotelFindMany, 0, 'transport does not read the hotel master');
  assert.equal(calls.quoteItemCalls, 0);
  assert.equal(calls.pricingCalls, 0);
  // no vehicle/rate/price leaks in the planning payload
  assert.doesNotMatch(JSON.stringify(result), /Sedan|Coaster|\bprice\b|markup|totalSell/i);
});

test('R.3: no days → empty suggestions with a clear message', async () => {
  const { prisma } = makeFakePrisma([]);
  const service = new QuoteItineraryService(prisma as any);
  const result = await service.suggestTailorMadeTransport('quote-1', { companyId: 'co-1' });
  assert.deepEqual(result.suggestions, []);
  assert.match(result.message, /no active itinerary days/i);
});

// ---- Phase R.4: entrance/ticket/activity suggestions (read-only) ----

test('R.4: experience suggestions classify per day + best-effort master match, strictly read-only', async () => {
  const masters = {
    services: [
      { id: 'svc-jerash', name: 'Jerash & Amman Touring', entranceFee: { siteName: 'Jerash Archaeological Site' } },
      { id: 'svc-petra', name: 'Petra Entrance', entranceFee: { siteName: 'Petra Entrance Ticket' } },
    ],
    activities: [
      { id: 'act-wr', name: 'Wadi Rum Jeep Experiences', city: 'Wadi Rum', rateVariants: [{ id: 'var-2h', name: '2h Jeep Tour' }] },
    ],
  };
  const { prisma, calls } = makeFakePrisma(persistedDayRows(), [], masters);
  const service = new QuoteItineraryService(prisma as any);
  const result = await service.suggestTailorMadeExperiences('quote-1', { companyId: 'co-1' });

  const byPlace = Object.fromEntries(result.suggestions.map((s: any) => [s.place, s]));
  assert.equal(byPlace['Jerash'].dayNumber, 2);
  assert.equal(byPlace['Jerash'].matchedServiceId, 'svc-jerash');
  assert.equal(byPlace['Jerash'].matchedName, 'Jerash Archaeological Site');
  assert.equal(byPlace['Petra'].dayNumber, 4, 'Petra entrance on the visit day only');
  assert.equal(byPlace['Petra'].matchedServiceId, 'svc-petra');
  assert.equal(byPlace['Wadi Rum'].suggestedItemType, 'ACTIVITY');
  assert.equal(byPlace['Wadi Rum'].matchedActivityId, 'act-wr');
  assert.equal(byPlace['Wadi Rum'].matchedActivityRateVariantId, 'var-2h');
  // grouped by day is present
  assert.ok(result.byDay['2'] || result.byDay[2]);
  // masters were READ only (no writes), and NO QuoteItem/pricing access at all
  assert.equal(calls.serviceFindMany, 1);
  assert.equal(calls.activityFindMany, 1);
  assert.equal(calls.dayCreate.length, 0);
  assert.equal(calls.dayDeleteMany, 0);
  assert.equal(calls.auditCreate.length, 0);
  assert.equal(calls.quoteItemCalls, 0, 'no QuoteItem access');
  assert.equal(calls.pricingCalls, 0, 'no pricing access');
  // internal lookup hints are stripped; no RAW internal rate field leaks. (R.6C-0
  // intentionally adds neutral estimatedCost/estimatedSell/markupPercent preview
  // fields — those are allowed; raw catalog field names are not.)
  assert.doesNotMatch(JSON.stringify(result), /matchTerms|variantTerms|matchKind|specificTerms/);
  assert.doesNotMatch(JSON.stringify(result), /foreignerFeeJod|costPrice|sellPrice|totalSell/i);
  // R.6C-0 — readiness + itineraryDayId + markup are present per suggestion.
  assert.equal(byPlace['Jerash'].readiness, 'MATCHED');
  assert.equal(byPlace['Wadi Rum'].readiness, 'MATCHED');
  assert.ok('itineraryDayId' in byPlace['Jerash']);
  assert.equal(byPlace['Jerash'].markupPercent, 20);
});

test('R.4: master-read failure degrades to descriptive-only (still read-only, no throw)', async () => {
  // No supplierService/activity models wired here would normally crash; instead
  // provide empty masters so enrichment runs but matches nothing.
  const { prisma, calls } = makeFakePrisma(persistedDayRows(), [], { services: [], activities: [] });
  const service = new QuoteItineraryService(prisma as any);
  const result = await service.suggestTailorMadeExperiences('quote-1', { companyId: 'co-1' });
  assert.ok(result.suggestions.length > 0, 'descriptive suggestions still returned');
  assert.ok(result.suggestions.every((s: any) => s.matchedServiceId === null && s.matchedActivityId === null));
  assert.equal(calls.quoteItemCalls, 0);
  assert.equal(calls.pricingCalls, 0);
});

test('R.4: no days → empty experience suggestions with a clear message', async () => {
  const { prisma, calls } = makeFakePrisma([]);
  const service = new QuoteItineraryService(prisma as any);
  const result = await service.suggestTailorMadeExperiences('quote-1', { companyId: 'co-1' });
  assert.deepEqual(result.suggestions, []);
  assert.match(result.message, /generate and apply a tailor-made draft/i);
  assert.equal(calls.quoteItemCalls, 0);
  assert.equal(calls.pricingCalls, 0);
});

// ---- Phase R.5: guide suggestions (read-only) ----

test('R.5: guide suggestions classify per day (Jerash D2, Petra D4), strictly read-only', async () => {
  const { prisma, calls } = makeFakePrisma(persistedDayRows());
  const service = new QuoteItineraryService(prisma as any);
  const result = await service.suggestTailorMadeGuides('quote-1', { companyId: 'co-1' });

  const byDay = Object.fromEntries(result.suggestions.map((s: any) => [s.dayNumber, s]));
  assert.equal(byDay[2].guideTypeSuggestion, 'LOCAL');
  assert.equal(byDay[2].displayName, 'Local guide for Jerash');
  assert.equal(byDay[4].guideTypeSuggestion, 'LOCAL');
  assert.equal(byDay[4].displayName, 'Local guide for Petra');
  assert.equal(byDay[1].guideTypeSuggestion, 'NONE'); // arrival
  assert.equal(byDay[6].guideTypeSuggestion, 'NONE'); // leisure
  assert.equal(byDay[8].guideTypeSuggestion, 'NONE'); // departure
  assert.equal(result.guidedDayCount, 2);
  assert.ok(typeof result.escortNote === 'string' && result.escortNote.length > 0, 'escort offered as a planning note');
  // R.6D-0 — readiness + read-only estimate on LOCAL guide suggestions.
  assert.equal(byDay[2].readiness, 'MATCHED');
  assert.equal(byDay[2].guideType, 'local');
  assert.equal(byDay[2].guideDuration, 'full_day');
  assert.equal(byDay[2].estimatedCost, 120);
  assert.equal(byDay[2].estimatedSell, 144); // 120 × 1.20
  assert.equal(byDay[2].markupPercent, 20);
  assert.equal(byDay[2].currency, 'USD');
  assert.equal(byDay[2].itineraryDayId, 'day-2'); // threaded from the day row
  assert.equal(byDay[4].readiness, 'MATCHED');
  assert.equal(byDay[4].estimatedSell, 144);
  // NONE days carry no estimate.
  assert.equal(byDay[1].readiness, 'NONE');
  assert.equal(byDay[1].estimatedCost, null);
  // strictly read-only — no writes, no hotel/service/activity master read, no QuoteItem/pricing
  assert.equal(calls.dayCreate.length, 0);
  assert.equal(calls.dayDeleteMany, 0);
  assert.equal(calls.auditCreate.length, 0);
  assert.equal(calls.hotelFindMany, 0);
  assert.equal(calls.serviceFindMany, 0);
  assert.equal(calls.activityFindMany, 0);
  assert.equal(calls.quoteItemCalls, 0, 'no QuoteItem access');
  assert.equal(calls.pricingCalls, 0, 'no pricing access');
  // no raw guide metadata leaks (the neutral estimatedCost/estimatedSell/markupPercent
  // fields are the intended R.6D-0 read-only estimate, not raw metadata).
  assert.doesNotMatch(JSON.stringify(result), /minPax|maxPax|requiresOperatorConfirmation|Overnight:\s*No/i);
  assert.doesNotMatch(JSON.stringify(result), /costPrice|sellPrice|totalSell|GUIDE_RATES|overnightSupplement/i);
});

test('R.5: no days → empty guide suggestions with a clear message', async () => {
  const { prisma, calls } = makeFakePrisma([]);
  const service = new QuoteItineraryService(prisma as any);
  const result = await service.suggestTailorMadeGuides('quote-1', { companyId: 'co-1' });
  assert.deepEqual(result.suggestions, []);
  assert.match(result.message, /no active itinerary days/i);
  assert.equal(result.escortNote, null);
  assert.equal(calls.quoteItemCalls, 0);
  assert.equal(calls.pricingCalls, 0);
});

// ---- Phase R.6A-0: hotel-stay configure / price preview (READ-ONLY) ----

function makeHotelPreviewPrisma(opts: { quote: any; hotel: any; rates: any[] }) {
  const calls = { quoteFindUnique: 0, hotelRateFindMany: 0, quoteItemAccess: 0, pricingAccess: 0, writeAccess: 0 };
  const base: any = {
    quote: {
      findFirst: async () => (opts.quote ? { id: 'quote-1' } : null),
      findUnique: async () => { calls.quoteFindUnique += 1; return opts.quote; },
    },
    hotel: { findUnique: async () => opts.hotel },
    hotelRate: { findMany: async () => { calls.hotelRateFindMany += 1; return opts.rates.slice(); } },
  };
  const prisma = new Proxy(base, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'quoteItem' || prop === 'quoteService') calls.quoteItemAccess += 1;
      if (/pricing|hotelRate$|markup/i.test(prop) && prop !== 'hotelRate') calls.pricingAccess += 1;
      return new Proxy({}, { get: (_t, m: string) => async () => { if (/create|update|delete|upsert/i.test(m)) calls.writeAccess += 1; throw new Error(`Unexpected prisma access: ${prop}.${m}`); } });
    },
  });
  return { prisma, calls };
}

const PREVIEW_QUOTE = { adults: 2, children: 0, roomCount: 1, travelStartDate: new Date('2026-06-01T00:00:00.000Z') };
const AMMAN_RATES = [
  { id: 'rate-dbl-bb', hotelId: 'h-amman', contractId: 'c-amman', roomCategoryId: 'rc-deluxe', roomCategory: { name: 'Deluxe' }, occupancyType: 'DBL', mealPlan: 'BB', cost: 80, pricingBasis: 'PER_ROOM', currency: 'USD', seasonName: 'Standard 2026', seasonFrom: new Date('2026-01-01'), seasonTo: new Date('2026-12-31') },
  { id: 'rate-sgl-bb', hotelId: 'h-amman', contractId: 'c-amman', roomCategoryId: 'rc-deluxe', roomCategory: { name: 'Deluxe' }, occupancyType: 'SGL', mealPlan: 'BB', cost: 60, pricingBasis: 'PER_ROOM', currency: 'USD', seasonName: 'Standard 2026', seasonFrom: new Date('2026-01-01'), seasonTo: new Date('2026-12-31') },
];

test('R.6A-0: returns room/meal/occupancy options + an estimated price at HOTEL_DEFAULT_MARKUP (15%), read-only', async () => {
  const { prisma, calls } = makeHotelPreviewPrisma({ quote: PREVIEW_QUOTE, hotel: { name: 'Corp Amman Hotel', city: 'Amman' }, rates: AMMAN_RATES });
  const service = new QuoteItineraryService(prisma as any);
  const result: any = await service.previewTailorMadeHotelStay(
    'quote-1',
    { hotelId: 'h-amman', contractId: 'c-amman', stay: { city: 'Amman', startDay: 1, endDay: 2, nights: 2 }, roomCategoryId: 'rc-deluxe', occupancyType: 'DBL', mealPlan: 'BB' },
    { companyId: 'co-1' },
  );
  assert.equal(result.hotelName, 'Corp Amman Hotel');
  assert.deepEqual(result.availableRoomCategories, [{ id: 'rc-deluxe', name: 'Deluxe' }]);
  assert.deepEqual(result.availableMealPlans.sort(), ['BB']);
  assert.deepEqual(result.availableOccupancyTypes.sort(), ['DBL', 'SGL']);
  assert.equal(result.defaults.markupPercent, 15);
  assert.equal(result.nights, 2);
  assert.ok(result.pricePreview, 'price preview present');
  assert.equal(result.pricePreview.markupPercent, 15);
  assert.ok(result.pricePreview.totalCost > 0);
  // sell == cost * (1 + 15/100), rounded to cents
  assert.equal(result.pricePreview.totalSell, Math.round(result.pricePreview.totalCost * 1.15 * 100) / 100);
  // R.6A-1: the matched rate's season + identifiers are echoed back for the apply payload.
  assert.equal(result.pricePreview.seasonName, 'Standard 2026');
  assert.equal(result.pricePreview.roomCategoryId, 'rc-deluxe');
  assert.equal(result.pricePreview.occupancyType, 'DBL');
  assert.equal(result.pricePreview.mealPlan, 'BB');
  assert.equal(result.canApply, false);
  // strictly read-only — no QuoteItem/pricing/write access
  assert.equal(calls.quoteItemAccess, 0, 'no QuoteItem access');
  assert.equal(calls.pricingAccess, 0, 'no pricing-model access');
  assert.equal(calls.writeAccess, 0, 'no writes');
  assert.equal(calls.hotelRateFindMany >= 1, true, 'read hotel rates');
});

test('R.6A-0: no contracted rates → clear NO_RATES message, no price, canApply false', async () => {
  const { prisma, calls } = makeHotelPreviewPrisma({ quote: PREVIEW_QUOTE, hotel: { name: 'No Rate Inn', city: 'Amman' }, rates: [] });
  const service = new QuoteItineraryService(prisma as any);
  const result: any = await service.previewTailorMadeHotelStay(
    'quote-1',
    { hotelId: 'h-amman', contractId: 'c-amman', stay: { city: 'Amman', startDay: 1, endDay: 2, nights: 2 } },
    { companyId: 'co-1' },
  );
  assert.equal(result.rateStatus, 'NO_RATES');
  assert.equal(result.pricePreview, null);
  assert.match(result.message, /no active contracted rates/i);
  assert.equal(result.canApply, false);
  assert.equal(calls.quoteItemAccess, 0);
  assert.equal(calls.writeAccess, 0);
});

test('R.6A-0: missing hotelId/contractId is rejected', async () => {
  const { prisma } = makeHotelPreviewPrisma({ quote: PREVIEW_QUOTE, hotel: null, rates: [] });
  const service = new QuoteItineraryService(prisma as any);
  await assert.rejects(
    () => service.previewTailorMadeHotelStay('quote-1', { stay: { city: 'Amman', startDay: 1, endDay: 2, nights: 2 } } as any, { companyId: 'co-1' }),
    /hotelId and contractId are required/i,
  );
});
