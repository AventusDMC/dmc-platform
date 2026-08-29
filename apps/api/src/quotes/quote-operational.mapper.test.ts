import assert = require('node:assert/strict');
import test = require('node:test');
import { ForbiddenException } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { mapQuoteToOperational } from './quote-operational.mapper';

// ---------------------------------------------------------------------------
// Synthetic sentinels ONLY. Every restricted string carries the substring
// "SENTINEL"; the numeric cost carries the distinctive value 987654321. A single
// scan of the serialized output for either proves nothing restricted leaked.
// Legitimate sell/operational values never contain "SENTINEL" or that number.
// ---------------------------------------------------------------------------
const COST = 987654321;
const SUPPLIER = 'SENTINEL_SUPPLIER_NAME';
const CONTRACT = 'SENTINEL_CONTRACT_NAME';
const TOKEN = 'SENTINEL_TOKEN_VALUE';
const PII = 'SENTINEL_PASSPORT_NUMBER';
const SNAPSHOT = 'SENTINEL_SNAPSHOT_BLOB';
const NOTE = 'SENTINEL_INTERNAL_NOTE';
const FUTURE = 'SENTINEL_FUTURE_FIELD';
const JSON_SENTINEL = { SENTINEL_JSON_KEY: 'SENTINEL_JSON_VALUE' };

const D1 = new Date('2026-05-01T00:00:00.000Z');
const D2 = new Date('2026-05-04T00:00:00.000Z');

function hotelItem() {
  return {
    id: 'it1',
    quoteId: 'q1',
    optionId: null,
    serviceId: 'sv1',
    quantity: 1,
    paxCount: 2,
    totalSell: 1200,
    sellPrice: 1200,
    sortOrder: 0,
    createdAt: D1,
    updatedAt: D1,
    jordanPassCovered: false,
    currency: 'USD',
    quoteCurrency: 'USD',
    hotelId: 'h1',
    contractId: 'c1',
    roomCategoryId: 'rc1',
    mealPlan: 'BB',
    occupancyType: 'DBL',
    seasonName: 'High',
    serviceDate: D1,
    // restricted (must all be dropped)
    totalCost: COST,
    baseCost: COST,
    costBaseAmount: COST,
    overrideCost: COST,
    useOverride: true,
    finalCost: COST,
    markupPercent: COST,
    markupAmount: COST,
    salesTaxPercent: COST,
    serviceChargePercent: COST,
    tourismFeeAmount: COST,
    fxRate: COST,
    fxFromCurrency: 'SENTINEL_FX_FROM',
    pricingDescription: NOTE,
    jordanPassSavingsJod: COST,
    externalSupplierName: SUPPLIER,
    externalInternalNotes: NOTE,
    externalNetCost: COST,
    externalPackagePricingMatrixJson: JSON_SENTINEL,
    __futureCostColumn: FUTURE,
    hotel: {
      id: 'h1',
      name: 'Petra Hotel',
      city: 'Petra',
      category: '5',
      preferenceRank: 1,
      supplierId: 'sup',
      supplierName: SUPPLIER,
      resolvedSupplierId: 'sup',
    },
    contract: { id: 'c1', name: CONTRACT, ratePolicies: JSON_SENTINEL },
    roomCategory: { id: 'rc1', name: 'Deluxe Room', code: 'DLX', description: NOTE },
    service: {
      id: 'sv1',
      name: 'Hotel Service',
      serviceType: { id: 'st1', code: 'HOTEL', name: 'Hotel' },
      baseCost: COST,
      costBaseAmount: COST,
      supplierId: 'sup',
    },
  };
}

function transportAssignedItem() {
  return {
    id: 'it2',
    quoteId: 'q1',
    quantity: 1,
    paxCount: 2,
    totalSell: 300,
    sortOrder: 1,
    createdAt: D1,
    updatedAt: D1,
    currency: 'USD',
    quoteCurrency: 'USD',
    transportLabel: 'Airport transfer',
    serviceDate: D1,
    contractId: null,
    appliedVehicleRate: {
      id: 'vr1',
      routeName: 'QAIA - Amman',
      supplierId: 'sup1',
      price: COST,
      transportContractId: 'tc1',
      standaloneDeductionAmount: COST,
      supplier: { id: 'sup1', name: SUPPLIER },
      route: { fromPlace: { city: 'QAIA' }, toPlace: { city: 'Amman' } },
      vehicle: { name: 'Sedan', vehicleClass: 'Sedan', supplierName: SUPPLIER },
      serviceType: { code: 'AIRPORT_TRANSFER', name: 'Airport Transfer' },
    },
    service: { name: 'Transfer', serviceType: { code: 'TRANSFER', name: 'Transfer' } },
  };
}

