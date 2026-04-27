import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { ContractImportType, HotelRatePricingBasis } from '@prisma/client';
import { ContractImportsService } from '../contract-imports/contract-imports.service';
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
        pricingBasis: 'PER_ROOM',
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

function createHotelRatesServiceWithLookupRates(rates: any[]) {
  return new HotelRatesService({
    hotelRate: {
      findMany: async ({ where }: any = {}) =>
        rates.filter(
          (rate) =>
            (!where?.hotelId || rate.hotelId === where.hotelId) &&
            (!where?.contractId || rate.contractId === where.contractId),
        ),
    },
  } as any);
}

function createLookupRate(overrides: any = {}) {
  const hotelId = overrides.hotelId || 'hotel-1';
  return {
    id: overrides.id || 'rate-1',
    contractId: overrides.contractId || 'contract-1',
    hotelId,
    seasonId: null,
    seasonName: 'Imported',
    seasonFrom: overrides.seasonFrom || new Date('2026-01-01T00:00:00.000Z'),
    seasonTo: overrides.seasonTo || new Date('2026-12-31T00:00:00.000Z'),
    roomCategoryId: overrides.roomCategoryId || 'room-1',
    occupancyType: overrides.occupancyType !== undefined ? overrides.occupancyType : 'DBL',
    mealPlan: overrides.mealPlan !== undefined ? overrides.mealPlan : 'BB',
    pricingBasis: overrides.pricingBasis || 'PER_PERSON',
    currency: 'JOD',
    cost: overrides.cost ?? 100,
    createdAt: overrides.createdAt || new Date('2026-01-01T00:00:00.000Z'),
    contract: {
      id: overrides.contractId || 'contract-1',
      ratePolicies: overrides.ratePolicies,
      childPolicy: overrides.childPolicy,
      supplements: overrides.supplements || overrides.contract?.supplements || [],
      hotel: { id: hotelId, name: overrides.hotelName || 'Grand Petra' },
    },
    roomCategory: {
      id: overrides.roomCategoryId || 'room-1',
      name: overrides.roomCategoryName || 'Deluxe',
      code: null,
      isActive: true,
    },
  };
}

function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
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

test('create rejects invalid negative tax and service charge percentages', async () => {
  const service = createHotelRatesService();
  const baseRate: any = {
    contractId: 'contract-1',
    seasonName: 'Summer',
    roomCategoryId: 'room-1',
    occupancyType: 'DBL',
    mealPlan: 'BB',
    currency: 'USD',
    cost: 150,
  };

  await assert.rejects(
    () =>
      service.create({
        ...baseRate,
        salesTaxPercent: -1,
      }),
    /salesTaxPercent must be at least 0/,
  );
  await assert.rejects(
    () =>
      service.create({
        ...baseRate,
        serviceChargePercent: -1,
      }),
    /serviceChargePercent must be at least 0/,
  );
});

test('create normalizes imported hotel pricingBasis aliases without falling back to PER_ROOM', async () => {
  const service = createHotelRatesService();

  for (const value of ['PER_PERSON', 'PER PERSON', 'per person', 'person']) {
    const result = await service.create({
      contractId: 'contract-1',
      seasonName: 'Summer',
      roomCategoryId: 'room-1',
      occupancyType: 'DBL',
      mealPlan: 'BB',
      pricingBasis: value,
      currency: 'USD',
      cost: 150,
    });

    assert.equal(result.pricingBasis, 'PER_PERSON');
  }

  for (const value of ['PER_ROOM', 'PER ROOM', 'per room', 'room']) {
    const result = await service.create({
      contractId: 'contract-1',
      seasonName: 'Summer',
      roomCategoryId: 'room-1',
      occupancyType: 'DBL',
      mealPlan: 'BB',
      pricingBasis: value,
      currency: 'USD',
      cost: 150,
    });

    assert.equal(result.pricingBasis, 'PER_ROOM');
  }
});

