import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';
import { QuotePricingService } from './quote-pricing.service';
import { calculateMultiCurrencyQuoteItemPricing } from './multi-currency-pricing';
import { HotelRatesService } from '../hotel-rates/hotel-rates.service';

function createQuotesService(prismaOverrides?: Partial<any>) {
  const prisma = {
    quote: {
      findFirst: async () => null,
    },
    invoice: {
      create: async ({ data }: any) => ({
        id: 'invoice-1',
        quoteId: data.quoteId,
        totalAmount: data.totalAmount,
        currency: data.currency,
        status: data.status,
        dueDate: data.dueDate,
      }),
    },
    ...prismaOverrides,
  };

  return new QuotesService(
    prisma as any,
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

function createExternalPackageQuotesService(quoteOverrides: Record<string, any> = {}) {
  return createQuotesService({
    quote: {
      findUnique: async ({ where }: any) =>
        where.id === 'quote-1'
          ? {
              id: 'quote-1',
              quoteCurrency: 'USD',
              adults: 3,
              children: 1,
              roomCount: 2,
              nightCount: 1,
              travelStartDate: null,
              createdAt: new Date('2026-04-27T00:00:00.000Z'),
              ...quoteOverrides,
            }
          : null,
      findFirst: async ({ where }: any) =>
        where.id === 'quote-1'
          ? {
              id: 'quote-1',
              quoteCurrency: 'USD',
              adults: 3,
              children: 1,
              roomCount: 2,
              nightCount: 1,
              travelStartDate: null,
              createdAt: new Date('2026-04-27T00:00:00.000Z'),
              ...quoteOverrides,
            }
          : null,
    },
    supplierService: {
      findUnique: async ({ where }: any) =>
        where.id === 'external-package-service'
          ? {
              id: 'external-package-service',
              name: 'External DMC Package',
              category: 'External Package',
              unitType: 'per_group',
              baseCost: 0,
              currency: 'USD',
              costBaseAmount: 0,
              costCurrency: 'USD',
              salesTaxPercent: 0,
              salesTaxIncluded: false,
              serviceChargePercent: 0,
              serviceChargeIncluded: false,
              serviceType: { name: 'External Package', code: 'EXTERNAL_PACKAGE' },
            }
          : null,
    },
    itinerary: {
      findUnique: async () => null,
    },
    quoteItineraryDay: {
      findUnique: async () => null,
    },
    quoteOption: {
      findUnique: async () => null,
    },
  });
}

async function resolveExternalPackage(values: Record<string, any>) {
  const service = createExternalPackageQuotesService(values.quote || {});
  const valueOrDefault = (key: string, fallback: any) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback);
  return (service as any).resolveQuoteItemValues({
    quoteId: 'quote-1',
    serviceId: 'external-package-service',
    quantity: 1,
    paxCount: values.paxCount,
    country: valueOrDefault('country', 'Egypt'),
    supplierName: valueOrDefault('supplierName', 'Cairo Partner DMC'),
    startDay: valueOrDefault('startDay', 1),
    endDay: valueOrDefault('endDay', 4),
    startDate: valueOrDefault('startDate', new Date('2026-10-01T00:00:00.000Z')),
    endDate: valueOrDefault('endDate', new Date('2026-10-04T00:00:00.000Z')),
    pricingBasis: values.pricingBasis,
    netCost: values.netCost,
    currency: valueOrDefault('currency', 'USD'),
    includes: valueOrDefault('includes', 'Cairo guide and transfers'),
    excludes: valueOrDefault('excludes', 'International flights'),
    internalNotes: valueOrDefault('internalNotes', 'Partner net rate locked by ops'),
    clientDescription: valueOrDefault('clientDescription', 'Four-day private Cairo and Giza extension.'),
    markupPercent: valueOrDefault('markupPercent', 0),
    markupAmount: values.markupAmount,
    sellPrice: values.sellPrice,
    overrideCost: values.overrideCost,
    useOverride: values.useOverride,
  });
}

function createHotelLookupRate(overrides: any = {}) {
  return {
    id: overrides.id || 'rate-1',
    contractId: 'contract-1',
    hotelId: 'hotel-1',
    seasonId: null,
    seasonName: 'Imported',
    seasonFrom: new Date('2026-01-01T00:00:00.000Z'),
    seasonTo: new Date('2026-12-31T00:00:00.000Z'),
    roomCategoryId: 'room-1',
    occupancyType: overrides.occupancyType || 'DBL',
    mealPlan: 'BB',
    pricingBasis: overrides.pricingBasis || 'PER_PERSON',
    currency: overrides.currency || 'USD',
    cost: overrides.cost ?? 100,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    contract: {
      id: 'contract-1',
      ratePolicies: overrides.ratePolicies,
      supplements: overrides.supplements || [],
      hotel: { id: 'hotel-1', name: 'Grand Petra' },
    },
    roomCategory: {
      id: 'room-1',
      name: 'Deluxe',
      code: null,
      isActive: true,
    },
  };
}

test('scenario: hotel in JOD quoted in EUR with per-room-per-night and stay tourism fee', () => {
  const service = createQuotesService();

  const pricing = (service as any).calculateCentralizedQuoteItemPricing({
    service: {
      category: 'Hotel',
      unitType: 'per_room',
      serviceType: { name: 'Hotel', code: 'HOTEL' },
    },
    quantity: 1,
    paxCount: 2,
    roomCount: 2,
    nightCount: 3,
    dayCount: 1,
    unitCost: 50,
    markupPercent: 0,
    quoteCurrency: 'EUR',
    supplierPricing: {
      costBaseAmount: 50,
      costCurrency: 'JOD',
      salesTaxPercent: 16,
      salesTaxIncluded: true,
      serviceChargePercent: 10,
      serviceChargeIncluded: false,
      tourismFeeAmount: 4,
      tourismFeeCurrency: 'JOD',
      tourismFeeMode: 'PER_NIGHT_PER_PERSON',
    },
  });

  assert.equal(pricing.supplierCostTotal, 330);
  assert.equal(pricing.totalCost, 462.16);
  assert.equal(pricing.totalSell, 462.16);
  assert.equal(pricing.quoteCurrency, 'EUR');
  assert.equal(pricing.fxFromCurrency, 'JOD');
  assert.equal(pricing.fxToCurrency, 'EUR');
  assert.equal(pricing.fxRate, Number((1.41 / 1.08).toFixed(6)));
});

test('scenario: hotel in USD quoted in JOD with per-person-per-night and room tourism fee', () => {
  const service = createQuotesService();

  const pricing = (service as any).calculateCentralizedQuoteItemPricing({
    service: {
      category: 'Hotel',
      unitType: 'per_person',
      serviceType: { name: 'Hotel', code: 'HOTEL' },
    },
    quantity: 2,
    paxCount: 2,
    roomCount: 1,
    nightCount: 3,
    dayCount: 1,
    unitCost: 30,
    markupPercent: 0,
    quoteCurrency: 'JOD',
    supplierPricing: {
      costBaseAmount: 30,
      costCurrency: 'USD',
      salesTaxPercent: 8,
      salesTaxIncluded: false,
      serviceChargePercent: 10,
      serviceChargeIncluded: false,
      tourismFeeAmount: 7,
      tourismFeeCurrency: 'USD',
      tourismFeeMode: 'PER_NIGHT_PER_ROOM',
    },
  });

  assert.equal(pricing.supplierCostTotal, 213.84);
  assert.equal(pricing.totalCost, 166.55);
  assert.equal(pricing.quoteCurrency, 'JOD');
  assert.equal(pricing.fxFromCurrency, 'USD');
  assert.equal(pricing.fxToCurrency, 'JOD');
  assert.equal(pricing.fxRate, Number((1 / 1.41).toFixed(6)));
});

test('quote hotel pricing uses persisted PER_PERSON rate basis for pax-night units', () => {
  const service = createQuotesService();

  const pricing = (service as any).calculateCentralizedQuoteItemPricing({
    service: {
      category: 'Hotel',
      unitType: 'per_room',
      serviceType: { name: 'Hotel', code: 'HOTEL' },
    },
    quantity: 1,
    paxCount: 3,
    roomCount: 2,
    nightCount: 2,
    dayCount: 1,
    unitCost: 40,
    markupPercent: 0,
    quoteCurrency: 'USD',
    supplierPricing: {
      costBaseAmount: 40,
      costCurrency: 'USD',
    },
    hotelRatePricingBasis: 'PER_PERSON',
  });

  assert.equal(pricing.supplierCostTotal, 240);
  assert.equal(pricing.totalCost, 240);
});

test('quote hotel pricing uses persisted PER_ROOM rate basis for room-night units', () => {
  const service = createQuotesService();

  const pricing = (service as any).calculateCentralizedQuoteItemPricing({
    service: {
      category: 'Hotel',
      unitType: 'per_person',
      serviceType: { name: 'Hotel', code: 'HOTEL' },
    },
    quantity: 1,
    paxCount: 3,
    roomCount: 2,
    nightCount: 2,
    dayCount: 1,
    unitCost: 40,
    markupPercent: 0,
    quoteCurrency: 'USD',
    supplierPricing: {
      costBaseAmount: 40,
      costCurrency: 'USD',
    },
    hotelRatePricingBasis: 'PER_ROOM',
  });

  assert.equal(pricing.supplierCostTotal, 160);
  assert.equal(pricing.totalCost, 160);
});

test('Egypt-only EXTERNAL_PACKAGE quote calculates per-person cost and stores client-facing fields', async () => {
  const values = await resolveExternalPackage({
    pricingBasis: 'PER_PERSON',
    netCost: 250,
    markupPercent: 20,
  });

  assert.equal(values.data.externalPackageCountry, 'Egypt');
  assert.equal(values.data.externalSupplierName, 'Cairo Partner DMC');
  assert.equal(values.data.externalPricingBasis, 'PER_PERSON');
  assert.equal(values.data.externalNetCost, 250);
  assert.equal(values.data.totalCost, 1000);
  assert.equal(values.data.totalSell, 1200);
  assert.equal(values.data.finalCost, 1000);
  assert.equal(values.data.externalClientDescription, 'Four-day private Cairo and Giza extension.');
  assert.equal(values.data.externalIncludes, 'Cairo guide and transfers');
  assert.equal(values.data.externalExcludes, 'International flights');
  assert.equal(values.data.externalInternalNotes, 'Partner net rate locked by ops');
});

test('EXTERNAL_PACKAGE PER_GROUP charges net cost once', async () => {
  const values = await resolveExternalPackage({
    pricingBasis: 'PER_GROUP',
    netCost: 900,
    markupPercent: 10,
  });

  assert.equal(values.data.totalCost, 900);
  assert.equal(values.data.totalSell, 990);
});

test('EXTERNAL_PACKAGE accepts supported currencies and rejects missing or unsupported currency', async () => {
  const values = await resolveExternalPackage({
    quote: { quoteCurrency: 'EUR' },
    pricingBasis: 'PER_GROUP',
    netCost: 900,
    currency: 'EUR',
  });

  assert.equal(values.data.currency, 'EUR');
  assert.equal(values.data.quoteCurrency, 'EUR');
  assert.equal(values.data.costCurrency, 'EUR');
  assert.equal(values.data.externalNetCost, 900);

  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_PERSON', netCost: 250, currency: '' }),
    /External package currency is required/,
  );
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_PERSON', netCost: 250, currency: 'GBP' }),
    /costCurrency must be one of USD, EUR, or JOD/,
  );
});

