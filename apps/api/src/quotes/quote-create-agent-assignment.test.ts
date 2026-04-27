const quoteCreateTest = require('node:test');
const quoteCreateAssert = require('node:assert/strict');
const { BadRequestException: QuoteCreateBadRequestException } = require('@nestjs/common');
const { QuotesService: QuoteCreateQuotesService } = require('./quotes.service');
const { QuotePricingService: QuoteCreateQuotePricingService } = require('./quote-pricing.service');

type CreateServiceOptions = {
  agentLookupResult?: { id: string } | null;
};

function createService(options: CreateServiceOptions = {}) {
  const calls: {
    userFindFirst: any[];
    quoteCreateData: any[];
  } = {
    userFindFirst: [],
    quoteCreateData: [],
  };

  const prisma = {
    company: {
      findFirst: async ({ where }: any) =>
        ['company-1', 'company-2'].includes(where.id) ? { id: where.id } : null,
    },
    contact: {
      findFirst: async ({ where }: any) => {
        if (where.id === 'contact-1') {
          return { id: 'contact-1', companyId: 'company-1' };
        }
        if (where.id === 'contact-2') {
          return { id: 'contact-2', companyId: 'company-2' };
        }
        return null;
      },
    },
    user: {
      findFirst: async (args: any) => {
        calls.userFindFirst.push(args);
        return options.agentLookupResult ?? null;
      },
    },
    $transaction: async (callback: any) =>
      callback({
        quote: {
          findFirst: async () => null,
          create: async (args: any) => {
            calls.quoteCreateData.push(args.data);
            return { id: 'quote-1' };
          },
        },
      }),
  };

  const service = new QuoteCreateQuotesService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    new QuoteCreateQuotePricingService(),
  );

  (service as any).recalculateQuoteTotals = async () => undefined;
  (service as any).loadQuoteState = async () => ({ id: 'quote-1' });

  return { service, calls };
}

function createQuoteInput(overrides: Record<string, unknown> = {}): any {
  return {
    clientCompanyId: 'company-1',
    brandCompanyId: 'company-1',
    contactId: 'contact-1',
    bookingType: 'FIT',
    title: 'Test quote',
    description: '',
    pricingMode: 'FIXED',
    pricingType: 'simple',
    fixedPricePerPerson: null,
    pricingSlabs: [],
    focType: 'none',
    focRatio: null,
    focCount: null,
    focRoomType: null,
    adults: 2,
    children: 0,
    roomCount: 1,
    nightCount: 1,
    singleSupplement: null,
    travelStartDate: null,
    validUntil: null,
    quoteCurrency: 'USD',
    ...overrides,
  };
}

quoteCreateTest('create quote without agent succeeds and does not validate agent', async () => {
  const { service, calls } = createService();

  const result = await service.create(createQuoteInput(), { companyId: 'company-1' } as any);

  quoteCreateAssert.equal(result.id, 'quote-1');
  quoteCreateAssert.equal(calls.userFindFirst.length, 0);
  quoteCreateAssert.equal(calls.quoteCreateData[0].agentId, null);
});

quoteCreateTest('create quote with no quoteType succeeds as FIT', async () => {
  const { service, calls } = createService();

  const result = await service.create(createQuoteInput({ quoteType: undefined }), { companyId: 'company-1' } as any);

  quoteCreateAssert.equal(result.id, 'quote-1');
  quoteCreateAssert.equal(calls.quoteCreateData[0].quoteType, 'FIT');
  quoteCreateAssert.equal(calls.quoteCreateData[0].bookingType, 'FIT');
});

quoteCreateTest('create quote with FIT quoteType succeeds', async () => {
  const { service, calls } = createService();

  const result = await service.create(createQuoteInput({ quoteType: 'FIT', bookingType: 'GROUP' }), { companyId: 'company-1' } as any);

  quoteCreateAssert.equal(result.id, 'quote-1');
  quoteCreateAssert.equal(calls.quoteCreateData[0].quoteType, 'FIT');
  quoteCreateAssert.equal(calls.quoteCreateData[0].bookingType, 'GROUP');
});

quoteCreateTest('create quote with GROUP quoteType succeeds', async () => {
  const { service, calls } = createService();

  const result = await service.create(createQuoteInput({ quoteType: 'GROUP', bookingType: 'FIT' }), { companyId: 'company-1' } as any);

  quoteCreateAssert.equal(result.id, 'quote-1');
  quoteCreateAssert.equal(calls.quoteCreateData[0].quoteType, 'GROUP');
  quoteCreateAssert.equal(calls.quoteCreateData[0].bookingType, 'FIT');
});

quoteCreateTest('create quote for a different managed company succeeds', async () => {
  const { service, calls } = createService();

  const result = await service.create(
    createQuoteInput({
      clientCompanyId: 'company-2',
      brandCompanyId: 'company-2',
      contactId: 'contact-2',
    }),
    { companyId: 'company-1' } as any,
  );

  quoteCreateAssert.equal(result.id, 'quote-1');
  quoteCreateAssert.equal(calls.quoteCreateData[0].clientCompanyId, 'company-2');
  quoteCreateAssert.equal(calls.quoteCreateData[0].brandCompanyId, 'company-2');
  quoteCreateAssert.equal(calls.quoteCreateData[0].contactId, 'contact-2');
});

