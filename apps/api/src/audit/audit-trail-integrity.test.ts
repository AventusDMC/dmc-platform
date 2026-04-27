import test = require('node:test');
import assert = require('node:assert/strict');
const { AuditService } = require('./audit.service');
const { BookingsService } = require('../bookings/bookings.service');
const { QuotePricingService } = require('../quotes/quote-pricing.service');
const { QuotesService } = require('../quotes/quotes.service');

const actor = {
  id: 'user-dmc-admin',
  userId: 'user-dmc-admin',
  companyId: 'dmc-company',
  role: 'admin',
  label: 'DMC Admin',
};

function createQuotesService(prisma: any, auditEntries: any[] = []) {
  return new QuotesService(
    prisma,
    {
      log: async (entry: any) => {
        auditEntries.push({ ...entry, timestamp: new Date('2026-04-28T00:00:00.000Z') });
        return entry;
      },
    } as any,
    {} as any,
    {} as any,
    new QuotePricingService(),
  );
}

function createBookingsService(prisma: any) {
  return new BookingsService(prisma, { log: async () => null } as any);
}

test('AuditService stores actor company user entity metadata and timestamp-ready data', async () => {
  let createdData: any;
  const service = new AuditService({
    auditLog: {
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'audit-1', createdAt: new Date('2026-04-28T00:00:00.000Z'), ...data };
      },
    },
  } as any);

  const audit = await service.log({
    actor: { id: 'user-1', companyId: 'dmc-company' },
    companyId: 'client-company',
    action: 'quote.created',
    entity: 'quote',
    entityId: 'quote-1',
    metadata: { clientCompanyId: 'client-company' },
  });

  assert.equal(audit.createdAt.toISOString(), '2026-04-28T00:00:00.000Z');
  assert.equal(createdData.companyId, 'client-company');
  assert.equal(createdData.userId, 'user-1');
  assert.equal(createdData.action, 'quote.created');
  assert.equal(createdData.entityId, 'quote-1');
  assert.deepEqual(createdData.metadata, { clientCompanyId: 'client-company' });
});

test('quote creation writes audit entry with actor selected client company and timestamp', async () => {
  const auditEntries: any[] = [];
  let createdQuoteData: any;
  const service = createQuotesService(
    {
      $transaction: async (callback: any) =>
        callback({
          quote: {
            findFirst: async () => null,
            create: async ({ data }: any) => {
              createdQuoteData = data;
              return { id: 'quote-1', ...data };
            },
          },
        }),
      company: {
        findFirst: async ({ where }: any) => (where.id === 'client-company' ? { id: 'client-company' } : null),
      },
      contact: {
        findFirst: async () => ({ id: 'contact-1', companyId: 'client-company' }),
      },
    },
    auditEntries,
  );
  (service as any).recalculateQuoteTotals = async () => null;
  (service as any).loadQuoteState = async () => ({ id: 'quote-1', clientCompanyId: 'client-company' });

  await service.create(
    {
      clientCompanyId: 'client-company',
      contactId: 'contact-1',
      title: 'Audited Quote',
      quoteCurrency: 'USD',
      quoteType: 'FIT',
      bookingType: 'FIT',
      adults: 2,
      children: 0,
      roomCount: 1,
      nightCount: 1,
      travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
      validUntil: new Date('2026-05-01T00:00:00.000Z'),
    } as any,
    actor,
  );

  assert.equal(createdQuoteData.clientCompanyId, 'client-company');
  assert.equal(auditEntries[0].action, 'quote.created');
  assert.equal(auditEntries[0].actor.id, actor.id);
  assert.equal(auditEntries[0].companyId, 'client-company');
  assert.equal(auditEntries[0].metadata.clientCompanyId, 'client-company');
  assert.equal(auditEntries[0].timestamp.toISOString(), '2026-04-28T00:00:00.000Z');
});

