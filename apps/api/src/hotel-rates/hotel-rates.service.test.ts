import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { HotelRatesService } from './hotel-rates.service';

function createHotelRatesService() {
  const prisma = {
    hotelContract: {
      findUnique: async ({ where }: any) => ({
        id: where.id,
        hotelId: 'hotel-1',
        hotel: {
          id: 'hotel-1',
          name: 'Grand Petra',
        },
      }),
    },
    hotelRoomCategory: {
      findUnique: async ({ where }: any) => ({
        id: where.id,
        hotelId: 'hotel-1',
      }),
    },
    hotelRate: {
      findUnique: async ({ where }: any) => ({
        id: where.id,
        contractId: 'contract-1',
        seasonId: null,
        seasonName: 'Open',
        roomCategoryId: 'room-1',
        occupancyType: 'DBL',
        mealPlan: 'BB',
        pricingMode: null,
        currency: 'USD',
        cost: 100,
        costBaseAmount: 100,
        costCurrency: 'USD',
        salesTaxPercent: 0,
        salesTaxIncluded: false,
        serviceChargePercent: 0,
        serviceChargeIncluded: false,
        tourismFeeAmount: null,
        tourismFeeCurrency: null,
        tourismFeeMode: null,
        contract: {
          id: 'contract-1',
          hotelId: 'hotel-1',
          hotel: {
            id: 'hotel-1',
            name: 'Grand Petra',
          },
        },
        roomCategory: {
          id: 'room-1',
          hotelId: 'hotel-1',
        },
      }),
      create: async ({ data }: any) => ({
        id: 'rate-1',
        ...data,
        contract: {
          id: data.contractId,
          hotelId: 'hotel-1',
          hotel: { id: 'hotel-1', name: 'Grand Petra' },
        },
        roomCategory: {
          id: data.roomCategoryId,
          hotelId: 'hotel-1',
        },
      }),
      update: async ({ where, data }: any) => ({
        id: where.id,
        ...data,
        contract: {
          id: data.contractId || 'contract-1',
          hotelId: 'hotel-1',
          hotel: { id: 'hotel-1', name: 'Grand Petra' },
        },
        roomCategory: {
          id: data.roomCategoryId || 'room-1',
          hotelId: 'hotel-1',
        },
      }),
      delete: async ({ where }: any) => ({ id: where.id }),
    },
  };

  return new HotelRatesService(prisma as any);
}

test('create persists hotel pricingMode and structured tax/service/tourism fields', async () => {
  const service = createHotelRatesService();

  const result = await service.create({
    contractId: 'contract-1',
    seasonName: 'Summer',
    roomCategoryId: 'room-1',
    occupancyType: 'DBL',
    mealPlan: 'BB',
    pricingMode: 'PER_ROOM_PER_NIGHT',
    currency: 'USD',
    cost: 150,
    salesTaxPercent: 16,
    salesTaxIncluded: false,
    serviceChargePercent: 10,
    serviceChargeIncluded: true,
    tourismFeeAmount: 7,
    tourismFeeCurrency: 'JOD',
    tourismFeeMode: 'PER_NIGHT_PER_PERSON',
  });

  assert.equal(result.pricingMode, 'PER_ROOM_PER_NIGHT');
  assert.equal(result.salesTaxPercent, 16);
  assert.equal(result.serviceChargePercent, 10);
  assert.equal(result.tourismFeeAmount, 7);
  assert.equal(result.tourismFeeCurrency, 'JOD');
});

test('update persists hotel pricingMode and structured pricing field changes', async () => {
  const service = createHotelRatesService();

  const result = await service.update('rate-1', {
    pricingMode: 'PER_PERSON_PER_NIGHT',
    salesTaxPercent: 8,
    salesTaxIncluded: true,
    serviceChargePercent: 5,
    serviceChargeIncluded: false,
    tourismFeeAmount: 4,
    tourismFeeCurrency: 'EUR',
    tourismFeeMode: 'PER_NIGHT_PER_ROOM',
  });

  assert.equal(result.id, 'rate-1');
  assert.equal(result.pricingMode, 'PER_PERSON_PER_NIGHT');
  assert.equal(result.salesTaxPercent, 8);
  assert.equal(result.salesTaxIncluded, true);
  assert.equal(result.tourismFeeCurrency, 'EUR');
});

test('old rows with null pricingMode still update safely', async () => {
  const service = createHotelRatesService();

  const result = await service.update('rate-1', {
    cost: 175,
  });

  assert.equal(result.id, 'rate-1');
  assert.equal(result.cost, 175);
});