test('same-currency EXTERNAL_PACKAGE pricing keeps per-person and per-group totals in quote currency', async () => {
  const perPerson = await resolveExternalPackage({
    pricingBasis: 'PER_PERSON',
    netCost: 100,
    currency: 'USD',
    markupPercent: 10,
  });
  const perGroup = await resolveExternalPackage({
    pricingBasis: 'PER_GROUP',
    netCost: 900,
    currency: 'USD',
    markupPercent: 10,
  });

  assert.equal(perPerson.data.totalCost, 400);
  assert.equal(perPerson.data.totalSell, 440);
  assert.equal(perPerson.data.fxRate, null);
  assert.equal(perGroup.data.totalCost, 900);
  assert.equal(perGroup.data.totalSell, 990);
  assert.equal(perGroup.data.fxRate, null);
});

test('mixed-currency EXTERNAL_PACKAGE converts with FX snapshot and does not fall back to quote currency', async () => {
  const values = await resolveExternalPackage({
    quote: { quoteCurrency: 'EUR' },
    pricingBasis: 'PER_PERSON',
    netCost: 100,
    currency: 'USD',
    markupPercent: 10,
  });

  assert.equal(values.data.costCurrency, 'USD');
  assert.equal(values.data.quoteCurrency, 'EUR');
  assert.equal(values.data.currency, 'EUR');
  assert.equal(values.data.costBaseAmount, 100);
  assert.equal(values.data.externalNetCost, 100);
  assert.equal(values.data.totalCost, 370.37);
  assert.equal(values.data.totalSell, 407.41);
  assert.equal(values.data.fxFromCurrency, 'USD');
  assert.equal(values.data.fxToCurrency, 'EUR');
  assert.equal(values.data.fxRate, 0.925926);
});