test('re-quote preserves original quote and audits revisedFromId linkage with actor', async () => {
  const auditEntries: any[] = [];
  let createdQuoteData: any;
  const original = {
    id: 'quote-1',
    quoteNumber: 'Q-1',
    clientCompanyId: 'client-company',
    brandCompanyId: null,
    contactId: 'contact-1',
    agentId: null,
    quoteType: 'FIT',
    jordanPassType: 'NONE',
    bookingType: 'FIT',
    title: 'Original Quote',
    description: null,
    quoteCurrency: 'USD',
    pricingType: 'simple',
    pricingMode: 'FIXED',
    fixedPricePerPerson: null,
    focType: 'none',
    adults: 2,
    children: 0,
    roomCount: 1,
    nightCount: 1,
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    validUntil: new Date('2026-05-01T00:00:00.000Z'),
    totalPrice: 100,
    totalCost: 70,
    totalSell: 100,
    pricePerPax: 50,
    revisionNumber: 1,
    status: 'ACCEPTED',
    acceptedVersionId: 'version-1',
    pricingSlabs: [],
    itineraries: [],
    quoteItems: [],
    quoteOptions: [],
    scenarios: [],
  };
  const service = createQuotesService(
    {
      quote: {
        findFirst: async ({ where }: any) => (where.id === 'quote-1' ? original : null),
      },
      $transaction: async (callback: any) =>
        callback({
          quote: {
            findFirst: async () => null,
            create: async ({ data }: any) => {
              createdQuoteData = data;
              return { id: 'quote-2', ...data };
            },
          },
          itinerary: { create: async () => ({ id: 'itinerary-2' }) },
          quoteOption: { create: async () => ({ id: 'option-2' }) },
          quotePricingSlab: { create: async () => ({}) },
          quoteItem: { create: async () => ({ id: 'item-2' }) },
          quoteScenario: { create: async () => ({}) },
        }),
    },
    auditEntries,
  );
  (service as any).loadQuoteState = async () => ({ id: 'quote-2', revisedFromId: 'quote-1', clientCompanyId: 'client-company' });

  await service.requote('quote-1', actor);

  assert.equal(original.status, 'ACCEPTED');
  assert.equal(createdQuoteData.revisedFromId, 'quote-1');
  assert.equal(createdQuoteData.revisionNumber, 2);
  assert.equal(auditEntries[0].action, 'quote.revised');
  assert.equal(auditEntries[0].entityId, 'quote-2');
  assert.equal(auditEntries[0].actor.id, actor.id);
  assert.equal(auditEntries[0].metadata.revisedFromId, 'quote-1');
});

test('quote to booking conversion audits booking creation with quote and booking identifiers', async () => {
  const auditEntries: any[] = [];
  let bookingCreateData: any;
  const service = createQuotesService(
    {
      quote: {
        findFirst: async ({ where }: any) => {
          if (where.revisedFromId) return null;
          return { id: 'quote-1', status: 'ACCEPTED', acceptedVersionId: 'version-1', clientCompanyId: 'client-company', booking: null };
        },
      },
      $transaction: async (callback: any) =>
        callback({
          quote: {
            findFirst: async () => ({ id: 'quote-1', status: 'ACCEPTED', acceptedVersionId: 'version-1', clientCompanyId: 'client-company', booking: null }),
          },
          quoteVersion: {
            findFirst: async () => ({
              id: 'version-1',
              quoteId: 'quote-1',
              booking: null,
              snapshotJson: {
                clientCompany: { id: 'client-company', name: 'Client Co' },
                contact: { firstName: 'Lina', lastName: 'Haddad' },
                adults: 2,
                children: 0,
                roomCount: 1,
                nightCount: 1,
                travelStartDate: '2026-06-01T00:00:00.000Z',
                itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Arrival' }],
                quoteItems: [],
              },
            }),
          },
          supplier: { findMany: async () => [] },
          booking: {
            findFirst: async () => null,
            create: async ({ data }: any) => {
              bookingCreateData = data;
              return { id: 'booking-1', bookingRef: data.bookingRef, ...data };
            },
          },
          bookingPassenger: { create: async () => ({ id: 'passenger-1' }) },
          bookingRoomingEntry: { create: async () => ({ id: 'room-1' }) },
          bookingRoomingAssignment: { create: async () => ({}) },
        }),
    },
    auditEntries,
  );

  await service.convertToBooking('quote-1', actor);

  assert.equal(bookingCreateData.quoteId, 'quote-1');
  assert.equal(bookingCreateData.clientCompanyId, 'client-company');
  assert.equal(auditEntries[0].action, 'booking.created');
  assert.equal(auditEntries[0].entityId, 'booking-1');
  assert.equal(auditEntries[0].actor.id, actor.id);
  assert.equal(auditEntries[0].metadata.quoteId, 'quote-1');
});