quoteCreateTest('update quote uses requested client company and does not filter by actor company', async () => {
  const quoteFindWheres: any[] = [];
  let quoteUpdateData: any;
  const prisma = {
    quote: {
      findFirst: async ({ where }: any) => {
        quoteFindWheres.push(where);
        return {
          id: 'quote-1',
          clientCompanyId: 'company-1',
          brandCompanyId: 'company-1',
          contactId: 'contact-1',
          agentId: null,
          status: 'DRAFT',
          sentAt: null,
          acceptedAt: null,
          acceptedVersionId: null,
          pricingType: 'simple',
          pricingMode: 'FIXED',
          fixedPricePerPerson: null,
          focType: 'none',
          focRatio: null,
          focCount: null,
          focRoomType: null,
          quoteCurrency: 'USD',
        };
      },
    },
    company: {
      findFirst: async ({ where }: any) =>
        ['company-1', 'company-2'].includes(where.id) ? { id: where.id } : null,
    },
    contact: {
      findFirst: async ({ where }: any) =>
        where.id === 'contact-2' ? { id: 'contact-2', companyId: 'company-2' } : null,
    },
    user: {
      findFirst: async () => null,
    },
    $transaction: async (callback: any) =>
      callback({
        quote: {
          update: async ({ data }: any) => {
            quoteUpdateData = data;
            return { id: 'quote-1' };
          },
        },
        quotePricingSlab: {
          deleteMany: async () => ({ count: 0 }),
          createMany: async () => ({ count: 0 }),
        },
      }),
  };
  const service = new QuoteCreateQuotesService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    new QuoteCreateQuotePricingService(),
  );
  (service as any).recalculateQuoteTotals = async () => undefined;
  (service as any).loadQuoteState = async () => ({ id: 'quote-1', clientCompanyId: 'company-2' });

  const result = await service.update(
    'quote-1',
    {
      clientCompanyId: 'company-2',
      brandCompanyId: 'company-2',
      contactId: 'contact-2',
      quoteCurrency: 'USD',
    } as any,
    { companyId: 'dmc-company-1' } as any,
  );

  quoteCreateAssert.ok(quoteFindWheres.some((where) => where.id === 'quote-1' && where.clientCompanyId === undefined));
  quoteCreateAssert.ok(quoteFindWheres.some((where) => where.revisedFromId === 'quote-1'));
  quoteCreateAssert.equal(quoteUpdateData.clientCompanyId, 'company-2');
  quoteCreateAssert.equal(quoteUpdateData.brandCompanyId, 'company-2');
  quoteCreateAssert.equal(quoteUpdateData.contactId, 'contact-2');
  quoteCreateAssert.equal(result.clientCompanyId, 'company-2');
});

quoteCreateTest('quote create and update still require authenticated company context', async () => {
  const { service } = createService();

  await quoteCreateAssert.rejects(
    () => service.create(createQuoteInput(), undefined as any),
    /Company context is required/,
  );

  await quoteCreateAssert.rejects(
    () => service.update('quote-1', { clientCompanyId: 'company-2' } as any, undefined as any),
    /Company context is required/,
  );
});