test('EXTERNAL_PACKAGE selling layer supports markup amount sellPrice and finalCost override', async () => {
  const amount = await resolveExternalPackage({
    pricingBasis: 'PER_GROUP',
    netCost: 900,
    markupAmount: 125,
  });
  const sellOverride = await resolveExternalPackage({
    pricingBasis: 'PER_GROUP',
    netCost: 900,
    markupPercent: 50,
    sellPrice: 1111,
  });
  const finalCostOverride = await resolveExternalPackage({
    pricingBasis: 'PER_PERSON',
    netCost: 250,
    markupPercent: 20,
    overrideCost: 700,
    useOverride: true,
  });

  assert.equal(amount.data.totalCost, 900);
  assert.equal(amount.data.totalSell, 1025);
  assert.equal(sellOverride.data.totalCost, 900);
  assert.equal(sellOverride.data.totalSell, 1111);
  assert.equal(finalCostOverride.data.totalCost, 700);
  assert.equal(finalCostOverride.data.finalCost, 700);
  assert.equal(finalCostOverride.data.totalSell, 840);
});

test('mixed quote totals aggregate Jordan hotel with Israel and Egypt external packages', async () => {
  const hotelPricing = calculateMultiCurrencyQuoteItemPricing({
    supplierPricing: { costBaseAmount: 600, costCurrency: 'USD' },
    pricingUnits: { pricingUnits: 1, roomCount: 1, nightCount: 1, paxCount: 4 },
    quoteCurrency: 'USD',
    markupPercent: 20,
  });
  const israel = await resolveExternalPackage({
    country: 'Israel',
    pricingBasis: 'PER_GROUP',
    netCost: 1200,
    markupPercent: 15,
  });
  const egypt = await resolveExternalPackage({
    country: 'Egypt',
    pricingBasis: 'PER_PERSON',
    netCost: 250,
    markupPercent: 20,
  });

  const totalCost = Number((hotelPricing.totalCost + israel.data.totalCost + egypt.data.totalCost).toFixed(2));
  const totalSell = Number((hotelPricing.totalSell + israel.data.totalSell + egypt.data.totalSell).toFixed(2));

  assert.equal(hotelPricing.totalCost, 600);
  assert.equal(hotelPricing.totalSell, 720);
  assert.equal(totalCost, 2800);
  assert.equal(totalSell, 3300);
});

