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

test('findByQuoteId preserves excursion origin variant fields for client rendering', async () => {
  const service = createService({
    quoteItineraryDay: {
      findMany: async () => [
        {
          id: 'day-1',
          quoteId: 'quote-1',
          dayNumber: 1,
          title: 'Petra',
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
              quoteService: {
                id: 'quote-service-1',
                quoteId: 'quote-1',
                optionId: null,
                serviceDate: null,
                startTime: null,
                pickupTime: null,
                pickupLocation: null,
                meetingPoint: null,
                quantity: 1,
                paxCount: 2,
                participantCount: 2,
                adultCount: 2,
                childCount: 0,
                roomCount: null,
                nightCount: null,
                dayCount: 1,
                pricingDescription: null,
                overrideReason: 'Excursion template: Petra Guided Experience | Origin: Aqaba',
                reconfirmationRequired: false,
                reconfirmationDueAt: null,
                service: null,
                hotel: null,
                contract: null,
                roomCategory: null,
                appliedVehicleRate: null,
                touringRoute: {
                  id: 'touring-route-aqaba',
                  name: 'Aqaba Petra Full Day',
                  startCity: 'Aqaba',
                },
              },
            },
          ],
        },
      ],
    },
  });

  const result = await service.findByQuoteId('quote-1', { companyId: 'company-1' });
  const quoteService = result.days[0].dayItems[0].quoteService;

  assert.equal(quoteService?.overrideReason, 'Excursion template: Petra Guided Experience | Origin: Aqaba');
  assert.deepEqual(quoteService?.touringRoute, {
    id: 'touring-route-aqaba',
    name: 'Aqaba Petra Full Day',
    startCity: 'Aqaba',
  });
});