test('create normalizes PER_ROOM aliases and falls back to PER_ROOM for missing or invalid pricingBasis', async () => {
  const service = createHotelRatesService();

  for (const value of ['PER_ROOM', 'PER ROOM', 'per room', 'room']) {
    const result = await service.create({
      contractId: 'contract-1',
      seasonName: 'Summer',
      roomCategoryId: 'room-1',
      occupancyType: 'DBL',
      mealPlan: 'BB',
      pricingBasis: value,
      currency: 'USD',
      cost: 150,
    });

    assert.equal(result.pricingBasis, 'PER_ROOM');
  }

  for (const value of [undefined, null, '', 'weekly']) {
    const result = await service.create({
      contractId: 'contract-1',
      seasonName: 'Summer',
      roomCategoryId: 'room-1',
      occupancyType: 'DBL',
      mealPlan: 'BB',
      pricingBasis: value as any,
      currency: 'USD',
      cost: 150,
    });

    assert.equal(result.pricingBasis, 'PER_ROOM');
  }
});

test('valid PER_PERSON pricingBasis is not overwritten by PER_ROOM default', async () => {
  const service = createHotelRatesService();

  const result = await service.create({
    contractId: 'contract-1',
    seasonName: 'Summer',
    roomCategoryId: 'room-1',
    occupancyType: 'DBL',
    mealPlan: 'BB',
    pricingBasis: 'PER_PERSON',
    currency: 'USD',
    cost: 150,
  });

  assert.equal(result.pricingBasis, 'PER_PERSON');
});

test('calculateFinalPrice applies pax multiplier only for PER_PERSON rates', () => {
  const service = createHotelRatesService();

  assert.equal(service.calculateFinalPrice(80, HotelRatePricingBasis.PER_PERSON, 3), 240);
  assert.equal(service.calculateFinalPrice(80, HotelRatePricingBasis.PER_ROOM, 3), 80);
});

test('approval import persists normalized HotelRate.pricingBasis', async () => {
  const createdRates: any[] = [];
  const prisma = {
    hotel: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: 'hotel-1', ...data }),
    },
    hotelContract: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: 'contract-1', createdAt: new Date(), ...data }),
    },
    hotelRoomCategory: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: 'room-1', ...data }),
    },
    season: {
      upsert: async ({ create }: any) => ({ id: 'season-1', ...create }),
    },
    hotelRate: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdRates.push(data);
        return { id: `rate-${createdRates.length}`, ...data };
      },
    },
    supplier: {
      findUnique: async () => ({ id: 'supplier-1', notes: null }),
      update: async ({ data }: any) => ({ id: 'supplier-1', ...data }),
    },
  };
  const service = new ContractImportsService(prisma as any);

  await (service as any).importHotelPreview(
    {
      contractType: ContractImportType.HOTEL,
      supplier: { name: 'Grand Petra Supplier', isNew: false },
      contract: {
        name: 'Grand Petra 2026',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        currency: 'JOD',
      },
      hotel: { name: 'Grand Petra', city: 'Amman', category: '5' },
      roomCategories: [{ name: 'Deluxe', code: 'DLX' }],
      seasons: [],
      rates: [
        {
          roomType: 'Deluxe',
          occupancyType: 'DBL',
          mealPlan: 'BB',
          seasonName: 'Imported',
          cost: 100,
          currency: 'JOD',
          pricingBasis: 'per person',
        },
        {
          roomType: 'Deluxe',
          occupancyType: 'SGL',
          mealPlan: 'BB',
          seasonName: 'Imported',
          cost: 90,
          currency: 'JOD',
          pricingBasis: 'room',
        },
      ],
      mealPlans: [],
      taxes: [],
      supplements: [],
      policies: [],
      ratePolicies: [],
      cancellationPolicy: null,
      childPolicy: null,
      missingFields: [],
      uncertainFields: [],
    },
    'supplier-1',
    'contract.xlsx',
    '',
  );

  assert.equal(createdRates[0].pricingBasis, 'PER_PERSON');
  assert.equal(createdRates[0].pricingMode, 'PER_PERSON_PER_NIGHT');
  assert.equal(createdRates[1].pricingBasis, 'PER_ROOM');
  assert.equal(createdRates[1].pricingMode, 'PER_ROOM_PER_NIGHT');
});

test('contract child pricing reads CHILD_FREE from ratePolicies', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      ratePolicies: [{ policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 5 }],
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 3,
    adults: 2,
    childrenAges: [4],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.adultsCost, 200);
  assert.equal(result.childrenCost, 0);
  assert.equal(result.totalCost, 200);
});

test('contract child pricing reads CHILD_DISCOUNT from ratePolicies', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      ratePolicies: [{ policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 }],
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 3,
    adults: 2,
    childrenAges: [8],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.adultsCost, 200);
  assert.equal(result.childrenCost, 50);
  assert.equal(result.totalCost, 250);
});

