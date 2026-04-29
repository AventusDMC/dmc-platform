import test = require('node:test');
import assert = require('node:assert/strict');
import { PATH_METADATA } from '@nestjs/common/constants';
const { QuotesService } = require('./quotes.service');
const { QuotesController } = require('./quotes.controller');
const { QuotePricingService } = require('./quote-pricing.service');

function createQuotesService(prisma: any = {}) {
  return new QuotesService(
    prisma,
    { log: async () => null } as any,
    {} as any,
    {} as any,
    new QuotePricingService(),
  );
}

function createBaseQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-1',
    quoteNumber: 'Q-1',
    clientCompanyId: 'company-1',
    brandCompanyId: null,
    contactId: 'contact-1',
    agentId: null,
    title: 'Recovered Quote',
    description: 'Quote detail should still load',
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
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    updatedAt: new Date('2026-04-27T00:00:00.000Z'),
    ...overrides,
  };
}

test('quote detail returns base quote when optional relation loads fail after migration recovery', async () => {
  const originalConsoleError = console.error;
  const loggedErrors: any[] = [];
  console.error = (...args: any[]) => {
    loggedErrors.push(args);
  };

  try {
    const service = createQuotesService({
      quote: {
        findFirst: async () => createBaseQuote(),
      },
      company: {
        findUnique: async () => {
          throw new Error('relation company branding failed');
        },
      },
      contact: {
        findUnique: async () => {
          throw new Error('relation contact failed');
        },
      },
      quotePricingSlab: {
        findMany: async () => {
          throw new Error('relation pricing slabs failed');
        },
      },
      quoteItem: {
        findMany: async () => {
          throw new Error('relation quote items failed');
        },
      },
      itinerary: {
        findMany: async () => {
          throw new Error('relation itineraries failed');
        },
      },
      quoteOption: {
        findMany: async () => {
          throw new Error('relation quote options failed');
        },
      },
      quoteScenario: {
        findMany: async () => {
          throw new Error('relation scenarios failed');
        },
      },
      invoice: {
        findUnique: async () => {
          throw new Error('relation invoice failed');
        },
      },
      booking: {
        findUnique: async () => {
          throw new Error('relation booking failed');
        },
      },
    });

    const quote = await service.findOne('quote-1', { companyId: 'company-1' });

    assert.equal(quote.id, 'quote-1');
    assert.deepEqual(quote.quoteItems, []);
    assert.deepEqual(quote.itineraries, []);
    assert.deepEqual(quote.quoteOptions, []);
    assert.deepEqual(quote.scenarios, []);
    assert.equal(quote.invoice, null);
    assert.equal(quote.booking, null);
    assert.ok(loggedErrors.some((entry) => entry[0] === '[quote/findById]' && entry[1] === 'quoteItems'));
  } finally {
    console.error = originalConsoleError;
  }
});

test('quote versions endpoint returns empty list when versions relation fails after migration recovery', async () => {
  const originalConsoleError = console.error;
  const loggedErrors: any[] = [];
  console.error = (...args: any[]) => {
    loggedErrors.push(args);
  };

  try {
    const service = createQuotesService({
      quoteVersion: {
        findMany: async () => {
          throw new Error('relation quote versions failed');
        },
      },
    });

    const versions = await service.findVersions('quote-1');

    assert.deepEqual(versions, []);
    assert.ok(loggedErrors.some((entry) => entry[0] === '[quote/findById]' && entry[1] === 'versions'));
  } finally {
    console.error = originalConsoleError;
  }
});

test('quotes controller exposes explicit cancel route', () => {
  const routePath = (Reflect as any).getMetadata(PATH_METADATA, QuotesController.prototype.cancelQuote);
  assert.equal(routePath, ':id/cancel');
  const requotePath = (Reflect as any).getMetadata(PATH_METADATA, QuotesController.prototype.requote);
  assert.equal(requotePath, ':id/requote');
});

