import { test } from 'node:test';
import * as assert from 'node:assert/strict';
const { QuotesService } = require('./quotes.service');

// Booking Creation V2 — Slice 1C: PIN TESTS for the quote item → BookingService
// mapping performed by QuotesService.buildBookingServicesFromAcceptedVersion (the
// engine that convertToBooking / POST /quotes/:id/v2/booking delegate to).
//
// These tests LOCK the CURRENT, ACTUAL behavior of the mapper before any V2
// create-booking UI is exposed. They call the mapper directly with a synthetic
// ACCEPTED-version snapshot + a stubbed supplier lookup — no DB, no live quote. Where
// the pinned behavior is a quirk that could bite a V2 launch, it is called out in a
// comment prefixed "RISK:". The mapper is NOT modified in this slice.

// --- Test harness ---------------------------------------------------------------

// Suppliers that resolve in the catalog. resolveOperationalSupplier does a
// supplier.findUnique by id; a hit returns {id, name}, a miss marks the row unresolved.
function makeService(resolvableSupplierIds: string[] = ALL_SUPPLIER_IDS) {
  const resolvable = new Set(resolvableSupplierIds);
  const prisma = {
    supplier: {
      findUnique: async ({ where }: any) =>
        resolvable.has(where.id) ? { id: where.id, name: `Resolved:${where.id}` } : null,
    },
  };
  // The mapper only touches prisma.supplier (via the arg we pass) and pure instance
  // helpers; the other constructor deps are unused here.
  return new QuotesService(prisma as any, {} as any, {} as any, {} as any, {} as any);
}

const ALL_SUPPLIER_IDS = ['sup-hotel', 'sup-trans', 'sup-act', 'sup-guide', 'sup-meal', 'sup-tick', 'sup-ext'];

// A representative ACCEPTED-version snapshot: 2 itinerary days, one item per service
// family, plus edge items (option variant, id-less) that must be dropped.
function makeSnapshot(overrides: any = {}) {
  return {
    adults: 2,
    children: 1,
    travelStartDate: '2026-08-01',
    nightCount: 1,
    quoteItineraryDays: [
      {
        id: 'day-1',
        dayNumber: 1,
        title: 'Arrival',
        date: '2026-08-01',
        dayItems: [{ quoteServiceId: 'it-hotel' }, { quoteServiceId: 'it-transport' }],
      },
      {
        id: 'day-2',
        dayNumber: 2,
        title: 'Touring',
        date: '2026-08-02',
        dayItems: [
          { quoteServiceId: 'it-activity' },
          { quoteServiceId: 'it-guide' },
          { quoteServiceId: 'it-meal' },
          { quoteServiceId: 'it-ticket' },
          { quoteServiceId: 'it-external' },
        ],
      },
    ],
    quoteItems: [
      {
        id: 'it-hotel',
        itineraryId: 'day-1',
        quantity: 1,
        pricingDescription: 'Mövenpick Petra · 1 night',
        totalCost: 200,
        totalSell: 260,
        service: { name: 'Mövenpick Petra', category: 'Hotel' },
        hotel: { supplierId: 'sup-hotel', supplierName: 'Mövenpick' },
      },
      {
        id: 'it-transport',
        itineraryId: 'day-1',
        quantity: 1,
        pricingDescription: 'QAIA → Amman transfer',
        totalCost: 100,
        totalSell: 120,
        service: { name: 'Airport transfer', category: 'Transport' },
        appliedVehicleRate: { id: 'vr-1', vehicle: { id: 'veh-1', supplierId: 'sup-trans', supplierName: 'Alpha' } },
      },
      {
        id: 'it-activity',
        itineraryId: 'day-2',
        quantity: 1,
        pricingDescription: 'Jerash half-day',
        totalCost: 90,
        totalSell: 117,
        activityId: 'act-1',
        startTime: '09:00',
        pickupTime: '08:30',
        pickupLocation: 'Hotel lobby',
        meetingPoint: 'Main gate',
        participantCount: 3,
        adultCount: 2,
        childCount: 1,
        reconfirmationRequired: true,
        reconfirmationDueAt: '2026-07-20',
        service: { name: 'Jerash tour', category: 'Activity', supplierId: 'sup-act', supplierName: 'Jordan Select' },
      },
      {
        id: 'it-guide',
        itineraryId: 'day-2',
        quantity: 1,
        pricingDescription: 'Licensed guide (EN)',
        totalCost: 50,
        totalSell: 65,
        startTime: '09:00',
        pickupTime: '08:45',
        pickupLocation: 'Hotel reception',
        meetingPoint: 'Visitor centre',
        service: { name: 'Licensed guide', category: 'Guide', supplierId: 'sup-guide', supplierName: 'Almushtari' },
      },
      {
        id: 'it-meal',
        itineraryId: 'day-2',
        quantity: 1,
        pricingDescription: 'Dinner',
        totalCost: 30,
        totalSell: 39,
        service: { name: 'Group dinner', category: 'Meal', supplierId: 'sup-meal', supplierName: 'Haret Jdoudna' },
      },
      {
        id: 'it-ticket',
        itineraryId: 'day-2',
        quantity: 1,
        pricingDescription: 'Petra entrance',
        totalCost: 60,
        totalSell: 60,
        service: { name: 'Petra entrance', category: 'Entrance Ticket', supplierId: 'sup-tick', supplierName: 'PDTRA' },
      },
      {
        id: 'it-external',
        itineraryId: 'day-2',
        quantity: 1,
        pricingDescription: 'Cairo extension',
        totalCost: 400,
        totalSell: 500,
        service: { name: 'Cairo 3-night package', category: 'External Package', supplierId: 'sup-ext', supplierName: 'Cairo DMC' },
      },
    ],
    ...overrides,
  };
}