test('mixed quote converts Jordan hotel and Egypt external package into one quote currency', async () => {
  const service = createQuotesService();
  const jordanHotel = (service as any).calculateCentralizedQuoteItemPricing({
    service: {
      category: 'Hotel',
      unitType: 'per_room',
      serviceType: { name: 'Hotel', code: 'HOTEL' },
    },
    quantity: 1,
    paxCount: 2,
    roomCount: 1,
    nightCount: 1,
    dayCount: 1,
    unitCost: 100,
    markupPercent: 0,
    quoteCurrency: 'EUR',
    supplierPricing: {
      costBaseAmount: 100,
      costCurrency: 'JOD',
    },
    hotelRatePricingBasis: 'PER_ROOM',
  });
  const egyptPackage = await resolveExternalPackage({
    quote: { quoteCurrency: 'EUR' },
    country: 'Egypt',
    pricingBasis: 'PER_GROUP',
    netCost: 216,
    currency: 'USD',
    markupPercent: 10,
  });
  const totalCost = Number((jordanHotel.totalCost + egyptPackage.data.totalCost).toFixed(2));
  const totalSell = Number((jordanHotel.totalSell + egyptPackage.data.totalSell).toFixed(2));

  assert.equal(jordanHotel.totalCost, 130.56);
  assert.equal(jordanHotel.fxFromCurrency, 'JOD');
  assert.equal(egyptPackage.data.totalCost, 200);
  assert.equal(egyptPackage.data.totalSell, 220);
  assert.equal(egyptPackage.data.fxFromCurrency, 'USD');
  assert.equal(egyptPackage.data.fxToCurrency, 'EUR');
  assert.equal(totalCost, 330.56);
  assert.equal(totalSell, 350.56);
});