function transportUnassignedItem() {
  return {
    id: 'it3',
    quoteId: 'q1',
    quantity: 1,
    paxCount: 2,
    totalSell: 500,
    sortOrder: 2,
    createdAt: D1,
    updatedAt: D1,
    currency: 'USD',
    quoteCurrency: 'USD',
    contractId: null,
    appliedVehicleRate: {
      routeName: 'City tour',
      supplierId: null,
      supplier: null,
      route: null,
      vehicle: { name: 'Coaster', vehicleClass: 'Coaster' },
      serviceType: { code: 'POINT_TO_POINT', name: 'P2P' },
    },
    touringRoutePricing: {
      supplierId: null,
      supplier: null,
      vehicle: { name: 'Coaster', vehicleClass: 'Coaster' },
      transportServiceType: { code: 'PKG', name: 'Package' },
    },
  };
}

function experienceItem() {
  return {
    id: 'it4',
    quoteId: 'q1',
    quantity: 1,
    paxCount: 2,
    totalSell: 80,
    sortOrder: 3,
    createdAt: D1,
    updatedAt: D1,
    currency: 'USD',
    quoteCurrency: 'USD',
    activityId: 'act1',
    entranceFeeId: 'ef1',
    contractId: null,
    activity: { id: 'act1', name: 'Petra Guide', costPrice: COST, supplierId: 'x', supplierCompany: { name: SUPPLIER } },
    entranceFee: { siteName: 'Petra', foreignerFeeJod: COST },
    touringRoute: {
      id: 'tr1',
      name: 'Petra Route',
      mainDestinations: 'Petra',
      includedKm: COST,
      stops: [{ id: 's1', order: 1, city: 'Petra', location: 'Treasury', notes: 'visit', poiId: 'poi1' }],
    },
  };
}

function hotelOption() {
  return {
    id: 'ho1',
    quoteOptionId: 'opt1',
    city: 'Petra',
    hotelId: 'h1',
    roomCategoryId: 'rc1',
    hotelNameSnapshot: 'Petra Hotel',
    roomType: 'Deluxe',
    mealPlan: 'BB',
    mealPlanCode: 'BB',
    nights: 2,
    isPrimary: true,
    createdAt: D1,
    updatedAt: D1,
    hotel: { id: 'h1', name: 'Petra Hotel', city: 'Petra', category: '5', supplierName: SUPPLIER, factSheet: { highlightsJson: JSON_SENTINEL } },
    roomCategory: { id: 'rc1', name: 'Deluxe Room' },
    matchedPricedQuoteItemId: 'it1',
    pricingMatchStatus: 'matched',
    pricingMatchReason: 'direct_option_item_match',
    matchedDiscriminators: {
      roomCategoryId: 'rc1',
      mealPlan: 'BB',
      mealPlanCode: 'BB',
      occupancyType: 'DBL',
      seasonName: 'High',
      serviceDate: '2026-05-01',
      optionId: 'opt1',
    },
  };
}