test('missing ratePolicies safely falls back to standard child pricing', async () => {
  const service = createHotelRatesServiceWithLookupRates([createLookupRate({ ratePolicies: undefined })]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 3,
    adults: 2,
    childrenAges: [4],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.adultsCost, 200);
  assert.equal(result.childrenCost, 100);
  assert.equal(result.totalCost, 300);
});

test('legacy child bands are ignored when ratePolicies exists', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      ratePolicies: [{ policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 5 }],
      childPolicy: {
        bands: [{ minAge: 0, maxAge: 5, chargeBasis: 'PERCENT_OF_ADULT', chargeValue: 100 }],
      },
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 3,
    adults: 2,
    childrenAges: [4],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.childrenCost, 0);
  assert.equal(result.totalCost, 200);
});

test('multiple rates render the correct child policy per selected rate', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      id: 'rate-free',
      roomCategoryId: 'room-free',
      roomCategoryName: 'Family Free Child',
      ratePolicies: [{ policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 5 }],
    }),
    createLookupRate({
      id: 'rate-discount',
      roomCategoryId: 'room-discount',
      roomCategoryName: 'Family Discount Child',
      ratePolicies: [{ policyType: 'CHILD_DISCOUNT', ageFrom: 0, ageTo: 5, percent: 50 }],
    }),
  ]);

  const freeResult = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 3,
    adults: 2,
    childrenAges: [4],
    roomCategoryId: 'room-free',
  });
  const discountResult = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 3,
    adults: 2,
    childrenAges: [4],
    roomCategoryId: 'room-discount',
  });

  assert.equal(freeResult.childrenCost, 0);
  assert.equal(freeResult.totalCost, 200);
  assert.equal(discountResult.childrenCost, 50);
  assert.equal(discountResult.totalCost, 250);
});

test('supplement pricing applies per-room, per-person, one-time, and child supplement policies consistently', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      ratePolicies: [
        { policyType: 'ADULT_EXTRA_MEAL', amount: 10, pricingBasis: 'PER_ROOM', mealPlan: 'BB' },
        { policyType: 'THIRD_PERSON_SUPPLEMENT', amount: 15, pricingBasis: 'PER_PERSON' },
        { policyType: 'SINGLE_SUPPLEMENT', amount: 20, pricingBasis: 'PER_STAY' },
        { policyType: 'CHILD_EXTRA_MEAL', amount: 5, pricingBasis: 'PER_PERSON', ageFrom: 6, ageTo: 11 },
      ],
      occupancyType: 'SGL',
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-03',
    occupancy: 'SGL',
    mealPlan: 'BB',
    pax: 4,
    adults: 3,
    childrenAges: [8],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.adultsCost, 600);
  assert.equal(result.childrenCost, 200);
  assert.equal(result.supplementsCost, 110);
  assert.equal(result.totalCost, 910);
  assert.deepEqual(
    result.breakdown.map((night) => night.supplementsCost),
    [65, 45],
  );
});

test('decimal hotel rates and supplements round nightly components and totals consistently', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      cost: 33.335,
      ratePolicies: [
        { policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 },
        { policyType: 'ADULT_EXTRA_MEAL', amount: 12.345, pricingBasis: 'PER_PERSON', mealPlan: 'BB' },
      ],
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 3,
    adults: 2,
    childrenAges: [8],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.adultsCost, 66.67);
  assert.equal(result.childrenCost, 16.67);
  assert.equal(result.supplementsCost, 24.69);
  assert.equal(result.totalCost, 108.03);
  assert.deepEqual(result.breakdown.map((night) => night.cost), [108.03]);
});

test('multi-room PER_ROOM pricing multiplies room count and nights without pax multiplier', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      pricingBasis: 'PER_ROOM',
      cost: 100,
      ratePolicies: [{ policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 }],
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-04',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 5,
    roomCount: 2,
    adults: 2,
    childrenAges: [4, 8, 10],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.adultsCost, 600);
  assert.equal(result.childrenCost, 0);
  assert.equal(result.totalCost, 600);
});

test('multi-room PER_PERSON pricing charges pax and nights without multiplying by room count', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      pricingBasis: 'PER_PERSON',
      cost: 100,
      ratePolicies: [
        { policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 5 },
        { policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 },
      ],
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-04',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 4,
    roomCount: 2,
    adults: 2,
    childrenAges: [4, 8],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.adultsCost, 600);
  assert.equal(result.childrenCost, 150);
  assert.equal(result.totalCost, 750);
});