test('EXTERNAL_PACKAGE validation rejects missing required fields clearly', async () => {
  await assert.rejects(
    () => resolveExternalPackage({ country: '', pricingBasis: 'PER_PERSON', netCost: 250, currency: 'USD' }),
    /External package country is required/,
  );
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: null, netCost: 250, currency: 'USD' }),
    /External package pricingBasis must be PER_PERSON or PER_GROUP/,
  );
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_PERSON', netCost: undefined, currency: 'USD' }),
    /External package netCost is required/,
  );
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_PERSON', netCost: 250, currency: '' }),
    /External package currency is required/,
  );
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_PERSON', netCost: 250, currency: 'USD', clientDescription: '' }),
    /External package client description is required/,
  );
});

test('EXTERNAL_PACKAGE validation rejects bad numeric and pricing basis values', async () => {
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_PERSON', netCost: -1 }),
    /External package netCost must be zero or greater/,
  );
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_PERSON', netCost: Number.NaN }),
    /External package netCost must be zero or greater/,
  );
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_DAY', netCost: 250 }),
    /External package pricingBasis must be PER_PERSON or PER_GROUP/,
  );
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_PERSON', netCost: 250, markupAmount: Number.NaN }),
    /Markup amount must be zero or greater/,
  );
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_PERSON', netCost: 250, overrideCost: Number.NaN, useOverride: true }),
    /Override cost must be zero or greater/,
  );
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_PERSON', netCost: 250, markupPercent: Number.NaN }),
    /Markup percent must be zero or greater/,
  );
});

test('EXTERNAL_PACKAGE validation rejects invalid day and date ranges', async () => {
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_PERSON', netCost: 250, startDay: 5, endDay: 3 }),
    /External package endDay cannot be before startDay/,
  );
  await assert.rejects(
    () =>
      resolveExternalPackage({
        pricingBasis: 'PER_PERSON',
        netCost: 250,
        startDate: new Date('2026-10-05T00:00:00.000Z'),
        endDate: new Date('2026-10-03T00:00:00.000Z'),
      }),
    /External package endDate cannot be before startDate/,
  );
  await assert.rejects(
    () => resolveExternalPackage({ pricingBasis: 'PER_PERSON', netCost: 250, startDate: new Date('invalid') }),
    /Invalid operational date/,
  );
});

test('quote child pricing applies CHILD_FREE from persisted ratePolicies', async () => {
  const service = new HotelRatesService({
    hotelRate: {
      findMany: async () => [
        createHotelLookupRate({
          ratePolicies: [{ policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 5 }],
        }),
      ],
    },
  } as any);

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

test('quote child pricing applies CHILD_DISCOUNT from persisted ratePolicies', async () => {
  const service = new HotelRatesService({
    hotelRate: {
      findMany: async () => [
        createHotelLookupRate({
          ratePolicies: [{ policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 }],
        }),
      ],
    },
  } as any);

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

  assert.equal(result.childrenCost, 50);
  assert.equal(result.totalCost, 250);
});

test('quote child pricing safely falls back when ratePolicies are missing', async () => {
  const service = new HotelRatesService({
    hotelRate: {
      findMany: async () => [createHotelLookupRate({ ratePolicies: undefined })],
    },
  } as any);

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

  assert.equal(result.childrenCost, 100);
  assert.equal(result.totalCost, 300);
});

test('quote hotel supplement cost appears in summary total and still uses selling layer overrides', async () => {
  const hotelRates = new HotelRatesService({
    hotelRate: {
      findMany: async () => [
        createHotelLookupRate({
          ratePolicies: [
            { policyType: 'ADULT_EXTRA_MEAL', amount: 10, pricingBasis: 'PER_ROOM', mealPlan: 'BB' },
            { policyType: 'SINGLE_SUPPLEMENT', amount: 20, pricingBasis: 'PER_STAY' },
          ],
          occupancyType: 'SGL',
        }),
      ],
    },
  } as any);
  const quotes = createQuotesService();

  const hotelCost = await hotelRates.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-03',
    occupancy: 'SGL',
    mealPlan: 'BB',
    pax: 1,
    adults: 1,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });
  const pricing = calculateMultiCurrencyQuoteItemPricing({
    supplierPricing: {
      costBaseAmount: hotelCost.totalCost,
      costCurrency: 'USD',
    },
    pricingUnits: {
      pricingUnits: 1,
      roomCount: 1,
      nightCount: 1,
      paxCount: 1,
    },
    quoteCurrency: 'USD',
    markupPercent: 0,
  });

  assert.equal(hotelCost.supplementsCost, 40);
  assert.deepEqual(
    hotelCost.breakdown.map((night) => night.supplementsCost),
    [30, 10],
  );
  assert.equal(hotelCost.totalCost, 240);
  assert.equal(pricing.totalCost, 240);
  assert.equal(
    (quotes as any).applyQuoteItemSellingLayer({
      pricing,
      cost: hotelCost.totalCost,
      markupPercent: 20,
      markupAmount: null,
      sellPriceOverride: null,
    }).totalSell,
    288,
  );
  assert.equal(
    (quotes as any).applyQuoteItemSellingLayer({
      pricing,
      cost: hotelCost.totalCost,
      markupPercent: 20,
      markupAmount: null,
      sellPriceOverride: 310,
    }).totalSell,
    310,
  );
});