async function mapRows(service: any, snapshot: any) {
  const rows: any[] = await service.buildBookingServicesFromAcceptedVersion(snapshot, (service as any).prisma);
  const byId: Record<string, any> = {};
  for (const r of rows) byId[r.sourceQuoteItemId] = r;
  return { rows, byId };
}

// --- Type/operationType classification -----------------------------------------

test('serviceType is the RAW quote category and operationType is the normalized enum, per family', async () => {
  const service = makeService();
  const { byId } = await mapRows(service, makeSnapshot());

  // serviceType = item.service.category verbatim (not normalized)
  assert.equal(byId['it-hotel'].serviceType, 'Hotel');
  assert.equal(byId['it-transport'].serviceType, 'Transport');
  assert.equal(byId['it-activity'].serviceType, 'Activity');
  assert.equal(byId['it-guide'].serviceType, 'Guide');
  assert.equal(byId['it-meal'].serviceType, 'Meal');
  assert.equal(byId['it-ticket'].serviceType, 'Entrance Ticket');
  assert.equal(byId['it-external'].serviceType, 'External Package');

  // operationType = inferBookingOperationServiceType(category + name)
  assert.equal(byId['it-hotel'].operationType, 'HOTEL');
  assert.equal(byId['it-transport'].operationType, 'TRANSPORT');
  assert.equal(byId['it-activity'].operationType, 'ACTIVITY');
  assert.equal(byId['it-guide'].operationType, 'GUIDE');
  assert.equal(byId['it-ticket'].operationType, 'TICKET');
  assert.equal(byId['it-external'].operationType, 'EXTERNAL_PACKAGE');

  // FIXED (mapping-hardening): a meal/dining item now maps to the dedicated DINING
  // operationType (restaurant assignment + meal confirmation live on DINING). Previously
  // it fell through to ACTIVITY.
  assert.equal(byId['it-meal'].operationType, 'DINING');
});

// --- Activity-only operational fields -------------------------------------------