test('multi-room optional EXTRA_BED prices only when selected and follows extra-person capacity', async () => {
  const optionalExtraBed = {
    id: 'supp-extra-bed',
    type: 'EXTRA_BED',
    amount: 25,
    chargeBasis: 'PER_STAY',
    isMandatory: false,
    isActive: true,
  };
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      pricingBasis: 'PER_PERSON',
      cost: 100,
      contract: {
        supplements: [optionalExtraBed],
      },
    }),
  ]);

  const baseInput = {
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL' as any,
    mealPlan: 'BB' as any,
    pax: 5,
    roomCount: 2,
    adults: 3,
    childrenAges: [8, 10],
    roomCategoryId: 'room-1',
  };
  const defaultResult = await service.calculateHotelCost(baseInput);
  const selectedResult = await service.calculateHotelCost({
    ...baseInput,
    selectedSupplementIds: ['supp-extra-bed'],
  });

  assert.equal(defaultResult.supplementsCost, 0);
  assert.equal(selectedResult.supplementsCost, 25);
  assert.equal(selectedResult.totalCost, 525);
});

test('multi-room adult and child extra-bed policies use room capacity before charging', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      pricingBasis: 'PER_PERSON',
      cost: 100,
      ratePolicies: [
        { policyType: 'CHILD_EXTRA_BED', amount: 12, pricingBasis: 'PER_PERSON', ageFrom: 0, ageTo: 11 },
        { policyType: 'ADULT_EXTRA_BED', amount: 20, pricingBasis: 'PER_PERSON' },
      ],
    }),
  ]);

  const childExtraBed = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 5,
    roomCount: 2,
    adults: 3,
    childrenAges: [8, 10],
    roomCategoryId: 'room-1',
  });
  const adultExtraBed = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 5,
    roomCount: 2,
    adults: 5,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });

  assert.equal(childExtraBed.supplementsCost, 12);
  assert.equal(adultExtraBed.supplementsCost, 20);
});

test('multi-room edge cases handle zero children, one adult with children, uneven rooms, and missing occupancy fallback', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      pricingBasis: 'PER_PERSON',
      cost: 100,
      ratePolicies: [
        { policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 5 },
        { policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 },
      ],
    }),
  ]);

  const zeroChildren = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    roomCount: 2,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });
  const oneAdultWithChildren = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 3,
    roomCount: 2,
    adults: 1,
    childrenAges: [4, 8],
    roomCategoryId: 'room-1',
  });
  const unevenRooms = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 5,
    roomCount: 2,
    adults: 3,
    childrenAges: [4, 8],
    roomCategoryId: 'room-1',
  });
  const missingOccupancy = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: undefined as any,
    mealPlan: undefined as any,
    pax: 2,
    roomCount: undefined,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });

  assert.equal(zeroChildren.totalCost, 200);
  assert.equal(oneAdultWithChildren.totalCost, 150);
  assert.equal(unevenRooms.totalCost, 350);
  assert.equal(missingOccupancy.totalCost, 200);
});

test('date-range pricing uses a single season when all nights are inside one rate range', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      cost: 120,
      pricingBasis: 'PER_PERSON',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-30T00:00:00.000Z'),
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-10',
    checkOutDate: '2026-06-13',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.nights, 3);
  assert.equal(result.totalCost, 720);
  assert.deepEqual(
    result.breakdown.map((night) => night.cost),
    [240, 240, 240],
  );
});

test('date-range boundaries include start and final priced night but exclude checkout date', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      cost: 80,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-03T00:00:00.000Z'),
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-04',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 4,
    roomCount: 2,
    adults: 2,
    childrenAges: [7, 10],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.nights, 3);
  assert.deepEqual(
    result.breakdown.map((night) => night.date),
    ['2026-06-01', '2026-06-02', '2026-06-03'],
  );
  assert.equal(result.totalCost, 480);
});

test('timezone-offset quote datetimes use local date boundaries without night drift', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      cost: 80,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-03T00:00:00.000Z'),
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01T23:30:00-05:00',
    checkOutDate: '2026-06-04T01:00:00+09:00',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    roomCount: 1,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.nights, 3);
  assert.deepEqual(
    result.breakdown.map((night) => night.date),
    ['2026-06-01', '2026-06-02', '2026-06-03'],
  );
  assert.equal(result.totalCost, 240);
});

