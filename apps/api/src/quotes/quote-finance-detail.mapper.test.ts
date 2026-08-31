import assert = require('node:assert/strict');
import test = require('node:test');
import { ForbiddenException } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { mapQuoteToFinanceDetail } from './quote-finance-detail.mapper';
import { mapQuoteToOperational } from './quote-operational.mapper';

// CP-N3b2c2a — Finance quote-detail DTO/mapper/gate. Synthetic data only.
// Every forbidden/sensitive value is prefixed SENTINEL_ so a single recursive scan of
// the serialized output proves none of them leak. Legitimate finance values (supplier
// name, contract name, costs) use plain, non-SENTINEL strings/numbers.

const SENTINELS = [
  'SENTINEL_ACCESS_TOKEN', 'SENTINEL_PUBLIC_TOKEN', 'SENTINEL_SNAPSHOT', 'SENTINEL_CLIENT_SNAPSHOT',
  'SENTINEL_PASSPORT', 'SENTINEL_DOB', 'SENTINEL_CONTACT_EMAIL', 'SENTINEL_CONTACT_PHONE', 'SENTINEL_AGENT_EMAIL',
  'SENTINEL_RATEPOLICIES', 'SENTINEL_COMMISSION', 'SENTINEL_GALLERY', 'SENTINEL_SUPPLIER_ID', 'SENTINEL_FUTURE',
  'SENTINEL_CAPABILITY_URL', 'SENTINEL_FX',
];

function rawQuote(): any {
  return {
    id: 'q1', quoteType: 'standard', jordanPassType: 'none', bookingType: 'FIT', title: 'Trip',
    description: 'desc', quoteNumber: 'Q-1', quoteCurrency: 'USD', proposalLanguage: 'en', status: 'DRAFT',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    adults: 2, children: 0, roomCount: 1, nightCount: 3,
    travelStartDate: '2026-06-01T00:00:00.000Z', validUntil: null, sentAt: null, acceptedAt: null,
    revisionNumber: 0, revisedFromId: null, acceptedVersionId: null, clientChangeRequestMessage: null,
    inclusionsText: null, exclusionsText: null, termsNotesText: null,
    totalCost: 900, totalSell: 1200, totalPrice: 1200, pricePerPax: 600, singleSupplement: null,
    fixedPricePerPerson: 600, pricingType: 'simple', pricingMode: 'FIXED', publicEnabled: true, isLatestRevision: true,
    // publicToken is normally stripped upstream; include it to prove the mapper never emits it.
    publicToken: 'SENTINEL_PUBLIC_TOKEN',
    fxRate: 'SENTINEL_FX', fxFromCurrency: 'SENTINEL_FX', focType: 'none', focRatio: null, focCount: null, focRoomType: null,
    company: { id: 'co1', name: 'DMC Co', agentCommissionPercent: 'SENTINEL_COMMISSION', logoUrl: 'SENTINEL_CAPABILITY_URL' },
    contact: { id: 'ct1', firstName: 'Al', lastName: 'Ro', email: 'SENTINEL_CONTACT_EMAIL', phone: 'SENTINEL_CONTACT_PHONE' },
    agent: { id: 'ag1', firstName: 'Ag', lastName: 'En', email: 'SENTINEL_AGENT_EMAIL' },
    passengers: [{ id: 'p1', firstName: 'Pax', lastName: 'One', passportNumber: 'SENTINEL_PASSPORT', dateOfBirth: 'SENTINEL_DOB', email: 'SENTINEL_CONTACT_EMAIL' }],
    booking: { id: 'bk1', status: 'confirmed', accessToken: 'SENTINEL_ACCESS_TOKEN', snapshotJson: { x: 'SENTINEL_SNAPSHOT' }, clientSnapshotJson: { y: 'SENTINEL_CLIENT_SNAPSHOT' } },
    invoice: { id: 'inv1', totalAmount: 1200, currency: 'USD', status: 'DRAFT', dueDate: null },
    pricingSlabs: [], scenarios: [], itineraries: [],
    quoteItems: [hotelItem(), transportItem(), externalPackageItem()],
    quoteOptions: [{
      id: 'opt1', quoteId: 'q1', kind: 'HOTEL', name: 'Option A', notes: null, pricingMode: 'PER_ITEM',
      hotelCategoryId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      totalPrice: 1200, totalSell: 1200, pricePerPax: 600, totalCost: 900, profit: 300, packageMarginPercent: 25,
      hotelCategory: { id: 'hc1', name: '5-star' },
      hotelOptions: [{
        id: 'ho1', quoteOptionId: 'opt1', city: 'Amman', hotelId: 'h1', roomCategoryId: 'rc1',
        hotelNameSnapshot: 'Hilton', roomType: 'DBL', mealPlan: 'BB', mealPlanCode: 'BB', nights: 3, isPrimary: true,
        notes: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        hotel: { id: 'h1', name: 'Hilton', city: 'Amman', category: '5', preferenceRank: 1, supplierName: 'SENTINEL_SUPPLIER_ID',
          factSheet: { shortDescription: 'Nice', highlightsJson: ['Central', 'Rooftop'], amenitiesJson: ['Wifi', 'Pool'], imageGalleryJson: ['SENTINEL_GALLERY'] } },
        roomCategory: { id: 'rc1', name: 'Deluxe' },
        matchedPricedQuoteItemId: null, pricingMatchStatus: 'matched', pricingMatchReason: 'direct_option_item_match',
        matchedDiscriminators: null,
      }],
      quoteItems: [hotelItem()],
    }],
    quoteItineraryDays: [{
      id: 'd1', quoteId: 'q1', packageTemplateId: null, packageTemplateDayId: null, dayNumber: 1, title: 'Day 1',
      notes: null, notesLanguage: null, country: 'JO', transportDayType: null, vehicleRetained: null, vehicleReleased: null,
      inRetainedBlock: null, overnightCity: null, vehicleReturnsToBase: null, sortOrder: 0, isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      dayItems: [{ id: 'di1', dayId: 'd1', quoteServiceId: 'it1', sortOrder: 0, notes: null, isActive: true, quoteService: hotelItem() }],
    }],
  };
}

