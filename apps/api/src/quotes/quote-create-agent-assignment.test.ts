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
      findFirst: async ({ where }: any) => (where.id === 'company-1' ? { id: 'company-1' } : null),
    },
    contact: {
      findFirst: async ({ where }: any) =>
        where.id === 'contact-1' && where.companyId === 'company-1'
          ? { id: 'contact-1', companyId: 'company-1' }
          : null,
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
