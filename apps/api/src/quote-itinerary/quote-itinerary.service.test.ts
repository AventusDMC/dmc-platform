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

test('R.7A-2.1: findByQuoteId exposes a client-safe activityName for an applied activity, no pricing/internal fields', async () => {
  const service = createService({
    quoteItineraryDay: {
      findMany: async () => [
        {
          id: 'day-4',
          quoteId: 'quote-1',
          dayNumber: 4,
          title: 'Wadi Rum / Dead Sea',
          notes: null,
          sortOrder: 0,
          isActive: true,
          createdAt: '2026-04-24T08:00:00.000Z',
          updatedAt: '2026-04-24T08:00:00.000Z',
          dayItems: [
            {
              id: 'item-1',
              dayId: 'day-4',
              quoteServiceId: 'quote-service-1',
              sortOrder: 0,
              notes: null,
              isActive: true,
              createdAt: '2026-04-24T08:00:00.000Z',
              updatedAt: '2026-04-24T08:00:00.000Z',
              quoteService: {
                id: 'quote-service-1',
                quoteId: 'quote-1',
                pricingDescription: 'INTERNAL: cost 60 / sell 96 / markup 60%',
                activityId: 'activity-jeep',
                activityRateVariantId: 'variant-1',
                ticketRateVariantId: null,
                // service is null for activity items (matches production shape).
                service: null,
                hotel: null,
                contract: null,
                roomCategory: null,
                appliedVehicleRate: null,
                touringRoute: null,
                // R.7A-2.1 — the loaded Activity relation (public name only).
                activity: { id: 'activity-jeep', name: 'Wadi Rum Jeep Tour' },
              },
            },
          ],
        },
      ],
    },
  });

  const result = await service.findByQuoteId('quote-1', { companyId: 'company-1' });
  const qs = result.days[0].dayItems[0].quoteService as Record<string, unknown>;

  // The clean public activity name is exposed for the narrative preview…
  assert.equal(qs.activityName, 'Wadi Rum Jeep Tour');
  assert.equal(qs.activityId, 'activity-jeep');
  // …and the serialized summary exposes no cost/sell/markup or raw Activity object.
  assert.equal('activity' in qs, false, 'must not pass through the raw Activity relation');
  for (const forbidden of ['cost', 'costPrice', 'sellPrice', 'markup', 'markupPercent', 'supplierId']) {
    assert.equal(forbidden in qs, false, `serialized summary must not include ${forbidden}`);
  }
  // pricingDescription is a pre-existing field (not introduced here) but must
  // never carry into the narrative preview — the admin-web mapper ignores it.
});

