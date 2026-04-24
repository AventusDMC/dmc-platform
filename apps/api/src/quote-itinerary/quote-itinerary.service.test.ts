import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuoteItineraryService } from './quote-itinerary.service';

function createService(overrides?: Partial<any>) {
  const prisma = {
    quote: {
      findFirst: async () => ({ id: 'quote-1' }),
      findUnique: async () => ({ id: 'quote-1' }),
    },
    quoteItineraryDay: {
      findMany: async () => [],
    },
    ...overrides,
  };

  return new QuoteItineraryService(prisma as any);
}

test('findByQuoteId returns empty itinerary when quote exists but has no itinerary rows', async () => {
  const service = createService();

  const result = await service.findByQuoteId('quote-1', { companyId: 'company-1' });

  assert.deepEqual(result, {
    quoteId: 'quote-1',
    days: [],
  });
});

test('findByQuoteId safely serializes day items with missing linked quote services', async () => {
  const service = createService({
    quoteItineraryDay: {
      findMany: async () => [
        {
          id: 'day-1',
          quoteId: 'quote-1',
          dayNumber: 1,
          title: 'Arrival',
          notes: null,
          sortOrder: 0,
          isActive: true,
          createdAt: '2026-04-24T08:00:00.000Z',
          updatedAt: '2026-04-24T08:00:00.000Z',
          dayItems: [
            {
              id: 'item-1',
              dayId: 'day-1',
              quoteServiceId: 'quote-service-1',
              sortOrder: 0,
              notes: null,
              isActive: true,
              createdAt: '2026-04-24T08:00:00.000Z',
              updatedAt: '2026-04-24T08:00:00.000Z',
              quoteService: null,
            },
          ],
        },
      ],
    },
  });

  const result = await service.findByQuoteId('quote-1', { companyId: 'company-1' });

  assert.equal(result.days.length, 1);
  assert.equal(result.days[0].dayItems.length, 1);
  assert.equal(result.days[0].dayItems[0].quoteService, null);
});