test('cancel quote sets status to CANCELLED without deleting the quote', async () => {
  let updateData: any;
  const service = createQuotesService({
    quote: {
      findFirst: async () => ({
        id: 'quote-1',
        status: 'SENT',
        acceptedVersionId: null,
        sentAt: new Date('2026-04-27T00:00:00.000Z'),
        acceptedAt: null,
        pricingType: 'simple',
        pricingMode: 'FIXED',
        pricingSlabs: [],
      }),
      update: async ({ data }: any) => {
        updateData = data;
        return createBaseQuote({
          status: data.status,
          acceptedVersionId: data.acceptedVersionId,
          sentAt: data.sentAt,
          acceptedAt: data.acceptedAt,
          clientCompany: { id: 'company-1', name: 'Client Co' },
          brandCompany: null,
          contact: { id: 'contact-1', firstName: 'Lina', lastName: 'Haddad' },
          pricingSlabs: [],
        });
      },
    },
  });

  const quote = await service.cancelQuote('quote-1', { companyId: 'company-1' });

  assert.equal(quote.status, 'CANCELLED');
  assert.equal(updateData.status, 'CANCELLED');
});

test('cancelled quote conversion is rejected before creating a booking', async () => {
  const tx = {
    quote: {
      findFirst: async () => ({
        id: 'quote-1',
        status: 'CANCELLED',
        acceptedVersionId: 'version-1',
        booking: null,
      }),
    },
  };
  const service = createQuotesService({
    quote: {
      findFirst: async () => null,
    },
    $transaction: async (callback: any) => callback(tx),
  });

  await assert.rejects(
    () => service.convertToBooking('quote-1', { companyId: 'company-1' }),
    /Cancelled quotes cannot be converted to bookings/,
  );
});

test('re-quote clones quote into a new revision and leaves original unchanged', async () => {
  let createdQuoteData: any;
  const createdItems: any[] = [];
  const original = {
    ...createBaseQuote({
      id: 'quote-1',
      revisionNumber: 1,
      revisedFromId: null,
      clientCompanyId: 'client-company-1',
      brandCompanyId: 'brand-company-1',
      contactId: 'contact-1',
      agentId: 'agent-1',
      status: 'ACCEPTED',
      acceptedVersionId: 'version-1',
      sentAt: new Date('2026-04-27T00:00:00.000Z'),
      acceptedAt: new Date('2026-04-28T00:00:00.000Z'),
      publicToken: 'public-token',
      publicEnabled: true,
    }),
    pricingSlabs: [{ minPax: 1, maxPax: null, price: 100, focPax: 0, notes: null }],
    itineraries: [{ id: 'itinerary-1', dayNumber: 1, title: 'Arrival', description: 'Arrive' }],
    quoteOptions: [{ id: 'option-1', name: 'Option A', notes: null, hotelCategoryId: null, pricingMode: 'itemized', packageMarginPercent: null }],
    quoteItems: [{
      id: 'item-1',
      optionId: 'option-1',
      itineraryId: 'itinerary-1',
      serviceId: 'service-1',
      serviceDate: null,
      startTime: null,
      pickupTime: null,
      pickupLocation: null,
      meetingPoint: null,
      participantCount: null,
      adultCount: null,
      childCount: null,
      reconfirmationRequired: false,
      reconfirmationDueAt: null,
      hotelId: null,
      contractId: null,
      seasonId: null,
      seasonName: null,
      roomCategoryId: null,
      occupancyType: null,
      mealPlan: null,
      quantity: 1,
      paxCount: null,
      roomCount: null,
      nightCount: null,
      dayCount: null,
      baseCost: 50,
      overrideCost: null,
      overrideReason: null,
      useOverride: false,
      markupPercent: 20,
      markupAmount: null,
      sellPrice: null,
      currency: 'USD',
      pricingDescription: null,
      customServiceName: null,
      unitCost: null,
      pricingBasis: null,
      country: null,
      supplierName: null,
      startDay: null,
      endDay: null,
      startDate: null,
      endDate: null,
      netCost: null,
      includes: null,
      excludes: null,
      internalNotes: null,
      clientDescription: null,
      transportServiceTypeId: null,
      routeId: null,
      appliedVehicleRateId: null,
    }],
    scenarios: [{ paxCount: 2, totalCost: 100, totalSell: 130, pricePerPax: 65 }],
  };
  const tx = {
    quote: {
      findFirst: async ({ where }: any) => (where?.quoteNumber ? null : original),
      create: async ({ data }: any) => {
        createdQuoteData = data;
        return { id: 'quote-2', ...data };
      },
    },
    itinerary: {
      create: async () => ({ id: 'itinerary-2' }),
    },
    quoteOption: {
      create: async () => ({ id: 'option-2' }),
    },
    quotePricingSlab: {
      create: async () => ({}),
    },
    quoteItem: {
      create: async ({ data }: any) => {
        createdItems.push(data);
        return { id: 'item-2', ...data };
      },
    },
    quoteScenario: {
      create: async () => ({}),
    },
  };
  const service = createQuotesService({
    quote: {
      findFirst: async ({ where }: any) => (where?.id === 'quote-1' ? original : null),
    },
    $transaction: async (callback: any) => callback(tx),
  });
  (service as any).loadQuoteState = async (quoteId: string) => ({ id: quoteId, revisionNumber: 2, revisedFromId: 'quote-1' });

  const revised = await service.requote('quote-1', { companyId: 'dmc-company-1' });

  assert.equal(revised.id, 'quote-2');
  assert.equal(createdQuoteData.clientCompanyId, 'client-company-1');
  assert.equal(createdQuoteData.revisionNumber, 2);
  assert.equal(createdQuoteData.revisedFromId, 'quote-1');
  assert.equal(createdQuoteData.status, 'DRAFT');
  assert.equal(createdQuoteData.acceptedVersionId, null);
  assert.equal(createdItems[0].quoteId, 'quote-2');
  assert.equal(createdItems[0].optionId, 'option-2');
  assert.equal(createdItems[0].itineraryId, 'itinerary-2');
});

