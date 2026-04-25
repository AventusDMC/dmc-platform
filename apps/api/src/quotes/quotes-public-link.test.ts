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