function hotelItem(): any {
  return {
    id: 'it1', quoteId: 'q1', optionId: null, serviceId: null, activityId: null, entranceFeeId: null, itineraryId: null,
    quantity: 1, paxCount: 2, sellPrice: 400, totalSell: 400, sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    jordanPassCovered: false, currency: 'USD', quoteCurrency: 'USD', standaloneTransfer: false, reconfirmationRequired: false,
    hotelId: 'h1', contractId: 'c1', roomCategoryId: 'rc1', seasonName: 'High', mealPlan: 'BB', occupancyType: 'DBL',
    // finance cost cluster
    totalCost: 300, baseCost: 300, costBaseAmount: 300, overrideCost: null, useOverride: false, overrideReason: null,
    markupPercent: 33.3, markupAmount: 100, jordanPassSavingsJod: 0, pricingDescription: 'Rate on file', baseSell: 400,
    externalNetCost: null, externalSupplierName: null, externalInternalNotes: null, externalPackageSingleSupplement: null,
    externalPackagePricingMatrixJson: null, promotionExplanation: null, futureCol: 'SENTINEL_FUTURE',
    contract: { name: 'Hilton Contract', ratePolicies: 'SENTINEL_RATEPOLICIES' },
    hotel: { id: 'h1', name: 'Hilton', city: 'Amman', category: '5', preferenceRank: 1, supplierName: 'SENTINEL_SUPPLIER_ID' },
    roomCategory: { id: 'rc1', name: 'Deluxe' }, activity: null, entranceFee: null, service: null, touringRoute: null,
    appliedVehicleRate: null, touringRoutePricing: null,
  };
}
function transportItem(): any {
  return {
    id: 'it2', quoteId: 'q1', quantity: 1, paxCount: 2, sellPrice: 200, totalSell: 200, sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    jordanPassCovered: false, currency: 'USD', quoteCurrency: 'USD', standaloneTransfer: true, reconfirmationRequired: false,
    totalCost: 150, baseCost: 150, costBaseAmount: 150, overrideCost: 160, useOverride: true, overrideReason: 'peak',
    markupPercent: 25, markupAmount: 40, jordanPassSavingsJod: 0, pricingDescription: 'Sedan transfer', baseSell: 200,
    externalNetCost: null, externalSupplierName: null, externalInternalNotes: null, externalPackageSingleSupplement: null,
    externalPackagePricingMatrixJson: null, promotionExplanation: ['Early bird', { name: 'Loyalty', effect: '-5%', type: 'discount', minStay: 3, boardBasis: 'BB', evilKey: 'SENTINEL_FUTURE' }],
    contract: null, hotel: null, roomCategory: null, activity: null, entranceFee: null, service: null, touringRoute: null,
    appliedVehicleRate: { routeName: 'QAIA-Amman', supplierId: 'SENTINEL_SUPPLIER_ID', route: { fromPlace: { city: 'QAIA' }, toPlace: { city: 'Amman' } }, vehicle: { name: 'Sedan', vehicleClass: 'Sedan' }, serviceType: { code: 'ROUTE_TRANSFER', name: 'Route Transfer' }, supplier: { id: 'SENTINEL_SUPPLIER_ID', name: 'Alpha Transport' } },
    touringRoutePricing: null,
  };
}
function externalPackageItem(): any {
  return {
    id: 'it3', quoteId: 'q1', quantity: 1, paxCount: 2, sellPrice: 600, totalSell: 600, sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    jordanPassCovered: false, currency: 'USD', quoteCurrency: 'USD', standaloneTransfer: false, reconfirmationRequired: false,
    externalPackageName: 'Petra Pkg', externalPackageCountry: 'JO', externalPricingBasis: 'PER_PERSON',
    totalCost: 450, baseCost: 450, costBaseAmount: 450, overrideCost: null, useOverride: false, overrideReason: null,
    markupPercent: 33, markupAmount: 150, jordanPassSavingsJod: 0, pricingDescription: 'Ext pkg', baseSell: 600,
    externalNetCost: 450, externalSupplierName: 'Desert Co', externalInternalNotes: 'net rate', externalPackageSingleSupplement: 50,
    externalPackagePricingMatrixJson: [
      { label: 'Band A', paxFrom: 1, paxTo: 4, freePax: 0, costPerPerson: 225, sellPerPerson: 300, notes: 'std' },
      { label: 'evil', paxFrom: 5, evilKey: 'SENTINEL_FUTURE' },
    ],
    promotionExplanation: null, contract: null,
    hotel: null, roomCategory: null, activity: null, entranceFee: null, service: null, touringRoute: null,
    appliedVehicleRate: null, touringRoutePricing: null,
  };
}

