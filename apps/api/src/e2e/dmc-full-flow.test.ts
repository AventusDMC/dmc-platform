import test = require('node:test');
import assert = require('node:assert/strict');
const { ActivitiesService } = require('../activities/activities.service');
const { QuotesService } = require('../quotes/quotes.service');
const { QuotePricingService } = require('../quotes/quote-pricing.service');
const { ProposalV3Service } = require('../quotes/proposal-v3.service');
const { BookingsService } = require('../bookings/bookings.service');

const actor = {
  userId: 'user-dmc-admin',
  companyId: 'dmc-company',
  role: 'admin',
};

function createPdfTextCapture(service: any) {
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

  service.createPdf = (write: (doc: any) => void) => {
    lines.length = 0;
    write(doc);
    return Promise.resolve(Buffer.from(lines.join('\n')));
  };
}

function matchesWhere(row: any, where: any) {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'id' && typeof value === 'object' && value && 'in' in value) {
      return (value as any).in.includes(row.id);
    }
    if (typeof value === 'object' && value && 'startsWith' in value) {
      return String(row[key] || '').startsWith(String((value as any).startsWith));
    }
    if (typeof value === 'object' && value && !Array.isArray(value) && !(value instanceof Date)) {
      return true;
    }
    return row[key] === value;
  });
}