test('timezone-offset season strings still match boundary quote dates deterministically', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      cost: 90,
      pricingBasis: 'PER_ROOM',
      seasonFrom: '2026-06-01T23:00:00-05:00',
      seasonTo: '2026-06-02T01:00:00+09:00',
    }),
    createLookupRate({
      id: 'later-season',
      cost: 140,
      pricingBasis: 'PER_ROOM',
      seasonFrom: '2026-06-03T00:00:00.000Z',
      seasonTo: '2026-06-30T00:00:00.000Z',
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01T22:00:00-05:00',
    checkOutDate: '2026-06-03T03:00:00+09:00',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    roomCount: 1,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.nights, 2);
  assert.deepEqual(
    result.breakdown.map((night) => night.date),
    ['2026-06-01', '2026-06-02'],
  );
  assert.deepEqual(
    result.breakdown.map((night) => night.cost),
    [90, 90],
  );
});

test('UTC-stored contract season matches local quote dates without off-by-one errors', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      cost: 110,
      pricingBasis: 'PER_PERSON',
      seasonFrom: new Date(Date.UTC(2026, 5, 1, 0, 0, 0)),
      seasonTo: new Date(Date.UTC(2026, 5, 2, 0, 0, 0)),
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-03',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.nights, 2);
  assert.deepEqual(
    result.breakdown.map((night) => night.date),
    ['2026-06-01', '2026-06-02'],
  );
  assert.equal(result.totalCost, 440);
});

test('multi-season PER_PERSON stay splits nights across matching date ranges', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      id: 'rate-early',
      cost: 100,
      pricingBasis: 'PER_PERSON',
      seasonName: 'Early June',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-02T00:00:00.000Z'),
    }),
    createLookupRate({
      id: 'rate-late',
      cost: 150,
      pricingBasis: 'PER_PERSON',
      seasonName: 'Late June',
      seasonFrom: new Date('2026-06-03T00:00:00.000Z'),
      seasonTo: new Date('2026-06-30T00:00:00.000Z'),
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-04',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 3,
    adults: 3,
    childrenAges: [],
    roomCount: 2,
    roomCategoryId: 'room-1',
  });

  assert.deepEqual(
    result.breakdown.map((night) => night.cost),
    [300, 300, 450],
  );
  assert.equal(result.totalCost, 1050);
});

test('multi-season PER_ROOM stay splits nights across matching date ranges with room-night logic', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      id: 'rate-early',
      cost: 90,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-02T00:00:00.000Z'),
    }),
    createLookupRate({
      id: 'rate-late',
      cost: 140,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-03T00:00:00.000Z'),
      seasonTo: new Date('2026-06-30T00:00:00.000Z'),
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-04',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 5,
    adults: 3,
    childrenAges: [6, 10],
    roomCount: 2,
    roomCategoryId: 'room-1',
  });

  assert.deepEqual(
    result.breakdown.map((night) => night.cost),
    [180, 180, 280],
  );
  assert.equal(result.totalCost, 640);
});

test('missing date-range coverage fails clearly instead of reusing the wrong season', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      cost: 100,
      pricingBasis: 'PER_PERSON',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-01T00:00:00.000Z'),
    }),
    createLookupRate({
      cost: 200,
      pricingBasis: 'PER_PERSON',
      seasonFrom: new Date('2026-06-03T00:00:00.000Z'),
      seasonTo: new Date('2026-06-30T00:00:00.000Z'),
    }),
  ]);

  await assert.rejects(
    () =>
      service.calculateHotelCost({
        hotelId: 'hotel-1',
        checkInDate: '2026-06-01',
        checkOutDate: '2026-06-04',
        occupancy: 'DBL',
        mealPlan: 'BB',
        pax: 2,
        adults: 2,
        childrenAges: [],
        roomCategoryId: 'room-1',
      }),
    /No rates found for this hotel and date/,
  );
});