function serialize(dto: unknown): string { return JSON.stringify(dto); }
function assertNoSentinels(dto: unknown, label: string) {
  const s = serialize(dto);
  for (const sen of SENTINELS) {
    assert.equal(s.includes(sen), false, `${label}: leaked ${sen}`);
  }
  // also generic: no SENTINEL_ prefix at all
  assert.equal(/SENTINEL_/.test(s), false, `${label}: leaked a SENTINEL_ value`);
}

// ---------------------------------------------------------------------------
// 1. Exact root + nested key sets
// ---------------------------------------------------------------------------
const ROOT_KEYS = [
  'id', 'quoteType', 'jordanPassType', 'bookingType', 'title', 'description', 'quoteNumber', 'quoteCurrency',
  'proposalLanguage', 'status', 'createdAt', 'updatedAt', 'adults', 'children', 'roomCount', 'nightCount',
  'travelStartDate', 'validUntil', 'sentAt', 'acceptedAt', 'revisionNumber', 'revisedFromId', 'acceptedVersionId',
  'clientChangeRequestMessage', 'inclusionsText', 'exclusionsText', 'termsNotesText', 'totalCost', 'totalSell',
  'totalPrice', 'pricePerPax', 'singleSupplement', 'fixedPricePerPerson', 'pricingType', 'pricingMode',
  'publicEnabled', 'isLatestRevision', 'company', 'contact', 'agent', 'quoteItineraryDays', 'itineraries',
  'quoteItems', 'quoteOptions', 'passengers', 'pricingSlabs', 'scenarios', 'invoice', 'booking',
  'currentPricing', 'priceComputation', 'workflowDiagnostics', 'convertBlockers',
];
const ITEM_KEYS = [
  'id', 'quoteId', 'optionId', 'serviceId', 'activityId', 'entranceFeeId', 'itineraryId', 'packageTemplateId',
  'packageTemplateDayId', 'packageTemplateComponentId', 'excursionTemplateId', 'excursionTemplateComponentId',
  'excursionTemplateComponentOptional', 'quantity', 'paxCount', 'participantCount', 'adultCount', 'childCount',
  'roomCount', 'nightCount', 'dayCount', 'sellPrice', 'totalSell', 'sortOrder', 'createdAt', 'updatedAt',
  'jordanPassCovered', 'currency', 'quoteCurrency', 'customServiceName', 'transportLabel', 'standaloneTransfer',
  'guideType', 'guideDuration', 'guideOvernight', 'serviceDate', 'startTime', 'pickupTime', 'pickupLocation',
  'meetingPoint', 'reconfirmationRequired', 'reconfirmationDueAt', 'hotelId', 'roomCategoryId', 'seasonName',
  'mealPlan', 'occupancyType', 'touringRouteId', 'externalPackageCountry', 'externalPackageName', 'externalStartDay',
  'externalEndDay', 'externalStartDate', 'externalEndDate', 'externalPricingBasis', 'externalIncludes',
  'externalExcludes', 'externalHotelsOrSimilar', 'externalClientDescription', 'totalCost', 'baseCost', 'costBaseAmount',
  'overrideCost', 'useOverride', 'overrideReason', 'markupPercent', 'markupAmount', 'jordanPassSavingsJod',
  'pricingDescription', 'baseSell', 'externalNetCost', 'externalSupplierName', 'externalInternalNotes',
  'externalPackageSingleSupplement', 'externalPackagePricingMatrix', 'promotionExplanation', 'contract', 'hotel',
  'roomCategory', 'activity', 'entranceFee', 'service', 'touringRoute', 'appliedVehicleRate', 'touringRoutePricing',
];
const OPTION_KEYS = ['id', 'quoteId', 'kind', 'name', 'notes', 'pricingMode', 'hotelCategoryId', 'createdAt', 'updatedAt', 'totalPrice', 'totalSell', 'pricePerPax', 'totalCost', 'profit', 'packageMarginPercent', 'hotelCategory', 'hotelOptions', 'quoteItems'];
const HOTEL_OPTION_KEYS = ['id', 'quoteOptionId', 'city', 'hotelId', 'roomCategoryId', 'hotelNameSnapshot', 'roomType', 'mealPlan', 'mealPlanCode', 'nights', 'isPrimary', 'notes', 'createdAt', 'updatedAt', 'hotel', 'roomCategory', 'matchedPricedQuoteItemId', 'pricingMatchStatus', 'pricingMatchReason', 'matchedDiscriminators'];
const FACTSHEET_KEYS = ['shortDescription', 'highlights', 'amenities'];
const BOOKING_KEYS = ['id', 'status'];
const MATRIX_ROW_KEYS = ['label', 'paxFrom', 'paxTo', 'freePax', 'costPerPerson', 'sellPerPerson', 'notes'];