test('old quote revisions cannot be converted to bookings', async () => {
  const service = createQuotesService({
    $transaction: async () => {
      throw new Error('conversion should not start');
    },
  });
  (service as any).assertLatestQuoteRevision = async () => {
    throw new Error('Only the latest quote revision can be changed or converted');
  };

  await assert.rejects(
    () => service.convertToBooking('quote-1', { companyId: 'company-1' }),
    /Only the latest quote revision/,
  );
});

test('accepted quote conversion creates booking with client company pax dates and booking days', async () => {
  let bookingCreateData: any;
  const tx = {
    quote: {
      findFirst: async () => ({
        id: 'quote-1',
        clientCompanyId: 'client-company-1',
        status: 'ACCEPTED',
        acceptedVersionId: 'version-1',
        booking: null,
      }),
    },
    quoteVersion: {
      findFirst: async () => ({
        id: 'version-1',
        quoteId: 'quote-1',
        booking: null,
        snapshotJson: {
          bookingType: 'FIT',
          clientCompany: { id: 'client-company-1', name: 'Client Co' },
          contact: { firstName: 'Lina', lastName: 'Haddad' },
          adults: 2,
          children: 1,
          roomCount: 2,
          nightCount: 2,
          travelStartDate: '2026-06-01T00:00:00.000Z',
          itineraries: [
            { id: 'day-1', dayNumber: 1, title: 'Arrival', description: 'Arrival day' },
            { id: 'day-2', dayNumber: 2, title: 'Petra', description: 'Touring day' },
          ],
          quoteItems: [],
        },
      }),
    },
    supplier: {
      findMany: async () => [],
    },
    booking: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        bookingCreateData = data;
        return {
          id: 'booking-1',
          bookingRef: data.bookingRef,
          quoteId: data.quoteId,
          ...data,
        };
      },
    },
    bookingPassenger: {
      create: async () => ({ id: 'passenger-1' }),
    },
    bookingRoomingEntry: {
      create: async () => ({ id: 'room-1' }),
    },
    bookingRoomingAssignment: {
      create: async () => ({}),
    },
  };
  const service = createQuotesService({
    quote: {
      findFirst: async () => null,
    },
    $transaction: async (callback: any) => callback(tx),
  });

  const booking = await service.convertToBooking('quote-1', { companyId: 'dmc-company-1' });

  assert.equal(booking.id, 'booking-1');
  assert.equal(bookingCreateData.quoteId, 'quote-1');
  assert.equal(bookingCreateData.clientCompanyId, 'client-company-1');
  assert.equal(bookingCreateData.pax, 3);
  assert.equal(bookingCreateData.startDate.toISOString(), '2026-06-01T00:00:00.000Z');
  assert.equal(bookingCreateData.endDate.toISOString(), '2026-06-03T00:00:00.000Z');
  assert.equal(bookingCreateData.days.create.length, 3);
});