test('invalid quote date values are rejected instead of silently shifting pricing', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      cost: 100,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-30T00:00:00.000Z'),
    }),
  ]);

  await assert.rejects(
    () =>
      service.calculateHotelCost({
        hotelId: 'hotel-1',
        checkInDate: 'not-a-date',
        checkOutDate: '2026-06-03',
        occupancy: 'DBL',
        mealPlan: 'BB',
        pax: 2,
        adults: 2,
        childrenAges: [],
        roomCategoryId: 'room-1',
      }),
    /A valid lookup date is required/,
  );
  await assert.rejects(
    () =>
      service.calculateHotelCost({
        hotelId: 'hotel-1',
        checkInDate: '2026-06-03',
        checkOutDate: '2026-06-03T23:59:59-05:00',
        occupancy: 'DBL',
        mealPlan: 'BB',
        pax: 2,
        adults: 2,
        childrenAges: [],
        roomCategoryId: 'room-1',
      }),
    /checkOutDate must be after checkInDate/,
  );
});

test('overlapping equal-range rates choose the newer imported rate before lower price', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      id: 'older-cheaper-rate',
      cost: 80,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-30T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
    createLookupRate({
      id: 'newer-expensive-rate',
      cost: 120,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-30T00:00:00.000Z'),
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-10',
    checkOutDate: '2026-06-11',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 4,
    roomCount: 1,
    adults: 2,
    childrenAges: [8, 10],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.totalCost, 120);
});

test('overlapping rates prefer the shorter seasonal range over the broad fallback range', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      id: 'broad-base-rate',
      cost: 70,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-01-01T00:00:00.000Z'),
      seasonTo: new Date('2026-12-31T00:00:00.000Z'),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    }),
    createLookupRate({
      id: 'specific-peak-rate',
      cost: 150,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-10T00:00:00.000Z'),
      seasonTo: new Date('2026-06-12T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
  ]);

  const specificResult = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-10',
    checkOutDate: '2026-06-11',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    roomCount: 1,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });
  const fallbackResult = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-07-01',
    checkOutDate: '2026-07-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    roomCount: 1,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });

  assert.equal(specificResult.totalCost, 150);
  assert.equal(fallbackResult.totalCost, 70);
});

test('overlapping rates prefer exact meal plan and occupancy over blank fallback dimensions', async () => {
  const mealPlanService = createHotelRatesServiceWithLookupRates([
    createLookupRate({ id: 'meal-fallback', cost: 70, pricingBasis: 'PER_ROOM', mealPlan: null }),
    createLookupRate({ id: 'meal-wrong', cost: 20, pricingBasis: 'PER_ROOM', mealPlan: 'RO' }),
    createLookupRate({ id: 'meal-exact', cost: 120, pricingBasis: 'PER_ROOM', mealPlan: 'HB' }),
  ]);
  const occupancyService = createHotelRatesServiceWithLookupRates([
    createLookupRate({ id: 'occupancy-fallback', cost: 60, pricingBasis: 'PER_ROOM', occupancyType: null }),
    createLookupRate({ id: 'occupancy-wrong', cost: 20, pricingBasis: 'PER_ROOM', occupancyType: 'SGL' }),
    createLookupRate({ id: 'occupancy-exact', cost: 130, pricingBasis: 'PER_ROOM', occupancyType: 'TPL' }),
  ]);

  const mealPlanResult = await mealPlanService.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'HB',
    pax: 2,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });
  const occupancyResult = await occupancyService.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'TPL',
    mealPlan: 'BB',
    pax: 3,
    adults: 3,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });

  assert.equal(mealPlanResult.totalCost, 120);
  assert.equal(occupancyResult.totalCost, 130);
});

test('blank meal plan fallback rate is used only when no exact meal plan rate exists', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({ id: 'meal-fallback', cost: 70, pricingBasis: 'PER_ROOM', mealPlan: null }),
    createLookupRate({ id: 'meal-wrong', cost: 20, pricingBasis: 'PER_ROOM', mealPlan: 'RO' }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'HB',
    pax: 2,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });

  assert.equal(result.totalCost, 70);
});

test('ambiguous equal-priority overlapping rates are rejected clearly', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      id: 'ambiguous-rate-1',
      cost: 100,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-30T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
    createLookupRate({
      id: 'ambiguous-rate-2',
      cost: 100,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-30T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
  ]);

  await assert.rejects(
    () =>
      service.calculateHotelCost({
        hotelId: 'hotel-1',
        checkInDate: '2026-06-10',
        checkOutDate: '2026-06-11',
        occupancy: 'DBL',
        mealPlan: 'BB',
        pax: 2,
        adults: 2,
        childrenAges: [],
        roomCategoryId: 'room-1',
      }),
    /Ambiguous hotel rates match/,
  );
});