test('R.7A-2.1: activityName is null when no Activity is linked (entrances/other items stay no-op)', async () => {
  const service = createService({
    quoteItineraryDay: {
      findMany: async () => [
        {
          id: 'day-3',
          quoteId: 'quote-1',
          dayNumber: 3,
          title: 'Petra Visit / Wadi Rum',
          notes: null,
          sortOrder: 0,
          isActive: true,
          createdAt: '2026-04-24T08:00:00.000Z',
          updatedAt: '2026-04-24T08:00:00.000Z',
          dayItems: [
            {
              id: 'item-1',
              dayId: 'day-3',
              quoteServiceId: 'quote-service-1',
              sortOrder: 0,
              notes: null,
              isActive: true,
              createdAt: '2026-04-24T08:00:00.000Z',
              updatedAt: '2026-04-24T08:00:00.000Z',
              quoteService: {
                id: 'quote-service-1',
                quoteId: 'quote-1',
                activityId: null,
                // Entrance applied via serviceId with an internal-style name.
                service: { id: 'svc-1', name: 'Petra 3 Days archived variant source', category: 'variant_archived', serviceType: null },
                hotel: null,
                contract: null,
                roomCategory: null,
                appliedVehicleRate: null,
                touringRoute: null,
                activity: null,
              },
            },
          ],
        },
      ],
    },
  });

  const result = await service.findByQuoteId('quote-1', { companyId: 'company-1' });
  const qs = result.days[0].dayItems[0].quoteService as Record<string, unknown>;
  assert.equal(qs.activityName, null, 'no Activity linked → activityName null (entrance stays no-op)');
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

// Phase 3D.1C.1 — removeDay must NOT write an audit row referencing the just-
// deleted day (FK violation → 500). The DAY_DELETED audit uses dayId: null.
function createRemoveDayService() {
  const auditCreates: any[] = [];
  let deleted = false;
  const txClient = {
    quoteItineraryDay: {
      findMany: async () => (deleted ? [] : [{ id: 'day-1', quoteId: 'quote-1' }]),
      delete: async () => { deleted = true; return {}; },
      update: async () => ({}),
    },
    quoteItineraryAuditLog: { create: async ({ data }: any) => { auditCreates.push(data); return data; } },
  };
  const prisma = {
    quoteItineraryDay: {
      findUnique: async () => ({ id: 'day-1', quoteId: 'quote-1', dayNumber: 2, title: 'Jerash', isActive: true, sortOrder: 1, dayItems: [], poiAssignments: [] }),
    },
    $transaction: async (cb: any) => cb(txClient),
  };
  return { service: new QuoteItineraryService(prisma as any), auditCreates };
}

test('removeDay writes the DAY_DELETED audit with dayId null (no FK to the deleted day)', async () => {
  const { service, auditCreates } = createRemoveDayService();
  const result = await service.removeDay('day-1', ACTOR);
  assert.deepEqual(result, { id: 'day-1' });
  assert.equal(auditCreates.length, 1);
  const audit = auditCreates[0];
  assert.equal(audit.action, 'DAY_DELETED');
  assert.equal(audit.dayId, null, 'audit row must not reference the deleted day id');
  assert.equal(audit.quoteId, 'quote-1');
  assert.match(audit.oldValue, /day day-1/); // deleted id preserved for traceability
  assert.equal(audit.actorUserId, (ACTOR as { id: string }).id);
});

// PR7 — transport day-classification metadata capture via updateDay.
function createUpdateDayService(existing: any) {
  const updates: any[] = [];
  const txClient: any = {
    quoteItineraryDay: {
      findMany: async () => [{ id: existing.id, quoteId: existing.quoteId, dayNumber: existing.dayNumber, sortOrder: existing.sortOrder ?? 0 }],
      update: async ({ data }: any) => { updates.push(data); return { ...existing, ...data }; },
    },
    quoteItineraryAuditLog: { create: async () => ({}) },
  };
  const prisma: any = {
    quoteItineraryDay: { findUnique: async () => ({ dayItems: [], poiAssignments: [], ...existing }) },
    $transaction: async (cb: any) => cb(txClient),
  };
  return { service: new QuoteItineraryService(prisma as any), updates };
}
const BASE_DAY = { id: 'day-1', quoteId: 'quote-1', dayNumber: 2, title: 'Petra', isActive: true, sortOrder: 1, transportDayType: null, vehicleRetained: null, vehicleReleased: null, inRetainedBlock: null };
const mainUpdate = (updates: any[]) => updates.find((u) => 'title' in u);
const ALLOWED_KEYS = new Set(['dayNumber', 'title', 'notes', 'notesLanguage', 'country', 'transportDayType', 'vehicleRetained', 'vehicleReleased', 'inRetainedBlock', 'overnightCity', 'vehicleReturnsToBase', 'isActive']);

test('PR7 updateDay: title-only edit leaves metadata untouched (NULL stays NULL, retention not written)', async () => {
  const { service, updates } = createUpdateDayService({ ...BASE_DAY });
  await service.updateDay('day-1', { title: 'Petra revised' }, ACTOR);
  const m = mainUpdate(updates);
  assert.equal(m.transportDayType, null);
  assert.equal('vehicleRetained' in m, false); // retention untouched → not written
});

test('PR7 updateDay: saves transportDayType only', async () => {
  const { service, updates } = createUpdateDayService({ ...BASE_DAY });
  await service.updateDay('day-1', { transportDayType: 'TOURING_ROUTE' }, ACTOR);
  assert.equal(mainUpdate(updates).transportDayType, 'TOURING_ROUTE');
});

test('PR7 updateDay: vehicle retained writes true + clears released/block', async () => {
  const { service, updates } = createUpdateDayService({ ...BASE_DAY });
  await service.updateDay('day-1', { vehicleRetained: true, vehicleReleased: null, inRetainedBlock: null }, ACTOR);
  const m = mainUpdate(updates);
  assert.equal(m.vehicleRetained, true);
  assert.equal(m.vehicleReleased, null);
  assert.equal(m.inRetainedBlock, null);
});

test('PR7 updateDay: vehicle released writes true + clears retained/block', async () => {
  const { service, updates } = createUpdateDayService({ ...BASE_DAY });
  await service.updateDay('day-1', { vehicleReleased: true, vehicleRetained: null, inRetainedBlock: null }, ACTOR);
  const m = mainUpdate(updates);
  assert.equal(m.vehicleReleased, true);
  assert.equal(m.vehicleRetained, null);
});

test('PR7 updateDay: part of retained block writes true + clears retained/released', async () => {
  const { service, updates } = createUpdateDayService({ ...BASE_DAY });
  await service.updateDay('day-1', { inRetainedBlock: true, vehicleRetained: null, vehicleReleased: null }, ACTOR);
  const m = mainUpdate(updates);
  assert.equal(m.inRetainedBlock, true);
  assert.equal(m.vehicleRetained, null);
});

test('PR7 updateDay: Auto/Unset saves NULLs', async () => {
  const { service, updates } = createUpdateDayService({ ...BASE_DAY, transportDayType: 'TOURING_ROUTE', vehicleRetained: true });
  await service.updateDay('day-1', { transportDayType: null, vehicleRetained: null, vehicleReleased: null, inRetainedBlock: null }, ACTOR);
  const m = mainUpdate(updates);
  assert.equal(m.transportDayType, null);
  assert.equal(m.vehicleRetained, null);
});

test('PR7 updateDay: rejects contradictory retained + released (400)', async () => {
  const { service } = createUpdateDayService({ ...BASE_DAY });
  await assert.rejects(() => service.updateDay('day-1', { vehicleRetained: true, vehicleReleased: true }, ACTOR), /cannot both be true/);
});

test('PR7 updateDay: rejects invalid transportDayType', async () => {
  const { service } = createUpdateDayService({ ...BASE_DAY });
  await assert.rejects(() => service.updateDay('day-1', { transportDayType: 'NONSENSE' }, ACTOR), /Invalid transportDayType/);
});

test('PR7 updateDay: omitted metadata preserved (existing type kept, retention not rewritten)', async () => {
  const { service, updates } = createUpdateDayService({ ...BASE_DAY, transportDayType: 'TOURING_ROUTE', vehicleRetained: true });
  await service.updateDay('day-1', { title: 'x' }, ACTOR);
  const m = mainUpdate(updates);
  assert.equal(m.transportDayType, 'TOURING_ROUTE'); // preserved
  assert.equal('vehicleRetained' in m, false); // retention untouched, not rewritten
});

test('PR7 updateDay: writes ONLY day metadata keys (no pricing/total fields)', async () => {
  const { service, updates } = createUpdateDayService({ ...BASE_DAY });
  await service.updateDay('day-1', { transportDayType: 'POINT_TO_POINT', vehicleRetained: true, vehicleReleased: null, inRetainedBlock: null }, ACTOR);
  for (const key of Object.keys(mainUpdate(updates))) {
    assert.ok(ALLOWED_KEYS.has(key), `unexpected write key (possible pricing leak): ${key}`);
  }
});

// PR12B-3A — driver-overnight day metadata capture (overnightCity, vehicleReturnsToBase). Metadata
// only; updateDay never recalculates totals (the fake has no quote model → any recalc would throw).
test('PR12B-3A updateDay: saves overnightCity', async () => {
  const { service, updates } = createUpdateDayService({ ...BASE_DAY });
  await service.updateDay('day-1', { overnightCity: 'Petra' }, ACTOR);
  assert.equal(mainUpdate(updates).overnightCity, 'Petra');
});

test('PR12B-3A updateDay: clears overnightCity to null', async () => {
  const { service, updates } = createUpdateDayService({ ...BASE_DAY, overnightCity: 'Petra' });
  await service.updateDay('day-1', { overnightCity: null }, ACTOR);
  assert.equal(mainUpdate(updates).overnightCity, null);
});

test('PR12B-3A updateDay: blank overnightCity saves null; long value capped at 120', async () => {
  const { service, updates } = createUpdateDayService({ ...BASE_DAY });
  await service.updateDay('day-1', { overnightCity: '   ' }, ACTOR);
  assert.equal(mainUpdate(updates).overnightCity, null);
  const long = createUpdateDayService({ ...BASE_DAY });
  await long.service.updateDay('day-1', { overnightCity: 'x'.repeat(200) }, ACTOR);
  assert.equal(mainUpdate(long.updates).overnightCity.length, 120);
});

test('PR12B-3A updateDay: vehicleReturnsToBase true / false / null', async () => {
  const t = createUpdateDayService({ ...BASE_DAY });
  await t.service.updateDay('day-1', { vehicleReturnsToBase: true }, ACTOR);
  assert.equal(mainUpdate(t.updates).vehicleReturnsToBase, true);
  const f = createUpdateDayService({ ...BASE_DAY });
  await f.service.updateDay('day-1', { vehicleReturnsToBase: false }, ACTOR);
  assert.equal(mainUpdate(f.updates).vehicleReturnsToBase, false);
  const n = createUpdateDayService({ ...BASE_DAY, vehicleReturnsToBase: true });
  await n.service.updateDay('day-1', { vehicleReturnsToBase: null }, ACTOR);
  assert.equal(mainUpdate(n.updates).vehicleReturnsToBase, null);
});

test('PR12B-3A updateDay: rejects invalid vehicleReturnsToBase (400)', async () => {
  const { service } = createUpdateDayService({ ...BASE_DAY });
  await assert.rejects(() => service.updateDay('day-1', { vehicleReturnsToBase: 'yes' as any }, ACTOR), /vehicleReturnsToBase must be a boolean or null/);
});

test('PR12B-3A updateDay: omitted overnight fields preserved', async () => {
  const { service, updates } = createUpdateDayService({ ...BASE_DAY, overnightCity: 'Aqaba', vehicleReturnsToBase: true });
  await service.updateDay('day-1', { title: 'x' }, ACTOR);
  const m = mainUpdate(updates);
  assert.equal(m.overnightCity, 'Aqaba');
  assert.equal(m.vehicleReturnsToBase, true);
});