test('accepted multi-country quote conversion creates booking with hotel and external package services', async () => {
  let bookingCreateData: any;
  const tx = {
    quote: {
      findFirst: async () => ({
        id: 'quote-1',
        clientCompanyId: 'company-1',
        status: 'ACCEPTED',
        acceptedVersionId: 'version-1',
        booking: null,
      }),
    },
    quoteVersion: {
      findFirst: async () => ({
        id: 'version-1',
        quoteId: 'quote-1',
        booking: null,
        snapshotJson: {
          bookingType: 'FIT',
          clientCompany: { id: 'company-1', name: 'Client Co' },
          contact: { firstName: 'Lina', lastName: 'Haddad', email: 'lina@example.test' },
          adults: 2,
          children: 0,
          roomCount: 1,
          nightCount: 4,
          travelStartDate: '2026-06-01T00:00:00.000Z',
          itineraries: [
            { id: 'day-1', dayNumber: 1, title: 'Arrival Amman', description: 'Jordan arrival and hotel' },
            { id: 'day-3', dayNumber: 3, title: 'Egypt extension', description: 'Partner Egypt program' },
          ],
          quoteItems: [
            {
              id: 'item-jordan-hotel',
              itineraryId: 'day-1',
              quantity: 2,
              pricingDescription: 'Jordan hotel confirmed from contract',
              totalCost: 240,
              totalSell: 300,
              service: {
                name: 'Amman Hotel',
                category: 'Hotel',
                supplierId: 'supplier-hotel',
              },
            },
            {
              id: 'item-egypt-package',
              itineraryId: 'day-3',
              quantity: 1,
              pricingDescription: 'Egypt external package | per group',
              totalCost: 900,
              totalSell: 1170,
              service: {
                name: 'Egypt Cairo Extension',
                category: 'External Package',
                supplierId: 'supplier-egypt',
              },
            },
          ],
        },
      }),
    },
    supplier: {
      findUnique: async () => null,
    },
    booking: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        bookingCreateData = data;
        return {
          id: 'booking-1',
          bookingRef: data.bookingRef,
          quoteId: data.quoteId,
          ...data,
        };
      },
    },
    bookingPassenger: {
      create: async () => ({ id: 'passenger-1' }),
    },
    bookingRoomingEntry: {
      create: async () => ({ id: 'room-1' }),
    },
    bookingRoomingAssignment: {
      create: async () => ({}),
    },
  };
  const service = createQuotesService({
    quote: {
      findFirst: async () => null,
    },
    $transaction: async (callback: any) => callback(tx),
  });

  await service.convertToBooking('quote-1', { companyId: 'company-1' });

  assert.equal(bookingCreateData.clientCompanyId, 'company-1');
  assert.equal(bookingCreateData.pax, 2);
  assert.equal(bookingCreateData.days.create.length, 5);
  assert.equal(bookingCreateData.services.create.length, 2);

  const hotelService = bookingCreateData.services.create.find((entry: any) => entry.sourceQuoteItemId === 'item-jordan-hotel');
  assert.equal(hotelService.operationType, 'HOTEL');
  assert.equal(hotelService.supplierId, null);
  assert.equal(hotelService.supplierName, 'supplier-hotel');
  assert.equal(hotelService.totalCost, 240);
  assert.equal(hotelService.totalSell, 300);

  const externalPackageService = bookingCreateData.services.create.find((entry: any) => entry.sourceQuoteItemId === 'item-egypt-package');
  assert.equal(externalPackageService.operationType, 'EXTERNAL_PACKAGE');
  assert.equal(externalPackageService.serviceType, 'External Package');
  assert.equal(externalPackageService.supplierId, null);
  assert.equal(externalPackageService.supplierName, 'supplier-egypt');
  assert.equal(externalPackageService.description, 'Egypt Cairo Extension');
  assert.equal(externalPackageService.notes, 'Egypt external package | per group');
  assert.equal(externalPackageService.totalCost, 900);
  assert.equal(externalPackageService.totalSell, 1170);
});

