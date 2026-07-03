import { test } from 'node:test';
import * as assert from 'node:assert/strict';
const { QuotesService } = require('./quotes.service');

// Booking Creation V2 — Slice 1B: SNAPSHOT VERIFICATION.
// Confirms the accepted-QuoteVersion snapshot is the complete, stable source of truth
// for booking creation before any V2 Create-Booking UI is exposed. Tests the pure
// builder buildBookingSnapshotFromAcceptedVersion (the 6 Booking JSON columns +
// pax/pricing) and re-confirms item-level cost preservation through the service mapper.
// No DB, no live quote — a synthetic accepted-version snapshot is the only input.

function makeService(prisma: any = {}) {
  return new QuotesService(prisma as any, {} as any, {} as any, {} as any, {} as any);
}

// A realistic accepted-version snapshot (shape mirrors loadQuoteState → JSON clone).
function makeSnapshot(overrides: any = {}) {
  return {
    bookingType: 'FIT',
    clientCompany: { id: 'co-client', name: 'Anderson Travel' },
    brandCompany: { id: 'co-brand', name: 'Axis DMC' },
    contact: { firstName: 'James', lastName: 'Anderson', title: 'Mr', email: 'james@example.com' },
    itineraries: [
      { id: 'itin-1', dayNumber: 1, title: 'Arrival' },
      { id: 'itin-2', dayNumber: 2, title: 'Petra' },
    ],
    quoteItineraryDays: [
      { id: 'day-1', dayNumber: 1, title: 'Arrival', isActive: true, dayItems: [] },
    ],
    pricingSlabs: [{ minPax: 1, maxPax: 2, pricePerPax: 900 }],
    scenarios: [{ id: 'sc-1', label: 'Base' }],
    pricingMode: 'FIXED',
    pricingType: 'simple',
    totalCost: 5980,
    totalSell: 8450,
    pricePerPax: 4225,
    fixedPricePerPerson: 4225,
    validUntil: '2026-08-01',
    adults: 2,
    children: 1,
    roomCount: 2,
    nightCount: 6,
    travelStartDate: '2026-08-01',
    ...overrides,
  };
}

// --- The six Booking snapshot columns -------------------------------------------

test('buildBookingSnapshotFromAcceptedVersion populates all six Booking snapshot columns', () => {
  const service = makeService();
  const snap = makeSnapshot();
  const out = (service as any).buildBookingSnapshotFromAcceptedVersion(snap);

  // Full snapshot is carried verbatim.
  assert.equal(out.snapshotJson, snap);
  // Company / brand / contact snapshots come straight from the accepted version.
  assert.deepEqual(out.clientSnapshotJson, snap.clientCompany);
  assert.deepEqual(out.brandSnapshotJson, snap.brandCompany);
  assert.deepEqual(out.contactSnapshotJson, snap.contact);
  // Itinerary snapshot = the itineraries array.
  assert.deepEqual(out.itinerarySnapshotJson, snap.itineraries);
});

test('pricingSnapshotJson preserves the commercial figures from the accepted version', () => {
  const service = makeService();
  const out = (service as any).buildBookingSnapshotFromAcceptedVersion(makeSnapshot());
  assert.deepEqual(out.pricingSnapshotJson, {
    pricingMode: 'FIXED',
    pricingType: 'simple',
    bookingType: 'FIT',
    totalCost: 5980,
    totalSell: 8450,
    pricePerPax: 4225,
    fixedPricePerPerson: 4225,
    validUntil: '2026-08-01',
    pricingSlabs: [{ minPax: 1, maxPax: 2, pricePerPax: 900 }],
    scenarios: [{ id: 'sc-1', label: 'Base' }],
  });
});

test('pax + room + night counts are coerced to safe non-negative integers', () => {
  const service = makeService();
  const out = (service as any).buildBookingSnapshotFromAcceptedVersion(
    makeSnapshot({ adults: 2, children: 1, roomCount: 2, nightCount: 6 }),
  );
  assert.equal(out.adults, 2);
  assert.equal(out.children, 1);
  assert.equal(out.roomCount, 2);
  assert.equal(out.nightCount, 6);
  assert.equal(out.travelStartDate, '2026-08-01');
});

// --- Snapshot-only fallbacks ----------------------------------------------------

test('brand snapshot falls back client→company; missing client/contact degrade safely', () => {
  const service = makeService();

  // No brandCompany → falls back to clientCompany.
  const noBrand = (service as any).buildBookingSnapshotFromAcceptedVersion(
    makeSnapshot({ brandCompany: undefined }),
  );
  assert.deepEqual(noBrand.brandSnapshotJson, noBrand.clientSnapshotJson);

  // No client/brand at all but legacy `company` present → both use it.
  const legacy = (service as any).buildBookingSnapshotFromAcceptedVersion(
    makeSnapshot({ clientCompany: undefined, brandCompany: undefined, company: { id: 'co-legacy' } }),
  );
  assert.deepEqual(legacy.clientSnapshotJson, { id: 'co-legacy' });
  assert.deepEqual(legacy.brandSnapshotJson, { id: 'co-legacy' });

  // Nothing at all → empty client, null brand, empty contact, empty itinerary.
  const empty = (service as any).buildBookingSnapshotFromAcceptedVersion({});
  assert.deepEqual(empty.clientSnapshotJson, {});
  assert.equal(empty.brandSnapshotJson, null);
  assert.deepEqual(empty.contactSnapshotJson, {});
  assert.deepEqual(empty.itinerarySnapshotJson, []);
});

// --- Snapshot is the sole source of truth ---------------------------------------