test('hotel supplements follow tax-inclusive and tax-exclusive quote settings without double tax', async () => {
  const hotelRates = new HotelRatesService({
    hotelRate: {
      findMany: async () => [
        createHotelLookupRate({
          pricingBasis: 'PER_ROOM',
          supplements: [
            { id: 'mandatory-gala', type: 'GALA_DINNER', amount: 20, chargeBasis: 'PER_ROOM', isMandatory: true, isActive: true },
            { id: 'optional-dinner', type: 'EXTRA_DINNER', amount: 30, chargeBasis: 'PER_ROOM', isMandatory: false, isActive: true },
          ],
        }),
      ],
    },
  } as any);

  const mandatoryOnly = await hotelRates.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
  });
  const withOptional = await hotelRates.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-02',
    occupancy: 'DBL',
    mealPlan: 'BB',
    pax: 2,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-1',
    selectedSupplementIds: ['optional-dinner'],
  });
  const inclusive = calculateMultiCurrencyQuoteItemPricing({
    supplierPricing: {
      costBaseAmount: mandatoryOnly.totalCost,
      costCurrency: 'USD',
      salesTaxPercent: 10,
      salesTaxIncluded: true,
    },
    pricingUnits: { pricingUnits: 1, roomCount: 1, nightCount: 1, paxCount: 2 },
    quoteCurrency: 'USD',
    markupPercent: 0,
  });
  const exclusive = calculateMultiCurrencyQuoteItemPricing({
    supplierPricing: {
      costBaseAmount: withOptional.totalCost,
      costCurrency: 'USD',
      salesTaxPercent: 10,
      salesTaxIncluded: false,
    },
    pricingUnits: { pricingUnits: 1, roomCount: 1, nightCount: 1, paxCount: 2 },
    quoteCurrency: 'USD',
    markupPercent: 0,
  });

  assert.equal(mandatoryOnly.supplementsCost, 20);
  assert.equal(mandatoryOnly.totalCost, 120);
  assert.equal(withOptional.supplementsCost, 50);
  assert.equal(withOptional.totalCost, 150);
  assert.equal(inclusive.totalCost, 120);
  assert.equal(exclusive.totalCost, 165);
});

test('scenario: mixed quote lines convert into quote currency EUR with per-line FX snapshots', () => {
  const service = createQuotesService();

  const hotelLine = (service as any).calculateCentralizedQuoteItemPricing({
    service: {
      category: 'Hotel',
      unitType: 'per_room',
      serviceType: { name: 'Hotel', code: 'HOTEL' },
    },
    quantity: 1,
    paxCount: 2,
    roomCount: 2,
    nightCount: 2,
    dayCount: 1,
    unitCost: 40,
    markupPercent: 0,
    quoteCurrency: 'EUR',
    supplierPricing: {
      costBaseAmount: 40,
      costCurrency: 'JOD',
    },
  });

  const transportLine = (service as any).calculateCentralizedQuoteItemPricing({
    service: {
      category: 'Transport',
      unitType: 'per_vehicle',
      serviceType: { name: 'Transfer', code: 'TRANSFER' },
    },
    quantity: 1,
    paxCount: 2,
    roomCount: 1,
    nightCount: 1,
    dayCount: 1,
    unitCost: 120,
    markupPercent: 0,
    quoteCurrency: 'EUR',
    supplierPricing: {
      costBaseAmount: 120,
      costCurrency: 'USD',
    },
  });

  const serviceLine = (service as any).calculateCentralizedQuoteItemPricing({
    service: {
      category: 'Activity',
      unitType: 'per_person',
      serviceType: { name: 'Museum', code: 'ACTIVITY' },
    },
    quantity: 1,
    paxCount: 3,
    roomCount: 1,
    nightCount: 1,
    dayCount: 1,
    unitCost: 25,
    markupPercent: 0,
    quoteCurrency: 'EUR',
    supplierPricing: {
      costBaseAmount: 25,
      costCurrency: 'EUR',
    },
  });

  const quoteTotal = Number((hotelLine.totalCost + transportLine.totalCost + serviceLine.totalCost).toFixed(2));

  assert.equal(hotelLine.totalCost, 208.89);
  assert.equal(hotelLine.fxFromCurrency, 'JOD');
  assert.equal(hotelLine.fxToCurrency, 'EUR');

  assert.equal(transportLine.totalCost, 111.11);
  assert.equal(transportLine.fxFromCurrency, 'USD');
  assert.equal(transportLine.fxToCurrency, 'EUR');

  assert.equal(serviceLine.totalCost, 75);
  assert.equal(serviceLine.fxRate, null);
  assert.equal(serviceLine.quoteCurrency, 'EUR');

  assert.equal(quoteTotal, 395);
});