test('accepted DMC quote conversion preserves transport service for client and supplier companies different from actor', async () => {
  let bookingCreateData: any;
  const quoteLookupWheres: any[] = [];
  const tx = {
    quote: {
      findFirst: async ({ where }: any) => {
        quoteLookupWheres.push(where);
        return {
          id: 'quote-transport-1',
          clientCompanyId: 'client-company-1',
          status: 'ACCEPTED',
          acceptedVersionId: 'version-transport-1',
          booking: null,
        };
      },
    },
    quoteVersion: {
      findFirst: async () => ({
        id: 'version-transport-1',
        quoteId: 'quote-transport-1',
        booking: null,
        snapshotJson: {
          bookingType: 'FIT',
          clientCompany: { id: 'client-company-1', name: 'Agent Client Co' },
          contact: { firstName: 'Lina', lastName: 'Haddad' },
          adults: 3,
          children: 1,
          roomCount: 2,
          nightCount: 1,
          travelStartDate: '2026-06-01T00:00:00.000Z',
          itineraries: [
            { id: 'day-1', dayNumber: 1, serviceDate: '2026-06-01T10:00:00.000Z', title: 'Arrival transfer' },
          ],
          quoteItems: [
            {
              id: 'item-transport-1',
              itineraryId: 'day-1',
              quantity: 1,
              pricingDescription: 'QAIA to Petra | Mercedes Vito | Per vehicle',
              totalCost: 120,
              totalSell: 165,
              service: {
                name: 'Private arrival transfer',
                category: 'Transport',
                supplierId: null,
              },
              appliedVehicleRate: {
                routeId: 'route-1',
                routeName: 'QAIA to Petra',
                vehicle: {
                  id: 'vehicle-1',
                  name: 'Mercedes Vito',
                  supplierId: 'supplier-company-1',
                },
              },
            },
          ],
        },
      }),
    },
    supplier: {
      findUnique: async () => null,
    },
    booking: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        bookingCreateData = data;
        return { id: 'booking-transport-1', ...data };
      },
    },
    bookingPassenger: {
      create: async () => ({ id: 'passenger-1' }),
    },
    bookingRoomingEntry: {
      create: async () => ({ id: 'room-1' }),
    },
    bookingRoomingAssignment: {
      create: async () => ({}),
    },
  };
  const service = createQuotesService({
    quote: {
      findFirst: async () => null,
    },
    $transaction: async (callback: any) => callback(tx),
  });

  await service.convertToBooking('quote-transport-1', { companyId: 'dmc-company-1' });

  assert.ok(quoteLookupWheres.some((where) => where.id === 'quote-transport-1'));
  assert.ok(quoteLookupWheres.every((where) => where.clientCompanyId === undefined));
  assert.equal(bookingCreateData.clientCompanyId, 'client-company-1');
  assert.equal(bookingCreateData.services.create.length, 1);

  const transportService = bookingCreateData.services.create[0];
  assert.equal(transportService.operationType, 'TRANSPORT');
  assert.equal(transportService.supplierId, null);
  assert.equal(transportService.supplierName, 'supplier-company-1');
  assert.equal(transportService.totalCost, 120);
  assert.equal(transportService.totalSell, 165);
  assert.equal(transportService.status, 'ready');
});

test('accepted DMC quote conversion preserves activity booking service for external client and supplier', async () => {
  let bookingCreateData: any;
  const tx = {
    quote: {
      findFirst: async ({ where }: any) => {
        if (where.revisedFromId) return null;
        return {
          id: 'quote-activity-1',
          clientCompanyId: 'client-company-1',
          status: 'ACCEPTED',
          acceptedVersionId: 'version-activity-1',
          booking: null,
        };
      },
    },
    quoteVersion: {
      findFirst: async () => ({
        id: 'version-activity-1',
        quoteId: 'quote-activity-1',
        booking: null,
        snapshotJson: {
          bookingType: 'FIT',
          clientCompany: { id: 'client-company-1', name: 'Agent Client Co' },
          contact: { firstName: 'Lina', lastName: 'Haddad' },
          adults: 3,
          children: 1,
          roomCount: 2,
          nightCount: 1,
          travelStartDate: '2026-06-01T00:00:00.000Z',
          itineraries: [
            { id: 'day-1', dayNumber: 1, serviceDate: '2026-06-01T20:30:00.000Z', title: 'Petra touring' },
          ],
          quoteItems: [
            {
              id: 'item-activity-1',
              activityId: 'catalog-activity-1',
              itineraryId: 'day-1',
              quantity: 1,
              participantCount: 4,
              adultCount: 3,
              childCount: 1,
              startTime: '20:30',
              pickupTime: '19:45',
              pickupLocation: 'Hotel lobby',
              meetingPoint: 'Visitor center',
              pricingDescription: 'Petra by Night guided experience',
              totalCost: 140,
              totalSell: 210,
              reconfirmationRequired: true,
              reconfirmationDueAt: '2026-05-31T18:00:00.000Z',
              service: {
                name: 'Petra by Night',
                category: 'Activity',
                supplierId: 'supplier-activity-1',
              },
            },
          ],
        },
      }),
    },
    supplier: {
      findUnique: async () => null,
    },
    booking: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        bookingCreateData = data;
        return { id: 'booking-activity-1', ...data };
      },
    },
    bookingPassenger: {
      create: async () => ({ id: 'passenger-1' }),
    },
    bookingRoomingEntry: {
      create: async () => ({ id: 'room-1' }),
    },
    bookingRoomingAssignment: {
      create: async () => ({}),
    },
  };
  const service = createQuotesService({
    quote: {
      findFirst: async () => null,
    },
    $transaction: async (callback: any) => callback(tx),
  });

  await service.convertToBooking('quote-activity-1', { companyId: 'dmc-company-1' });

  assert.equal(bookingCreateData.clientCompanyId, 'client-company-1');
  assert.equal(bookingCreateData.services.create.length, 1);
  const activityService = bookingCreateData.services.create[0];
  assert.equal(activityService.operationType, 'ACTIVITY');
  assert.equal(activityService.activityId, 'catalog-activity-1');
  assert.equal(activityService.serviceType, 'Activity');
  assert.equal(activityService.supplierId, null);
  assert.equal(activityService.supplierName, 'supplier-activity-1');
  assert.equal(activityService.totalCost, 140);
  assert.equal(activityService.totalSell, 210);
  assert.equal(activityService.participantCount, 4);
  assert.equal(activityService.pickupLocation, 'Hotel lobby');
});