function createDmcFlowHarness() {
  const db = {
    companies: [] as any[],
    contacts: [] as any[],
    activities: [] as any[],
    supplierServices: [] as any[],
    quotes: [] as any[],
    quoteItems: [] as any[],
    itineraries: [] as any[],
    quoteVersions: [] as any[],
    bookings: [] as any[],
    bookingDays: [] as any[],
    bookingServices: [] as any[],
    passengers: [] as any[],
    vouchers: [] as any[],
    seenQuoteWheres: [] as any[],
    seenSupplierWheres: [] as any[],
    seenBookingWheres: [] as any[],
  };

  const ids = new Map<string, number>();
  const nextId = (prefix: string) => {
    const next = (ids.get(prefix) || 0) + 1;
    ids.set(prefix, next);
    return `${prefix}-${next}`;
  };

  function attachQuoteRelations(quote: any) {
    const clientCompany = db.companies.find((company) => company.id === quote.clientCompanyId) || null;
    const contact = db.contacts.find((entry) => entry.id === quote.contactId) || null;
    const quoteItems = db.quoteItems.filter((item) => item.quoteId === quote.id).map(attachQuoteItemRelations);
    const itineraries = db.itineraries.filter((day) => day.quoteId === quote.id);

    return {
      ...quote,
      clientCompany,
      company: clientCompany,
      brandCompany: null,
      contact,
      quoteItems,
      itineraries,
      quoteOptions: [],
      pricingSlabs: [],
      scenarios: [],
      invoice: null,
      booking: db.bookings.find((booking) => booking.quoteId === quote.id) || null,
    };
  }

  function attachQuoteItemRelations(item: any) {
    const service = db.supplierServices.find((entry) => entry.id === item.serviceId) || null;
    const activity = item.activityId ? db.activities.find((entry) => entry.id === item.activityId) || null : null;

    return {
      ...item,
      service,
      activity: activity ? { ...activity, supplierCompany: db.companies.find((company) => company.id === activity.supplierCompanyId) || null } : null,
      itinerary: item.itineraryId ? db.itineraries.find((day) => day.id === item.itineraryId) || null : null,
      hotel: null,
      contract: null,
      roomCategory: null,
      appliedVehicleRate: null,
    };
  }

  function attachBookingServiceRelations(service: any) {
    return {
      ...service,
      supplier: service.supplierId ? db.companies.find((company) => company.id === service.supplierId) || null : null,
      vehicle: null,
      bookingDay: service.bookingDayId ? db.bookingDays.find((day) => day.id === service.bookingDayId) || null : null,
    };
  }

  function attachBookingRelations(booking: any) {
    return {
      ...booking,
      quote: attachQuoteRelations(db.quotes.find((quote) => quote.id === booking.quoteId) || {}),
      days: db.bookingDays.filter((day) => day.bookingId === booking.id),
      passengers: db.passengers.filter((passenger) => passenger.bookingId === booking.id),
      services: db.bookingServices.filter((service) => service.bookingId === booking.id).map(attachBookingServiceRelations),
      vouchers: db.vouchers.filter((voucher) => voucher.bookingId === booking.id),
    };
  }

  const prisma: any = {
    $transaction: async (callback: any) => callback(prisma),
    company: {
      create: async ({ data }: any) => {
        const company = { id: nextId('company'), ...data, _count: { contacts: 0 } };
        db.companies.push(company);
        return company;
      },
      findFirst: async ({ where }: any) => db.companies.find((company) => matchesWhere(company, where)) || null,
      findUnique: async ({ where }: any) => db.companies.find((company) => company.id === where.id) || null,
    },
    contact: {
      create: async ({ data }: any) => {
        const contact = { id: nextId('contact'), ...data };
        db.contacts.push(contact);
        return contact;
      },
      findFirst: async ({ where }: any) => db.contacts.find((contact) => matchesWhere(contact, where)) || null,
    },
    activity: {
      create: async ({ data, include }: any) => {
        const activity = { id: nextId('activity'), ...data };
        db.activities.push(activity);
        return include?.supplierCompany
          ? { ...activity, supplierCompany: db.companies.find((company) => company.id === activity.supplierCompanyId) }
          : activity;
      },
      findMany: async () => db.activities.map((activity) => ({ ...activity, supplierCompany: db.companies.find((company) => company.id === activity.supplierCompanyId) })),
      findUnique: async ({ where, include }: any) => {
        const activity = db.activities.find((entry) => entry.id === where.id) || null;
        if (!activity) return null;
        return include?.supplierCompany
          ? { ...activity, supplierCompany: db.companies.find((company) => company.id === activity.supplierCompanyId) }
          : activity;
      },
      update: async ({ where, data, include }: any) => {
        const activity = db.activities.find((entry) => entry.id === where.id);
        Object.assign(activity, data);
        return include?.supplierCompany
          ? { ...activity, supplierCompany: db.companies.find((company) => company.id === activity.supplierCompanyId) }
          : activity;
      },
    },
    supplierService: {
      findUnique: async ({ where }: any) => db.supplierServices.find((service) => service.id === where.id) || null,
    },
    quote: {
      findFirst: async ({ where }: any) => {
        db.seenQuoteWheres.push(where);
        if (where?.revisedFromId) return db.quotes.find((quote) => quote.revisedFromId === where.revisedFromId) || null;
        if (where?.quoteNumber?.startsWith) return null;
        const quote = db.quotes.find((entry) => matchesWhere(entry, where)) || null;
        return quote ? attachQuoteRelations(quote) : null;
      },
      findUnique: async ({ where }: any) => {
        const quote = db.quotes.find((entry) => entry.id === where.id) || null;
        return quote ? attachQuoteRelations(quote) : null;
      },
      create: async ({ data }: any) => {
        const quote = {
          id: nextId('quote'),
          status: 'DRAFT',
          acceptedVersionId: null,
          sentAt: null,
          acceptedAt: null,
          createdAt: new Date('2026-04-27T00:00:00.000Z'),
          updatedAt: new Date('2026-04-27T00:00:00.000Z'),
          revisionNumber: 1,
          revisedFromId: null,
          ...data,
        };
        db.quotes.push(quote);
        return attachQuoteRelations(quote);
      },
      update: async ({ where, data }: any) => {
        const quote = db.quotes.find((entry) => entry.id === where.id);
        Object.assign(quote, data);
        return attachQuoteRelations(quote);
      },
    },
    quoteItem: {
      create: async ({ data }: any) => {
        const item = { id: nextId('quote-item'), ...data };
        db.quoteItems.push(item);
        return attachQuoteItemRelations(item);
      },
      findMany: async ({ where }: any) => db.quoteItems.filter((item) => matchesWhere(item, where)).map(attachQuoteItemRelations),
    },
    itinerary: {
      create: async ({ data }: any) => {
        const day = { id: nextId('itinerary'), ...data };
        db.itineraries.push(day);
        return day;
      },
      findUnique: async ({ where }: any) => db.itineraries.find((day) => day.id === where.id) || null,
      findMany: async ({ where }: any) => db.itineraries.filter((day) => matchesWhere(day, where)),
    },
    quoteItineraryDay: {
      findUnique: async () => null,
    },
    quoteItineraryDayItem: {
      findFirst: async () => null,
      create: async () => ({}),
    },
    quoteOption: {
      findUnique: async () => null,
      findMany: async () => [],
    },
    quotePricingSlab: {
      findMany: async () => [],
    },
    quoteScenario: {
      findMany: async () => [],
    },
    invoice: {
      findUnique: async () => null,
    },
    quoteVersion: {
      findFirst: async ({ where }: any) => db.quoteVersions.find((version) => matchesWhere(version, where)) || null,
      findUnique: async ({ where }: any) => db.quoteVersions.find((version) => version.id === where.id) || null,
      findMany: async ({ where }: any) => db.quoteVersions.filter((version) => matchesWhere(version, where)),
    },
    supplier: {
      findMany: async ({ where }: any) => {
        db.seenSupplierWheres.push(where);
        const ids = where?.id?.in || [];
        return db.companies.filter((company) => ids.includes(company.id));
      },
      findUnique: async ({ where }: any) => db.companies.find((company) => company.id === where.id) || null,
    },
    booking: {
      findFirst: async ({ where }: any) => {
        db.seenBookingWheres.push(where);
        if (where?.bookingRef?.startsWith) return null;
        const booking = db.bookings.find((entry) => matchesWhere(entry, where)) || null;
        return booking ? attachBookingRelations(booking) : null;
      },
      create: async ({ data }: any) => {
        const booking = {
          id: nextId('booking'),
          bookingRef: data.bookingRef,
          status: data.status || 'draft',
          ...data,
        };
        delete booking.days;
        delete booking.services;
        db.bookings.push(booking);

        for (const day of data.days?.create || []) {
          db.bookingDays.push({ id: nextId('booking-day'), bookingId: booking.id, ...day });
        }
        for (const service of data.services?.create || []) {
          db.bookingServices.push({ id: nextId('booking-service'), bookingId: booking.id, ...service });
        }
        return attachBookingRelations(booking);
      },
      update: async ({ where, data }: any) => {
        const booking = db.bookings.find((entry) => entry.id === where.id);
        Object.assign(booking, data);
        return attachBookingRelations(booking);
      },
    },
    bookingDay: {
      findFirst: async ({ where }: any) => {
        const day = db.bookingDays.find((entry) => entry.id === where.id && entry.bookingId === where.bookingId);
        return day
          ? {
              ...day,
              booking: attachBookingRelations(db.bookings.find((booking) => booking.id === day.bookingId)),
            }
          : null;
      },
      findMany: async ({ where }: any) => db.bookingDays.filter((day) => matchesWhere(day, where)),
    },
    bookingService: {
      count: async ({ where }: any) => db.bookingServices.filter((service) => matchesWhere(service, where)).length,
      findFirst: async ({ where }: any) => {
        const service = db.bookingServices.find((entry) => entry.id === where.id && entry.bookingId === where.bookingId);
        return service ? attachBookingServiceRelations(service) : null;
      },
      findMany: async ({ where }: any) => db.bookingServices.filter((service) => matchesWhere(service, where)).map(attachBookingServiceRelations),
      update: async ({ where, data }: any) => {
        const service = db.bookingServices.find((entry) => entry.id === where.id);
        Object.assign(service, data);
        return attachBookingServiceRelations(service);
      },
      create: async ({ data }: any) => {
        const service = { id: nextId('booking-service'), ...data };
        db.bookingServices.push(service);
        return attachBookingServiceRelations(service);
      },
    },
    bookingPassenger: {
      create: async ({ data }: any) => {
        const passenger = { id: nextId('passenger'), ...data };
        db.passengers.push(passenger);
        return passenger;
      },
      findMany: async ({ where }: any) => db.passengers.filter((passenger) => matchesWhere(passenger, where)),
      updateMany: async () => ({ count: 0 }),
    },
    voucher: {
      create: async ({ data }: any) => {
        const voucher = { id: nextId('voucher'), ...data, issuedAt: null };
        db.vouchers.push(voucher);
        return {
          ...voucher,
          supplier: db.companies.find((company) => company.id === voucher.supplierId) || null,
          bookingService: attachBookingServiceRelations(db.bookingServices.find((service) => service.id === voucher.bookingServiceId)),
        };
      },
      findFirst: async ({ where }: any) => {
        const voucher = db.vouchers.find((entry) => entry.id === where.id) || null;
        if (!voucher) return null;
        return {
          ...voucher,
          booking: attachBookingRelations(db.bookings.find((booking) => booking.id === voucher.bookingId)),
          supplier: db.companies.find((company) => company.id === voucher.supplierId) || null,
          bookingService: attachBookingServiceRelations(db.bookingServices.find((service) => service.id === voucher.bookingServiceId)),
        };
      },
    },
    bookingAuditLog: {
      create: async () => ({}),
      findMany: async () => [],
    },
    bookingRoomingEntry: {
      create: async ({ data }: any) => ({ id: nextId('rooming-entry'), ...data }),
      findMany: async () => [],
    },
    bookingRoomingAssignment: {
      create: async ({ data }: any) => ({ id: nextId('rooming-assignment'), ...data }),
    },
    payment: {
      findMany: async () => [],
    },
    route: {
      findUnique: async () => null,
    },
  };

  const activitiesService = new ActivitiesService(prisma);
  const quotesService = new QuotesService(
    prisma,
    { log: async () => null },
    {},
    {},
    new QuotePricingService(),
  );
  const bookingsService = new BookingsService(prisma, { log: async () => null });
  createPdfTextCapture(bookingsService);

  (quotesService as any).recalculateQuoteTotals = async (quoteId: string) => {
    const quote = db.quotes.find((entry) => entry.id === quoteId);
    const items = db.quoteItems.filter((item) => item.quoteId === quoteId);
    quote.totalCost = Number(items.reduce((total, item) => total + Number(item.totalCost || 0), 0).toFixed(2));
    quote.totalSell = Number(items.reduce((total, item) => total + Number(item.totalSell || 0), 0).toFixed(2));
    quote.totalPrice = quote.totalSell;
    quote.pricePerPax = Number((quote.totalSell / Math.max(1, quote.adults + quote.children)).toFixed(2));
  };
  (quotesService as any).loadQuoteState = async (quoteId: string) => {
    const quote = db.quotes.find((entry) => entry.id === quoteId);
    return quote ? attachQuoteRelations(quote) : null;
  };

  return {
    db,
    prisma,
    activitiesService,
    quotesService,
    bookingsService,
    proposalService: new ProposalV3Service(quotesService),
  };
}