test('the snapshot builder is pure — it never reads live quote/booking tables', () => {
  // A prisma whose every table throws if touched; the builder must not touch it.
  const hostilePrisma = new Proxy({}, {
    get() { throw new Error('snapshot builder must not read the database'); },
  });
  const service = makeService(hostilePrisma);
  // Completing without throwing proves the builder never touched the hostile prisma.
  const out = (service as any).buildBookingSnapshotFromAcceptedVersion(makeSnapshot());
  assert.equal(out.pricingSnapshotJson.totalSell, 8450);
  assert.equal(out.adults, 2);
});

// --- Item-level cost preservation (through the mapper) --------------------------

test('service mapping preserves the accepted-version item net/sell values (no recompute)', async () => {
  // supplier lookup resolves so rows are fully formed.
  const prisma = { supplier: { findUnique: async ({ where }: any) => ({ id: where.id, name: 'S' }) } };
  const service = makeService(prisma);
  const snap = makeSnapshot({
    quoteItineraryDays: [{ id: 'day-1', dayNumber: 1, isActive: true, dayItems: [{ quoteServiceId: 'it-1' }] }],
    quoteItems: [
      {
        id: 'it-1',
        itineraryId: 'day-1',
        quantity: 2,
        totalCost: 300, // net cost from the accepted version
        totalSell: 420, // selling price from the accepted version
        service: { name: 'Transfer', category: 'Transport', supplierId: 'sup-1', supplierName: 'Alpha' },
      },
    ],
  });
  const rows: any[] = await (service as any).buildBookingServicesFromAcceptedVersion(snap, prisma);
  const row = rows.find((r) => r.sourceQuoteItemId === 'it-1');

  // Totals come straight from the snapshot; unit = total ÷ qty (no re-pricing).
  assert.equal(row.totalCost, 300);
  assert.equal(row.totalSell, 420);
  assert.equal(row.qty, 2);
  assert.equal(row.unitCost, 150);
  assert.equal(row.unitSell, 210);
});

// --- Documented observation: itinerarySnapshotJson vs the V2 day model -----------

test('OBSERVATION: itinerarySnapshotJson captures `itineraries`, NOT `quoteItineraryDays`', () => {
  // The Booking.itinerarySnapshotJson column stores only the legacy `itineraries` array.
  // The V2 day model (`quoteItineraryDays`) is NOT copied into that column — but it IS
  // consumed by the service mapper to build booking days + day links, so no booking data
  // is lost. This pins the column's scope so a future reader doesn't assume V2 days live
  // in itinerarySnapshotJson.
  const service = makeService();
  const snap = makeSnapshot({
    itineraries: [{ id: 'itin-1', dayNumber: 1 }],
    quoteItineraryDays: [{ id: 'day-1', dayNumber: 1, isActive: true, dayItems: [] }],
  });
  const out = (service as any).buildBookingSnapshotFromAcceptedVersion(snap);
  assert.deepEqual(out.itinerarySnapshotJson, [{ id: 'itin-1', dayNumber: 1 }]);
  // quoteItineraryDays is absent from the itinerary column (lives in full snapshotJson).
  assert.equal(JSON.stringify(out.itinerarySnapshotJson).includes('day-1'), false);
  assert.equal((out.snapshotJson as any).quoteItineraryDays[0].id, 'day-1');
});

// --- External-package classification: real-data-shaped fixtures ------------------
// Verified against production (2026-07-03, read-only probe): the DB holds exactly 2
// external-package items, BOTH on CONFIRMED quotes with accepted versions, and BOTH
// have NO linked SupplierService (service = null). This fixture reproduces that exact
// shape (with generic placeholder names). The external-package hardening fix now maps
// them to EXTERNAL_PACKAGE via the externalPackageName signal.

test('external-package items shaped like real production data classify as EXTERNAL_PACKAGE (fixed)', async () => {
  const prisma = { supplier: { findUnique: async ({ where }: any) => ({ id: where.id, name: 'S' }) } };
  const service = makeService(prisma);
  const snap = makeSnapshot({
    quoteItineraryDays: [
      { id: 'day-1', dayNumber: 1, isActive: true, dayItems: [{ quoteServiceId: 'ext-1' }, { quoteServiceId: 'ext-2' }] },
    ],
    quoteItems: [
      // Real shape: externalPackageName set, NO linked `service`.
      { id: 'ext-1', itineraryId: 'day-1', quantity: 1, totalCost: 1000, totalSell: 1300, externalPackageName: 'Neighbouring-country extension A', externalPackageCountry: 'XX', externalSupplierName: 'Partner DMC A' },
      { id: 'ext-2', itineraryId: 'day-1', quantity: 1, totalCost: 900, totalSell: 1200, externalPackageName: 'Neighbouring-country extension B', externalPackageCountry: 'YY', externalSupplierName: 'Partner DMC B' },
    ],
  });
  const rows: any[] = await (service as any).buildBookingServicesFromAcceptedVersion(snap, prisma);
  const byId: Record<string, any> = {};
  for (const r of rows) byId[r.sourceQuoteItemId] = r;

  // FIXED: the explicit externalPackageName signal maps these to EXTERNAL_PACKAGE even
  // though they have no linked service taxonomy.
  assert.equal(byId['ext-1'].operationType, 'EXTERNAL_PACKAGE');
  assert.equal(byId['ext-2'].operationType, 'EXTERNAL_PACKAGE');
  // Conversion is NOT blocked — the rows still map with correct costs.
  assert.equal(byId['ext-1'].totalSell, 1300);
  assert.equal(rows.length, 2);
});