test('buildBookingServicesFromAcceptedVersion carries resolved supplier and ready status into booking services', async () => {
  const service = createQuotesService();
  const supplierId = '11111111-1111-4111-8111-111111111111';

  const bookingServices = await (service as any).buildBookingServicesFromAcceptedVersion(
    {
      travelStartDate: '2026-05-10T00:00:00.000Z',
      itineraries: [
        {
          id: 'day-1',
          dayNumber: 1,
          serviceDate: '2026-05-10T09:00:00.000Z',
        },
      ],
      quoteItems: [
        {
          id: 'item-1',
          itineraryId: 'day-1',
          quantity: 2,
          pricingDescription: 'Airport transfer',
          totalCost: 100,
          totalSell: 140,
          service: {
            name: 'Private Transfer',
            category: 'Transport',
            supplierId,
          },
        },
        {
          id: 'item-2',
          quantity: 1,
          pricingDescription: 'Meet and assist',
          totalCost: 35,
          totalSell: 45,
          service: {
            name: 'Meet and Assist',
            category: 'Operations',
          },
        },
        {
          id: 'item-3',
          itineraryId: 'day-1',
          quantity: 1,
          participantCount: 5,
          adultCount: 4,
          childCount: 1,
          startTime: '08:30',
          pickupTime: '08:00',
          pickupLocation: 'Hotel lobby',
          meetingPoint: 'Visitor center',
          pricingDescription: 'Sunrise jeep tour',
          totalCost: 120,
          totalSell: 180,
          reconfirmationRequired: true,
          reconfirmationDueAt: '2026-05-09T18:00:00.000Z',
          service: {
            name: 'Sunrise Jeep Tour',
            category: 'Activity',
            supplierId,
          },
        },
      ],
      adults: 2,
      children: 1,
    },
    {
      supplier: {
        findUnique: async ({ where }: any) =>
          where.id === supplierId
            ? {
                id: supplierId,
                name: 'Desert Compass Transport',
              }
            : null,
      },
    },
  );

  assert.equal(bookingServices.length, 3);
  assert.equal(bookingServices[0].supplierId, supplierId);
  assert.equal(bookingServices[0].supplierName, 'Desert Compass Transport');
  assert.equal(bookingServices[0].status, 'ready');
  assert.equal(bookingServices[0].serviceOrder, 0);
  assert.equal(bookingServices[0].serviceDate, '2026-05-10T09:00:00.000Z');
  assert.equal(bookingServices[0].notes, 'Airport transfer');
  assert.equal(bookingServices[0].confirmationStatus, 'pending');

  const meetAssist = bookingServices.find((entry: any) => entry.description === 'Meet and Assist');
  assert.equal(meetAssist.supplierId, null);
  assert.equal(meetAssist.supplierName, null);
  assert.equal(meetAssist.status, 'pending');

  const activity = bookingServices.find((entry: any) => entry.description === 'Sunrise Jeep Tour');
  assert.equal(activity.serviceType, 'Activity');
  assert.equal(activity.serviceDate, '2026-05-10T09:00:00.000Z');
  assert.equal(activity.startTime, '08:30');
  assert.equal(activity.pickupTime, '08:00');
  assert.equal(activity.pickupLocation, 'Hotel lobby');
  assert.equal(activity.meetingPoint, 'Visitor center');
  assert.equal(activity.participantCount, 5);
  assert.equal(activity.adultCount, 4);
  assert.equal(activity.childCount, 1);
  assert.equal(activity.reconfirmationRequired, true);
  assert.equal(activity.reconfirmationDueAt, '2026-05-09T18:00:00.000Z');
});