test('DMC full flow with first-class Activities preserves multi-company pricing operations and document safety', async () => {
  const { db, prisma, activitiesService, quotesService, bookingsService, proposalService } = createDmcFlowHarness();

  const supplierCompany = await prisma.company.create({
    data: { name: 'Petra Experiences Supplier', type: 'supplier', city: 'Wadi Musa', country: 'Jordan' },
  });
  const clientCompany = await prisma.company.create({
    data: { name: 'Global Agent Client', type: 'agent', city: 'Madrid', country: 'Spain' },
  });
  const contact = await prisma.contact.create({
    data: { firstName: 'Lina', lastName: 'Haddad', email: 'lina@example.test', companyId: clientCompany.id },
  });
  db.supplierServices.push({
    id: 'service-activity',
    name: 'Activity catalog service',
    category: 'Activity',
    supplierId: supplierCompany.id,
    serviceTypeId: 'service-type-activity',
    serviceType: { id: 'service-type-activity', name: 'Activity', code: 'ACTIVITY', isActive: true },
    unitType: 'per_person',
    baseCost: 0,
    currency: 'USD',
    entranceFee: null,
  });

  const activity = await activitiesService.create({
    name: 'Petra by Night',
    description: 'Candle-lit evening visit',
    supplierCompanyId: supplierCompany.id,
    pricingBasis: 'PER_PERSON',
    costPrice: 35,
    sellPrice: 55,
    durationMinutes: 120,
  });

  assert.equal(activity.supplierCompanyId, supplierCompany.id);
  assert.equal((await activitiesService.findOne(activity.id)).id, activity.id);

  await assert.rejects(
    () =>
      quotesService.create(
        {
          clientCompanyId: clientCompany.id,
          contactId: contact.id,
          title: 'Unauthenticated quote',
          quoteCurrency: 'USD',
          quoteType: 'FIT',
          bookingType: 'FIT',
          adults: 2,
          children: 1,
          roomCount: 1,
          nightCount: 1,
          travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
          validUntil: new Date('2026-05-01T00:00:00.000Z'),
        } as any,
      undefined,
    ),
    /company context|authenticated company/i,
  );

  const quote = await quotesService.create(
    {
      clientCompanyId: clientCompany.id,
      contactId: contact.id,
      title: 'Jordan Activity Quote',
      description: 'First-class activity flow',
      quoteCurrency: 'USD',
      quoteType: 'FIT',
      bookingType: 'FIT',
      pricingMode: 'FIXED',
      fixedPricePerPerson: 55,
      adults: 2,
      children: 1,
      roomCount: 1,
      nightCount: 1,
      travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
      validUntil: new Date('2026-05-01T00:00:00.000Z'),
    } as any,
    actor,
  );
  const itinerary = await prisma.itinerary.create({
    data: { quoteId: quote.id, dayNumber: 1, title: 'Petra touring', description: 'Evening experience' },
  });

  const quoteItem = await quotesService.createItem(
    {
      quoteId: quote.id,
      serviceId: 'service-activity',
      activityId: activity.id,
      itineraryId: itinerary.id,
      serviceDate: new Date('2026-06-01T00:00:00.000Z'),
      startTime: '20:30',
      pickupTime: '19:45',
      pickupLocation: 'Hotel lobby',
      meetingPoint: 'Visitor center',
      participantCount: 3,
      adultCount: 2,
      childCount: 1,
      paxCount: 3,
      quantity: 1,
      reconfirmationRequired: true,
      reconfirmationDueAt: new Date('2026-05-31T18:00:00.000Z'),
    } as any,
    actor,
  );

  assert.equal(quoteItem.activityId, activity.id);
  assert.equal(quoteItem.supplierId, undefined);
  assert.equal(quoteItem.costBaseAmount, 35);
  assert.equal(quoteItem.totalCost, 105);
  assert.equal(quoteItem.totalSell, 165);
  assert.equal(quoteItem.activity.supplierCompany.id, supplierCompany.id);

  const incompleteQuote = {
    ...db.quotes.find((entry) => entry.id === quote.id),
    id: 'quote-incomplete',
    status: 'DRAFT',
    acceptedVersionId: null,
  };
  db.quotes.push(incompleteQuote);
  db.quoteItems.push({
    ...db.quoteItems.find((entry) => entry.id === quoteItem.id),
    id: 'quote-item-incomplete',
    quoteId: incompleteQuote.id,
    startTime: null,
    pickupTime: null,
    pickupLocation: null,
    meetingPoint: null,
    reconfirmationDueAt: '2026-05-31T18:00:00.000Z',
  });

  await assert.rejects(
    () => quotesService.updateStatus(incompleteQuote.id, { status: 'SENT' as any }, actor),
    /complete all activity dates, timing, location, participant counts/i,
  );

  const acceptedSnapshot = {
    ...attachQuoteForSnapshot(db, quote.id),
    status: 'ACCEPTED',
    acceptedVersionId: 'quote-version-1',
  };
  db.quoteVersions.push({
    id: 'quote-version-1',
    quoteId: quote.id,
    snapshotJson: acceptedSnapshot,
    booking: null,
  });
  await prisma.quote.update({
    where: { id: quote.id },
    data: { status: 'ACCEPTED', acceptedVersionId: 'quote-version-1', acceptedAt: new Date('2026-04-28T00:00:00.000Z') },
  });

  const booking = await quotesService.convertToBooking(quote.id, actor);
  assert.equal(booking.clientCompanyId, clientCompany.id);

  const bookingService = db.bookingServices.find((service) => service.activityId === activity.id);
  assert.ok(bookingService);
  assert.equal(bookingService.operationType, 'ACTIVITY');
  assert.equal(bookingService.supplierId, supplierCompany.id);
  assert.equal(bookingService.totalCost, 105);
  assert.equal(bookingService.totalSell, 165);

  const bookingDay = db.bookingDays.find((day) => day.bookingId === booking.id);
  bookingService.bookingDayId = bookingDay.id;
  const updatedBookingService = await bookingsService.updateBookingService(booking.id, bookingDay.id, bookingService.id, {
    type: 'ACTIVITY',
    supplierId: supplierCompany.id,
    pickupTime: '20:00',
    notes: 'Petra by Night supplier reconfirmed. Meet at hotel lobby.',
    status: 'CONFIRMED',
    companyActor: actor,
  });

  assert.equal(updatedBookingService.supplierId, supplierCompany.id);
  assert.equal(updatedBookingService.operationStatus, 'CONFIRMED');
  assert.equal(updatedBookingService.pickupTime, '20:00');

  db.passengers.push({
    id: 'passenger-1',
    bookingId: booking.id,
    fullName: 'Rana Saleh',
    firstName: 'Rana',
    lastName: 'Saleh',
    nationality: 'Jordanian',
    passportNumber: 'P9988776',
    passportExpiryDate: new Date('2031-01-01T00:00:00.000Z'),
    dateOfBirth: new Date('1990-02-03T00:00:00.000Z'),
    entryPoint: 'QAIA',
  });

  const voucher = await bookingsService.createServiceVoucher(booking.id, bookingService.id, {
    companyActor: actor,
  });
  assert.equal(voucher.supplierId, supplierCompany.id);
  assert.equal(voucher.type, 'ACTIVITY');

  const proposalHtml = await proposalService.getProposalHtml(quote.id, actor);
  assert.ok(proposalHtml);
  assert.match(proposalHtml, /Petra by Night/);
  assert.doesNotMatch(proposalHtml, /Supplier cost|costBaseAmount|totalCost|supplierCost/i);
  assert.doesNotMatch(proposalHtml, /P9988776|passport/i);

  const guaranteeBuffer = await bookingsService.generateGuaranteeLetterPdf(booking.id, actor);
  const guaranteeText = guaranteeBuffer.toString('utf8');
  assert.match(guaranteeText, /Petra touring/);
  assert.match(guaranteeText, /Rana Saleh/);
  assert.doesNotMatch(guaranteeText, /totalCost|totalSell|margin|supplier cost/i);

  const voucherBuffer = await bookingsService.generateServiceVoucherPdf(voucher.id, actor);
  const voucherText = voucherBuffer.toString('utf8');
  assert.match(voucherText, /Activity Voucher/);
  assert.match(voucherText, /Petra by Night/);
  assert.doesNotMatch(voucherText, /105|totalCost|totalSell|margin|supplier cost/i);
  assert.doesNotMatch(voucherText, /P9988776|passport/i);

  assert.ok(db.seenQuoteWheres.every((where) => where.clientCompanyId === undefined && where.companyId === undefined));
  assert.ok(db.seenSupplierWheres.every((where) => where.clientCompanyId === undefined && where.companyId === undefined));
  assert.notEqual(actor.companyId, clientCompany.id);
  assert.notEqual(actor.companyId, supplierCompany.id);

  const cancelledQuote = await quotesService.create(
    {
      clientCompanyId: clientCompany.id,
      contactId: contact.id,
      title: 'Cancelled Activity Quote',
      quoteCurrency: 'USD',
      quoteType: 'FIT',
      bookingType: 'FIT',
      adults: 1,
      children: 0,
      roomCount: 1,
      nightCount: 1,
      travelStartDate: new Date('2026-07-01T00:00:00.000Z'),
      validUntil: new Date('2026-06-01T00:00:00.000Z'),
    } as any,
    actor,
  );
  await quotesService.cancelQuote(cancelledQuote.id, actor);
  await assert.rejects(
    () => quotesService.convertToBooking(cancelledQuote.id, actor),
    /Cancelled quotes cannot be converted to bookings/,
  );

  await bookingsService.cancelBooking(booking.id, {
    actor: { userId: actor.userId, label: 'DMC Admin' },
    companyActor: actor,
  });
  const cancelledBooking = db.bookings.find((entry) => entry.id === booking.id);
  assert.equal(cancelledBooking.status, 'cancelled');
  assert.ok(db.bookingServices.some((service) => service.id === bookingService.id && service.activityId === activity.id));
  assert.ok(db.vouchers.some((entry) => entry.id === voucher.id));
});