test('quote selling layer applies markup percent, markup amount, and sell override priority', () => {
  const service = createQuotesService();
  const pricing = calculateMultiCurrencyQuoteItemPricing({
    supplierPricing: {
      costBaseAmount: 100,
      costCurrency: 'USD',
    },
    pricingUnits: {
      pricingUnits: 1,
      roomCount: 1,
      nightCount: 1,
      paxCount: 1,
    },
    quoteCurrency: 'USD',
    markupPercent: 0,
  });

  assert.equal(
    (service as any).applyQuoteItemSellingLayer({
      pricing,
      cost: 100,
      markupPercent: 20,
      markupAmount: null,
      sellPriceOverride: null,
    }).totalSell,
    120,
  );
  assert.equal(
    (service as any).applyQuoteItemSellingLayer({
      pricing,
      cost: 100,
      markupPercent: 20,
      markupAmount: 35,
      sellPriceOverride: null,
    }).totalSell,
    135,
  );
  assert.equal(
    (service as any).applyQuoteItemSellingLayer({
      pricing,
      cost: 100,
      markupPercent: 20,
      markupAmount: 35,
      sellPriceOverride: 180,
    }).totalSell,
    180,
  );
});

test('capacity pricing uses ceil pax over max pax per unit for non per-person service rates', () => {
  const service = createQuotesService();

  const pricing = (service as any).calculateCentralizedQuoteItemPricing({
    service: {
      category: 'Activity',
      unitType: 'per_group',
      serviceType: { name: 'Jeep Safari', code: 'ACTIVITY' },
    },
    quantity: 1,
    paxCount: 7,
    roomCount: 1,
    nightCount: 1,
    dayCount: 1,
    unitCost: 50,
    markupPercent: 20,
    quoteCurrency: 'USD',
    supplierPricing: {
      costBaseAmount: 50,
      costCurrency: 'USD',
    },
    activityPricingBasis: 'PER_GROUP',
    capacityMaxPaxPerUnit: 3,
  });

  assert.equal(pricing.totalCost, 150);
  assert.equal(pricing.totalSell, 180);
});

test('capacity max does not change per-person pricing', () => {
  const service = createQuotesService();

  const pricing = (service as any).calculateCentralizedQuoteItemPricing({
    service: {
      category: 'Activity',
      unitType: 'per_person',
      serviceType: { name: 'Museum', code: 'ACTIVITY' },
    },
    quantity: 1,
    paxCount: 7,
    roomCount: 1,
    nightCount: 1,
    dayCount: 1,
    unitCost: 10,
    markupPercent: 0,
    quoteCurrency: 'USD',
    supplierPricing: {
      costBaseAmount: 10,
      costCurrency: 'USD',
    },
    activityPricingBasis: 'PER_PERSON',
    capacityMaxPaxPerUnit: 3,
  });

  assert.equal(pricing.totalCost, 70);
  assert.equal(pricing.totalSell, 70);
});

