const nodeTestQuotes = require('node:test');
const quotesAssert = require('node:assert/strict');
const { QuotePricingService } = require('./quote-pricing.service');
const { QuotesService } = require('./quotes.service');

function createQuotesService(prismaOverrides?: Partial<any>) {
  return new QuotesService(
    {
      quote: {
        findFirst: async () => null,
        update: async () => null,
      },
      ...prismaOverrides,
    } as any,
    {} as any,
    {
      findMatchingRate: async () => {
        throw new Error('Unexpected transport pricing lookup');
      },
    } as any,
    {
      evaluate: async () => null,
    } as any,
    new QuotePricingService(),
  );
}

nodeTestQuotes.test('enablePublicLink returns stable public URL payload', async () => {
  delete process.env.APP_PUBLIC_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  process.env.ADMIN_WEB_URL = 'https://portal.example.com';

  const service = createQuotesService({
    quote: {
      findFirst: async () => ({
        id: 'quote-1',
        publicToken: null,
        publicEnabled: false,
      }),
      update: async () => ({
        publicToken: 'generated-token',
        publicEnabled: true,
      }),
    },
  });

  const result = await service.enablePublicLink('quote-1', { companyId: 'company-1' } as any);

  quotesAssert.equal(result?.publicEnabled, true);
  quotesAssert.equal(result?.publicToken, 'generated-token');
  quotesAssert.equal(result?.publicUrl, 'https://portal.example.com/proposal/generated-token');
  delete process.env.ADMIN_WEB_URL;
});

nodeTestQuotes.test('enablePublicLink prefers production public app URL env', async () => {
  process.env.APP_PUBLIC_URL = 'https://dmc-platform-admin-web.vercel.app/';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.ADMIN_WEB_URL = 'http://localhost:3000';

  const service = createQuotesService({
    quote: {
      findFirst: async () => ({
        id: 'quote-1',
        publicToken: null,
        publicEnabled: false,
      }),
      update: async () => ({
        publicToken: 'generated-token',
        publicEnabled: true,
      }),
    },
  });

  const result = await service.enablePublicLink('quote-1', { companyId: 'company-1' } as any);

  quotesAssert.equal(result?.publicUrl, 'https://dmc-platform-admin-web.vercel.app/proposal/generated-token');
  delete process.env.APP_PUBLIC_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.ADMIN_WEB_URL;
});

nodeTestQuotes.test('findPublicProposalQuote returns null when public proposal is disabled', async () => {
  const service = createQuotesService({
    quote: {
      findFirst: async () => null,
    },
  });

  const quote = await service.findPublicProposalQuote('missing-token');
  quotesAssert.equal(quote, null);
});

// CP-Tb: the authenticated quote hydration (loadQuoteState / findOne) must never
// expose the capability-bearing publicToken, while preserving publicEnabled.
// SYNTHETIC placeholder token only — never a real value.
const CP_TB_SYNTHETIC_TOKEN = 'SYNTHETIC-CP-TB-PLACEHOLDER-TOKEN';

function makeStoredQuote(overrides?: Record<string, any>) {
  return {
    id: 'quote-1',
    publicToken: CP_TB_SYNTHETIC_TOKEN,
    publicEnabled: true,
    // Minimal fields so attach/foc do not throw; pricingType omitted => no price computation.
    adults: 2,
    children: 0,
    focType: 'none',
    focRatio: null,
    focCount: null,
    focRoomType: null,
    pricingMode: null,
    status: 'DRAFT',
    ...overrides,
  };
}

// findFirst that serves the main {where:{id}} lookup but returns null for the
// latest-revision lookup ({where:{revisedFromId}}), so the revision field never
// smuggles the raw token back into the response object.
function quoteFindFirst(storedQuote: Record<string, any>) {
  return async (args: any) => (args?.where?.revisedFromId ? null : storedQuote);
}

nodeTestQuotes.test('CP-Tb: findOne omits publicToken (own key absent) but preserves publicEnabled', async () => {
  const stored = makeStoredQuote();
  const service = createQuotesService({ quote: { findFirst: quoteFindFirst(stored) } });

  const result: any = await service.findOne('quote-1', { companyId: 'company-1', role: 'operations' } as any);

  // Real key-presence check (not value === undefined).
  quotesAssert.equal(Object.prototype.hasOwnProperty.call(result, 'publicToken'), false);
  quotesAssert.equal(result.publicEnabled, true);
  quotesAssert.equal(result.id, 'quote-1');

  // No token value and no token-bearing alias/URL introduced anywhere in the response.
  const serialized = JSON.stringify(result);
  quotesAssert.equal(serialized.includes(CP_TB_SYNTHETIC_TOKEN), false);
  quotesAssert.equal(serialized.includes('publicToken'), false);
  quotesAssert.equal(serialized.includes('/proposal/'), false);

  // The underlying stored/model object is not mutated.
  quotesAssert.equal(stored.publicToken, CP_TB_SYNTHETIC_TOKEN);
  quotesAssert.equal(stored.publicEnabled, true);
});

nodeTestQuotes.test('CP-Tb: publicEnabled:false is preserved as false and token still omitted', async () => {
  const stored = makeStoredQuote({ publicEnabled: false });
  const service = createQuotesService({ quote: { findFirst: quoteFindFirst(stored) } });

  const result: any = await service.findOne('quote-1', { companyId: 'company-1', role: 'admin' } as any);

  quotesAssert.equal(Object.prototype.hasOwnProperty.call(result, 'publicToken'), false);
  quotesAssert.equal(result.publicEnabled, false);
});

nodeTestQuotes.test('CP-Tb: omission is unconditional across every role and unknown/missing role', async () => {
  const actors = [
    { companyId: 'c1', role: 'admin' },
    { companyId: 'c1', role: 'super_admin' },
    { companyId: 'c1', role: 'finance' },
    { companyId: 'c1', role: 'operations' },
    { companyId: 'c1', role: 'agent_admin' },
    { companyId: 'c1', role: 'agent' },
    { companyId: 'c1', role: 'viewer' },
    { companyId: 'c1', role: 'nonexistent-unknown-role' },
    undefined, // missing actor
  ];
  for (const actor of actors) {
    const service = createQuotesService({ quote: { findFirst: quoteFindFirst(makeStoredQuote()) } });
    const result: any = await service.findOne('quote-1', actor as any);
    quotesAssert.equal(Object.prototype.hasOwnProperty.call(result, 'publicToken'), false, `role ${actor?.role ?? 'missing'} must not receive publicToken`);
    quotesAssert.equal(result.publicEnabled, true);
  }
});

export {};