test('activity-family rows carry pickup/meeting/participant fields; non-activity rows null them', async () => {
  const service = makeService();
  const { byId } = await mapRows(service, makeSnapshot());

  const activity = byId['it-activity'];
  assert.equal(activity.startTime, '09:00');
  assert.equal(activity.pickupTime, '08:30');
  assert.equal(activity.pickupLocation, 'Hotel lobby');
  assert.equal(activity.meetingPoint, 'Main gate');
  assert.equal(activity.participantCount, 3);
  assert.equal(activity.adultCount, 2);
  assert.equal(activity.childCount, 1);
  assert.equal(activity.reconfirmationRequired, true);
  assert.equal(activity.reconfirmationDueAt, '2026-07-20');

  // FIXED (mapping-hardening): GUIDE now preserves its operational TIMING fields
  // (start/pickup/meeting) from the quote item — Ops no longer re-enters them.
  // Participant counts + reconfirmation remain activity-only by design.
  const guide = byId['it-guide'];
  assert.equal(guide.startTime, '09:00');
  assert.equal(guide.pickupTime, '08:45');
  assert.equal(guide.pickupLocation, 'Hotel reception');
  assert.equal(guide.meetingPoint, 'Visitor centre');
  assert.equal(guide.participantCount, null);
  assert.equal(guide.adultCount, null);
  assert.equal(guide.childCount, null);
  assert.equal(guide.reconfirmationRequired, false);

  // Hotel likewise carries no activity operational fields.
  assert.equal(byId['it-hotel'].participantCount, null);
  assert.equal(byId['it-hotel'].startTime, null);
});

// --- Supplier resolution --------------------------------------------------------

test('a supplier that resolves in the catalog keeps its id and takes the catalog name', async () => {
  const service = makeService();
  const { byId } = await mapRows(service, makeSnapshot());

  assert.equal(byId['it-hotel'].supplierId, 'sup-hotel');
  assert.equal(byId['it-hotel'].supplierName, 'Resolved:sup-hotel');
  // Transport supplier is taken from the applied vehicle rate's vehicle.
  assert.equal(byId['it-transport'].supplierId, 'sup-trans');
  assert.equal(byId['it-transport'].supplierName, 'Resolved:sup-trans');
  assert.equal(byId['it-transport'].vehicleId, 'veh-1');
});

test('RISK: a supplierId absent from the catalog is DROPPED to null (name retained, row still ready)', async () => {
  // No suppliers resolve → mirrors the existing quotes-booking-conversion baseline
  // failures. The mapper marks the row unresolved: supplierId null, but the quote's
  // supplierName is retained and the row is still "ready" because a name + price exist.
  const service = makeService([]);
  const { byId } = await mapRows(service, makeSnapshot());

  assert.equal(byId['it-hotel'].supplierId, null);
  assert.equal(byId['it-hotel'].supplierName, 'Mövenpick'); // snapshot name retained
  assert.equal(byId['it-hotel'].status, 'ready'); // name + price ⇒ ready despite null id
  assert.equal(byId['it-activity'].supplierId, null);
  assert.equal(byId['it-activity'].supplierName, 'Jordan Select');
});

test('an item with neither supplier id nor name resolves to a null/pending operational row', async () => {
  const service = makeService();
  const snap = makeSnapshot({
    quoteItems: [
      {
        id: 'it-bare',
        itineraryId: 'day-1',
        quantity: 1,
        totalCost: 0,
        totalSell: 0,
        service: { name: 'Unpriced note', category: 'Other' },
      },
    ],
  });
  const { byId } = await mapRows(service, snap);
  assert.equal(byId['it-bare'].supplierId, null);
  assert.equal(byId['it-bare'].supplierName, null);
  assert.equal(byId['it-bare'].status, 'pending'); // no supplier + no price ⇒ pending
  assert.equal(byId['it-bare'].operationType, 'SERVICE'); // 'Other' ⇒ SERVICE
});

// --- Order / provenance / day mapping -------------------------------------------

test('serviceOrder is preserved as a dense 0..n sequence in day-then-input order', async () => {
  const service = makeService();
  const { rows } = await mapRows(service, makeSnapshot());
  assert.deepEqual(rows.map((r) => r.serviceOrder), [0, 1, 2, 3, 4, 5, 6]);
  // Day-1 items (hotel, transport) come before day-2 items.
  assert.deepEqual(
    rows.map((r) => r.sourceQuoteItemId),
    ['it-hotel', 'it-transport', 'it-activity', 'it-guide', 'it-meal', 'it-ticket', 'it-external'],
  );
});

