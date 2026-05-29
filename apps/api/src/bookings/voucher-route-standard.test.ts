import test = require('node:test');
import assert = require('node:assert/strict');
const { BookingsService } = require('./bookings.service');

// Phase 2C — voucher snapshot integration with RouteStandard.
// Tests the buildOperationalVoucherSnapshot seam directly: that the
// transport sub-block carries the canonical RouteStandard reference
// (distance / duration / +buffer / confidence / risk flags / notes)
// when one is attached, and gracefully falls back to null when none
// exists. The snapshot ends up persisted on vouchers.snapshotJson and
// drives the supplier-facing voucher detail page.

function createService(prisma: any) {
  return new BookingsService(prisma, { log: async () => null } as any, { log: async () => null } as any, { checkBookingHotelAllotmentAvailability: async () => ({ blockers: [], warnings: [] }) } as any);
}

function buildTransportBookingService(overrides: any = {}) {
  return {
    id: 'bs-1',
    serviceType: 'transport',
    description: 'Amman → Petra transfer',
    operationType: 'TRANSPORT',
    operationalDate: new Date('2026-06-01T00:00:00.000Z'),
    operationalTime: '08:00',
    pickupLocation: 'Amman Marriott',
    pickupTime: '08:00',
    assignedTo: 'Ali Driver',
    assignedSupplierId: 'sup-1',
    booking: {
      bookingRef: 'BK-2026-0042',
      pax: 2,
      passengers: [
        { id: 'p1', firstName: 'Jane', lastName: 'Doe' },
        { id: 'p2', firstName: 'John', lastName: 'Smith' },
      ],
      roomingEntries: [],
      clientSnapshotJson: { name: 'Jane Doe', companyName: 'Acme Tours' },
    },
    assignedSupplier: { id: 'sup-1', name: 'Petra Transport Co' },
    touringRoute: { code: 'AMM_PET', name: 'Amman to Petra', destination: 'Petra' },
    vehicle: { vehicleType: 'Mercedes Vito', name: 'Vito-12' },
    ...overrides,
  };
}

test('voucher snapshot: transport block carries routeStandard sub-block when one is attached', () => {
  const service = createService({} as any);
  const bookingService = buildTransportBookingService();
  const routeStandard = {
    routeCode: 'AMM_PET',
    routeName: 'Amman to Petra',
    standardDistanceKm: 235,
    standardDurationHours: 3.5,
    operationalBufferMinutes: 30,
    longDistanceFlag: false,
    overnightRisk: false,
    mountainRoadFlag: true,
    borderCrossingFlag: false,
    airportRouteFlag: false,
    notes: 'Construction zone 60-80 km — expect 10 min delay',
    confidenceLabel: 'Mountain Road Delay Risk' as const,
  };

  const snapshot = (service as any).buildOperationalVoucherSnapshot(
    bookingService,
    'TRANSPORT',
    [],
    routeStandard,
  );

  assert.ok(snapshot.transport, 'transport sub-block must be present for TRANSPORT vouchers');
  assert.ok(snapshot.transport.routeStandard, 'routeStandard sub-block must be present when standard attached');
  assert.equal(snapshot.transport.routeStandard.routeCode, 'AMM_PET');
  assert.equal(snapshot.transport.routeStandard.routeName, 'Amman to Petra');
  assert.equal(snapshot.transport.routeStandard.standardDistanceKm, 235);
  assert.equal(snapshot.transport.routeStandard.standardDurationHours, 3.5);
  assert.equal(snapshot.transport.routeStandard.operationalBufferMinutes, 30);
  assert.equal(snapshot.transport.routeStandard.confidenceLabel, 'Mountain Road Delay Risk');
  assert.equal(snapshot.transport.routeStandard.mountainRoadFlag, true);
  assert.equal(snapshot.transport.routeStandard.notes, 'Construction zone 60-80 km — expect 10 min delay');
});

