import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuoteItineraryService } from './quote-itinerary.service';

function createService(overrides?: Partial<any>) {
  const prisma = {
    quote: {
      findFirst: async () => ({ id: 'quote-1' }),
      findUnique: async () => ({ id: 'quote-1' }),
    },
    quoteItineraryDay: {
      findMany: async () => [],
    },
    ...overrides,
  };

  return new QuoteItineraryService(prisma as any);
}

test('findByQuoteId returns empty itinerary when quote exists but has no itinerary rows', async () => {
  const service = createService();

  const result = await service.findByQuoteId('quote-1', { companyId: 'company-1' });

  assert.deepEqual(result, {
    quoteId: 'quote-1',
    days: [],
  });
});

test('findByQuoteId safely serializes day items with missing linked quote services', async () => {
  const service = createService({
    quoteItineraryDay: {
      findMany: async () => [
        {
          id: 'day-1',
          quoteId: 'quote-1',
          dayNumber: 1,
          title: 'Arrival',
          notes: null,
          sortOrder: 0,
          isActive: true,
          createdAt: '2026-04-24T08:00:00.000Z',
          updatedAt: '2026-04-24T08:00:00.000Z',
          dayItems: [
            {
              id: 'item-1',
              dayId: 'day-1',
              quoteServiceId: 'quote-service-1',
              sortOrder: 0,
              notes: null,
              isActive: true,
              createdAt: '2026-04-24T08:00:00.000Z',
              updatedAt: '2026-04-24T08:00:00.000Z',
              quoteService: null,
            },
          ],
        },
      ],
    },
  });

  const result = await service.findByQuoteId('quote-1', { companyId: 'company-1' });

  assert.equal(result.days.length, 1);
  assert.equal(result.days[0].dayItems.length, 1);
  assert.equal(result.days[0].dayItems[0].quoteService, null);
});

test('findByQuoteId preserves excursion origin variant fields for client rendering', async () => {
  const service = createService({
    quoteItineraryDay: {
      findMany: async () => [
        {
          id: 'day-1',
          quoteId: 'quote-1',
          dayNumber: 1,
          title: 'Petra',
          notes: null,
          sortOrder: 0,
          isActive: true,
          createdAt: '2026-04-24T08:00:00.000Z',
          updatedAt: '2026-04-24T08:00:00.000Z',
          dayItems: [
            {
              id: 'item-1',
              dayId: 'day-1',
              quoteServiceId: 'quote-service-1',
              sortOrder: 0,
              notes: null,
              isActive: true,
              createdAt: '2026-04-24T08:00:00.000Z',
              updatedAt: '2026-04-24T08:00:00.000Z',
              quoteService: {
                id: 'quote-service-1',
                quoteId: 'quote-1',
                optionId: null,
                serviceDate: null,
                startTime: null,
                pickupTime: null,
                pickupLocation: null,
                meetingPoint: null,
                quantity: 1,
                paxCount: 2,
                participantCount: 2,
                adultCount: 2,
                childCount: 0,
                roomCount: null,
                nightCount: null,
                dayCount: 1,
                pricingDescription: null,
                overrideReason: 'Excursion template: Petra Guided Experience | Origin: Aqaba',
                reconfirmationRequired: false,
                reconfirmationDueAt: null,
                service: null,
                hotel: null,
                contract: null,
                roomCategory: null,
                appliedVehicleRate: null,
                touringRoute: {
                  id: 'touring-route-aqaba',
                  name: 'Aqaba Petra Full Day',
                  startCity: 'Aqaba',
                },
              },
            },
          ],
        },
      ],
    },
  });

  const result = await service.findByQuoteId('quote-1', { companyId: 'company-1' });
  const quoteService = result.days[0].dayItems[0].quoteService;

  assert.equal(quoteService?.overrideReason, 'Excursion template: Petra Guided Experience | Origin: Aqaba');
  assert.deepEqual(quoteService?.touringRoute, {
    id: 'touring-route-aqaba',
    name: 'Aqaba Petra Full Day',
    startCity: 'Aqaba',
  });
});

test('findByQuoteId returns an empty poiAssignments array for days that have none (existing quotes unchanged)', async () => {
  const service = createService({
    quoteItineraryDay: {
      findMany: async () => [
        {
          id: 'day-1',
          quoteId: 'quote-1',
          dayNumber: 1,
          title: 'Arrival',
          notes: null,
          sortOrder: 0,
          isActive: true,
          createdAt: '2026-04-24T08:00:00.000Z',
          updatedAt: '2026-04-24T08:00:00.000Z',
          dayItems: [],
          // No poiAssignments key at all → must serialize to [].
        },
      ],
    },
  });

  const result = await service.findByQuoteId('quote-1', { companyId: 'company-1' });
  assert.deepEqual(result.days[0].poiAssignments, []);
});