test('1. exact root + nested key sets', () => {
  const dto: any = mapQuoteToFinanceDetail(rawQuote());
  assert.deepEqual(Object.keys(dto).sort(), [...ROOT_KEYS].sort());
  assert.deepEqual(Object.keys(dto.quoteItems[0]).sort(), [...ITEM_KEYS].sort());
  assert.deepEqual(Object.keys(dto.quoteOptions[0]).sort(), [...OPTION_KEYS].sort());
  assert.deepEqual(Object.keys(dto.quoteOptions[0].hotelOptions[0]).sort(), [...HOTEL_OPTION_KEYS].sort());
  assert.deepEqual(Object.keys(dto.quoteOptions[0].hotelOptions[0].hotel.factSheet).sort(), [...FACTSHEET_KEYS].sort());
  assert.deepEqual(Object.keys(dto.booking).sort(), [...BOOKING_KEYS].sort());
  assert.deepEqual(Object.keys(dto.quoteItems[2].externalPackagePricingMatrix[0]).sort(), [...MATRIX_ROW_KEYS].sort());
});

// ---------------------------------------------------------------------------
// 2. Required finance values survive with correct values
// ---------------------------------------------------------------------------
test('2. finance cost/margin/override/supplier/contract/option/matrix/booking values survive', () => {
  const dto: any = mapQuoteToFinanceDetail(rawQuote());
  assert.equal(dto.totalCost, 900);
  const hotel = dto.quoteItems[0];
  assert.equal(hotel.totalCost, 300);
  assert.equal(hotel.baseCost, 300);
  assert.equal(hotel.markupPercent, 33.3);
  assert.equal(hotel.markupAmount, 100);
  assert.equal(hotel.pricingDescription, 'Rate on file');
  assert.equal(hotel.contract.name, 'Hilton Contract');
  const transport = dto.quoteItems[1];
  assert.equal(transport.overrideCost, 160);
  assert.equal(transport.useOverride, true);
  assert.equal(transport.appliedVehicleRate.supplier.name, 'Alpha Transport');
  const ext = dto.quoteItems[2];
  assert.equal(ext.externalNetCost, 450);
  assert.equal(ext.externalSupplierName, 'Desert Co');
  assert.equal(ext.externalInternalNotes, 'net rate');
  assert.equal(ext.externalPackagePricingMatrix[0].costPerPerson, 225);
  assert.equal(ext.externalPackagePricingMatrix[0].sellPerPerson, 300);
  const opt = dto.quoteOptions[0];
  assert.equal(opt.totalCost, 900);
  assert.equal(opt.profit, 300);
  assert.equal(opt.packageMarginPercent, 25);
  assert.equal(dto.booking.status, 'confirmed');
  assert.equal(dto.quoteOptions[0].hotelOptions[0].hotel.factSheet.highlights.join(','), 'Central,Rooftop');
});