test('sourceQuoteItemId is preserved and sourceMetadata is populated with provenance ids', async () => {
  const service = makeService();
  const { byId } = await mapRows(service, makeSnapshot());

  assert.equal(byId['it-activity'].sourceQuoteItemId, 'it-activity');
  const meta = byId['it-activity'].sourceMetadata;
  assert.equal(meta.sourceQuoteItemId, 'it-activity');
  assert.equal(meta.activityId, 'act-1');
  // provenance keys are always present (null when absent)
  assert.ok('entranceFeeId' in meta);
  assert.ok('touringRouteId' in meta);
  assert.ok('appliedVehicleRateId' in meta);
  assert.equal(byId['it-transport'].sourceMetadata.appliedVehicleRateId, 'vr-1');
});

test('booking day mapping groups items by their itinerary day', async () => {
  const service = makeService();
  const { byId } = await mapRows(service, makeSnapshot());

  const day1 = byId['it-hotel'].bookingDayId;
  assert.equal(byId['it-transport'].bookingDayId, day1);

  const day2 = byId['it-activity'].bookingDayId;
  assert.equal(byId['it-guide'].bookingDayId, day2);
  assert.equal(byId['it-ticket'].bookingDayId, day2);

  assert.ok(day1 && day2 && day1 !== day2, 'day-1 and day-2 map to distinct booking days');
});

// --- Initial operational statuses -----------------------------------------------

test('every mapped row starts at the correct initial operational statuses', async () => {
  const service = makeService();
  const { rows } = await mapRows(service, makeSnapshot());
  for (const r of rows) {
    assert.equal(r.operationStatus, 'PENDING');
    assert.equal(r.supplierConfirmationStatus, 'NOT_SENT');
    assert.equal(r.voucherStatus, 'NOT_GENERATED');
    assert.equal(r.voucherGeneratedAt, null);
    assert.equal(r.confirmationStatus, 'pending');
  }
});

test('unit cost/sell are derived from the snapshot totals ÷ quantity', async () => {
  const service = makeService();
  const snap = makeSnapshot({
    quoteItems: [
      {
        id: 'it-multi',
        itineraryId: 'day-1',
        quantity: 4,
        totalCost: 400,
        totalSell: 520,
        service: { name: 'Van transfer x4', category: 'Transport' },
      },
    ],
  });
  const { byId } = await mapRows(service, snap);
  assert.equal(byId['it-multi'].qty, 4);
  assert.equal(byId['it-multi'].unitCost, 100);
  assert.equal(byId['it-multi'].unitSell, 130);
  assert.equal(byId['it-multi'].totalCost, 400);
  assert.equal(byId['it-multi'].totalSell, 520);
});

// --- Exclusion rules ------------------------------------------------------------

test('option-variant items (optionId set) and id-less items are excluded from booking services', async () => {
  const service = makeService();
  const snap = makeSnapshot({
    quoteItems: [
      { id: 'it-keep', itineraryId: 'day-1', quantity: 1, totalCost: 10, totalSell: 12, service: { name: 'Keep', category: 'Transport' } },
      { id: 'it-option', optionId: 'opt-1', itineraryId: 'day-1', quantity: 1, totalCost: 10, totalSell: 12, service: { name: 'Option variant', category: 'Hotel' } },
      { itineraryId: 'day-1', quantity: 1, totalCost: 10, totalSell: 12, service: { name: 'No id', category: 'Hotel' } },
    ],
  });
  const { rows, byId } = await mapRows(service, snap);
  assert.equal(rows.length, 1);
  assert.ok(byId['it-keep']);
  assert.equal(byId['it-option'], undefined);
});

// --- Archived-route guard -------------------------------------------------------

test('an archived Touring Route in a mapped row is rejected by the operational-row guard', async () => {
  const service = makeService();
  const snap = makeSnapshot({
    quoteItems: [
      {
        id: 'it-archived',
        itineraryId: 'day-1',
        quantity: 1,
        totalCost: 100,
        totalSell: 120,
        service: { name: 'Wadi Rum route', category: 'Transport' },
        touringRouteId: 'tr-1',
        touringRoute: { id: 'tr-1', code: 'JOR-TR-STD', active: true, archived: true },
        touringRoutePricing: { id: 'trp-1', touringRouteId: 'tr-1' },
      },
    ],
  });
  await assert.rejects(mapRows(service, snap), /Archived Touring Routes cannot appear/);
});