test('overlapping priority applies per night across split-season stays', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      id: 'broad-base-rate',
      cost: 100,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-30T00:00:00.000Z'),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    }),
    createLookupRate({
      id: 'specific-night-two',
      cost: 200,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-02T00:00:00.000Z'),
      seasonTo: new Date('2026-06-02T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
    createLookupRate({
      id: 'specific-night-three',
      cost: 300,
      pricingBasis: 'PER_ROOM',
      seasonFrom: new Date('2026-06-03T00:00:00.000Z'),
      seasonTo: new Date('2026-06-03T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
  ]);

  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-04',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    roomCount: 1,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });

  assert.deepEqual(
    result.breakdown.map((night) => night.cost),
    [100, 200, 300],
  );
  assert.equal(result.totalCost, 600);
});

test('large contract rate lookup remains correct and bounded with 100 plus seasonal rates', async () => {
  const start = utcDate(2026, 0, 1);
  const rates = Array.from({ length: 120 }, (_, index) => {
    const seasonDate = addUtcDays(start, index);
    return createLookupRate({
      id: `large-rate-${index}`,
      cost: 50 + index,
      pricingBasis: 'PER_ROOM',
      seasonName: `Season ${index}`,
      seasonFrom: seasonDate,
      seasonTo: seasonDate,
      createdAt: addUtcDays(start, index),
    });
  });
  const service = createHotelRatesServiceWithLookupRates(rates);

  const startedAt = performance.now();
  const first = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: dateOnly(addUtcDays(start, 75)),
    checkOutDate: dateOnly(addUtcDays(start, 76)),
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    roomCount: 1,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });
  const repeated = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: dateOnly(addUtcDays(start, 75)),
    checkOutDate: dateOnly(addUtcDays(start, 76)),
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    roomCount: 1,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });
  const elapsedMs = performance.now() - startedAt;

  assert.equal(first.totalCost, 125);
  assert.equal(repeated.totalCost, first.totalCost);
  assert.ok(elapsedMs < 1000, `large contract lookup took ${elapsedMs}ms`);
});

test('fourteen-night multi-season quote splits correctly under larger itinerary input', async () => {
  const service = createHotelRatesServiceWithLookupRates([
    createLookupRate({
      id: 'nights-1-4',
      cost: 100,
      pricingBasis: 'PER_ROOM',
      seasonFrom: utcDate(2026, 0, 1),
      seasonTo: utcDate(2026, 0, 4),
    }),
    createLookupRate({
      id: 'nights-5-8',
      cost: 120,
      pricingBasis: 'PER_ROOM',
      seasonFrom: utcDate(2026, 0, 5),
      seasonTo: utcDate(2026, 0, 8),
    }),
    createLookupRate({
      id: 'nights-9-11',
      cost: 140,
      pricingBasis: 'PER_ROOM',
      seasonFrom: utcDate(2026, 0, 9),
      seasonTo: utcDate(2026, 0, 11),
    }),
    createLookupRate({
      id: 'nights-12-14',
      cost: 160,
      pricingBasis: 'PER_ROOM',
      seasonFrom: utcDate(2026, 0, 12),
      seasonTo: utcDate(2026, 0, 14),
    }),
  ]);

  const startedAt = performance.now();
  const result = await service.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-01-01',
    checkOutDate: '2026-01-15',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    roomCount: 1,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });
  const elapsedMs = performance.now() - startedAt;

  assert.equal(result.nights, 14);
  assert.deepEqual(
    result.breakdown.map((night) => night.cost),
    [100, 100, 100, 100, 120, 120, 120, 120, 140, 140, 140, 160, 160, 160],
  );
  assert.equal(result.totalCost, 1780);
  assert.ok(elapsedMs < 1500, `fourteen-night split quote took ${elapsedMs}ms`);
});

