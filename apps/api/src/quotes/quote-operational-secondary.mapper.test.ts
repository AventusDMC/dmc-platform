import 'reflect-metadata';
import assert = require('node:assert/strict');
import test = require('node:test');
import { ForbiddenException } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { QuoteItineraryController } from '../quote-itinerary/quote-itinerary.controller';
import {
  mapItineraryToOperational,
  mapPassengersToOperational,
  mapRoomingToOperational,
} from './quote-operational-secondary.mapper';

// Synthetic sentinels ONLY — every restricted value carries "SENTINEL"; a single
// scan of the serialized output for it proves nothing restricted leaked.
const NOTE = 'SENTINEL_INTERNAL_NOTE';
const CONTRACT = 'SENTINEL_CONTRACT_NAME';
const RATE = 'SENTINEL_RATE_VARIANT_ID';
const SUPPLIER = 'SENTINEL_SUPPLIER_NAME';
const PII = 'SENTINEL_PASSPORT_NUMBER';
const FUTURE = 'SENTINEL_FUTURE_FIELD';
const COST = 987654321;
const D = new Date('2026-05-01T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Raw fixtures (Prisma-serialized shapes carrying the restricted fields)
// ---------------------------------------------------------------------------

function rawItinerary(): any {
  return {
    quoteId: 'q1',
    days: [
      {
        id: 'd1', quoteId: 'q1', dayNumber: 1, title: 'Day 1', notes: 'Visit Petra',
        country: 'JO', sortOrder: 0, isActive: true, createdAt: D, updatedAt: D,
        dayItems: [
          {
            id: 'di1', dayId: 'd1', quoteServiceId: 'it1', sortOrder: 0, notes: 'n', isActive: true, createdAt: D, updatedAt: D,
            quoteService: {
              id: 'it1', quoteId: 'q1', optionId: 'opt1', serviceDate: D,
              startTime: '09:00', pickupTime: '08:30', pickupLocation: 'Lobby', meetingPoint: 'Gate',
              quantity: 1, paxCount: 2, participantCount: 2, adultCount: 2, childCount: 0, roomCount: 1, nightCount: 3, dayCount: 1,
              pricingDescription: NOTE, overrideReason: NOTE, reconfirmationRequired: false, reconfirmationDueAt: D,
              activityId: 'act1', activityRateVariantId: RATE, ticketRateVariantId: RATE, activityName: 'Petra Guide',
              totalCost: COST, baseCost: COST, __futureColumn: FUTURE,
              service: { id: 'sv1', name: 'Guide', category: 'guide', serviceType: { id: 'st1', name: 'Guide Service', code: 'GUIDE', __future: FUTURE } },
              hotel: { id: 'h1', name: 'Petra Hotel', city: 'Petra', supplierName: SUPPLIER },
              contract: { id: 'c1', name: CONTRACT, validFrom: D, validTo: D, currency: 'USD' },
              roomCategory: { id: 'rc1', name: 'Deluxe Room', code: RATE },
              touringRoute: { id: 'tr1', name: 'Petra Route', startCity: 'Amman' },
              appliedVehicleRate: {
                id: 'vr1', routeName: 'QAIA - Amman', price: COST, supplierId: 'sup', supplier: { name: SUPPLIER },
                vehicle: { id: 'v1', name: 'Sedan', supplierName: SUPPLIER },
                serviceType: { id: 'tst1', name: 'Airport Transfer', code: 'AIRPORT_TRANSFER' },
              },
            },
          },
        ],
      },
    ],
  };
}

function rawPassengers(): any {
  return [
    {
      id: 'p1', quoteId: 'q1', firstName: 'John', lastName: 'Smith', gender: 'M',
      dateOfBirth: D, nationality: 'SENTINEL_NATIONALITY', passportNumber: PII, passportExpiry: D,
      dietaryNotes: NOTE, mobilityNotes: NOTE, emergencyContact: PII, remarks: PII, __future: FUTURE,
    },
  ];
}

function rawRooming(): any {
  return [
    {
      id: 'rg1', quoteId: 'q1', itineraryDayId: 'd1', hotelQuoteItemId: 'it1',
      roomType: 'Double', occupancyType: 'double', notes: 'connecting', temporaryRoomLabel: 'Room 1',
      guideRoom: false, leaderRoom: false, sortOrder: 0, createdAt: D, updatedAt: D, __future: FUTURE,
      itineraryDay: { id: 'd1', dayNumber: 1, title: 'Day 1' },
      hotelQuoteItem: {
        id: 'it1', hotelId: 'h1', roomCategoryId: 'rc1', pricingDescription: NOTE, occupancyType: 'double', roomCount: 1,
        hotel: { id: 'h1', name: 'Petra Hotel' }, contract: { id: 'c1', name: CONTRACT }, roomCategory: { id: 'rc1', name: 'Deluxe Room' },
      },
      assignments: [
        {
          id: 'a1', roomingGroupId: 'rg1', quotePassengerId: 'p1', createdAt: D,
          quotePassenger: { id: 'p1', firstName: 'John', lastName: 'Smith', passportNumber: PII, dateOfBirth: D, nationality: 'SENTINEL_NAT' },
        },
      ],
    },
  ];
}

function assertNoSentinels(value: unknown, label: string) {
  const s = JSON.stringify(value);
  assert.equal(s.includes('SENTINEL'), false, `${label}: no SENTINEL value may leak`);
  assert.equal(s.includes(String(COST)), false, `${label}: no cost value may leak`);
  assert.equal(s.includes('__future'), false, `${label}: no unknown future field may propagate`);
}

// ---------------------------------------------------------------------------
// Itinerary mapper
// ---------------------------------------------------------------------------

const ITIN_RESPONSE_KEYS = ['days', 'quoteId'];
const ITIN_DAY_KEYS = ['dayItems', 'dayNumber', 'id', 'isActive', 'notes', 'sortOrder', 'title'];
const ITIN_DAYITEM_KEYS = ['id', 'isActive', 'notes', 'quoteService', 'quoteServiceId', 'sortOrder'];
const ITIN_SERVICE_KEYS = [
  'activityId', 'activityName', 'adultCount', 'appliedVehicleRate', 'childCount', 'contract', 'hotel', 'id',
  'meetingPoint', 'optionId', 'participantCount', 'paxCount', 'pickupLocation', 'pickupTime', 'roomCategory',
  'service', 'serviceDate', 'startTime', 'touringRoute',
].sort();

test('itinerary: exact root/day/item/service key sets; restricted keys absent', () => {
  const out = mapItineraryToOperational(rawItinerary());
  assert.deepEqual(Object.keys(out).sort(), ITIN_RESPONSE_KEYS);
  const day = out.days[0];
  assert.deepEqual(Object.keys(day).sort(), ITIN_DAY_KEYS);
  const item = day.dayItems[0];
  assert.deepEqual(Object.keys(item).sort(), ITIN_DAYITEM_KEYS);
  const qs = item.quoteService!;
  assert.deepEqual(Object.keys(qs).sort(), ITIN_SERVICE_KEYS);
  // excluded no-consumer / restricted keys never present
  for (const k of ['quantity', 'roomCount', 'nightCount', 'dayCount', 'reconfirmationRequired', 'reconfirmationDueAt', 'pricingDescription', 'overrideReason', 'activityRateVariantId', 'ticketRateVariantId', 'totalCost', 'baseCost', 'quoteId']) {
    assert.equal(k in qs, false, `service must not carry ${k}`);
  }
  assert.equal('code' in qs.roomCategory!, false);
  assert.equal('id' in qs.hotel!, false);
});

test('itinerary: retained IDs only where a consumer reads them; provenance IDs dropped', () => {
  const out = mapItineraryToOperational(rawItinerary());
  const qs = out.days[0].dayItems[0].quoteService!;
  assert.equal(qs.service!.id, 'sv1'); // Classic reads service.id -> retained
  assert.equal('id' in qs.service!.serviceType!, false); // serviceType.id no consumer -> dropped
  assert.equal('id' in qs.appliedVehicleRate!, false); // rate-row id -> dropped
  assert.equal('id' in qs.appliedVehicleRate!.vehicle!, false); // vehicle.id no consumer -> dropped
  assert.equal('code' in qs.appliedVehicleRate!.serviceType!, false); // avr serviceType.code no consumer -> dropped
  assert.equal('id' in qs.touringRoute!, false);
  assert.equal(qs.appliedVehicleRate!.routeName, 'QAIA - Amman');
  assert.equal(qs.appliedVehicleRate!.vehicle!.name, 'Sedan');
  assert.equal(qs.service!.serviceType!.code, 'GUIDE');
});

test('itinerary: contract state -> presence sentinel {} (zero own keys); no name/dates/currency/supplier', () => {
  const out = mapItineraryToOperational(rawItinerary());
  const qs = out.days[0].dayItems[0].quoteService!;
  assert.deepEqual(qs.contract, {});
  assert.equal(Object.keys(qs.contract as object).length, 0);
  assertNoSentinels(out, 'itinerary');
});

test('itinerary: absent contract -> null; empty/null relations do not crash', () => {
  const raw: any = { quoteId: 'q2', days: [{ id: 'd', dayNumber: 1, title: 'D', dayItems: [{ id: 'x', quoteServiceId: 'y', quoteService: { id: 'z', contract: null, service: null, hotel: null, appliedVehicleRate: null } }] }] };
  const out = mapItineraryToOperational(raw);
  const qs = out.days[0].dayItems[0].quoteService!;
  assert.equal(qs.contract, null);
  assert.equal(qs.service, null);
  assert.equal(qs.appliedVehicleRate, null);
  // fully empty
  assert.deepEqual(mapItineraryToOperational({}).days, []);
  assert.deepEqual(mapItineraryToOperational(null).days, []);
});

test('itinerary: source object is not mutated', () => {
  const raw = rawItinerary();
  const before = JSON.stringify(raw);
  mapItineraryToOperational(raw);
  assert.equal(JSON.stringify(raw), before);
});

// ---------------------------------------------------------------------------
// Passengers mapper
// ---------------------------------------------------------------------------

test('passengers: exactly { id, firstName, lastName }; all PII dropped', () => {
  const out = mapPassengersToOperational(rawPassengers());
  assert.equal(out.length, 1);
  assert.deepEqual(Object.keys(out[0]).sort(), ['firstName', 'id', 'lastName']);
  assert.equal(out[0].id, 'p1');
  assert.equal(out[0].firstName, 'John');
  assert.equal(out[0].lastName, 'Smith');
  assertNoSentinels(out, 'passengers');
  assert.deepEqual(mapPassengersToOperational([]), []);
  assert.deepEqual(mapPassengersToOperational(null), []);
});

test('passengers: source not mutated', () => {
  const raw = rawPassengers();
  const before = JSON.stringify(raw);
  mapPassengersToOperational(raw);
  assert.equal(JSON.stringify(raw), before);
});

// ---------------------------------------------------------------------------
// Rooming mapper
// ---------------------------------------------------------------------------

const ROOM_GROUP_KEYS = [
  'assignments', 'guideRoom', 'hotelQuoteItem', 'hotelQuoteItemId', 'id', 'itineraryDay', 'itineraryDayId',
  'leaderRoom', 'notes', 'occupancyType', 'roomType', 'temporaryRoomLabel',
].sort();

test('rooming: exact key set; pricingDescription + contract excluded; passenger name-only', () => {
  const out = mapRoomingToOperational(rawRooming());
  const g = out[0];
  assert.deepEqual(Object.keys(g).sort(), ROOM_GROUP_KEYS);
  for (const k of ['quoteId', 'sortOrder', 'createdAt', 'updatedAt', '__future']) {
    assert.equal(k in g, false, `rooming group must not carry ${k}`);
  }
  assert.deepEqual(Object.keys(g.hotelQuoteItem as object).sort(), ['hotel', 'roomCategory']);
  assert.equal('pricingDescription' in (g.hotelQuoteItem as object), false);
  assert.equal('contract' in (g.hotelQuoteItem as object), false);
  assert.equal('id' in (g.hotelQuoteItem as object), false);
  assert.deepEqual(Object.keys(g.itineraryDay as object).sort(), ['dayNumber', 'title']);
  const a = g.assignments[0];
  assert.deepEqual(Object.keys(a).sort(), ['id', 'quotePassenger', 'quotePassengerId']);
  assert.deepEqual(Object.keys(a.quotePassenger as object).sort(), ['firstName', 'id', 'lastName']);
  assert.equal(g.hotelQuoteItem!.hotel!.name, 'Petra Hotel');
  assert.equal(g.hotelQuoteItem!.roomCategory!.name, 'Deluxe Room');
  assertNoSentinels(out, 'rooming');
});

test('rooming: empty/null relations do not crash; source not mutated', () => {
  const raw: any = [{ id: 'rg', itineraryDayId: 'd', hotelQuoteItemId: 'h', occupancyType: 'double', itineraryDay: null, hotelQuoteItem: null, assignments: null }];
  const out = mapRoomingToOperational(raw);
  assert.equal(out[0].itineraryDay, null);
  assert.equal(out[0].hotelQuoteItem, null);
  assert.deepEqual(out[0].assignments, []);
  assert.deepEqual(mapRoomingToOperational([]), []);
  assert.deepEqual(mapRoomingToOperational(null), []);
  const src = rawRooming();
  const before = JSON.stringify(src);
  mapRoomingToOperational(src);
  assert.equal(JSON.stringify(src), before);
});

// ---------------------------------------------------------------------------
// Consumer-read compatibility (V2 / Classic / View needed paths present)
// ---------------------------------------------------------------------------

test('consumer compatibility: every consumer-read path is present in the mapped shapes', () => {
  const itin = mapItineraryToOperational(rawItinerary());
  const qs = itin.days[0].dayItems[0].quoteService!;
  // V2 day-transport resolver + Classic/View
  assert.equal(typeof qs.appliedVehicleRate!.routeName, 'string');
  assert.equal(typeof qs.appliedVehicleRate!.vehicle!.name, 'string');
  assert.equal(typeof qs.service!.name, 'string');
  assert.equal(typeof qs.service!.serviceType!.code, 'string');
  assert.equal(typeof qs.activityName, 'string');
  assert.equal(typeof qs.hotel!.name, 'string');
  assert.equal(typeof qs.roomCategory!.name, 'string');
  assert.equal(typeof itin.days[0].dayNumber, 'number');
  const room = mapRoomingToOperational(rawRooming())[0];
  assert.equal(typeof room.itineraryDay!.dayNumber, 'number');
  assert.equal(typeof room.hotelQuoteItem!.hotel!.name, 'string');
  assert.equal(room.assignments[0].quotePassenger!.firstName, 'John');
  const pax = mapPassengersToOperational(rawPassengers())[0];
  assert.equal(pax.firstName, 'John');
});

// ---------------------------------------------------------------------------
// Controller wiring — gate before service + identical bodies + raw unchanged
// ---------------------------------------------------------------------------

function makeActor(role: string | undefined) {
  return (role === undefined ? { id: 'u1', companyId: 'dmc-company' } : { id: 'u1', companyId: 'dmc-company', role }) as any;
}

function quotesController() {
  const calls = { passengers: 0, rooming: 0 };
  const quotesService: any = {
    findOne: async () => ({ id: 'q1', clientCompanyId: 'dmc-company' }),
    findPassengers: async () => { calls.passengers += 1; return rawPassengers(); },
    findRoomingGroups: async () => { calls.rooming += 1; return rawRooming(); },
  };
  return { controller: new QuotesController(quotesService, {} as any), calls, quotesService };
}

function itineraryController() {
  const calls = { itinerary: 0 };
  const service: any = { findByQuoteId: async () => { calls.itinerary += 1; return rawItinerary(); } };
  return { controller: new QuoteItineraryController(service), calls };
}

const ALLOWED = ['admin', 'super_admin', 'finance', 'operations', 'viewer'] as const;
const DENIED = ['agent', 'agent_admin', 'some-unknown-future-role'] as const;

test('controller: operations/viewer/finance receive IDENTICAL mapped bodies (all 3 companions)', async () => {
  for (const build of [
    () => quotesController().controller.findOperationalPassengers('q1', makeActor('x')),
  ]) {
    void build;
  }
  const passengers = await Promise.all(ALLOWED.map((r) => quotesController().controller.findOperationalPassengers('q1', makeActor(r))));
  const rooming = await Promise.all(ALLOWED.map((r) => quotesController().controller.findOperationalRooming('q1', makeActor(r))));
  const itin = await Promise.all(ALLOWED.map((r) => itineraryController().controller.findOperationalByQuoteId('q1', makeActor(r))));
  for (const arr of [passengers, rooming, itin]) {
    for (let i = 1; i < arr.length; i += 1) assert.deepEqual(arr[i], arr[0]);
  }
  assertNoSentinels(passengers[0], 'passengers-body');
  assertNoSentinels(rooming[0], 'rooming-body');
  assertNoSentinels(itin[0], 'itinerary-body');
});

for (const role of DENIED) {
  test(`controller: denied role "${role}" -> 403 BEFORE any service call (all 3 companions)`, async () => {
    const q = quotesController();
    await assert.rejects(() => q.controller.findOperationalPassengers('q1', makeActor(role)), ForbiddenException);
    await assert.rejects(() => q.controller.findOperationalRooming('q1', makeActor(role)), ForbiddenException);
    assert.equal(q.calls.passengers, 0);
    assert.equal(q.calls.rooming, 0);
    const i = itineraryController();
    await assert.rejects(() => i.controller.findOperationalByQuoteId('q1', makeActor(role)), ForbiddenException);
    assert.equal(i.calls.itinerary, 0);
  });
}

test('controller: missing role fails closed (403) before service (all 3 companions)', async () => {
  const q = quotesController();
  await assert.rejects(() => q.controller.findOperationalPassengers('q1', makeActor(undefined)), ForbiddenException);
  await assert.rejects(() => q.controller.findOperationalRooming('q1', makeActor(undefined)), ForbiddenException);
  assert.equal(q.calls.passengers, 0);
  assert.equal(q.calls.rooming, 0);
  const i = itineraryController();
  await assert.rejects(() => i.controller.findOperationalByQuoteId('q1', makeActor(undefined)), ForbiddenException);
  assert.equal(i.calls.itinerary, 0);
});

test('controller: existing RAW handlers remain unchanged (pass-through, still carry raw fields)', async () => {
  const q = quotesController();
  const rawPax: any = await q.controller.findPassengers('q1', makeActor('operations'));
  assert.equal(rawPax[0].passportNumber, PII); // raw passengers still full PII
  const i = itineraryController();
  const rawItin: any = await i.controller.findByQuoteId('q1', makeActor('finance'));
  assert.equal(rawItin.days[0].dayItems[0].quoteService.pricingDescription, NOTE); // raw itinerary unchanged
});

// ---------------------------------------------------------------------------
// Route resolution — exact public URLs
// ---------------------------------------------------------------------------

test('route resolution: three exact public paths', () => {
  const controllerPath = (c: any) => Reflect.getMetadata('path', c);
  const methodPath = (fn: any) => Reflect.getMetadata('path', fn);
  const methodVerb = (fn: any) => Reflect.getMetadata('method', fn);
  // GET === 0 in @nestjs/common RequestMethod
  assert.equal(controllerPath(QuotesController), 'quotes');
  assert.equal(methodPath(QuotesController.prototype.findOperationalPassengers), ':id/operational/passengers');
  assert.equal(methodVerb(QuotesController.prototype.findOperationalPassengers), 0);
  assert.equal(methodPath(QuotesController.prototype.findOperationalRooming), ':id/operational/rooming');
  assert.equal(methodVerb(QuotesController.prototype.findOperationalRooming), 0);
  assert.equal(controllerPath(QuoteItineraryController), '/');
  assert.equal(methodPath(QuoteItineraryController.prototype.findOperationalByQuoteId), 'quotes/:quoteId/operational/itinerary');
  assert.equal(methodVerb(QuoteItineraryController.prototype.findOperationalByQuoteId), 0);
});