// ---------------------------------------------------------------------------
// 3-4. Controller gate: allowed roles reach findOne + mapper (identical bodies);
//      denied roles 403 before findOne.
// ---------------------------------------------------------------------------
const ALLOWED = ['admin', 'super_admin', 'finance'] as const;
const DENIED = ['operations', 'viewer', 'agent', 'agent_admin', 'some-unknown-future-role'] as const;
function makeActor(role: string | undefined) { return (role === undefined ? { id: 'u1', companyId: 'dmc' } : { id: 'u1', companyId: 'dmc', role }) as any; }
function createController() {
  const calls = { findOne: 0 };
  const quotesService: any = { findOne: async () => { calls.findOne += 1; return rawQuote(); } };
  return { controller: new QuotesController(quotesService, {} as any), calls };
}

test('3. admin/super_admin/finance receive deeply identical bodies', async () => {
  const bodies = [];
  for (const role of ALLOWED) {
    const { controller } = createController();
    bodies.push(await controller.findOneFinanceDetail('q1', makeActor(role)));
  }
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[1], bodies[2]);
});

for (const role of DENIED) {
  test(`4. denied role "${role}" is 403 before findOne`, async () => {
    const { controller, calls } = createController();
    await assert.rejects(() => controller.findOneFinanceDetail('q1', makeActor(role)), ForbiddenException);
    assert.equal(calls.findOne, 0);
  });
}
test('4. missing role fails closed before findOne', async () => {
  const { controller, calls } = createController();
  await assert.rejects(() => controller.findOneFinanceDetail('q1', makeActor(undefined)), ForbiddenException);
  assert.equal(calls.findOne, 0);
});