test('multiple hotel quote items calculate and aggregate deterministically under load', async () => {
  const rates = [
    createLookupRate({
      id: 'hotel-1-rate',
      hotelId: 'hotel-1',
      cost: 100,
      pricingBasis: 'PER_ROOM',
      seasonFrom: utcDate(2026, 5, 1),
      seasonTo: utcDate(2026, 5, 30),
    }),
    createLookupRate({
      id: 'hotel-2-rate',
      hotelId: 'hotel-2',
      contractId: 'contract-2',
      cost: 80,
      pricingBasis: 'PER_PERSON',
      seasonFrom: utcDate(2026, 5, 1),
      seasonTo: utcDate(2026, 5, 30),
    }),
    createLookupRate({
      id: 'hotel-3-rate',
      hotelId: 'hotel-3',
      contractId: 'contract-3',
      cost: 150,
      pricingBasis: 'PER_ROOM',
      seasonFrom: utcDate(2026, 5, 1),
      seasonTo: utcDate(2026, 5, 30),
    }),
  ];
  const service = createHotelRatesServiceWithLookupRates(rates);

  const startedAt = performance.now();
  const [firstHotel, secondHotel, thirdHotel] = await Promise.all([
    service.calculateHotelCost({
      hotelId: 'hotel-1',
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-04',
      occupancy: 'DBL',
      mealPlan: 'BB',
      pax: 4,
      roomCount: 2,
      adults: 4,
      childrenAges: [],
      roomCategoryId: 'room-1',
    }),
    service.calculateHotelCost({
      hotelId: 'hotel-2',
      checkInDate: '2026-06-04',
      checkOutDate: '2026-06-06',
      occupancy: 'DBL',
      mealPlan: 'BB',
      pax: 3,
      roomCount: 2,
      adults: 3,
      childrenAges: [],
      roomCategoryId: 'room-1',
    }),
    service.calculateHotelCost({
      hotelId: 'hotel-3',
      checkInDate: '2026-06-06',
      checkOutDate: '2026-06-08',
      occupancy: 'DBL',
      mealPlan: 'BB',
      pax: 2,
      roomCount: 1,
      adults: 2,
      childrenAges: [],
      roomCategoryId: 'room-1',
    }),
  ]);
  const elapsedMs = performance.now() - startedAt;
  const aggregateCost = firstHotel.totalCost + secondHotel.totalCost + thirdHotel.totalCost;

  assert.deepEqual([firstHotel.totalCost, secondHotel.totalCost, thirdHotel.totalCost], [600, 480, 300]);
  assert.equal(aggregateCost, 1380);
  assert.ok(elapsedMs < 1500, `multiple hotel item pricing took ${elapsedMs}ms`);
});

test('quote recalculation with multiple hotel items stays deterministic without slowdown', async () => {
  const start = utcDate(2026, 6, 1);
  const createVersionRates = (versionCostOffset: number) =>
    Array.from({ length: 5 }).flatMap((_, hotelIndex) =>
      Array.from({ length: 12 }, (__, dayIndex) =>
        createLookupRate({
          id: `hotel-${hotelIndex + 1}-day-${dayIndex}-v-${versionCostOffset}`,
          hotelId: `hotel-${hotelIndex + 1}`,
          contractId: `contract-${hotelIndex + 1}`,
          cost: 100 + hotelIndex * 5 + versionCostOffset,
          pricingBasis: 'PER_ROOM',
          seasonFrom: addUtcDays(start, dayIndex),
          seasonTo: addUtcDays(start, dayIndex),
        }),
      ),
    );
  const calculateItems = async (service: HotelRatesService) =>
    Promise.all(
      Array.from({ length: 5 }, (_, hotelIndex) =>
        service.calculateHotelCost({
          hotelId: `hotel-${hotelIndex + 1}`,
          contractId: `contract-${hotelIndex + 1}`,
          checkInDate: '2026-07-01',
          checkOutDate: '2026-07-13',
          occupancy: 'DBL',
          mealPlan: 'BB',
          pax: 2,
          roomCount: 1,
          adults: 2,
          childrenAges: [],
          roomCategoryId: 'room-1',
        }),
      ),
    );

  const startedAt = performance.now();
  const originalItems = await calculateItems(createHotelRatesServiceWithLookupRates(createVersionRates(0)));
  const recalculatedItems = await calculateItems(createHotelRatesServiceWithLookupRates(createVersionRates(10)));
  const elapsedMs = performance.now() - startedAt;
  const originalTotal = originalItems.reduce((sum, item) => sum + item.totalCost, 0);
  const recalculatedTotal = recalculatedItems.reduce((sum, item) => sum + item.totalCost, 0);

  assert.equal(originalTotal, 6600);
  assert.equal(recalculatedTotal, 7200);
  assert.equal(recalculatedTotal - originalTotal, 600);
  assert.deepEqual(
    recalculatedItems.map((item) => item.nights),
    [12, 12, 12, 12, 12],
  );
  assert.ok(elapsedMs < 2500, `multi-item recalculation took ${elapsedMs}ms`);
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