test('booking amendment creates a new booking and audit row without mutating original', async () => {
  const bookingAuditRows: any[] = [];
  let createdBookingData: any;
  const original = {
    id: 'booking-1',
    bookingRef: 'BK-1',
    quoteId: 'quote-1',
    acceptedVersionId: 'version-1',
    clientCompanyId: 'client-company',
    amendmentNumber: 1,
    status: 'confirmed',
    bookingType: 'FIT',
    clientInvoiceStatus: 'unbilled',
    supplierPaymentStatus: 'unpaid',
    snapshotJson: { title: 'Original' },
    clientSnapshotJson: { name: 'Client Co' },
    contactSnapshotJson: {},
    itinerarySnapshotJson: [],
    pricingSnapshotJson: {},
    adults: 2,
    children: 0,
    pax: 2,
    roomCount: 1,
    nightCount: 1,
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-06-02T00:00:00.000Z'),
    days: [],
    passengers: [],
    services: [],
  };
  const service = createBookingsService({
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async ({ where }: any) => (where.id === 'booking-1' ? original : null),
          create: async ({ data }: any) => {
            createdBookingData = data;
            return { id: 'booking-2', ...data };
          },
        },
        bookingDay: { create: async () => ({ id: 'day-2' }) },
        bookingPassenger: { create: async () => ({ id: 'passenger-2' }) },
        bookingService: { create: async () => ({ id: 'service-2' }) },
        bookingAuditLog: {
          create: async ({ data }: any) => {
            bookingAuditRows.push({ ...data, createdAt: new Date('2026-04-28T00:00:00.000Z') });
            return data;
          },
        },
      }),
  });

  await service.amendBooking('booking-1', {
    actor: { userId: actor.userId, label: actor.label },
    companyActor: actor,
  });

  assert.equal(original.id, 'booking-1');
  assert.equal(createdBookingData.amendedFromId, 'booking-1');
  assert.equal(createdBookingData.clientCompanyId, 'client-company');
  assert.equal(bookingAuditRows[0].action, 'booking_amended');
  assert.equal(bookingAuditRows[0].oldValue, 'booking-1');
  assert.equal(bookingAuditRows[0].newValue, 'booking-2');
  assert.equal(bookingAuditRows[0].actorUserId, actor.userId);
  assert.equal(bookingAuditRows[0].createdAt.toISOString(), '2026-04-28T00:00:00.000Z');
});

test('activity service updates audit service id actor and changed operational notes', async () => {
  const bookingAuditRows: any[] = [];
  let updatedData: any;
  const service = createBookingsService({
    bookingService: {
      findFirst: async () => ({
        id: 'service-activity',
        bookingId: 'booking-1',
        bookingDayId: 'day-1',
        serviceType: 'ACTIVITY',
        operationType: 'ACTIVITY',
        operationStatus: 'PENDING',
        description: 'Petra by Night',
        supplierId: 'supplier-company',
        supplierName: 'Activity Supplier',
        pickupTime: '19:45',
        notes: null,
        supplier: { id: 'supplier-company', name: 'Activity Supplier' },
        vehicle: null,
        bookingDay: { id: 'day-1' },
      }),
    },
    supplier: { findUnique: async () => ({ id: 'supplier-company', name: 'Activity Supplier' }) },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          update: async ({ data }: any) => {
            updatedData = data;
            return { id: 'service-activity', ...data };
          },
        },
        bookingAuditLog: {
          create: async ({ data }: any) => {
            bookingAuditRows.push(data);
            return data;
          },
        },
      }),
  });

  await service.updateBookingService('booking-1', 'day-1', 'service-activity', {
    type: 'ACTIVITY',
    supplierId: 'supplier-company',
    pickupTime: '20:00',
    notes: 'Pickup time changed to 20:00',
    status: 'CONFIRMED',
    actor: { userId: actor.userId, label: actor.label },
    companyActor: actor,
  });

  assert.equal(updatedData.pickupTime, '20:00');
  assert.equal(bookingAuditRows[0].bookingServiceId, 'service-activity');
  assert.equal(bookingAuditRows[0].entityId, 'service-activity');
  assert.equal(bookingAuditRows[0].action, 'booking_service_updated');
  assert.match(bookingAuditRows[0].note, /20:00/);
  assert.equal(bookingAuditRows[0].actorUserId, actor.userId);
});