// ---------------------------------------------------------------------------
// 5-6. Recursive sentinel scan + accessToken/*SnapshotJson absent at every depth
// ---------------------------------------------------------------------------
test('5. no token / snapshot / PII / capability-URL / arbitrary-JSON / future / raw-relation sentinel appears', () => {
  const dto = mapQuoteToFinanceDetail(rawQuote());
  assertNoSentinels(dto, 'finance-detail');
});
test('6. booking.accessToken and every *SnapshotJson are absent at every depth', () => {
  const s = serialize(mapQuoteToFinanceDetail(rawQuote()));
  assert.equal(s.includes('accessToken'), false);
  assert.equal(s.includes('snapshotJson'), false);
  assert.equal(s.includes('SnapshotJson'), false);
  assert.equal(s.includes('publicToken'), false);
});

// ---------------------------------------------------------------------------
// 7. Matrix / promotion malformed + extra-key fail closed
// ---------------------------------------------------------------------------
test('7. matrix drops extra-key/malformed rows; non-array → null', () => {
  const dto: any = mapQuoteToFinanceDetail(rawQuote());
  const matrix = dto.quoteItems[2].externalPackagePricingMatrix;
  assert.equal(matrix.length, 1);                 // the evil extra-key row dropped
  assert.equal(matrix[0].label, 'Band A');
  const bad: any = rawQuote();
  bad.quoteItems[2].externalPackagePricingMatrixJson = 'oops';
  assert.equal(mapQuoteToFinanceDetail(bad).quoteItems[2].externalPackagePricingMatrix, null);
  const bad2: any = rawQuote();
  bad2.quoteItems[2].externalPackagePricingMatrixJson = { rows: 'x' };
  assert.equal(mapQuoteToFinanceDetail(bad2).quoteItems[2].externalPackagePricingMatrix, null);
});
test('7. promotion drops extra-key rows; keeps string + clean object; non-array → null', () => {
  const dto: any = mapQuoteToFinanceDetail(rawQuote());
  const promo = dto.quoteItems[1].promotionExplanation;
  assert.equal(promo.length, 1);                  // string kept, evilKey object dropped
  assert.equal(promo[0], 'Early bird');
  const bad: any = rawQuote();
  bad.quoteItems[1].promotionExplanation = { name: 'x' };
  assert.equal(mapQuoteToFinanceDetail(bad).quoteItems[1].promotionExplanation, null);
});

