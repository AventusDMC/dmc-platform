import test = require('node:test');
import assert = require('node:assert/strict');
import { QuotePricingService } from '../quotes/quote-pricing.service';

const { QuotesService } = require('../quotes/quotes.service');
const { BookingsService } = require('../bookings/bookings.service');

function createQuotesService(prisma: any = {}) {
  return new QuotesService(
    prisma,
    { log: async () => null } as any,
    {} as any,
    {} as any,
    new QuotePricingService(),
  );
}

function createBookingsService(prisma: any = {}) {
  return new BookingsService(prisma, { log: async () => null });
}

function createBaseQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-1',
    quoteNumber: 'Q-1',
    clientCompanyId: 'client-company-1',
    brandCompanyId: null,
    contactId: 'contact-1',
    agentId: null,
    title: 'Original quote',
    description: 'Original description',
    status: 'DRAFT',
    quoteType: 'FIT',
    bookingType: 'FIT',
    jordanPassType: 'NONE',
    adults: 2,
    children: 0,
    roomCount: 1,
    nightCount: 2,
    singleSupplement: null,
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    quoteCurrency: 'USD',
    pricingMode: 'FIXED',
    pricingType: 'simple',
    fixedPricePerPerson: null,
    focType: 'none',
    focRatio: null,
    focCount: null,
    focRoomType: null,
    totalCost: 100,
    totalSell: 130,
    pricePerPax: 65,
    markupPercent: 0,
    acceptedVersionId: null,
    sentAt: null,
    acceptedAt: null,
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    updatedAt: new Date('2026-04-27T00:00:00.000Z'),
    ...overrides,
  };
}

function createOriginalBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    quoteId: 'quote-1',
    acceptedVersionId: 'version-1',
    clientCompanyId: 'client-company-1',
    amendmentNumber: 1,
    amendedFromId: null,
    bookingType: 'FIT',
    status: 'confirmed',
    clientInvoiceStatus: 'unbilled',
    supplierPaymentStatus: 'unpaid',
    statusNote: null,
    bookingRef: 'BK-2026-0001',
    snapshotJson: { title: 'Original booking' },
    clientSnapshotJson: { name: 'Client Co' },
    brandSnapshotJson: null,
    contactSnapshotJson: { firstName: 'Lina', lastName: 'Haddad' },
    itinerarySnapshotJson: [],
    pricingSnapshotJson: { totalSell: 130 },
    adults: 2,
    children: 0,
    pax: 2,
    roomCount: 1,
    nightCount: 2,
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-06-03T00:00:00.000Z'),
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    days: [
      {
        id: 'day-1',
        dayNumber: 1,
        date: new Date('2026-06-01T00:00:00.000Z'),
        title: 'Arrival',
        notes: null,
        status: 'PENDING',
      },
    ],
    passengers: [],
    services: [
      {
        id: 'service-1',
        bookingDayId: 'day-1',
        sourceQuoteItemId: 'item-1',
        serviceOrder: 1,
        serviceType: 'ACTIVITY',
        operationType: 'ACTIVITY',
        operationStatus: 'CONFIRMED',
        referenceId: null,
        assignedTo: 'Guide Lina',
        guidePhone: '+962700000000',
        vehicleId: null,
        serviceDate: new Date('2026-06-01T00:00:00.000Z'),
        startTime: '08:30',
        pickupTime: '08:00',
        pickupLocation: 'Hotel lobby',
        meetingPoint: 'Visitor center',
        participantCount: 2,
        adultCount: 2,
        childCount: 0,
        supplierReference: 'ACT-1',
        reconfirmationRequired: false,
        reconfirmationDueAt: null,
        description: 'Petra visit',
        notes: 'Original notes',
        qty: 1,
        unitCost: 100,
        unitSell: 130,
        totalCost: 100,
        totalSell: 130,
        status: 'confirmed',
        supplierId: 'supplier-activity-1',
        supplierName: 'Petra Experiences',
        confirmationStatus: 'confirmed',
        confirmationNumber: 'ACT-1',
        confirmationNotes: null,
        statusNote: null,
        confirmationRequestedAt: null,
        confirmationConfirmedAt: null,
      },
    ],
    ...overrides,
  };
}

function stripUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function createPdfCapture(service: any) {
  service.fetchImageBuffer = async () => null;
  service.createPdf = async (write: (doc: any) => void) => {
    const lines: string[] = [];
    const doc: any = {
      y: 50,
      page: {
        width: 595,
        height: 842,
        margins: { left: 50, right: 50, top: 50, bottom: 50 },
      },
      font: () => doc,
      fontSize: () => doc,
      fillColor: () => doc,
      strokeColor: () => doc,
      lineWidth: () => doc,
      image: () => doc,
      moveTo: () => doc,
      lineTo: () => doc,
      stroke: () => doc,
      addPage: () => {
        doc.y = 50;
        return doc;
      },
      moveDown: (amount = 1) => {
        doc.y += 12 * amount;
        return doc;
      },
      text: (value: string) => {
        lines.push(String(value));
        doc.y += 12;
        return doc;
      },
    };

    write(doc);
    return Buffer.from(lines.join('\n'));
  };
}

test('concurrent quote updates preserve unrelated fields with last-write consistency', async () => {
  const state = createBaseQuote();
  const updateOrder: string[] = [];
  const service = createQuotesService({
    quote: {
      findFirst: async () => ({ ...state }),
    },
    company: {
      findFirst: async () => ({ id: 'client-company-1', name: 'Client Co' }),
    },
    contact: {
      findFirst: async () => ({ id: 'contact-1', companyId: 'client-company-1' }),
    },
    $transaction: async (callback: any) =>
      callback({
        quote: {
          update: async ({ data }: any) => {
            const cleanData = stripUndefined(data);
            Object.assign(state, cleanData);
            updateOrder.push(String(cleanData.title || `pax-${cleanData.adults}`));
            return { ...state };
          },
        },
        quotePricingSlab: {
          deleteMany: async () => ({}),
          createMany: async () => ({}),
        },
      }),
  });
  (service as any).assertLatestQuoteRevision = async () => null;
  (service as any).recalculateQuoteTotals = async () => null;
  (service as any).loadQuoteState = async () => ({ ...state });

  const [titleUpdate, paxUpdate] = await Promise.all([
    service.update('quote-1', { title: 'Updated title' }, { companyId: 'dmc-company-1' }),
    service.update('quote-1', { adults: 4, children: 1 }, { companyId: 'dmc-company-1' }),
  ]);

  assert.equal(updateOrder.length, 2);
  assert.equal(state.title, 'Updated title');
  assert.equal(state.adults, 4);
  assert.equal(state.children, 1);
  assert.equal(titleUpdate.clientCompanyId, 'client-company-1');
  assert.equal(paxUpdate.contactId, 'contact-1');
});

test('concurrent booking amendments get unique numbers and link to the original booking', async () => {
  const original = createOriginalBooking();
  const createdBookings: any[] = [];
  let nextBookingRef = 2;
  let transactionLock = Promise.resolve();
  const service = createBookingsService({
    $transaction: async (callback: any, options?: any) => {
      const previousTransaction = transactionLock;
      let releaseTransaction: () => void = () => null;
      transactionLock = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });
      await previousTransaction;

      try {
        return await callback({
        booking: {
          findFirst: async ({ where }: any) => {
            if (where?.id === 'booking-1') return original;
            if (where?.OR) {
              const latestCreated = [...createdBookings].sort((left, right) => right.amendmentNumber - left.amendmentNumber)[0];
              return latestCreated ? { amendmentNumber: latestCreated.amendmentNumber } : { amendmentNumber: 1 };
            }
            if (where?.bookingRef) return null;
            return null;
          },
          create: async ({ data }: any) => {
            const created = { id: `booking-${createdBookings.length + 2}`, ...data };
            createdBookings.push(created);
            return created;
          },
        },
        bookingDay: {
          create: async ({ data }: any) => ({ id: `day-${createdBookings.length + 1}`, ...data }),
        },
        bookingPassenger: {
          create: async ({ data }: any) => ({ id: `passenger-${createdBookings.length + 1}`, ...data }),
        },
        bookingService: {
          create: async ({ data }: any) => ({ id: `service-${createdBookings.length + 1}`, ...data }),
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
        });
      } finally {
        releaseTransaction();
      }
    },
  });
  (service as any).generateNextBookingRef = async () => `BK-2026-${String(nextBookingRef++).padStart(4, '0')}`;

  await Promise.all([
    service.amendBooking('booking-1', { companyActor: { companyId: 'dmc-company-1' } }),
    service.amendBooking('booking-1', { companyActor: { companyId: 'dmc-company-1' } }),
  ]);

  assert.deepEqual(createdBookings.map((booking) => booking.amendmentNumber).sort(), [2, 3]);
  assert.ok(createdBookings.every((booking) => booking.amendedFromId === 'booking-1'));
  assert.ok(createdBookings.every((booking) => booking.clientCompanyId === 'client-company-1'));
});