test('voucher snapshot: routeStandard falls back to null when none is attached (no loud warning)', () => {
  const service = createService({} as any);
  const bookingService = buildTransportBookingService();

  const snapshot = (service as any).buildOperationalVoucherSnapshot(
    bookingService,
    'TRANSPORT',
    [],
    null,
  );

  assert.ok(snapshot.transport, 'transport sub-block still present without a standard');
  assert.equal(
    snapshot.transport.routeStandard,
    null,
    'routeStandard should be null when no standard is seeded — voucher renders without it',
  );
  // Fallback: routeName + routeCode from the touring route still flow through
  // so the voucher is not blank.
  assert.equal(snapshot.transport.routeName, 'Amman to Petra');
  assert.equal(snapshot.transport.routeCode, 'AMM_PET');
});

test('voucher snapshot: routeStandard preserves the SAME route code as the touring route (no duplicate identifiers)', () => {
  // Phase 2C spec: "ONE operational identifier (touringRoute.code) — commercial
  // label is the humanized name. No duplicate competing codes." Verify the
  // routeStandard.routeCode and transport.routeCode share the same identifier
  // track when both are present.
  const service = createService({} as any);
  const bookingService = buildTransportBookingService();
  const routeStandard = {
    routeCode: 'AMM_PET',
    routeName: 'Amman to Petra',
    standardDistanceKm: 235,
    standardDurationHours: 3.5,
    operationalBufferMinutes: 30,
    longDistanceFlag: false,
    overnightRisk: false,
    mountainRoadFlag: false,
    borderCrossingFlag: false,
    airportRouteFlag: false,
    notes: null,
    confidenceLabel: 'Normal Traffic' as const,
  };

  const snapshot = (service as any).buildOperationalVoucherSnapshot(
    bookingService,
    'TRANSPORT',
    [],
    routeStandard,
  );

  assert.equal(
    snapshot.transport.routeCode,
    snapshot.transport.routeStandard.routeCode,
    'routeCode must match between the canonical reference block and the transport identifier',
  );
});

test('voucher snapshot: non-transport voucher does NOT receive a routeStandard sub-block', () => {
  // Sanity guard: passing a routeStandard to a HOTEL voucher should not
  // surface it anywhere — the transport block is null for hotel vouchers,
  // so nothing leaks into hotel/activity/guide sections.
  const service = createService({} as any);
  const hotelService = {
    id: 'bs-2',
    serviceType: 'hotel',
    description: 'Amman Marriott — 2 nights',
    operationType: 'HOTEL',
    operationalDate: new Date('2026-06-01T00:00:00.000Z'),
    nights: 2,
    booking: {
      bookingRef: 'BK-2026-0042',
      pax: 2,
      passengers: [],
      roomingEntries: [],
      clientSnapshotJson: {},
    },
    assignedSupplier: { id: 'sup-2', name: 'Amman Marriott' },
  };
  // Even when (defensively) a caller passes a standard to a non-transport
  // voucher, the transport block stays null.
  const snapshot = (service as any).buildOperationalVoucherSnapshot(
    hotelService,
    'HOTEL',
    [],
    { routeCode: 'AMM_PET', routeName: 'Amman to Petra' } as any,
  );
  assert.equal(snapshot.transport, null);
});

test('voucher snapshot: routeStandard confidence is read from the lookup value (not recomputed)', () => {
  // Lookup helper already derives the confidenceLabel server-side. Verify
  // the voucher snapshot passes it through verbatim — the frontend re-uses
  // the shared classifier for color/detail tooltip but trusts the label
  // string from the snapshot.
  const service = createService({} as any);
  const bookingService = buildTransportBookingService();
  const snapshot = (service as any).buildOperationalVoucherSnapshot(
    bookingService,
    'TRANSPORT',
    [],
    {
      routeCode: 'JOR_ISR',
      routeName: 'Amman to King Hussein Bridge',
      standardDistanceKm: 60,
      standardDurationHours: 1.2,
      operationalBufferMinutes: 90,
      longDistanceFlag: false,
      overnightRisk: false,
      mountainRoadFlag: false,
      borderCrossingFlag: true,
      airportRouteFlag: false,
      notes: 'King Hussein border crossing — allow 1-3 h wait',
      confidenceLabel: 'Border Delay Risk' as const,
    },
  );
  assert.equal(snapshot.transport.routeStandard.confidenceLabel, 'Border Delay Risk');
  assert.equal(snapshot.transport.routeStandard.borderCrossingFlag, true);
});