function attachQuoteForSnapshot(db: any, quoteId: string) {
  const quote = db.quotes.find((entry: any) => entry.id === quoteId);
  const clientCompany = db.companies.find((company: any) => company.id === quote.clientCompanyId);
  const contact = db.contacts.find((entry: any) => entry.id === quote.contactId);
  const itineraries = db.itineraries.filter((day: any) => day.quoteId === quoteId);
  const quoteItems = db.quoteItems
    .filter((item: any) => item.quoteId === quoteId)
    .map((item: any) => {
      const service = db.supplierServices.find((entry: any) => entry.id === item.serviceId);
      const activity = item.activityId ? db.activities.find((entry: any) => entry.id === item.activityId) : null;
      return {
        ...item,
        serviceDate: item.serviceDate instanceof Date ? item.serviceDate.toISOString() : item.serviceDate,
        reconfirmationDueAt: item.reconfirmationDueAt instanceof Date ? item.reconfirmationDueAt.toISOString() : item.reconfirmationDueAt,
        service: {
          id: service.id,
          name: activity?.name || service.name,
          category: service.category,
          supplierId: activity?.supplierCompanyId || service.supplierId,
          serviceType: service.serviceType,
        },
        activity,
      };
    });

  return {
    ...quote,
    clientCompany,
    company: clientCompany,
    contact,
    itineraries,
    quoteItems,
    quoteOptions: [],
    pricingSlabs: [],
    scenarios: [],
  };
}