test('an archived AQ_* Aqaba route code is rejected by the operational-row guard', async () => {
  const service = makeService();
  const snap = makeSnapshot({
    quoteItems: [
      {
        id: 'it-aq',
        itineraryId: 'day-1',
        quantity: 1,
        totalCost: 100,
        totalSell: 120,
        service: { name: 'Aqaba boat', category: 'Transport' },
        touringRouteId: 'tr-aq',
        touringRoute: { id: 'tr-aq', code: 'AQ_BOAT', active: true, archived: false },
        touringRoutePricing: { id: 'trp-aq', touringRouteId: 'tr-aq' },
      },
    ],
  });
  await assert.rejects(mapRows(service, snap), /Archived AQ_\* Touring Routes cannot appear/);
});

// --- Snapshot is the source of truth --------------------------------------------

test('the mapper reads ONLY the passed accepted-version snapshot, never live quote data', async () => {
  // The service is constructed with a prisma whose quote/quoteItem tables would THROW
  // if touched. A successful map proves the rows come purely from the snapshot arg.
  const prisma = {
    supplier: { findUnique: async ({ where }: any) => ({ id: where.id, name: `Resolved:${where.id}` }) },
    quote: { findFirst: async () => { throw new Error('live quote must not be read'); } },
    quoteItem: { findMany: async () => { throw new Error('live quote items must not be read'); } },
  };
  const service = new QuotesService(prisma as any, {} as any, {} as any, {} as any, {} as any);
  const { rows, byId } = await mapRows(service, makeSnapshot());
  assert.equal(rows.length, 7);
  // Descriptions/costs come straight from the snapshot values, not any live source.
  assert.equal(byId['it-hotel'].description, 'Mövenpick Petra');
  assert.equal(byId['it-hotel'].totalSell, 260);
});

// ================================================================================
// MAPPING HARDENING (1C-Hardening) — resolved / documented risks
// ================================================================================

// Risk 1 (FIXED): meals map to the dedicated DINING operationType.
test('hardening: a meal item maps to operationType DINING (not ACTIVITY)', async () => {
  const service = makeService();
  const { byId } = await mapRows(service, makeSnapshot());
  assert.equal(byId['it-meal'].operationType, 'DINING');
  assert.equal(byId['it-meal'].serviceType, 'Meal'); // raw category unchanged
});

// Risk 2 (FIXED): guides preserve their operational timing fields from the snapshot.
test('hardening: a guide item preserves start/pickup/meeting timing from the snapshot', async () => {
  const service = makeService();
  const { byId } = await mapRows(service, makeSnapshot());
  const guide = byId['it-guide'];
  assert.equal(guide.operationType, 'GUIDE');
  assert.equal(guide.startTime, '09:00');
  assert.equal(guide.pickupTime, '08:45');
  assert.equal(guide.pickupLocation, 'Hotel reception');
  assert.equal(guide.meetingPoint, 'Visitor centre');
  assert.equal(guide.operationalTime, '09:00'); // operationalTime also carries it
  // Participant counts remain activity-only (guides don't carry them on the quote item).
  assert.equal(guide.participantCount, null);
});

// Risk 3 (ACCEPTED, documented): an unresolved supplierId is NOT a conversion blocker.
// The row still maps; it simply arrives unassigned, so Ops surfaces it as "Needs
// Assignment". Fixing the underlying catalog data is a pilot-readiness (data-cleanup)
// concern, not a conversion-time hard block.
test('hardening: an unresolved supplier does NOT block mapping and leaves the row for Ops assignment', async () => {
  const service = makeService([]); // nothing resolves in the catalog
  const { rows, byId } = await mapRows(service, makeSnapshot());

  // Every item still maps — conversion is not blocked by unresolved suppliers.
  assert.equal(rows.length, 7);

  const hotel = byId['it-hotel'];
  assert.equal(hotel.supplierId, null); // catalog id dropped
  assert.equal(hotel.supplierName, 'Mövenpick'); // quote name retained for Ops context
  // The mapper never sets an operational assignment, so the schema defaults
  // (assignmentStatus UNASSIGNED / assignedSupplierId null) apply ⇒ Ops "Needs Assignment".
  assert.equal('assignedSupplierId' in hotel, false);
  assert.equal('assignmentStatus' in hotel, false);
});

