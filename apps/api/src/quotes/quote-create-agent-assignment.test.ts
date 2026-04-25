const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const { QuotesService } = require('./quotes.service');
const { QuotePricingService } = require('./quote-pricing.service');

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

  const service = new QuotesService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    new QuotePricingService(),
  );

  (service as any).recalculateQuoteTotals = async () => undefined;
  (service as any).loadQuoteState = async () => ({ id: 'quote-1' });

  return { service, calls };
}

function createQuoteInput(overrides: Record<string, unknown> = {}) {
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

test('create quote without agent succeeds and does not validate agent', async () => {
  const { service, calls } = createService();

  const result = await service.create(createQuoteInput(), { companyId: 'company-1' } as any);

  assert.equal(result.id, 'quote-1');
  assert.equal(calls.userFindFirst.length, 0);
  assert.equal(calls.quoteCreateData[0].agentId, null);
});

test('create quote with valid same-company agent succeeds', async () => {
  const { service, calls } = createService({ agentLookupResult: { id: 'agent-1' } });

  const result = await service.create(createQuoteInput({ agentId: ' agent-1 ' }), { companyId: 'company-1' } as any);

  assert.equal(result.id, 'quote-1');
  assert.deepEqual(calls.userFindFirst[0].where, {
    id: 'agent-1',
    companyId: 'company-1',
    role: {
      name: 'agent',
    },
  });
  assert.equal(calls.quoteCreateData[0].agentId, 'agent-1');
});

test('create quote with non-agent fails', async () => {
  const { service, calls } = createService({ agentLookupResult: null });

  await assert.rejects(
    () => service.create(createQuoteInput({ agentId: 'viewer-1' }), { companyId: 'company-1' } as any),
    (error: any) => {
      assert.equal(error instanceof BadRequestException, true);
      assert.equal(error.message, 'Assigned agent must be an agent user in the current company');
      return true;
    },
  );

  assert.deepEqual(calls.userFindFirst[0].where, {
    id: 'viewer-1',
    companyId: 'company-1',
    role: {
      name: 'agent',
    },
  });
});

test('create quote with other-company agent fails', async () => {
  const { service, calls } = createService({ agentLookupResult: null });

  await assert.rejects(
    () => service.create(createQuoteInput({ agentId: 'other-company-agent-1' }), { companyId: 'company-1' } as any),
    (error: any) => {
      assert.equal(error instanceof BadRequestException, true);
      assert.equal(error.message, 'Assigned agent must be an agent user in the current company');
      return true;
    },
  );

  assert.deepEqual(calls.userFindFirst[0].where, {
    id: 'other-company-agent-1',
    companyId: 'company-1',
    role: {
      name: 'agent',
    },
  });
});

export {};