// Stateful mock for the POI-assignment write path. Records create() payloads so
// the snapshot + ordering + replace-all behavior can be asserted directly.
function createPoiAssignmentService(options: {
  pois: any[];
  initialAssignments?: any[];
}) {
  const created: any[] = [];
  let currentAssignments = options.initialAssignments ?? [];
  const poiById = new Map(options.pois.map((poi) => [poi.id, poi]));

  const txClient = {
    quoteItineraryDayPoi: {
      deleteMany: async () => {
        currentAssignments = [];
        return { count: 0 };
      },
      create: async ({ data }: any) => {
        created.push(data);
        // Reflect into the "current" state, joining the POI include shape.
        currentAssignments.push({ ...data, id: `assign-${created.length}`, pointOfInterest: poiById.get(data.poiId) ?? null });
        return data;
      },
    },
    quoteItineraryAuditLog: {
      create: async () => ({}),
    },
  };

  const prisma = {
    quote: { findUnique: async () => ({ id: 'quote-1' }) },
    quoteItineraryDay: {
      findUnique: async () => ({
        id: 'day-1',
        quoteId: 'quote-1',
        poiAssignments: currentAssignments,
        dayItems: [],
      }),
    },
    pointOfInterest: {
      findMany: async ({ where }: any) => options.pois.filter((poi) => where.id.in.includes(poi.id)),
    },
    $transaction: async (cb: any) => cb(txClient),
  };

  return { service: new QuoteItineraryService(prisma as any), created };
}

const ACTOR = { id: 'user-1', auditLabel: 'Operator' };

test('setDayPois snapshots fallbackTitle (English translation) + fallbackCity from the POI at assignment time', async () => {
  const { service, created } = createPoiAssignmentService({
    pois: [
      {
        id: 'poi-citadel',
        code: 'AMM-CITADEL',
        name: 'Amman Citadel (internal)',
        isActive: true,
        city: { id: 'city-amman', name: 'Amman', country: 'Jordan' },
        translations: [{ locale: 'en', title: 'Amman Citadel' }, { locale: 'ar', title: 'جبل القلعة' }],
      },
    ],
  });

  await service.setDayPois('day-1', { assignments: [{ poiId: 'poi-citadel' }] }, ACTOR);

  assert.equal(created.length, 1);
  assert.equal(created[0].poiId, 'poi-citadel');
  assert.equal(created[0].fallbackTitle, 'Amman Citadel'); // English translation, not internal name
  assert.equal(created[0].fallbackCity, 'Amman');
  assert.equal(created[0].sortOrder, 0);
});

test('setDayPois falls back to the internal POI name when no English translation title exists', async () => {
  const { service, created } = createPoiAssignmentService({
    pois: [{ id: 'poi-x', code: 'X', name: 'Internal Name', isActive: true, city: null, translations: [] }],
  });

  await service.setDayPois('day-1', { assignments: [{ poiId: 'poi-x' }] }, ACTOR);

  assert.equal(created[0].fallbackTitle, 'Internal Name');
  assert.equal(created[0].fallbackCity, null);
});

test('setDayPois preserves order and assigns sequential sortOrder', async () => {
  const { service, created } = createPoiAssignmentService({
    pois: [
      { id: 'poi-a', code: 'A', name: 'A', isActive: true, city: null, translations: [{ locale: 'en', title: 'Alpha' }] },
      { id: 'poi-b', code: 'B', name: 'B', isActive: true, city: null, translations: [{ locale: 'en', title: 'Bravo' }] },
    ],
  });

  await service.setDayPois('day-1', { assignments: [{ poiId: 'poi-b' }, { poiId: 'poi-a' }] }, ACTOR);

  assert.deepEqual(created.map((r) => [r.poiId, r.sortOrder]), [
    ['poi-b', 0],
    ['poi-a', 1],
  ]);
});

test('setDayPois lets an explicit fallbackTitle/fallbackCity override the POI snapshot', async () => {
  const { service, created } = createPoiAssignmentService({
    pois: [{ id: 'poi-a', code: 'A', name: 'A', isActive: true, city: { id: 'c', name: 'Amman', country: 'Jordan' }, translations: [{ locale: 'en', title: 'Alpha' }] }],
  });

  await service.setDayPois('day-1', { assignments: [{ poiId: 'poi-a', fallbackTitle: 'Custom Label', fallbackCity: 'Petra' }] }, ACTOR);

  assert.equal(created[0].fallbackTitle, 'Custom Label');
  assert.equal(created[0].fallbackCity, 'Petra');
});

test('setDayPois rejects an assignment referencing an unknown POI', async () => {
  const { service } = createPoiAssignmentService({ pois: [] });
  await assert.rejects(
    () => service.setDayPois('day-1', { assignments: [{ poiId: 'missing' }] }, ACTOR),
    /was not found/,
  );
});

test('setDayPois rejects an assignment with neither poiId nor fallbackTitle', async () => {
  const { service } = createPoiAssignmentService({ pois: [] });
  await assert.rejects(
    () => service.setDayPois('day-1', { assignments: [{}] }, ACTOR),
    /needs a poiId or a fallbackTitle/,
  );
});

test('setDayPois with an empty list clears the day (replace-all)', async () => {
  const { service, created } = createPoiAssignmentService({ pois: [] });
  const result = await service.setDayPois('day-1', { assignments: [] }, ACTOR);
  assert.equal(created.length, 0);
  assert.deepEqual(result.poiAssignments, []);
});
