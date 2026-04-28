import test = require('node:test');
import assert = require('node:assert/strict');
const { ActivitiesService } = require('../activities/activities.service');
const { BookingsService } = require('../bookings/bookings.service');
const { calculateProfitSummary } = require('./profit');
const { QuotePricingService } = require('../quotes/quote-pricing.service');
const { ProposalV3Service } = require('../quotes/proposal-v3.service');
const { QuotesService } = require('../quotes/quotes.service');

const actor = {
  userId: 'user-dmc-admin',
  companyId: 'dmc-company',
  role: 'admin',
};

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

function capturePdfText(service: any) {
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

function createPricingHarness() {
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
  };

  const ids = new Map<string, number>();
  const nextId = (prefix: string) => {
    const next = (ids.get(prefix) || 0) + 1;
    ids.set(prefix, next);
    return `${prefix}-${next}`;
  };

  function attachQuoteItem(item: any) {
    const service = db.supplierServices.find((entry) => entry.id === item.serviceId) || null;
    const activity = item.activityId ? db.activities.find((entry) => entry.id === item.activityId) || null : null;

    return {
      ...item,
      service,
      activity: activity
        ? {
            ...activity,
            supplierCompany: db.companies.find((company) => company.id === activity.supplierCompanyId) || null,
          }
        : null,
      itinerary: item.itineraryId ? db.itineraries.find((day) => day.id === item.itineraryId) || null : null,
    };
  }

  function attachQuote(quote: any) {
    const clientCompany = db.companies.find((company) => company.id === quote.clientCompanyId) || null;
    const contact = db.contacts.find((entry) => entry.id === quote.contactId) || null;

    return {
      ...quote,
      clientCompany,
      company: clientCompany,
      brandCompany: null,
      contact,
      quoteItems: db.quoteItems.filter((item) => item.quoteId === quote.id).map(attachQuoteItem),
      itineraries: db.itineraries.filter((day) => day.quoteId === quote.id),
      quoteOptions: [],
      pricingSlabs: [],
      scenarios: [],
      invoice: null,
      booking: db.bookings.find((booking) => booking.quoteId === quote.id) || null,
    };
  }

  function attachBookingService(service: any) {
    return {
      ...service,
      supplier: service.supplierId ? db.companies.find((company) => company.id === service.supplierId) || null : null,
      vehicle: null,
      bookingDay: service.bookingDayId ? db.bookingDays.find((day) => day.id === service.bookingDayId) || null : null,
    };
  }

  function attachBooking(booking: any) {
    return {
      ...booking,
      quote: attachQuote(db.quotes.find((quote) => quote.id === booking.quoteId) || {}),
      days: db.bookingDays.filter((day) => day.bookingId === booking.id),
      passengers: db.passengers.filter((passenger) => passenger.bookingId === booking.id),
      services: db.bookingServices.filter((service) => service.bookingId === booking.id).map(attachBookingService),
      vouchers: db.vouchers.filter((voucher) => voucher.bookingId === booking.id),
    };
  }

  const prisma: any = {
    $transaction: async (callback: any) => callback(prisma),
    company: {
      create: async ({ data }: any) => {
        const company = { id: nextId('company'), ...data };
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
        return include?.supplierCompany ? attachActivity(activity) : activity;
      },
      findUnique: async ({ where, include }: any) => {
        const activity = db.activities.find((entry) => entry.id === where.id) || null;
        if (!activity) return null;
        return include?.supplierCompany ? attachActivity(activity) : activity;
      },
      findMany: async () => db.activities.map(attachActivity),
    },
    supplierService: {
      findUnique: async ({ where }: any) => db.supplierServices.find((service) => service.id === where.id) || null,
    },
    quote: {
      findFirst: async ({ where }: any) => {
        if (where?.revisedFromId) return db.quotes.find((quote) => quote.revisedFromId === where.revisedFromId) || null;
        if (where?.quoteNumber?.startsWith) return null;
        const quote = db.quotes.find((entry) => matchesWhere(entry, where)) || null;
        return quote ? attachQuote(quote) : null;
      },
      findUnique: async ({ where }: any) => {
        const quote = db.quotes.find((entry) => entry.id === where.id) || null;
        return quote ? attachQuote(quote) : null;
      },
      create: async ({ data }: any) => {
        const quote = {
          id: nextId('quote'),
          quoteNumber: `Q-2026-${String(db.quotes.length + 1).padStart(4, '0')}`,
          status: 'DRAFT',
          acceptedVersionId: null,
          acceptedAt: null,
          revisionNumber: 1,
          revisedFromId: null,
          createdAt: new Date('2026-04-28T00:00:00.000Z'),
          updatedAt: new Date('2026-04-28T00:00:00.000Z'),
          ...data,
        };
        db.quotes.push(quote);
        return attachQuote(quote);
      },
      update: async ({ where, data }: any) => {
        const quote = db.quotes.find((entry) => entry.id === where.id);
        Object.assign(quote, data);
        return attachQuote(quote);
      },
    },
    quoteItem: {
      create: async ({ data }: any) => {
        const item = { id: nextId('quote-item'), ...data };
        db.quoteItems.push(item);
        return attachQuoteItem(item);
      },
      findMany: async ({ where }: any) => db.quoteItems.filter((item) => matchesWhere(item, where)).map(attachQuoteItem),
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
        const ids = where?.id?.in || [];
        return db.companies.filter((company) => ids.includes(company.id));
      },
      findUnique: async ({ where }: any) => db.companies.find((company) => company.id === where.id) || null,
    },
    booking: {
      findFirst: async ({ where }: any) => {
        if (where?.bookingRef?.startsWith) return null;
        const booking = db.bookings.find((entry) => matchesWhere(entry, where)) || null;
        return booking ? attachBooking(booking) : null;
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

        return attachBooking(booking);
      },
      update: async ({ where, data }: any) => {
        const booking = db.bookings.find((entry) => entry.id === where.id);
        Object.assign(booking, data);
        return attachBooking(booking);
      },
    },
    bookingDay: {
      create: async ({ data }: any) => {
        const day = { id: nextId('booking-day'), ...data };
        db.bookingDays.push(day);
        return day;
      },
      findFirst: async ({ where }: any) => {
        const day = db.bookingDays.find((entry) => matchesWhere(entry, where));
        return day ? { ...day, booking: attachBooking(db.bookings.find((booking) => booking.id === day.bookingId)) } : null;
      },
      findMany: async ({ where }: any) => db.bookingDays.filter((day) => matchesWhere(day, where)),
    },
    bookingService: {
      count: async ({ where }: any) => db.bookingServices.filter((service) => matchesWhere(service, where)).length,
      create: async ({ data }: any) => {
        const service = { id: nextId('booking-service'), ...data };
        db.bookingServices.push(service);
        return attachBookingService(service);
      },
      findFirst: async ({ where }: any) => {
        const service = db.bookingServices.find((entry) => matchesWhere(entry, where)) || null;
        return service ? attachBookingService(service) : null;
      },
      findMany: async ({ where }: any) => db.bookingServices.filter((service) => matchesWhere(service, where)).map(attachBookingService),
      update: async ({ where, data }: any) => {
        const service = db.bookingServices.find((entry) => entry.id === where.id);
        Object.assign(service, data);
        return attachBookingService(service);
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
    bookingRoomingEntry: {
      create: async ({ data }: any) => ({ id: nextId('rooming-entry'), ...data }),
      findMany: async () => [],
    },
    bookingRoomingAssignment: {
      create: async ({ data }: any) => ({ id: nextId('rooming-assignment'), ...data }),
    },
    voucher: {
      create: async ({ data }: any) => {
        const voucher = { id: nextId('voucher'), issuedAt: null, ...data };
        db.vouchers.push(voucher);
        return {
          ...voucher,
          supplier: db.companies.find((company) => company.id === voucher.supplierId) || null,
          bookingService: attachBookingService(db.bookingServices.find((service) => service.id === voucher.bookingServiceId)),
        };
      },
      findFirst: async ({ where }: any) => {
        const voucher = db.vouchers.find((entry) => matchesWhere(entry, where)) || null;
        if (!voucher) return null;
        return {
          ...voucher,
          booking: attachBooking(db.bookings.find((booking) => booking.id === voucher.bookingId)),
          supplier: db.companies.find((company) => company.id === voucher.supplierId) || null,
          bookingService: attachBookingService(db.bookingServices.find((service) => service.id === voucher.bookingServiceId)),
        };
      },
    },
    bookingAuditLog: {
      create: async () => ({}),
      findMany: async () => [],
    },
    payment: {
      findMany: async () => [],
    },
    route: {
      findUnique: async () => null,
    },
  };

  function attachActivity(activity: any) {
    return {
      ...activity,
      supplierCompany: db.companies.find((company) => company.id === activity.supplierCompanyId) || null,
    };
  }

  const activitiesService = new ActivitiesService(prisma);
  const quotesService = new QuotesService(prisma, { log: async () => null }, {}, {}, new QuotePricingService());
  const bookingsService = new BookingsService(prisma, { log: async () => null });
  capturePdfText(bookingsService);

  (quotesService as any).recalculateQuoteTotals = async (quoteId: string) => {
    const quote = db.quotes.find((entry) => entry.id === quoteId);
    const items = db.quoteItems.filter((item) => item.quoteId === quoteId);
    quote.totalCost = roundMoney(items.reduce((total, item) => total + Number(item.totalCost || 0), 0));
    quote.totalSell = roundMoney(items.reduce((total, item) => total + Number(item.totalSell || 0), 0));
    quote.marginAmount = roundMoney(quote.totalSell - quote.totalCost);
    quote.quoteCurrency = quote.quoteCurrency || 'USD';
    quote.pricePerPax = roundMoney(quote.totalSell / Math.max(1, Number(quote.adults || 0) + Number(quote.children || 0)));
  };
  (quotesService as any).loadQuoteState = async (quoteId: string) => {
    const quote = db.quotes.find((entry) => entry.id === quoteId);
    return quote ? attachQuote(quote) : null;
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

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function createSnapshot(db: any, quoteId: string) {
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

test('Quote to booking pricing and profit integrity stays stable with first-class Activities', async () => {
  const { db, prisma, activitiesService, quotesService, bookingsService, proposalService } = createPricingHarness();

  const clientCompany = await prisma.company.create({ data: { name: 'Agent Client', type: 'agent' } });
  const supplierCompany = await prisma.company.create({ data: { name: 'Activity Supplier', type: 'supplier' } });
  const hotelSupplier = await prisma.company.create({ data: { name: 'Hotel Supplier', type: 'supplier' } });
  const transportSupplier = await prisma.company.create({ data: { name: 'Transport Supplier', type: 'supplier' } });
  const contact = await prisma.contact.create({
    data: { firstName: 'Lina', lastName: 'Haddad', email: 'lina@example.test', companyId: clientCompany.id },
  });

  db.supplierServices.push(
    {
      id: 'service-activity',
      name: 'Activity catalog service',
      category: 'Activity',
      supplierId: supplierCompany.id,
      serviceType: { id: 'service-type-activity', name: 'Activity', code: 'ACTIVITY' },
      unitType: 'per_person',
      baseCost: 0,
      currency: 'USD',
      entranceFee: null,
    },
    {
      id: 'service-hotel',
      name: 'Amman Hotel',
      category: 'Hotel',
      supplierId: hotelSupplier.id,
      serviceType: { id: 'service-type-hotel', name: 'Hotel', code: 'HOTEL' },
    },
    {
      id: 'service-transport',
      name: 'Airport Transfer',
      category: 'Transport',
      supplierId: transportSupplier.id,
      serviceType: { id: 'service-type-transport', name: 'Transport', code: 'TRANSPORT' },
    },
  );

  const perPersonActivity = await activitiesService.create({
    name: 'Petra by Night',
    description: 'Evening experience',
    supplierCompanyId: supplierCompany.id,
    pricingBasis: 'PER_PERSON',
    costPrice: 35,
    sellPrice: 50,
    durationMinutes: 120,
  });
  const zeroCostActivity = await activitiesService.create({
    name: 'Welcome orientation',
    supplierCompanyId: supplierCompany.id,
    pricingBasis: 'PER_GROUP',
    costPrice: 0,
    sellPrice: 25,
    durationMinutes: 30,
  });
  const discountedGroupActivity = await activitiesService.create({
    name: 'Private cooking class',
    supplierCompanyId: supplierCompany.id,
    pricingBasis: 'PER_GROUP',
    costPrice: 120,
    sellPrice: 95,
    durationMinutes: 90,
  });

  const quote = await quotesService.create(
    {
      clientCompanyId: clientCompany.id,
      contactId: contact.id,
      title: 'Pricing integrity quote',
      quoteCurrency: 'USD',
      quoteType: 'FIT',
      bookingType: 'FIT',
      pricingMode: 'FIXED',
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
    data: { quoteId: quote.id, dayNumber: 1, title: 'Arrival and Petra', description: 'Hotel, transfer, and activity' },
  });

  const activityItem = await quotesService.createItem(
    {
      quoteId: quote.id,
      serviceId: 'service-activity',
      activityId: perPersonActivity.id,
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
    } as any,
    actor,
  );

  assert.equal(activityItem.totalCost, 105);
  assert.equal(activityItem.totalSell, 150);
  assert.equal(roundMoney(activityItem.totalSell - activityItem.totalCost), 45);
  assert.equal(activityItem.currency, 'USD');
  assert.equal(activityItem.costCurrency, 'USD');

  const zeroCostItem = await quotesService.createItem(
    {
      quoteId: quote.id,
      serviceId: 'service-activity',
      activityId: zeroCostActivity.id,
      itineraryId: itinerary.id,
      serviceDate: new Date('2026-06-01T00:00:00.000Z'),
      startTime: '18:00',
      meetingPoint: 'Hotel lobby',
      participantCount: 3,
      paxCount: 3,
      quantity: 1,
    } as any,
    actor,
  );
  assert.equal(zeroCostItem.totalCost, 0);
  assert.equal(zeroCostItem.totalSell, 25);

  const discountedItem = await quotesService.createItem(
    {
      quoteId: quote.id,
      serviceId: 'service-activity',
      activityId: discountedGroupActivity.id,
      itineraryId: itinerary.id,
      serviceDate: new Date('2026-06-01T00:00:00.000Z'),
      startTime: '15:00',
      meetingPoint: 'Cooking school',
      participantCount: 3,
      paxCount: 3,
      quantity: 1,
    } as any,
    actor,
  );
  assert.equal(discountedItem.totalCost, 120);
  assert.equal(discountedItem.totalSell, 95);
  assert.equal(roundMoney(discountedItem.totalSell - discountedItem.totalCost), -25);

  db.quoteItems.push(
    {
      id: 'quote-item-hotel',
      quoteId: quote.id,
      serviceId: 'service-hotel',
      itineraryId: itinerary.id,
      quantity: 1,
      paxCount: 3,
      baseCost: 220,
      costBaseAmount: 220,
      supplierCostBaseAmount: 220,
      supplierCostCurrency: 'USD',
      totalCost: 220,
      totalSell: 280,
      currency: 'USD',
      pricingDescription: 'Amman hotel contract rate',
    },
    {
      id: 'quote-item-transport',
      quoteId: quote.id,
      serviceId: 'service-transport',
      itineraryId: itinerary.id,
      quantity: 1,
      paxCount: 3,
      baseCost: 80,
      costBaseAmount: 80,
      supplierCostBaseAmount: 80,
      supplierCostCurrency: 'USD',
      totalCost: 80,
      totalSell: 110,
      currency: 'USD',
      pricingDescription: 'Airport transfer',
    },
  );
  await (quotesService as any).recalculateQuoteTotals(quote.id);

  const storedQuote = db.quotes.find((entry) => entry.id === quote.id);
  const quoteProfit = calculateProfitSummary({ totalCost: storedQuote.totalCost, totalSell: storedQuote.totalSell });
  assert.equal(storedQuote.totalCost, 525);
  assert.equal(storedQuote.totalSell, 660);
  assert.equal(storedQuote.marginAmount, 135);
  assert.equal(roundMoney(storedQuote.totalSell - storedQuote.totalCost), storedQuote.marginAmount);
  assert.deepEqual(quoteProfit, {
    totalCost: 525,
    totalSell: 660,
    grossProfit: 135,
    marginPercent: 20.45,
  });

  const snapshot = createSnapshot(db, quote.id);
  db.quoteVersions.push({ id: 'quote-version-1', quoteId: quote.id, snapshotJson: snapshot, booking: null });
  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      status: 'ACCEPTED',
      acceptedVersionId: 'quote-version-1',
      acceptedAt: new Date('2026-04-28T00:00:00.000Z'),
    },
  });

  const booking = await quotesService.convertToBooking(quote.id, actor);
  const bookingServices = db.bookingServices.filter((service) => service.bookingId === booking.id);
  const bookingProfit = calculateProfitSummary({
    totalCost: bookingServices.reduce((total, service) => total + Number(service.totalCost || 0), 0),
    totalSell: bookingServices.reduce((total, service) => total + Number(service.totalSell || 0), 0),
  });
  assert.equal(bookingServices.length, 5);
  assert.equal(roundMoney(bookingServices.reduce((total, service) => total + Number(service.totalCost || 0), 0)), 525);
  assert.equal(roundMoney(bookingServices.reduce((total, service) => total + Number(service.totalSell || 0), 0)), 660);
  assert.equal(roundMoney(bookingServices.reduce((total, service) => total + Number(service.totalSell || 0) - Number(service.totalCost || 0), 0)), 135);
  assert.deepEqual(bookingProfit, {
    totalCost: 525,
    totalSell: 660,
    grossProfit: 135,
    marginPercent: 20.45,
  });

  const convertedActivity = bookingServices.find((service) => service.activityId === perPersonActivity.id);
  assert.equal(convertedActivity.totalCost, activityItem.totalCost);
  assert.equal(convertedActivity.totalSell, activityItem.totalSell);

  const originalBookingStatusBeforeAmendment = booking.status;
  const amendedBooking = await bookingsService.amendBooking(booking.id, {
    actor: { userId: actor.userId, label: 'DMC Admin' },
    companyActor: actor,
  });
  const originalServicesAfterAmendment = db.bookingServices.filter((service) => service.bookingId === booking.id);
  const amendedServices = db.bookingServices.filter((service) => service.bookingId === amendedBooking.id);
  assert.equal(roundMoney(originalServicesAfterAmendment.reduce((total, service) => total + Number(service.totalCost || 0), 0)), 525);
  assert.equal(roundMoney(originalServicesAfterAmendment.reduce((total, service) => total + Number(service.totalSell || 0), 0)), 660);
  assert.equal(roundMoney(amendedServices.reduce((total, service) => total + Number(service.totalCost || 0), 0)), 525);
  assert.equal(roundMoney(amendedServices.reduce((total, service) => total + Number(service.totalSell || 0), 0)), 660);

  await assert.rejects(
    () =>
      bookingsService.cancelBooking(booking.id, {
        actor: { userId: actor.userId, label: 'DMC Admin' },
        companyActor: actor,
      }),
    /Only the latest booking amendment/,
  );

  await bookingsService.cancelBooking(amendedBooking.id, {
    actor: { userId: actor.userId, label: 'DMC Admin' },
    companyActor: actor,
  });
  const originalBookingAfterCancelAttempt = db.bookings.find((entry) => entry.id === booking.id);
  const cancelledBooking = db.bookings.find((entry) => entry.id === amendedBooking.id);
  const cancelledServices = db.bookingServices.filter((service) => service.bookingId === amendedBooking.id);
  assert.equal(originalBookingAfterCancelAttempt.status, originalBookingStatusBeforeAmendment);
  assert.equal(cancelledBooking.status, 'cancelled');
  assert.equal(roundMoney(cancelledServices.reduce((total, service) => total + Number(service.totalCost || 0), 0)), 525);
  assert.equal(roundMoney(cancelledServices.reduce((total, service) => total + Number(service.totalSell || 0), 0)), 660);

  const bookingDay = db.bookingDays.find((day) => day.bookingId === booking.id);
  convertedActivity.bookingDayId = bookingDay.id;
  convertedActivity.notes = 'Petra by Night operational voucher';
  const voucher = await bookingsService.createServiceVoucher(booking.id, convertedActivity.id, { companyActor: actor });

  const proposalHtml = await proposalService.getProposalHtml(quote.id, actor);
  assert.match(proposalHtml, /USD/);
  assert.match(proposalHtml, /660/);
  assert.doesNotMatch(proposalHtml, /Supplier cost|supplierCost|costBaseAmount|totalCost|total cost|gross profit/i);
  assert.doesNotMatch(proposalHtml, /USD 525/);

  const voucherText = (await bookingsService.generateServiceVoucherPdf(voucher.id, actor)).toString('utf8');
  assert.match(voucherText, /Activity Voucher/);
  assert.doesNotMatch(voucherText, /105|525|totalCost|totalSell|margin|supplier cost/i);
});