function rawQuote(): any {
  return {
    id: 'q1',
    quoteType: 'FIT',
    jordanPassType: 'NONE',
    bookingType: 'STANDARD',
    title: 'Jordan Discovery',
    description: 'A trip',
    quoteNumber: 'Q-2026-0001',
    quoteCurrency: 'USD',
    proposalLanguage: 'en',
    status: 'DRAFT',
    createdAt: D1,
    updatedAt: D2,
    adults: 2,
    children: 0,
    roomCount: 1,
    nightCount: 3,
    travelStartDate: D1,
    validUntil: D2,
    sentAt: null,
    acceptedAt: null,
    revisionNumber: 1,
    revisedFromId: null,
    acceptedVersionId: null,
    clientChangeRequestMessage: null,
    inclusionsText: 'Included things',
    exclusionsText: 'Excluded things',
    termsNotesText: 'Terms',
    totalSell: 5000,
    totalPrice: 5000,
    pricePerPax: 2500,
    singleSupplement: 200,
    fixedPricePerPerson: 0,
    pricingType: 'group',
    pricingMode: 'SLAB',
    publicEnabled: true,
    isLatestRevision: true,
    focType: 'none',
    focRatio: null,
    focCount: null,
    focRoomType: null,
    // restricted at root
    totalCost: COST,
    publicToken: TOKEN,
    selectedTransportContractId: CONTRACT,
    selectedTransportPricingOption: NOTE,
    __futureQuoteColumn: FUTURE,
    company: { id: 'co1', name: 'Client Co', agentCommissionPercent: COST, agentRateMode: NOTE },
    contact: { id: 'ct1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '123' },
    agent: { id: 'ag1', firstName: 'Op', lastName: 'Owner', email: 'op@example.com' },
    quoteItineraryDays: [
      {
        id: 'd1',
        quoteId: 'q1',
        dayNumber: 1,
        title: 'Day 1',
        notes: 'Visit Petra',
        notesLanguage: 'en',
        overnightCity: 'Petra',
        sortOrder: 0,
        isActive: true,
        createdAt: D1,
        updatedAt: D1,
        dayItems: [{ id: 'di1', dayId: 'd1', quoteServiceId: 'it1', sortOrder: 0, isActive: true, quoteService: hotelItem() }],
      },
    ],
    itineraries: [
      {
        id: 'i1',
        quoteId: 'q1',
        dayNumber: 1,
        title: 'Day 1',
        description: 'desc',
        images: [{ id: 'im1', itineraryId: 'i1', galleryImageId: 'g1', sortOrder: 0, galleryImage: { id: 'g1', imageUrl: 'http://img/petra.jpg', title: 'Petra', __future: FUTURE } }],
      },
    ],
    quoteItems: [hotelItem(), transportAssignedItem(), transportUnassignedItem(), experienceItem()],
    quoteOptions: [
      {
        id: 'opt1',
        quoteId: 'q1',
        kind: 'HOTELS',
        name: 'Option A',
        notes: null,
        pricingMode: 'PER_ITEM',
        createdAt: D1,
        updatedAt: D1,
        totalPrice: 5000,
        totalSell: 5000,
        pricePerPax: 2500,
        totalCost: COST,
        profit: COST,
        packageMarginPercent: COST,
        hotelCategory: { id: 'hc1', name: '5-star' },
        hotelOptions: [hotelOption()],
        quoteItems: [hotelItem()],
      },
    ],
    passengers: [
      {
        id: 'p1',
        firstName: 'John',
        lastName: 'Smith',
        passportNumber: PII,
        dateOfBirth: D1,
        nationality: 'SENTINEL_NATIONALITY',
        emergencyContact: PII,
        dietaryNotes: NOTE,
        mobilityNotes: NOTE,
        remarks: PII,
        gender: 'M',
      },
    ],
    pricingSlabs: [
      { id: 'sl1', minPax: 1, maxPax: 10, price: 2500, actualPax: 2, focPax: 0, payingPax: 2, totalSell: 5000, pricePerPayingPax: 2500, pricePerActualPax: 2500, totalCost: COST, notes: NOTE },
    ],
    scenarios: [{ id: 'sc1', paxCount: 2, totalSell: 5000, pricePerPax: 2500, totalCost: COST }],
    invoice: { id: 'inv1', totalAmount: 5000, currency: 'USD', status: 'PENDING', dueDate: D2, __future: FUTURE },
    booking: { id: 'bk1', accessToken: TOKEN, bookingRef: 'BK-1', pricingSnapshotJson: { secret: SNAPSHOT }, clientSnapshotJson: { p: PII } },
  };
}

const EXPECTED_ROOT_KEYS = [
  'id', 'quoteType', 'jordanPassType', 'bookingType', 'title', 'description', 'quoteNumber',
  'quoteCurrency', 'proposalLanguage', 'status', 'createdAt', 'updatedAt', 'adults', 'children',
  'roomCount', 'nightCount', 'travelStartDate', 'validUntil', 'sentAt', 'acceptedAt', 'revisionNumber',
  'revisedFromId', 'acceptedVersionId', 'clientChangeRequestMessage', 'inclusionsText', 'exclusionsText',
  'termsNotesText', 'totalSell', 'totalPrice', 'pricePerPax', 'singleSupplement', 'fixedPricePerPerson',
  'pricingType', 'pricingMode', 'publicEnabled', 'isLatestRevision', 'company', 'contact', 'agent',
  'quoteItineraryDays', 'itineraries', 'quoteItems', 'quoteOptions', 'passengers', 'pricingSlabs',
  'scenarios', 'invoice', 'booking', 'currentPricing', 'priceComputation', 'workflowDiagnostics',
  'convertBlockers',
].sort();

const ITEM_KEYS = [
  'id', 'quoteId', 'optionId', 'serviceId', 'activityId', 'entranceFeeId', 'itineraryId',
  'packageTemplateId', 'packageTemplateDayId', 'packageTemplateComponentId', 'excursionTemplateId',
  'excursionTemplateComponentId', 'excursionTemplateComponentOptional', 'quantity', 'paxCount',
  'participantCount', 'adultCount', 'childCount', 'roomCount', 'nightCount', 'dayCount', 'sellPrice',
  'totalSell', 'sortOrder', 'createdAt', 'updatedAt', 'jordanPassCovered', 'currency', 'quoteCurrency',
  'customServiceName', 'transportLabel', 'standaloneTransfer', 'guideType', 'guideDuration',
  'guideOvernight', 'serviceDate', 'startTime', 'pickupTime', 'pickupLocation', 'meetingPoint',
  'reconfirmationRequired', 'reconfirmationDueAt', 'hotelId', 'roomCategoryId', 'seasonName', 'mealPlan',
  'occupancyType', 'touringRouteId', 'externalPackageCountry', 'externalPackageName', 'externalStartDay',
  'externalEndDay', 'externalStartDate', 'externalEndDate', 'externalPricingBasis', 'externalIncludes',
  'externalExcludes', 'externalHotelsOrSimilar', 'externalClientDescription', 'contract', 'hotel',
  'roomCategory', 'activity', 'entranceFee', 'service', 'touringRoute', 'appliedVehicleRate',
  'touringRoutePricing',
].sort();

// ---------------------------------------------------------------------------
// Mapper: sentinel containment + structure
// ---------------------------------------------------------------------------

test('mapper: no restricted sentinel survives anywhere in the serialized output', () => {
  const out = mapQuoteToOperational(rawQuote());
  const serialized = JSON.stringify(out);
  assert.equal(serialized.includes('SENTINEL'), false, 'no SENTINEL string may leak');
  assert.equal(serialized.includes(String(COST)), false, 'no cost value may leak');
  assert.equal(serialized.includes('example.com'), false, 'no contact/agent email may leak');
});

test('mapper: exact root key-set matches the DTO contract', () => {
  const out = mapQuoteToOperational(rawQuote());
  assert.deepEqual(Object.keys(out).sort(), EXPECTED_ROOT_KEYS);
});

test('mapper: exact quote-item key-set matches the DTO contract', () => {
  const out = mapQuoteToOperational(rawQuote());
  assert.deepEqual(Object.keys(out.quoteItems[0]).sort(), ITEM_KEYS);
});

test('mapper: sell totals, pax counts and itinerary structure are preserved', () => {
  const out = mapQuoteToOperational(rawQuote());
  assert.equal(out.totalSell, 5000);
  assert.equal(out.pricePerPax, 2500);
  assert.equal(out.singleSupplement, 200);
  assert.equal(out.adults, 2);
  assert.equal(out.children, 0);
  assert.equal(out.quoteItems[0].totalSell, 1200);
  assert.equal(out.quoteItineraryDays[0].dayItems[0].quoteService.id, 'it1');
  assert.equal(out.quoteItineraryDays[0].overnightCity, 'Petra');
  assert.equal(out.itineraries[0].images[0].galleryImage?.imageUrl, 'http://img/petra.jpg');
  assert.equal(out.quoteItems[0].hotel?.name, 'Petra Hotel');
  assert.equal(out.quoteItems[0].service?.serviceType.code, 'HOTEL');
  // dates coerced to ISO strings
  assert.equal(out.createdAt, D1.toISOString());
});

test('mapper: contract-presence sentinel is {} when linked and null when not', () => {
  const out = mapQuoteToOperational(rawQuote());
  const hotel = out.quoteItems[0]; // contractId 'c1'
  assert.notEqual(hotel.contract, null);
  assert.deepEqual(hotel.contract, {});
  assert.equal(Object.keys(hotel.contract as object).length, 0);
  const experience = out.quoteItems[3]; // contractId null
  assert.equal(experience.contract, null);
});

test('mapper: supplier sentinel is exactly { name: "Assigned" } or null (assignment-truthful)', () => {
  const out = mapQuoteToOperational(rawQuote());
  const assigned = out.quoteItems[1].appliedVehicleRate; // has real supplier -> Assigned
  assert.notEqual(assigned, null);
  assert.deepEqual(assigned?.supplier, { name: 'Assigned' });
  assert.deepEqual(Object.keys(assigned?.supplier as object), ['name']);
  const unassignedRate = out.quoteItems[2].appliedVehicleRate; // no supplier -> null
  assert.equal(unassignedRate?.supplier, null);
  const unassignedPricing = out.quoteItems[2].touringRoutePricing; // no supplier -> null
  assert.equal(unassignedPricing?.supplier, null);
});

test('mapper: passenger objects contain EXACTLY id, firstName, lastName', () => {
  const out = mapQuoteToOperational(rawQuote());
  const p = out.passengers[0];
  assert.deepEqual(Object.keys(p).sort(), ['firstName', 'id', 'lastName']);
  assert.equal(p.id, 'p1');
  assert.equal(p.firstName, 'John');
  assert.equal(p.lastName, 'Smith');
});

test('mapper: hotel/room/service projections drop supplier identity and rate/cost fields', () => {
  const out = mapQuoteToOperational(rawQuote());
  const hotel = out.quoteItems[0];
  assert.deepEqual(Object.keys(hotel.hotel as object).sort(), ['category', 'city', 'id', 'name', 'preferenceRank']);
  assert.deepEqual(Object.keys(hotel.roomCategory as object).sort(), ['id', 'name']);
  assert.deepEqual(Object.keys(hotel.service as object).sort(), ['name', 'serviceType']);
  assert.equal('supplierName' in (hotel.hotel as object), false);
  assert.equal('code' in (hotel.roomCategory as object), false);
  assert.equal('baseCost' in (hotel.service as object), false);
});

test('mapper: pricing slab drops totalCost and notes; hotel option keeps safe match metadata', () => {
  const out = mapQuoteToOperational(rawQuote());
  const slab = out.pricingSlabs[0];
  assert.equal('totalCost' in slab, false);
  assert.equal('notes' in slab, false);
  assert.equal(slab.totalSell, 5000);
  const ho = out.quoteOptions[0].hotelOptions[0];
  assert.equal(ho.pricingMatchStatus, 'matched');
  assert.equal(ho.matchedPricedQuoteItemId, 'it1');
  assert.equal(ho.matchedDiscriminators?.optionId, 'opt1');
  assert.equal('factSheet' in (ho.hotel as object), false);
});

test('mapper: re-derived pricing carries no cost total, slabLines, contextLines or errors', () => {
  const out = mapQuoteToOperational(rawQuote());
  assert.notEqual(out.priceComputation, null);
  const pc = out.priceComputation!;
  assert.equal('totalCost' in pc.totals, false);
  assert.equal('slabLines' in pc.display, false);
  assert.equal('contextLines' in pc.display, false);
  assert.equal('errors' in (pc as object), false);
  if (pc.matchedSlab) {
    assert.equal('totalCost' in pc.matchedSlab, false);
  }
  assert.equal(typeof pc.display.summaryLabel, 'string');
  assert.equal(Array.isArray(pc.warnings), true);
  const serializedPc = JSON.stringify(pc) + JSON.stringify(out.currentPricing);
  assert.equal(serializedPc.includes('SENTINEL'), false);
  assert.equal(serializedPc.includes(String(COST)), false);
  if (out.currentPricing?.matchedSlab) {
    assert.equal('totalCost' in out.currentPricing.matchedSlab, false);
  }
});

test('mapper: workflow diagnostics keep totalSell but never totalCost; convert blockers derived', () => {
  const out = mapQuoteToOperational(rawQuote());
  assert.equal(out.workflowDiagnostics.length, 4);
  for (const d of out.workflowDiagnostics) {
    assert.equal('totalCost' in d.persistedOperationalFields, false);
    assert.equal('totalSell' in d.persistedOperationalFields, true);
  }
  assert.equal(out.convertBlockers.length, 4);
  assert.equal(out.convertBlockers[0].blockerType, 'workflow-fields');
});

test('mapper: booking is reduced to { id } and drops accessToken + snapshots', () => {
  const out = mapQuoteToOperational(rawQuote());
  assert.deepEqual(out.booking, { id: 'bk1' });
  assert.equal('totalCost' in out, false);
  assert.equal('publicToken' in out, false);
  assert.equal('selectedTransportContractId' in out, false);
});

test('mapper: does NOT mutate the source Prisma-shaped fixture', () => {
  const fixture = rawQuote();
  const before = JSON.stringify(fixture);
  mapQuoteToOperational(fixture);
  assert.equal(JSON.stringify(fixture), before);
});

test('mapper: null / empty relations map without crashing', () => {
  const minimal: any = {
    id: 'q2',
    pricingType: undefined, // -> priceComputation null
    quoteItems: [],
    quoteItineraryDays: [],
    itineraries: [],
    quoteOptions: [],
    passengers: [],
    pricingSlabs: [],
    scenarios: [],
    company: null,
    contact: null,
    agent: null,
    invoice: null,
    booking: null,
  };
  const out = mapQuoteToOperational(minimal);
  assert.equal(out.id, 'q2');
  assert.deepEqual(out.quoteItems, []);
  assert.deepEqual(out.passengers, []);
  assert.equal(out.company, null);
  assert.equal(out.booking, null);
  assert.equal(out.priceComputation, null);
  assert.equal(out.currentPricing, null);
  assert.deepEqual(Object.keys(out).sort(), EXPECTED_ROOT_KEYS);
});

// ---------------------------------------------------------------------------
// Controller wiring — gate + identical-projection-per-role
// ---------------------------------------------------------------------------

function makeActor(role: string | undefined, companyId = 'dmc-company') {
  return (role === undefined ? { id: 'u1', companyId } : { id: 'u1', companyId, role }) as any;
}

function createController() {
  const calls = { findOne: 0, lastId: null as string | null, lastActor: null as any };
  const quotesService: any = {
    findOne: async (id: string, actor: any) => {
      calls.findOne += 1;
      calls.lastId = id;
      calls.lastActor = actor;
      return rawQuote();
    },
  };
  const controller = new QuotesController(quotesService, {} as any);
  return { controller, calls };
}

const ALLOWED = ['admin', 'super_admin', 'finance', 'operations', 'viewer'] as const;
const DENIED = ['agent', 'agent_admin', 'some-unknown-future-role'] as const;

for (const role of ALLOWED) {
  test(`controller: allowed role "${role}" receives the operational projection`, async () => {
    const { controller, calls } = createController();
    const out: any = await controller.findOneOperational('q1', makeActor(role));
    assert.equal(calls.findOne, 1);
    assert.equal(out.id, 'q1');
    assert.deepEqual(Object.keys(out).sort(), EXPECTED_ROOT_KEYS);
    assert.equal(JSON.stringify(out).includes('SENTINEL'), false);
  });
}

test('controller: operations, viewer and finance receive the IDENTICAL projection', async () => {
  const ops: any = await createController().controller.findOneOperational('q1', makeActor('operations'));
  const viewer: any = await createController().controller.findOneOperational('q1', makeActor('viewer'));
  const finance: any = await createController().controller.findOneOperational('q1', makeActor('finance'));
  assert.deepEqual(ops, viewer);
  assert.deepEqual(ops, finance);
});

for (const role of DENIED) {
  test(`controller: denied role "${role}" gets 403 BEFORE the quote service is called`, async () => {
    const { controller, calls } = createController();
    await assert.rejects(() => controller.findOneOperational('q1', makeActor(role)), ForbiddenException);
    assert.equal(calls.findOne, 0);
  });
}

test('controller: missing role fails closed (403) before the quote service is called', async () => {
  const { controller, calls } = createController();
  await assert.rejects(() => controller.findOneOperational('q1', makeActor(undefined)), ForbiddenException);
  assert.equal(calls.findOne, 0);
});

test('controller: raw GET :id remains unchanged — same internal-role gate, raw pass-through', async () => {
  const allowed = createController();
  const raw: any = await allowed.controller.findOne('q1', makeActor('operations'));
  // raw endpoint returns the untouched raw quote (still carries buy-side fields).
  assert.equal(raw.totalCost, COST);
  assert.equal(raw.publicToken, TOKEN);
  const denied = createController();
  await assert.rejects(() => denied.controller.findOne('q1', makeActor('agent')), ForbiddenException);
  assert.equal(denied.calls.findOne, 0);
});
