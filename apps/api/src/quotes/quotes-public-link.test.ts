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

export {};