quoteCreateTest('DMC admin can add activity item to quote for external client without actor-company filtering', async () => {
  const quoteFindWheres: any[] = [];
  let createdItemData: any;
  const prisma = {
    quote: {
      findFirst: async ({ where }: any) => {
        quoteFindWheres.push(where);
        if (where.revisedFromId) return null;
        return { id: 'quote-1', clientCompanyId: 'client-company-1' };
      },
      findUnique: async ({ where }: any) => ({
        id: where.id,
        clientCompanyId: 'client-company-1',
        adults: 3,
        children: 1,
        roomCount: 2,
        nightCount: 1,
        quoteCurrency: 'USD',
        jordanPassType: 'NONE',
        travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-04-27T00:00:00.000Z'),
      }),
    },
    supplierService: {
      findUnique: async ({ where }: any) => ({
        id: where.id,
        supplierId: 'supplier-company-1',
        name: 'Petra by Night',
        category: 'Activity',
        unitType: 'per_person',
        baseCost: 40,
        currency: 'USD',
        costBaseAmount: 35,
        costCurrency: 'USD',
        salesTaxPercent: 0,
        salesTaxIncluded: false,
        serviceChargePercent: 0,
        serviceChargeIncluded: false,
        tourismFeeAmount: null,
        tourismFeeCurrency: null,
        tourismFeeMode: null,
        serviceType: { name: 'Activity', code: 'ACTIVITY' },
        entranceFee: null,
      }),
    },
    activity: {
      findUnique: async ({ where }: any) => ({
        id: where.id,
        name: 'Petra by Night Catalog',
        supplierCompanyId: 'supplier-company-1',
        pricingBasis: 'PER_PERSON',
        costPrice: 35,
        sellPrice: 52.5,
        durationMinutes: 120,
        active: true,
        supplierCompany: { id: 'supplier-company-1', name: 'Petra Experiences' },
      }),
    },
    itinerary: {
      findUnique: async () => null,
    },
    quoteItineraryDay: {
      findUnique: async () => null,
    },
    quoteOption: {
      findUnique: async () => null,
    },
    quoteItem: {
      create: async ({ data }: any) => {
        createdItemData = data;
        return { id: 'item-activity-1', ...data };
      },
    },
  };
  const service = new QuoteCreateQuotesService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    new QuoteCreateQuotePricingService(),
  );
  (service as any).recalculateQuoteTotals = async () => undefined;

  const item = await service.createItem(
    {
      quoteId: 'quote-1',
      serviceId: 'activity-1',
      activityId: 'catalog-activity-1',
      paxCount: 4,
      adultCount: 3,
      childCount: 1,
      participantCount: 4,
      serviceDate: new Date('2026-06-01T00:00:00.000Z'),
      startTime: '20:30',
      pickupTime: '19:45',
      pickupLocation: 'Hotel lobby',
      meetingPoint: 'Visitor center',
      markupPercent: 20,
      sellPrice: 210,
    } as any,
    { companyId: 'dmc-company-1' } as any,
  );

  quoteCreateAssert.equal(item.id, 'item-activity-1');
  quoteCreateAssert.ok(quoteFindWheres.some((where) => where.id === 'quote-1'));
  quoteCreateAssert.ok(quoteFindWheres.every((where) => where.clientCompanyId === undefined));
  quoteCreateAssert.equal(createdItemData.quoteId, 'quote-1');
  quoteCreateAssert.equal(createdItemData.serviceId, 'activity-1');
  quoteCreateAssert.equal(createdItemData.activityId, 'catalog-activity-1');
  quoteCreateAssert.equal(createdItemData.costBaseAmount, 35);
  quoteCreateAssert.equal(createdItemData.costCurrency, 'USD');
  quoteCreateAssert.equal(createdItemData.totalCost, 140);
  quoteCreateAssert.equal(createdItemData.totalSell, 210);
  quoteCreateAssert.equal(createdItemData.participantCount, 4);
});

quoteCreateTest('create quote with invalid quoteType returns clear bad request', async () => {
  const { service } = createService();

  await quoteCreateAssert.rejects(
    () => service.create(createQuoteInput({ quoteType: 'SERIES' }), { companyId: 'company-1' } as any),
    (error: any) => {
      quoteCreateAssert.equal(error instanceof QuoteCreateBadRequestException, true);
      quoteCreateAssert.equal(error.message, 'quoteType must be FIT or GROUP');
      return true;
    },
  );
});

quoteCreateTest('create quote with valid same-company agent succeeds', async () => {
  const { service, calls } = createService({ agentLookupResult: { id: 'agent-1' } });

  const result = await service.create(createQuoteInput({ agentId: ' agent-1 ' }), { companyId: 'company-1' } as any);

  quoteCreateAssert.equal(result.id, 'quote-1');
  quoteCreateAssert.deepEqual(calls.userFindFirst[0].where, {
    id: 'agent-1',
    companyId: 'company-1',
    role: {
      name: 'agent',
    },
  });
  quoteCreateAssert.equal(calls.quoteCreateData[0].agentId, 'agent-1');
});

quoteCreateTest('create quote with non-agent fails', async () => {
  const { service, calls } = createService({ agentLookupResult: null });

  await quoteCreateAssert.rejects(
    () => service.create(createQuoteInput({ agentId: 'viewer-1' }), { companyId: 'company-1' } as any),
    (error: any) => {
      quoteCreateAssert.equal(error instanceof QuoteCreateBadRequestException, true);
      quoteCreateAssert.equal(error.message, 'Assigned agent must be an agent user in the current company');
      return true;
    },
  );

  quoteCreateAssert.deepEqual(calls.userFindFirst[0].where, {
    id: 'viewer-1',
    companyId: 'company-1',
    role: {
      name: 'agent',
    },
  });
});

quoteCreateTest('create quote with other-company agent fails', async () => {
  const { service, calls } = createService({ agentLookupResult: null });

  await quoteCreateAssert.rejects(
    () => service.create(createQuoteInput({ agentId: 'other-company-agent-1' }), { companyId: 'company-1' } as any),
    (error: any) => {
      quoteCreateAssert.equal(error instanceof QuoteCreateBadRequestException, true);
      quoteCreateAssert.equal(error.message, 'Assigned agent must be an agent user in the current company');
      return true;
    },
  );

  quoteCreateAssert.deepEqual(calls.userFindFirst[0].where, {
    id: 'other-company-agent-1',
    companyId: 'company-1',
    role: {
      name: 'agent',
    },
  });
});
