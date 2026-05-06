import test = require('node:test');
import assert = require('node:assert/strict');
import { BadRequestException } from '@nestjs/common';
const { QuotePricingService } = require('./quote-pricing.service');
const { QuotesService } = require('./quotes.service');

function createQuotesService(prismaOverrides: Partial<any> = {}) {
  return new QuotesService(
    {
      quote: {
        findFirst: async (args: any) => (args?.where?.revisedFromId ? null : { id: 'quote-1' }),
      },
      quoteOption: {
        findFirst: async () => ({ id: 'option-1', quoteId: 'quote-1', kind: 'HOTEL_OPTION_SET' }),
      },
      hotel: {
        findUnique: async ({ where }: any) => (where.id === 'hotel-1' ? { id: 'hotel-1', name: 'Petra Palace', city: 'Wadi Musa' } : null),
      },
      hotelRoomCategory: {
        findUnique: async ({ where }: any) =>
          where.id === 'room-1' ? { id: 'room-1', hotelId: 'hotel-1', name: 'Deluxe Room' } : { id: where.id, hotelId: 'other-hotel', name: 'Other Room' },
      },
      quoteHotelOption: {
        create: async (args: any) => ({
          id: 'hotel-option-1',
          ...args.data,
        }),
      },
      ...prismaOverrides,
    } as any,
    { log: async () => null } as any,
    {} as any,
    {} as any,
    new QuotePricingService(),
  );
}

const actor = { companyId: 'company-1' } as any;

test('creates quote hotel alternative with catalog hotel and valid room category', async () => {
  let createdArgs: any;
  const service = createQuotesService({
    quoteHotelOption: {
      create: async (args: any) => {
        createdArgs = args;
        return { id: 'hotel-option-1', ...args.data };
      },
    },
  });

  const result = await service.createHotelOptionAlternative(
    'quote-1',
    'option-1',
    {
      hotelId: 'hotel-1',
      roomCategoryId: 'room-1',
      mealPlanCode: 'BB',
      nights: 2,
    },
    actor,
  );

  assert.equal(result.roomCategoryId, 'room-1');
  assert.equal(result.roomType, 'Deluxe Room');
  assert.equal(result.mealPlanCode, 'BB');
  assert.equal(result.mealPlan, 'BB');
  assert.equal(createdArgs.include.roomCategory, true);
  assert.equal(createdArgs.include.hotel.include.factSheet, true);
  assert.equal(createdArgs.include.hotel.include.roomCategories, true);
});

test('rejects room category that does not belong to selected hotel', async () => {
  const service = createQuotesService();

  await assert.rejects(
    () =>
      service.createHotelOptionAlternative(
        'quote-1',
        'option-1',
        {
          hotelId: 'hotel-1',
          roomCategoryId: 'room-other',
          roomType: 'Legacy room',
          mealPlan: 'Legacy meal',
        },
        actor,
      ),
    (error: unknown) => error instanceof BadRequestException && /Room category does not belong/.test(error.message),
  );
});

test('rejects room category without catalog hotel', async () => {
  const service = createQuotesService();

  await assert.rejects(
    () =>
      service.createHotelOptionAlternative(
        'quote-1',
        'option-1',
        {
          city: 'Amman',
          hotelNameSnapshot: 'Hotel or similar',
          roomCategoryId: 'room-1',
          roomType: 'Standard',
          mealPlan: 'BB',
        },
        actor,
      ),
    (error: unknown) => error instanceof BadRequestException && /Hotel is required/.test(error.message),
  );
});

test('keeps manual text-only hotel alternative working', async () => {
  const service = createQuotesService();

  const result = await service.createHotelOptionAlternative(
    'quote-1',
    'option-1',
    {
      city: 'Aqaba',
      hotelNameSnapshot: 'Resort or similar',
      roomType: 'Sea View DBL',
      mealPlan: 'Dinner and breakfast',
      nights: 3,
    },
    actor,
  );

  assert.equal(result.hotelId, null);
  assert.equal(result.roomCategoryId, null);
  assert.equal(result.mealPlanCode, null);
  assert.equal(result.roomType, 'Sea View DBL');
  assert.equal(result.mealPlan, 'Dinner and breakfast');
});