// Risk 4 (FIXED): external-package classification now uses the explicit
// externalPackageName signal as authoritative. Both a taxonomy-mapped external item
// and a "bare" external item (only external* fields, no linked service — the real
// production shape) map to EXTERNAL_PACKAGE.
test('hardening: external-package classification — mapped category and bare external item both → EXTERNAL_PACKAGE', async () => {
  const service = makeService(['sup-ext']);
  const snap = makeSnapshot({
    quoteItems: [
      {
        id: 'it-ext-typed',
        itineraryId: 'day-2',
        quantity: 1,
        totalCost: 400,
        totalSell: 500,
        service: { name: 'Cairo package', category: 'External Package', supplierId: 'sup-ext', supplierName: 'Cairo DMC' },
      },
      {
        // Realistic "bare" external item: no linked SupplierService, only external* fields.
        id: 'it-ext-bare',
        itineraryId: 'day-2',
        quantity: 1,
        totalCost: 300,
        totalSell: 380,
        externalPackageName: 'Luxor extension',
        externalPackageCountry: 'EG',
        externalSupplierName: 'Nile DMC',
      },
    ],
  });
  const { byId } = await mapRows(service, snap);

  // Mapped taxonomy → EXTERNAL_PACKAGE (unchanged).
  assert.equal(byId['it-ext-typed'].operationType, 'EXTERNAL_PACKAGE');

  // FIXED: a bare external item (externalPackageName only, no linked service) now also
  // maps to EXTERNAL_PACKAGE via the explicit signal. serviceType (raw category) stays
  // 'other' — only the operational bucket is corrected.
  assert.equal(byId['it-ext-bare'].operationType, 'EXTERNAL_PACKAGE');
  assert.equal(byId['it-ext-bare'].serviceType, 'other');
});

// Focused hardening proofs.
test('hardening: externalPackageName forces EXTERNAL_PACKAGE even with a generic category/name', async () => {
  const service = makeService(['sup-x']);
  const snap = makeSnapshot({
    quoteItems: [
      {
        // Deliberately generic taxonomy that would otherwise classify as SERVICE...
        id: 'it-ext-generic',
        itineraryId: 'day-1',
        quantity: 1,
        totalCost: 100,
        totalSell: 130,
        externalPackageName: 'Cross-border extension',
        service: { name: 'Misc', category: 'Other', supplierId: 'sup-x', supplierName: 'X' },
      },
      {
        // ...vs a genuinely generic SERVICE item with NO external signal.
        id: 'it-plain-service',
        itineraryId: 'day-1',
        quantity: 1,
        totalCost: 50,
        totalSell: 60,
        service: { name: 'Meet & assist', category: 'Other', supplierId: 'sup-x', supplierName: 'X' },
      },
    ],
  });
  const { byId } = await mapRows(service, snap);
  // externalPackageName wins even though category/name are generic.
  assert.equal(byId['it-ext-generic'].operationType, 'EXTERNAL_PACKAGE');
  // A normal generic item without the external signal still maps to SERVICE.
  assert.equal(byId['it-plain-service'].operationType, 'SERVICE');
});

test('hardening: no regression — hotel/transport/activity/guide/meal/ticket unchanged by the external fix', async () => {
  const service = makeService();
  const { byId } = await mapRows(service, makeSnapshot());
  assert.equal(byId['it-hotel'].operationType, 'HOTEL');
  assert.equal(byId['it-transport'].operationType, 'TRANSPORT');
  assert.equal(byId['it-activity'].operationType, 'ACTIVITY');
  assert.equal(byId['it-guide'].operationType, 'GUIDE');
  assert.equal(byId['it-meal'].operationType, 'DINING');
  assert.equal(byId['it-ticket'].operationType, 'TICKET');
  // The default snapshot's external item uses a mapped category (no externalPackageName).
  assert.equal(byId['it-external'].operationType, 'EXTERNAL_PACKAGE');
});