// ---------------------------------------------------------------------------
// 8. Structured fact sheet with email/phone/token/note → empty, no leak
// ---------------------------------------------------------------------------
test('8. structured fact-sheet object → empty highlights/amenities and leaks nothing', () => {
  const raw: any = rawQuote();
  raw.quoteOptions[0].hotelOptions[0].hotel.factSheet = {
    shortDescription: 'ok',
    highlightsJson: { identity: { email: 'SENTINEL_CONTACT_EMAIL', phone: 'SENTINEL_CONTACT_PHONE' }, token: 'SENTINEL_ACCESS_TOKEN' },
    amenitiesJson: { note: 'SENTINEL_FUTURE', wifi: 'SENTINEL_SNAPSHOT' },
  };
  const dto: any = mapQuoteToFinanceDetail(raw);
  const fs = dto.quoteOptions[0].hotelOptions[0].hotel.factSheet;
  assert.deepEqual(fs.highlights, []);
  assert.deepEqual(fs.amenities, []);
  assert.equal(fs.shortDescription, 'ok');
  assertNoSentinels(dto, 'structured-factsheet');
  // mixed array also fails closed
  const raw2: any = rawQuote();
  raw2.quoteOptions[0].hotelOptions[0].hotel.factSheet.highlightsJson = ['ok', { x: 'SENTINEL_FUTURE' }];
  const dto2: any = mapQuoteToFinanceDetail(raw2);
  assert.deepEqual(dto2.quoteOptions[0].hotelOptions[0].hotel.factSheet.highlights, []);
});

// ---------------------------------------------------------------------------
// 9. Null/empty relations do not crash
// ---------------------------------------------------------------------------
test('9. null/empty relations do not crash', () => {
  const raw: any = {
    id: 'q2', pricingType: 'simple', pricingMode: 'FIXED', totalCost: 0,
    company: null, contact: null, agent: null, booking: null, invoice: null,
    passengers: [], quoteItems: [], quoteOptions: [], quoteItineraryDays: [], itineraries: [], pricingSlabs: [], scenarios: [],
  };
  const dto: any = mapQuoteToFinanceDetail(raw);
  assert.equal(dto.id, 'q2');
  assert.equal(dto.booking, null);
  assert.deepEqual(dto.quoteItems, []);
  // an item with null sub-relations
  const raw2: any = rawQuote();
  raw2.quoteItems = [{ id: 'x', contract: null, hotel: null, appliedVehicleRate: null, touringRoutePricing: null }];
  const dto2: any = mapQuoteToFinanceDetail(raw2);
  assert.equal(dto2.quoteItems[0].contract, null);
  assert.equal(dto2.quoteItems[0].appliedVehicleRate, null);
});

// ---------------------------------------------------------------------------
// 10. Source fixture not mutated
// ---------------------------------------------------------------------------
test('10. source object is not mutated', () => {
  const raw = rawQuote();
  const clone = structuredClone(raw);
  mapQuoteToFinanceDetail(raw);
  assert.deepEqual(raw, clone);
});

// ---------------------------------------------------------------------------
// 11. Operational-derived fields match a direct operational mapping (reuse intact)
// ---------------------------------------------------------------------------
test('11. sell-side fields equal the operational projection (operational mapper output unchanged)', () => {
  const raw = rawQuote();
  const fin: any = mapQuoteToFinanceDetail(raw);
  const op: any = mapQuoteToOperational(raw);
  assert.deepEqual(fin.currentPricing, op.currentPricing);
  assert.deepEqual(fin.priceComputation, op.priceComputation);
  assert.deepEqual(fin.passengers, op.passengers);
  assert.deepEqual(fin.company, op.company);
  assert.deepEqual(fin.contact, op.contact);
  assert.deepEqual(fin.itineraries, op.itineraries);
  assert.equal(fin.totalSell, op.totalSell);
});

// ---------------------------------------------------------------------------
// 12. Controller route resolves exactly; raw findOne handler untouched
// ---------------------------------------------------------------------------
test('12. finance-detail route + method resolve exactly; raw :id handler still present', () => {
  const Reflect_ = (globalThis as any).Reflect;
  const methodPath = Reflect_.getMetadata('path', QuotesController.prototype.findOneFinanceDetail);
  const methodVerb = Reflect_.getMetadata('method', QuotesController.prototype.findOneFinanceDetail);
  assert.equal(methodPath, ':id/finance-detail');
  assert.equal(methodVerb, 0); // RequestMethod.GET
  assert.equal(typeof QuotesController.prototype.findOne, 'function'); // raw :id handler untouched
});