test('buildBookingServicesFromAcceptedVersion logs unresolved supplier names without blocking conversion', async () => {
  const service = createQuotesService();
  const originalConsoleWarn = console.warn;
  const warnings: any[] = [];
  console.warn = (...args: any[]) => {
    warnings.push(args);
  };

  try {
    const bookingServices = await (service as any).buildBookingServicesFromAcceptedVersion(
      {
        travelStartDate: '2026-05-10T00:00:00.000Z',
        quoteItems: [
          {
            id: 'item-unresolved-supplier',
            quantity: 1,
            pricingDescription: 'Legacy transport',
            totalCost: 100,
            totalSell: 140,
            service: {
              name: 'Legacy Transfer',
              category: 'Transport',
              supplierName: 'Legacy Supplier',
            },
          },
        ],
      },
      {
        supplier: {
          findUnique: async () => null,
        },
      },
    );

    assert.equal(bookingServices.length, 1);
    assert.equal(bookingServices[0].supplierId, null);
    assert.equal(bookingServices[0].supplierName, 'Legacy Supplier');
    assert.equal(bookingServices[0].status, 'ready');
    assert.deepEqual(warnings[0], [
      '[quote/convert-to-booking] unresolved supplier',
      {
        quoteItemId: 'item-unresolved-supplier',
        supplierName: 'Legacy Supplier',
        supplierId: null,
      },
    ]);
  } finally {
    console.warn = originalConsoleWarn;
  }
});

test('buildBookingServicesFromAcceptedVersion resolves activity dates from itinerary day and quote travel start date', async () => {
  const service = createQuotesService();

  const bookingServices = await (service as any).buildBookingServicesFromAcceptedVersion(
    {
      travelStartDate: '2026-06-01T00:00:00.000Z',
      itineraries: [
        {
          id: 'day-3',
          dayNumber: 3,
        },
      ],
      quoteItems: [
        {
          id: 'item-activity',
          itineraryId: 'day-3',
          quantity: 1,
          startTime: '09:00',
          meetingPoint: 'Camp gate',
          participantCount: 2,
          adultCount: 2,
          childCount: 0,
          totalCost: 50,
          totalSell: 80,
          service: {
            name: 'Desert Walk',
            category: 'Activity',
          },
        },
      ],
      adults: 2,
      children: 0,
    },
    {
      supplier: {
        findMany: async () => [],
      },
    },
  );

  assert.equal(bookingServices[0].serviceDate, '2026-06-03T00:00:00.000Z');
});

test('buildBookingDaysFromAcceptedVersion creates dated booking days from quote timeline', () => {
  const service = createQuotesService();

  const bookingDays = (service as any).buildBookingDaysFromAcceptedVersion({
    travelStartDate: '2026-06-01T00:00:00.000Z',
    nightCount: 2,
    itineraries: [
      {
        dayNumber: 1,
        title: 'Arrival in Amman',
        description: 'Meet and assist.',
      },
      {
        dayNumber: 3,
        title: 'Petra touring',
        description: 'Full day touring.',
      },
    ],
  });

  assert.equal(bookingDays.length, 3);
  assert.equal(bookingDays[0].dayNumber, 1);
  assert.equal(bookingDays[0].date.toISOString(), '2026-06-01T00:00:00.000Z');
  assert.equal(bookingDays[0].status, 'PENDING');
  assert.equal(bookingDays[1].dayNumber, 2);
  assert.equal(bookingDays[1].title, 'Day 2');
  assert.equal(bookingDays[2].date.toISOString(), '2026-06-03T00:00:00.000Z');
});