test('quote selling layer rounds decimal markup percent, markup amount, and sell override consistently', () => {
  const service = createQuotesService();
  const pricing = calculateMultiCurrencyQuoteItemPricing({
    supplierPricing: {
      costBaseAmount: 124.956,
      costCurrency: 'USD',
    },
    pricingUnits: { pricingUnits: 1, roomCount: 1, nightCount: 1, paxCount: 1 },
    quoteCurrency: 'USD',
    markupPercent: 0,
  });

  const percentMarkup = (service as any).applyQuoteItemSellingLayer({
    pricing,
    cost: 124.956,
    markupPercent: 12.345,
    markupAmount: null,
    sellPriceOverride: null,
  });
  const amountMarkup = (service as any).applyQuoteItemSellingLayer({
    pricing,
    cost: 124.956,
    markupPercent: 12.345,
    markupAmount: 10.555,
    sellPriceOverride: null,
  });
  const override = (service as any).applyQuoteItemSellingLayer({
    pricing,
    cost: 124.956,
    markupPercent: 12.345,
    markupAmount: 10.555,
    sellPriceOverride: 123.456,
  });

  assert.equal(percentMarkup.totalCost, 124.96);
  assert.equal(percentMarkup.totalSell, 140.39);
  assert.equal(amountMarkup.totalCost, 124.96);
  assert.equal(amountMarkup.totalSell, 135.51);
  assert.equal(override.totalCost, 124.96);
  assert.equal(override.totalSell, 123.46);
});

test('quote manual cost override drives final cost and margin summary', () => {
  const service = createQuotesService();
  const basePricing = calculateMultiCurrencyQuoteItemPricing({
    supplierPricing: {
      costBaseAmount: 100,
      costCurrency: 'USD',
    },
    pricingUnits: {
      pricingUnits: 2,
      roomCount: 1,
      nightCount: 1,
      paxCount: 2,
    },
    quoteCurrency: 'USD',
    markupPercent: 0,
  });

  const pricing = (service as any).applyQuoteItemSellingLayer({
    pricing: { ...basePricing, totalCost: 150 },
    cost: 150,
    markupPercent: 20,
    markupAmount: null,
    sellPriceOverride: null,
  });
  const marginAmount = Number((pricing.totalSell - pricing.totalCost).toFixed(2));
  const marginPercent = pricing.totalSell > 0 ? Number(((marginAmount / pricing.totalSell) * 100).toFixed(2)) : 0;

  assert.equal(basePricing.totalCost, 200);
  assert.equal(pricing.totalCost, 150);
  assert.equal(pricing.totalSell, 180);
  assert.equal(marginAmount, 30);
  assert.equal(marginPercent, 16.67);
});

test('scenario: legacy quote item without structured pricing keeps stored sell fallback', () => {
  const service = createQuotesService();

  const pricing = (service as any).calculateCentralizedQuoteItemPricing({
    service: {
      category: 'Operations',
      unitType: 'per_group',
      serviceType: { name: 'Legacy service', code: 'OPS' },
    },
    quantity: 0,
    paxCount: 0,
    roomCount: 0,
    nightCount: 0,
    dayCount: 0,
    unitCost: 0,
    markupPercent: 0,
    quoteCurrency: 'EUR',
    supplierPricing: {
      costBaseAmount: null,
      costCurrency: null,
      salesTaxPercent: null,
      salesTaxIncluded: null,
      serviceChargePercent: null,
      serviceChargeIncluded: null,
      tourismFeeAmount: null,
      tourismFeeCurrency: null,
      tourismFeeMode: null,
    },
    legacyCurrency: 'EUR',
  });

  assert.equal(pricing.totalCost, 0);
  assert.equal(pricing.totalSell, 0);

  const helperFallback = calculateMultiCurrencyQuoteItemPricing({
    supplierPricing: {
      costBaseAmount: 0,
      costCurrency: 'EUR',
    },
    pricingUnits: {
      pricingUnits: 1,
      roomCount: 1,
      nightCount: 1,
      paxCount: 1,
    },
    quoteCurrency: 'EUR',
    markupPercent: 0,
    legacyPricing: {
      totalCost: 420,
      totalSell: 500,
      currency: 'EUR',
    },
  });

  assert.equal(helperFallback.totalCost, 420);
  assert.equal(helperFallback.totalSell, 500);
});

test('scenario: invoice generation uses stored quote total and quote currency', async () => {
  const service = createQuotesService({
    quote: {
      findFirst: async () => ({
        id: 'quote-1',
        status: 'ACCEPTED',
        acceptedAt: new Date('2026-04-24T10:00:00.000Z'),
        totalSell: 987.65,
        quoteCurrency: 'EUR',
        invoice: null,
        quoteItems: [
          { currency: 'JOD' },
          { currency: 'USD' },
        ],
      }),
    },
  });

  const invoice = await service.createInvoice('quote-1', { companyId: 'company-1' } as any);

  assert.ok(invoice);
  assert.equal(invoice.quoteId, 'quote-1');
  assert.equal(invoice.totalAmount, 987.65);
  assert.equal(invoice.currency, 'EUR');
  assert.equal(invoice.status, 'ISSUED');
});