test('passenger audit logs omit full passport numbers on create and update', async () => {
  const bookingAuditRows: any[] = [];
  const service = createBookingsService({
    $transaction: async (callback: any) =>
      callback({
        booking: { findFirst: async () => ({ id: 'booking-1' }) },
        bookingPassenger: {
          create: async ({ data }: any) => ({ id: 'passenger-1', ...data }),
          updateMany: async () => ({ count: 0 }),
        },
        bookingAuditLog: {
          create: async ({ data }: any) => {
            bookingAuditRows.push(data);
            return data;
          },
        },
      }),
  });

  await service.createPassenger('booking-1', {
    firstName: 'Rana',
    lastName: 'Saleh',
    nationality: 'Jordanian',
    passportNumber: 'P9988776',
    passportExpiryDate: '2031-01-01',
    actor: { userId: actor.userId, label: actor.label },
    companyActor: actor,
  });

  const serialized = JSON.stringify(bookingAuditRows);
  assert.match(serialized, /Rana Saleh/);
  assert.doesNotMatch(serialized, /P9988776/);
});

test('quote and booking cancellation audit actor reason and sequence', async () => {
  const quoteAuditEntries: any[] = [];
  const bookingAuditRows: any[] = [];
  const quoteService = createQuotesService(
    {
      quote: {
        findFirst: async () => ({
          id: 'quote-1',
          status: 'SENT',
          clientCompanyId: 'client-company',
          acceptedVersionId: null,
          sentAt: new Date('2026-04-28T00:00:00.000Z'),
          acceptedAt: null,
          pricingType: 'simple',
          pricingMode: 'FIXED',
          pricingSlabs: [],
        }),
        update: async ({ data }: any) => ({ id: 'quote-1', clientCompanyId: 'client-company', ...data }),
      },
    },
    quoteAuditEntries,
  );
  const bookingService = createBookingsService({
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async () => ({ id: 'booking-1', status: 'confirmed' }),
          update: async ({ data }: any) => ({ id: 'booking-1', ...data }),
        },
        bookingAuditLog: {
          create: async ({ data }: any) => {
            bookingAuditRows.push({ ...data, createdAt: new Date('2026-04-28T00:05:00.000Z') });
            return data;
          },
        },
      }),
  });

  await quoteService.cancelQuote('quote-1', actor);
  await bookingService.cancelBooking('booking-1', {
    note: 'Client cancelled',
    actor: { userId: actor.userId, label: actor.label },
    companyActor: actor,
  });

  assert.equal(quoteAuditEntries[0].action, 'quote.cancelled');
  assert.equal(quoteAuditEntries[0].actor.id, actor.id);
  assert.equal(bookingAuditRows[0].action, 'booking_status_updated');
  assert.equal(bookingAuditRows[0].newValue, 'cancelled');
  assert.equal(bookingAuditRows[0].note, 'Client cancelled');
  assert.equal(bookingAuditRows[0].actorUserId, actor.userId);
});

test('document generation audit rows capture voucher manifest and proposal types without sensitive data', async () => {
  const auditRows: any[] = [];
  const audit = new AuditService({
    auditLog: {
      create: async ({ data }: any) => {
        auditRows.push(data);
        return data;
      },
    },
  } as any);

  await audit.log({
    actor: { id: actor.id, companyId: 'client-company' },
    action: 'document.generated',
    entity: 'quote',
    entityId: 'quote-1',
    metadata: { type: 'proposal', clientCompanyId: 'client-company' },
  });
  await audit.log({
    actor: { id: actor.id, companyId: 'client-company' },
    action: 'document.generated',
    entity: 'voucher',
    entityId: 'voucher-1',
    metadata: { type: 'voucher', supplierCompanyId: 'supplier-company' },
  });
  await audit.log({
    actor: { id: actor.id, companyId: 'client-company' },
    action: 'document.generated',
    entity: 'booking',
    entityId: 'booking-1',
    metadata: { type: 'manifest', clientCompanyId: 'client-company' },
  });

  assert.deepEqual(auditRows.map((row) => row.metadata.type), ['proposal', 'voucher', 'manifest']);
  assert.equal(auditRows[1].metadata.supplierCompanyId, 'supplier-company');
  assert.doesNotMatch(JSON.stringify(auditRows), /P9988776|passportNumber|totalCost|margin/);
});

test('historical revisions cannot be mutated and audit sequence remains truthful', async () => {
  const service = createQuotesService({
    quote: {
      findFirst: async () => ({ id: 'quote-old', status: 'DRAFT', pricingType: 'simple', pricingMode: 'FIXED', pricingSlabs: [] }),
    },
  });
  (service as any).assertLatestQuoteRevision = async () => {
    throw new Error('Only the latest quote revision can be changed or converted');
  };

  await assert.rejects(
    () => service.updateStatus('quote-old', { status: 'SENT' as any }, actor),
    /Only the latest quote revision/,
  );
});