test('parallel activity assignment updates retain operational fields and valid participant counts', async () => {
  const state = {
    ...createOriginalBooking().services[0],
    id: 'service-activity',
    bookingId: 'booking-1',
    bookingDay: { id: 'day-1', date: new Date('2026-06-01T00:00:00.000Z') },
    supplier: { id: 'supplier-activity-1', name: 'Petra Experiences' },
    vehicle: null,
  };
  const updatePayloads: any[] = [];
  const service = createBookingsService({
    bookingService: {
      findFirst: async () => ({ ...state }),
    },
    supplier: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: 'Petra Experiences' }),
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          update: async ({ data }: any) => {
            const cleanData = stripUndefined(data);
            Object.assign(state, cleanData);
            updatePayloads.push(cleanData);
            return { ...state, supplier: { id: state.supplierId, name: state.supplierName }, bookingDay: { id: 'day-1' }, vehicle: null };
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  await Promise.all([
    service.updateBookingService('booking-1', 'day-1', 'service-activity', {
      type: 'ACTIVITY',
      supplierId: 'supplier-activity-1',
      assignedTo: 'Guide Omar',
      pickupTime: '08:45',
      status: 'REQUESTED',
      companyActor: { companyId: 'dmc-company-1' },
    }),
    service.updateBookingService('booking-1', 'day-1', 'service-activity', {
      type: 'ACTIVITY',
      supplierId: 'supplier-activity-1',
      notes: 'Bring water',
      status: 'CONFIRMED',
      companyActor: { companyId: 'dmc-company-1' },
    }),
  ]);

  assert.equal(updatePayloads.length, 2);
  assert.equal(state.operationType, 'ACTIVITY');
  assert.equal(state.supplierId, 'supplier-activity-1');
  assert.ok(state.pickupTime);
  assert.ok(Number(state.participantCount) >= 0);
  assert.notEqual(state.participantCount, Number.NaN);
});

test('document generation in parallel keeps voucher booking and service association isolated', async () => {
  const vouchers = new Map([
    [
      'voucher-a',
      {
        id: 'voucher-a',
        type: 'TRANSPORT',
        status: 'DRAFT',
        notes: 'Arrival pickup',
        supplier: { name: 'Transport Supplier A' },
        booking: {
          id: 'booking-a',
          bookingRef: 'BK-A',
          pax: 2,
          adults: 2,
          children: 0,
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          endDate: new Date('2026-06-03T00:00:00.000Z'),
          snapshotJson: { title: 'Client A Trip' },
          brandSnapshotJson: { name: 'Brand A' },
          clientSnapshotJson: { name: 'Client A' },
          quote: { clientCompany: { name: 'Client A' }, brandCompany: { name: 'Brand A', branding: null }, contact: {} },
          passengers: [],
          days: [],
        },
        bookingService: {
          id: 'service-a',
          referenceId: null,
          description: 'Airport transfer A',
          pickupTime: '09:00',
          startTime: null,
          assignedTo: 'Driver A',
          guidePhone: null,
          vehicle: { name: 'Van A' },
          bookingDay: { title: 'Arrival A' },
          totalCost: 500,
          totalSell: 700,
        },
      },
    ],
    [
      'voucher-b',
      {
        id: 'voucher-b',
        type: 'ACTIVITY',
        status: 'DRAFT',
        notes: 'Activity pickup',
        supplier: { name: 'Activity Supplier B' },
        booking: {
          id: 'booking-b',
          bookingRef: 'BK-B',
          pax: 3,
          adults: 3,
          children: 0,
          startDate: new Date('2026-07-01T00:00:00.000Z'),
          endDate: new Date('2026-07-02T00:00:00.000Z'),
          snapshotJson: { title: 'Client B Trip' },
          brandSnapshotJson: { name: 'Brand B' },
          clientSnapshotJson: { name: 'Client B' },
          quote: { clientCompany: { name: 'Client B' }, brandCompany: { name: 'Brand B', branding: null }, contact: {} },
          passengers: [],
          days: [],
        },
        bookingService: {
          id: 'service-b',
          referenceId: null,
          description: 'Petra tour B',
          pickupTime: '10:30',
          startTime: null,
          assignedTo: 'Guide B',
          guidePhone: null,
          vehicle: null,
          bookingDay: { title: 'Petra B' },
          totalCost: 800,
          totalSell: 950,
        },
      },
    ],
  ]);
  const service = createBookingsService({
    voucher: {
      findFirst: async ({ where }: any) => vouchers.get(where.id),
    },
  });
  createPdfCapture(service);

  const [pdfA, pdfB] = await Promise.all([
    service.generateServiceVoucherPdf('voucher-a', { companyId: 'dmc-company-1' }),
    service.generateServiceVoucherPdf('voucher-b', { companyId: 'dmc-company-1' }),
  ]);
  const textA = pdfA.toString('utf8');
  const textB = pdfB.toString('utf8');

  assert.match(textA, /BK-A/);
  assert.match(textA, /Client A Trip/);
  assert.match(textA, /Driver A/);
  assert.doesNotMatch(textA, /Client B Trip|Guide B|totalCost|totalSell|margin/i);
  assert.match(textB, /BK-B/);
  assert.match(textB, /Activity Supplier B/);
  assert.match(textB, /Petra tour B/);
  assert.doesNotMatch(textB, /Client A Trip|Driver A|totalCost|totalSell|margin/i);
});

test('simultaneous multi-company actions do not contaminate client company data', async () => {
  const createdServices: any[] = [];
  const service = createBookingsService({
    bookingDay: {
      findFirst: async ({ where }: any) => ({
        id: where.id,
        bookingId: where.bookingId,
        date: new Date('2026-06-01T00:00:00.000Z'),
        booking: { id: where.bookingId, clientCompanyId: where.bookingId === 'booking-a' ? 'client-a' : 'client-b', adults: 2, children: 0 },
      }),
    },
    bookingService: {
      count: async () => 0,
      findFirst: async () => null,
    },
    supplier: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: `Supplier ${where.id}` }),
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          create: async ({ data }: any) => {
            createdServices.push(data);
            return { id: `service-${createdServices.length}`, ...data };
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  await Promise.all([
    service.createBookingService('booking-a', 'day-a', {
      type: 'ACTIVITY',
      supplierId: 'supplier-a',
      notes: 'Client A note',
      companyActor: { companyId: 'dmc-company-1' },
    }),
    service.createBookingService('booking-b', 'day-b', {
      type: 'ACTIVITY',
      supplierId: 'supplier-b',
      notes: 'Client B note',
      companyActor: { companyId: 'dmc-company-1' },
    }),
  ]);

  assert.equal(createdServices.length, 2);
  assert.ok(createdServices.some((entry) => entry.bookingId === 'booking-a' && entry.supplierId === 'supplier-a' && entry.notes === 'Client A note'));
  assert.ok(createdServices.some((entry) => entry.bookingId === 'booking-b' && entry.supplierId === 'supplier-b' && entry.notes === 'Client B note'));
  assert.ok(createdServices.every((entry) => entry.bookingId !== undefined));
});

test('failed transaction does not persist partial amendment rows', async () => {
  const original = createOriginalBooking();
  const committedBookings: any[] = [];
  const service = createBookingsService({
    $transaction: async (callback: any) => {
      const stagedBookings: any[] = [];
      try {
        const result = await callback({
          booking: {
            findFirst: async ({ where }: any) => {
              if (where?.id === 'booking-1') return original;
              if (where?.OR) return { amendmentNumber: 1 };
              return null;
            },
            create: async ({ data }: any) => {
              const created = { id: 'booking-2', ...data };
              stagedBookings.push(created);
              return created;
            },
          },
          bookingDay: {
            create: async () => {
              throw new Error('simulated day clone failure');
            },
          },
          bookingPassenger: {
            create: async () => ({}),
          },
          bookingService: {
            create: async () => ({}),
          },
          bookingAuditLog: {
            create: async () => ({}),
          },
        });
        committedBookings.push(...stagedBookings);
        return result;
      } catch (error) {
        return Promise.reject(error);
      }
    },
  });
  (service as any).generateNextBookingRef = async () => 'BK-2026-0002';

  await assert.rejects(
    () => service.amendBooking('booking-1', { companyActor: { companyId: 'dmc-company-1' } }),
    /simulated day clone failure/,
  );
  assert.equal(committedBookings.length, 0);
});

test('read consistency returns complete booking state while updates are happening', async () => {
  let serviceState = {
    id: 'service-1',
    bookingId: 'booking-1',
    bookingDayId: 'day-1',
    operationType: 'ACTIVITY',
    serviceType: 'ACTIVITY',
    operationStatus: 'PENDING',
    description: 'Petra visit',
    pickupTime: '08:00',
    participantCount: 2,
    supplierId: 'supplier-activity-1',
    supplierName: 'Petra Experiences',
    status: 'pending',
    confirmationStatus: 'pending',
    auditLogs: [],
  };
  const service = createBookingsService({
    booking: {
      findFirst: async () => ({
        id: 'booking-1',
        quoteId: 'quote-1',
        adults: 2,
        children: 0,
        roomCount: 1,
        snapshotJson: { title: 'Consistent booking' },
        clientSnapshotJson: { name: 'Client Co' },
        contactSnapshotJson: { firstName: 'Lina', lastName: 'Haddad' },
        pricingSnapshotJson: { totalSell: 130 },
      }),
    },
    quote: {
      findUnique: async () => ({
        id: 'quote-1',
        clientCompany: { id: 'client-company-1', name: 'Client Co' },
        brandCompany: null,
        contact: { firstName: 'Lina', lastName: 'Haddad' },
      }),
    },
    quoteVersion: {
      findUnique: async () => null,
    },
    bookingAuditLog: {
      findMany: async () => [],
    },
    bookingPassenger: {
      findMany: async () => [],
    },
    bookingDay: {
      findMany: async () => [{ id: 'day-1', bookingId: 'booking-1', dayNumber: 1, title: 'Arrival', status: 'PENDING' }],
    },
    bookingRoomingEntry: {
      findMany: async () => [],
    },
    payment: {
      findMany: async () => [],
    },
    bookingService: {
      findFirst: async () => ({ ...serviceState, bookingDay: { id: 'day-1' }, supplier: { id: 'supplier-activity-1', name: 'Petra Experiences' } }),
      findMany: async () => [{ ...serviceState }],
    },
    supplier: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: 'Petra Experiences' }),
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          update: async ({ data }: any) => {
            serviceState = { ...serviceState, ...stripUndefined(data) };
            return { ...serviceState, bookingDay: { id: 'day-1' }, supplier: { id: serviceState.supplierId, name: serviceState.supplierName } };
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const [readResult] = await Promise.all([
    service.findOne('booking-1', { companyId: 'dmc-company-1' }),
    service.updateBookingService('booking-1', 'day-1', 'service-1', {
      type: 'ACTIVITY',
      supplierId: 'supplier-activity-1',
      pickupTime: '09:00',
      status: 'CONFIRMED',
      companyActor: { companyId: 'dmc-company-1' },
    }),
  ]);

  assert.equal(readResult.id, 'booking-1');
  assert.equal(readResult.clientSnapshotJson.name, 'Client Co');
  assert.ok(Array.isArray(readResult.days));
  assert.ok(Array.isArray(readResult.services));
  assert.equal(readResult.services[0].bookingId, 'booking-1');
  assert.ok(readResult.services[0].pickupTime);
});
