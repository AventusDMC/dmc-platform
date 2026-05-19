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

function createServiceRateQuoteService(values: {
  service: Record<string, any>;
  serviceRate?: Record<string, any> | null;
  quote?: Record<string, any>;
  activity?: Record<string, any> | null;
  activityRateVariant?: Record<string, any> | null;
  ticketRateVariant?: Record<string, any> | null;
}) {
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
              nightCount: 2,
              travelStartDate: null,
              createdAt: new Date('2026-04-27T00:00:00.000Z'),
              jordanPassType: 'NONE',
              ...values.quote,
            }
          : null,
    },
    supplierService: {
      findUnique: async ({ where }: any) =>
        where.id === 'service-1'
          ? {
              id: 'service-1',
              supplierId: 'supplier-1',
              name: 'Generic support service',
              category: 'Other',
              unitType: 'per_group',
              baseCost: 20,
              currency: 'USD',
              costBaseAmount: 20,
              costCurrency: 'USD',
              salesTaxPercent: 0,
              salesTaxIncluded: false,
              serviceChargePercent: 0,
              serviceChargeIncluded: false,
              tourismFeeAmount: null,
              tourismFeeCurrency: null,
              tourismFeeMode: null,
              serviceType: { name: 'Other Support', code: 'OTHER' },
              entranceFee: null,
              serviceRates: values.serviceRate ? [values.serviceRate] : [],
              ticketRateVariants: values.ticketRateVariant ? [values.ticketRateVariant] : [],
              ...values.service,
            }
          : null,
    },
    activity: {
      findUnique: async ({ where }: any) =>
        values.activity === null
          ? null
          : values.activity
            ? {
                id: where.id,
                name: 'Catalog Activity',
                pricingBasis: 'PER_PERSON',
                costPrice: 35,
                sellPrice: 52.5,
                durationMinutes: 120,
                supplierCompany: null,
                ...values.activity,
              }
            : null,
    },
    activityRateVariant: {
      findUnique: async ({ where }: any) =>
        values.activityRateVariant === null
          ? null
          : values.activityRateVariant
            ? {
                id: where.id,
                activityId: 'activity-1',
                name: '2 Hours',
                pricingBasis: 'PER_GROUP',
                costPrice: 90,
                sellPrice: 120,
                durationMinutes: 120,
                maxPaxPerUnit: 6,
                active: true,
                ...values.activityRateVariant,
              }
            : null,
    },
    ticketRateVariant: {
      findUnique: async ({ where }: any) =>
        values.ticketRateVariant === null
          ? null
          : values.ticketRateVariant
            ? {
                id: where.id,
                serviceId: 'service-1',
                label: '2 Days',
                costPrice: 55,
                sellPrice: null,
                currency: 'JOD',
                pricingBasis: 'PER_PERSON',
                includedInJordanPass: true,
                active: true,
                ...values.ticketRateVariant,
              }
            : null,
    },
    quoteItem: {
      count: async () => 0,
    },
    itinerary: { findUnique: async () => null },
    quoteItineraryDay: { findUnique: async () => null },
    quoteOption: { findUnique: async () => null },
  });
}

async function resolveServiceRateQuoteItem(values: {
  service?: Record<string, any>;
  serviceRate?: Record<string, any> | null;
  item?: Record<string, any>;
  quote?: Record<string, any>;
  activity?: Record<string, any> | null;
  activityRateVariant?: Record<string, any> | null;
  ticketRateVariant?: Record<string, any> | null;
}) {
  const service = createServiceRateQuoteService({
    service: values.service || {},
    serviceRate: values.serviceRate,
    quote: values.quote,
    activity: values.activity,
    activityRateVariant: values.activityRateVariant,
    ticketRateVariant: values.ticketRateVariant,
  });

  return (service as any).resolveQuoteItemValues({
    quoteId: 'quote-1',
    serviceId: 'service-1',
    quantity: 1,
    paxCount: 4,
    markupPercent: 20,
    ...values.item,
  });
}

function createGuideQuoteService(serviceOverrides: Record<string, any> = {}) {
  const guideServiceId = serviceOverrides.id || 'd7ddfdd2-5d94-4ec7-b9a2-7376934addb8';
  const quoteItineraryDayId = '6ca7bc63-33a7-43e4-9aaf-d9d4434f8390';
  const quote = {
    id: 'quote-1',
    quoteCurrency: 'USD',
    adults: 18,
    children: 3,
    roomCount: 11,
    nightCount: 1,
    travelStartDate: null,
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
  };
  const dayLinks: any[] = [];
  const createdItems: any[] = [];
  const service = createQuotesService({
    quote: {
      findFirst: async ({ where }: any) => (where?.revisedFromId ? null : where?.id === quote.id ? quote : null),
      findUnique: async ({ where }: any) => (where?.id === quote.id ? quote : null),
    },
    supplierService: {
      findUnique: async ({ where }: any) =>
        where.id === guideServiceId
          ? {
              id: guideServiceId,
              supplierId: 'supplier-guide',
              name: 'Jordan Guide Service',
              category: 'Guide',
              unitType: 'per_group',
              baseCost: 0,
              currency: 'USD',
              costBaseAmount: 0,
              costCurrency: 'USD',
              salesTaxPercent: 0,
              salesTaxIncluded: false,
              serviceChargePercent: 0,
              serviceChargeIncluded: false,
              serviceType: { id: 'type-guide', name: 'Guide', code: 'GUIDE' },
              entranceFee: null,
              serviceRates: [],
              ...serviceOverrides,
            }
          : null,
    },
    activity: {
      findUnique: async () => null,
    },
    itinerary: {
      findUnique: async () => null,
    },
    quoteItineraryDay: {
      findUnique: async ({ where }: any) =>
        where.id === quoteItineraryDayId ? { id: quoteItineraryDayId, quoteId: quote.id, dayNumber: 4 } : null,
    },
    quoteOption: {
      findUnique: async () => null,
    },
    quoteItem: {
      create: async ({ data, include }: any) => {
        const item = {
          id: `guide-item-${createdItems.length + 1}`,
          ...data,
          service: include?.service ? { id: guideServiceId, name: serviceOverrides.name || 'Jordan Guide Service', category: serviceOverrides.category || 'Guide' } : null,
        };
        createdItems.push(item);
        return item;
      },
    },
    quoteItineraryDayItem: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        dayLinks.push(data);
        return data;
      },
    },
  });
  (service as any).recalculateQuoteTotals = async () => undefined;

  return { service, guideServiceId, quoteItineraryDayId, dayLinks, createdItems };
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
    quantity: 5,
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

test('quote hotel pricing uses PER_PERSON_NIGHT basis for quote pax-night units', () => {
  const service = createQuotesService();

  const pricing = (service as any).calculateCentralizedQuoteItemPricing({
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
    unitCost: 45,
    markupPercent: 0,
    quoteCurrency: 'USD',
    supplierPricing: {
      costBaseAmount: 45,
      costCurrency: 'USD',
    },
    hotelRatePricingBasis: 'PER_PERSON_NIGHT',
  });

  assert.equal(pricing.supplierCostTotal, 90);
  assert.equal(pricing.totalCost, 90);
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

test('quote hotel pricing keeps PER_ROOM_NIGHT basis on room-night units', () => {
  const service = createQuotesService();

  const pricing = (service as any).calculateCentralizedQuoteItemPricing({
    service: {
      category: 'Hotel',
      unitType: 'per_person',
      serviceType: { name: 'Hotel', code: 'HOTEL' },
    },
    quantity: 1,
    paxCount: 2,
    roomCount: 1,
    nightCount: 1,
    dayCount: 1,
    unitCost: 45,
    markupPercent: 0,
    quoteCurrency: 'USD',
    supplierPricing: {
      costBaseAmount: 45,
      costCurrency: 'USD',
    },
    hotelRatePricingBasis: 'PER_ROOM_NIGHT',
  });

  assert.equal(pricing.supplierCostTotal, 45);
  assert.equal(pricing.totalCost, 45);
});

test('quote hotel pricing ignores quantity and stores unit hotel rate semantics for repricing', async () => {
  const service = createQuotesService();
  const hotelService = {
    category: 'Hotel',
    unitType: 'per_room',
    serviceType: { name: 'Hotel', code: 'HOTEL' },
  };

  const pricing = (service as any).calculateCentralizedQuoteItemPricing({
    service: hotelService,
    quantity: 3,
    paxCount: 4,
    roomCount: 2,
    nightCount: 2,
    dayCount: 1,
    unitCost: 40,
    markupPercent: 20,
    quoteCurrency: 'USD',
    supplierPricing: {
      costBaseAmount: 40,
      costCurrency: 'USD',
    },
    hotelRatePricingBasis: 'PER_ROOM',
  });
  const repricedTotal = await (service as any).calculateQuoteItemsTotalCostForPax(
    [
      {
        quantity: 3,
        roomCount: 2,
        nightCount: 2,
        dayCount: 1,
        paxCount: 4,
        baseCost: 40,
        currency: 'USD',
        quoteCurrency: 'USD',
        costCurrency: 'USD',
        overrideCost: null,
        useOverride: false,
        markupPercent: 20,
        service: hotelService,
      },
    ],
    { roomCount: 1, nightCount: 1 },
    4,
  );

  assert.equal(pricing.totalCost, 160);
  assert.equal(pricing.totalSell, 192);
  assert.equal(repricedTotal, 160);
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

test('one-off EXTERNAL_PACKAGE update does not require a SupplierService', async () => {
  let supplierServiceLookupCount = 0;
  let updatedData: Record<string, any> | null = null;
  const quote = {
    id: 'quote-1',
    quoteCurrency: 'USD',
    adults: 3,
    children: 1,
    roomCount: 2,
    nightCount: 1,
    travelStartDate: null,
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
  };
  const existingItem = {
    id: 'item-external-1',
    quoteId: 'quote-1',
    optionId: null,
    serviceId: null,
    activityId: null,
    itineraryId: null,
    serviceDate: null,
    startTime: null,
    pickupTime: null,
    pickupLocation: null,
    meetingPoint: null,
    participantCount: null,
    adultCount: null,
    childCount: null,
    reconfirmationRequired: false,
    reconfirmationDueAt: null,
    hotelId: null,
    contractId: null,
    seasonId: null,
    seasonName: null,
    roomCategoryId: null,
    occupancyType: null,
    mealPlan: null,
    quantity: 1,
    paxCount: 4,
    roomCount: null,
    nightCount: null,
    dayCount: null,
    overrideCost: null,
    overrideReason: null,
    useOverride: false,
    markupAmount: null,
    sellPrice: null,
    currency: 'USD',
    markupPercent: 10,
    externalPackageCountry: 'Egypt',
    externalPackageName: 'Cairo Extension',
    externalSupplierName: 'Cairo Partner DMC',
    externalStartDay: 1,
    externalEndDay: 4,
    externalStartDate: new Date('2026-10-01T00:00:00.000Z'),
    externalEndDate: new Date('2026-10-04T00:00:00.000Z'),
    externalPricingBasis: 'PER_GROUP',
    externalNetCost: 900,
    externalPackagePricingMatrixJson: [],
    externalPackageSingleSupplement: null,
    externalIncludes: 'Cairo guide and transfers',
    externalExcludes: 'International flights',
    externalInternalNotes: 'Partner net rate locked by ops',
    externalHotelsOrSimilar: 'Cairo hotel or similar',
    externalClientDescription: 'Four-day private Cairo and Giza extension.',
  };
  const service = createQuotesService({
    quote: {
      findFirst: async ({ where }: any) => (where.id === 'quote-1' ? quote : null),
      findUnique: async ({ where }: any) => (where.id === 'quote-1' ? quote : null),
    },
    quoteItem: {
      findFirst: async ({ where }: any) => (where.id === existingItem.id ? existingItem : null),
      update: async ({ data }: any) => {
        updatedData = data;
        return { ...existingItem, ...data, service: null };
      },
    },
    supplierService: {
      findUnique: async () => {
        supplierServiceLookupCount += 1;
        return null;
      },
    },
    activity: {
      findUnique: async () => null,
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
  (service as any).recalculateQuoteTotals = async () => undefined;

  const updated = await service.updateItem(
    existingItem.id,
    {
      quoteId: 'quote-1',
      serviceId: null,
      packageName: 'Updated Cairo Extension',
      country: 'Egypt',
      supplierName: 'Cairo Partner DMC',
      startDay: 1,
      endDay: 4,
      pricingBasis: 'PER_GROUP',
      netCost: 950,
      currency: 'USD',
      includes: 'Cairo guide and transfers',
      excludes: 'International flights',
      internalNotes: 'Updated partner notes',
      hotelsOrSimilar: 'Cairo hotel or similar',
      clientDescription: 'Updated Cairo and Giza extension.',
      quantity: 1,
      paxCount: 4,
      markupPercent: 10,
    },
    { companyId: 'company-1' } as any,
  );

  assert.equal(supplierServiceLookupCount, 0);
  assert.equal((updatedData as any)?.serviceId, null);
  assert.equal((updatedData as any)?.externalPackageName, 'Updated Cairo Extension');
  assert.equal((updatedData as any)?.externalNetCost, 950);
  assert.equal((updated as any).service?.name, 'Updated Cairo Extension');
});

test('quote-only EXTERNAL_PACKAGE hotels-only edit keeps pricing stable and serviceId null', async () => {
  const quote = {
    id: 'quote-1',
    quoteCurrency: 'USD',
    adults: 18,
    children: 3,
    roomCount: 11,
    nightCount: 1,
    travelStartDate: null,
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    focType: 'NONE',
    focRatio: null,
    focCount: null,
    focRoomType: null,
    pricingType: 'simple',
    pricingMode: 'SIMPLE',
    jordanPassType: 'NONE',
    pricingSlabs: [],
  };
  const items: any[] = [];
  let supplierServiceLookupCount = 0;
  let quoteTotals: Record<string, any> | null = null;
  const service = createQuotesService({
    quote: {
      findFirst: async ({ where }: any) => (where?.revisedFromId ? null : where?.id === quote.id ? quote : null),
      findUnique: async ({ where }: any) => (where?.id === quote.id ? quote : null),
      update: async ({ data }: any) => {
        quoteTotals = data;
        return { ...quote, ...data };
      },
    },
    quoteItem: {
      create: async ({ data }: any) => {
        assert.notEqual(data.externalPackagePricingMatrixJson, null);
        const item = {
          id: 'item-external-1',
          createdAt: new Date('2026-04-27T00:00:00.000Z'),
          updatedAt: new Date('2026-04-27T00:00:00.000Z'),
          ...data,
          service: null,
          entranceFee: null,
          appliedVehicleRate: null,
        };
        items.push(item);
        return item;
      },
      findFirst: async ({ where }: any) =>
        items.find((item) => item.id === where?.id && (where.optionId === undefined || item.optionId === where.optionId)) || null,
      findMany: async ({ where }: any) => {
        if (where?.entranceFeeId) {
          return [];
        }

        return items.filter((item) => item.quoteId === where?.quoteId && (where.optionId === undefined || item.optionId === where.optionId));
      },
      update: async ({ where, data }: any) => {
        assert.notEqual(data.externalPackagePricingMatrixJson, null);
        const index = items.findIndex((item) => item.id === where.id);
        assert.notEqual(index, -1);
        items[index] = { ...items[index], ...data, service: null };
        return items[index];
      },
      count: async () => 0,
    },
    supplierService: {
      findUnique: async () => {
        supplierServiceLookupCount += 1;
        return null;
      },
    },
    activity: {
      findUnique: async () => null,
    },
    itinerary: {
      findUnique: async () => null,
      findFirst: async () => null,
    },
    quoteItineraryDay: {
      findUnique: async () => null,
      findFirst: async () => null,
    },
    quoteOption: {
      findUnique: async () => null,
    },
  });

  const created = await service.createItem(
    {
      quoteId: quote.id,
      serviceId: null,
      packageName: 'Cairo Extension',
      country: 'Egypt',
      supplierName: 'Cairo Partner DMC',
      startDay: 1,
      endDay: 4,
      pricingBasis: 'PER_PERSON',
      netCost: 1500,
      pricingMatrixJson: null,
      currency: 'USD',
      includes: 'Cairo guide and transfers',
      excludes: 'International flights',
      internalNotes: 'Partner net rate locked by ops',
      hotelsOrSimilar: 'Original hotels',
      clientDescription: 'Four-day private Cairo and Giza extension.',
      quantity: 1,
      paxCount: 21,
      markupPercent: 20,
    },
    { companyId: 'company-1' } as any,
  );

  const createdCost = created.totalCost;
  const createdSell = created.totalSell;
  const updated = await service.updateItem(
    created.id,
    {
      quoteId: quote.id,
      serviceId: 'manual/external-package',
      hotelsOrSimilar: 'Updated hotels or similar',
    },
    { companyId: 'company-1' } as any,
  );

  assert.equal(supplierServiceLookupCount, 0);
  assert.equal(updated.serviceId, null);
  assert.equal(updated.externalPackageCountry, 'Egypt');
  assert.equal(updated.externalPackageName, 'Cairo Extension');
  assert.equal(updated.externalStartDay, 1);
  assert.equal(updated.externalEndDay, 4);
  assert.equal(updated.externalPricingBasis, 'PER_PERSON');
  assert.equal(updated.externalNetCost, 1500);
  assert.equal(updated.externalHotelsOrSimilar, 'Updated hotels or similar');
  assert.equal(updated.externalClientDescription, 'Four-day private Cairo and Giza extension.');
  assert.equal(updated.externalIncludes, 'Cairo guide and transfers');
  assert.equal(updated.externalExcludes, 'International flights');
  assert.equal(updated.totalCost, createdCost);
  assert.equal(updated.totalSell, createdSell);
  assert.equal((quoteTotals as any)?.totalCost, createdCost);
  assert.equal((quoteTotals as any)?.totalSell, createdSell);
});

test('quote item update preserves touring route source metadata when omitted', async () => {
  const quote = {
    id: 'quote-1',
    quoteCurrency: 'USD',
    adults: 2,
    children: 0,
    roomCount: 1,
    nightCount: 1,
    travelStartDate: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    focType: 'NONE',
    focRatio: null,
    focCount: null,
    focRoomType: null,
    pricingType: 'simple',
    pricingMode: 'SIMPLE',
    jordanPassType: 'NONE',
    pricingSlabs: [],
  };
  const existingItem = {
    id: 'item-origin-1',
    quoteId: quote.id,
    serviceId: 'transport-service-1',
    quantity: 1,
    paxCount: 2,
    markupPercent: 10,
    currency: 'USD',
    serviceDate: null,
    useOverride: false,
    overrideCost: null,
    overrideReason: null,
    transportServiceTypeId: 'transport-type-1',
    vehicleId: 'vehicle-van',
    touringRouteId: 'touring-route-1',
    touringRoutePricingId: 'touring-pricing-1',
  };
  let updatedData: any = null;
  const service = createQuotesService({
    quote: {
      findFirst: async ({ where }: any) => (where.id === quote.id ? quote : null),
      findUnique: async ({ where }: any) => (where.id === quote.id ? quote : null),
    },
    quoteItem: {
      findFirst: async ({ where }: any) => (where.id === existingItem.id ? existingItem : null),
      findMany: async () => [],
      update: async ({ data }: any) => {
        updatedData = data;
        return { ...existingItem, ...data };
      },
    },
    supplierService: {
      findUnique: async ({ where }: any) =>
        where.id === 'transport-service-1'
          ? {
              id: 'transport-service-1',
              name: 'Transport service',
              category: 'Transport',
              unitType: 'per_group',
              baseCost: 0,
              currency: 'USD',
              costBaseAmount: 0,
              costCurrency: 'USD',
              salesTaxPercent: 0,
              salesTaxIncluded: false,
              serviceChargePercent: 0,
              serviceChargeIncluded: false,
              serviceType: { name: 'Transport', code: 'TRANSPORT' },
            }
          : null,
    },
    touringRoute: {
      findUnique: async ({ where }: any) =>
        where.id === 'touring-route-1'
          ? {
              id: 'touring-route-1',
              name: 'Dead Sea Petra Full Day',
              startCity: 'Dead Sea',
              active: true,
              mainDestinations: ['Petra'],
              durationDays: 1,
              stops: [],
              pricings: [
                {
                  id: 'touring-pricing-1',
                  active: true,
                  baseCost: 180,
                  currency: 'USD',
                  minPax: 1,
                  maxPax: 7,
                  transportServiceTypeId: 'transport-type-1',
                  vehicleId: 'vehicle-van',
                  pricingBasis: 'PER_VEHICLE',
                  transportServiceType: { id: 'transport-type-1', name: 'Touring Route' },
                  vehicle: { id: 'vehicle-van', name: 'Van' },
                },
              ],
            }
          : null,
    },
    activity: { findUnique: async () => null },
    itinerary: { findUnique: async () => null },
    quoteItineraryDay: { findUnique: async () => null },
    quoteOption: { findUnique: async () => null },
  });
  (service as any).recalculateQuoteTotals = async () => undefined;

  await service.updateItem(
    existingItem.id,
    {
      quoteId: quote.id,
      quantity: 2,
      markupPercent: 15,
    },
    { companyId: 'company-1' } as any,
  );

  assert.equal(updatedData.touringRouteId, 'touring-route-1');
  assert.equal(updatedData.touringRoutePricingId, 'touring-pricing-1');
  assert.match(updatedData.pricingDescription, /Excursion origin variant/);
});

test('new transfer route quote item saves from selected vehicle rate and route-scoped transport service', async () => {
  const quote = {
    id: 'quote-1',
    quoteCurrency: 'USD',
    adults: 2,
    children: 0,
    roomCount: 1,
    nightCount: 1,
    travelStartDate: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    focType: 'NONE',
    focRatio: null,
    focCount: null,
    focRoomType: null,
    pricingType: 'simple',
    pricingMode: 'SIMPLE',
    jordanPassType: 'NONE',
    pricingSlabs: [],
  };
  const service = createQuotesService({
    quote: {
      findUnique: async ({ where }: any) => (where.id === quote.id ? quote : null),
    },
    supplierService: {
      findUnique: async ({ where }: any) =>
        where.id === 'service-wadi-rum-dead-sea'
          ? {
              id: 'service-wadi-rum-dead-sea',
              name: 'Wadi Rum -> Dead Sea',
              category: 'Transport',
              unitType: 'per_group',
              baseCost: 0,
              currency: 'USD',
              costBaseAmount: 0,
              costCurrency: 'USD',
              salesTaxPercent: 0,
              salesTaxIncluded: false,
              serviceChargePercent: 0,
              serviceChargeIncluded: false,
              serviceType: { name: 'Transport', code: 'TRANSPORT' },
              serviceRates: [],
              ticketRateVariants: [],
            }
          : null,
    },
    itinerary: { findUnique: async () => null },
    quoteItineraryDay: { findUnique: async () => null },
    quoteOption: { findUnique: async () => null },
    activity: { findUnique: async () => null },
    activityRateVariant: { findUnique: async () => null },
    ticketRateVariant: { findUnique: async () => null },
  });

  (service as any).transportPricingService = {
    resolvePricingRule: async () => {
      throw new Error('Expected selected vehicle rate path');
    },
    findMatchingRate: async (input: any) => {
      assert.equal(input.routeId, 'route-wadi-rum-dead-sea');
      assert.equal(input.serviceTypeId, 'transport-type-point-to-point');
      assert.equal(input.vehicleRateId, 'rate-wadi-rum-dead-sea-sedan');
      assert.equal(input.vehicleId, 'vehicle-sedan-2');
      assert.equal(input.paxCount, 2);

      return {
        id: 'rate-wadi-rum-dead-sea-sedan',
        routeId: 'route-wadi-rum-dead-sea',
        routeName: 'Wadi Rum -> Dead Sea',
        price: 140,
        currency: 'USD',
        maxPax: 2,
        serviceTypeId: 'transport-type-point-to-point',
        serviceType: { id: 'transport-type-point-to-point', name: 'Point-to-Point', code: 'POINT_TO_POINT', classification: 'ROUTE_TRANSFER' },
        vehicle: { id: 'vehicle-sedan-2', name: 'Sedan 2' },
      };
    },
  };

  const values = await (service as any).resolveQuoteItemValues({
    quoteId: quote.id,
    serviceId: 'service-wadi-rum-dead-sea',
    quantity: 1,
    paxCount: 2,
    markupPercent: 30,
    transportServiceTypeId: 'transport-type-point-to-point',
    vehicleRateId: 'rate-wadi-rum-dead-sea-sedan',
    transportVehicleId: 'vehicle-sedan-2',
    routeId: 'route-wadi-rum-dead-sea',
    routeName: 'Wadi Rum -> Dead Sea',
    currency: 'USD',
  });

  assert.equal(values.data.serviceId, 'service-wadi-rum-dead-sea');
  assert.equal(values.data.routeId, 'route-wadi-rum-dead-sea');
  assert.equal(values.data.transportServiceTypeId, 'transport-type-point-to-point');
  assert.equal(values.data.vehicleId, 'vehicle-sedan-2');
  assert.equal(values.data.appliedVehicleRateId, 'rate-wadi-rum-dead-sea-sedan');
  assert.equal(values.data.totalCost, 140);
  assert.equal(values.data.totalSell, 182);
});

test('duplicate source warnings flag same quote date activity and entrance sources without blocking', async () => {
  const duplicateIds: string[] = [];
  const service = createQuotesService({
    quoteItem: {
      findMany: async ({ where }: any) => {
        if (where.activityId === 'activity-1' && where.activityRateVariantId === 'variant-1') {
          duplicateIds.push('activity');
          return [{ id: 'item-activity-duplicate' }];
        }
        if (where.entranceFeeId === 'entrance-1' && where.ticketRateVariantId === 'ticket-variant-1') {
          duplicateIds.push('ticket');
          return [{ id: 'item-ticket-duplicate' }];
        }
        return [];
      },
    },
  });

  const warnings = await (service as any).buildDuplicateSourceWarnings({
    id: 'item-new',
    quoteId: 'quote-1',
    serviceDate: new Date('2026-05-10T00:00:00.000Z'),
    activityId: 'activity-1',
    activityRateVariantId: 'variant-1',
    entranceFeeId: 'entrance-1',
    ticketRateVariantId: 'ticket-variant-1',
  });

  assert.deepEqual(duplicateIds, ['activity', 'ticket']);
  assert.deepEqual(
    warnings.map((warning: any) => warning.code),
    ['DUPLICATE_ACTIVITY_SOURCE', 'DUPLICATE_ENTRANCE_TICKET_SOURCE'],
  );
  assert.deepEqual(warnings[0].duplicateQuoteItemIds, ['item-activity-duplicate']);
  assert.deepEqual(warnings[1].duplicateQuoteItemIds, ['item-ticket-duplicate']);
});

test('guide item creation supports local full-day and active planner day attachment', async () => {
  const { service, guideServiceId, quoteItineraryDayId, dayLinks, createdItems } = createGuideQuoteService();

  const item = await service.createItem(
    {
      quoteId: 'quote-1',
      serviceId: guideServiceId,
      itineraryId: quoteItineraryDayId,
      guideType: 'local',
      guideDuration: 'full_day',
      overnight: false,
      quantity: 1,
      paxCount: 21,
      markupPercent: 20,
    },
    { companyId: 'company-1' } as any,
  );

  assert.equal(item.serviceId, guideServiceId);
  assert.equal(item.itineraryId, null);
  assert.equal(item.baseCost, 120);
  assert.equal(item.totalCost, 120);
  assert.equal(item.totalSell, 144);
  assert.equal(item.pricingDescription, 'Guide | Local | Full day | Overnight: No');
  assert.equal(dayLinks.length, 1);
  assert.equal(dayLinks[0].dayId, quoteItineraryDayId);
  assert.equal(dayLinks[0].quoteServiceId, item.id);
  assert.equal(createdItems.length, 1);
});

test('guide item creation supports escort full-day with normalized UI values', async () => {
  const { service, guideServiceId } = createGuideQuoteService();

  const item = await service.createItem(
    {
      quoteId: 'quote-1',
      serviceId: guideServiceId,
      guideType: 'escort-guide',
      guideDuration: 'full-day',
      overnight: true,
      quantity: 1,
      paxCount: 21,
      markupPercent: 20,
    },
    { companyId: 'company-1' } as any,
  );

  assert.equal(item.baseCost, 250);
  assert.equal(item.totalCost, 250);
  assert.equal(item.totalSell, 300);
  assert.equal(item.pricingDescription, 'Guide | Escort | Full day | Overnight: Yes');
});

test('guide item creation rejects non-guide service with clear error', async () => {
  const { service, guideServiceId } = createGuideQuoteService({
    category: 'Other',
    serviceType: { id: 'type-other', name: 'Other Support', code: 'OTHER' },
  });

  await assert.rejects(
    () =>
      service.createItem(
        {
          quoteId: 'quote-1',
          serviceId: guideServiceId,
          guideType: 'local',
          guideDuration: 'full_day',
          overnight: false,
          quantity: 1,
          paxCount: 21,
          markupPercent: 20,
        },
        { companyId: 'company-1' } as any,
      ),
    /Selected service is not guide-compatible/,
  );
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
    /costCurrency must be one of USD, EUR, JOD, or ILS/,
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

test('quote save accepts HB derived from BB rate plus HB supplement without direct HB rate row', async () => {
  let capturedHotelRateWhere: any = null;
  const service = createQuotesService({
    quote: {
      findUnique: async ({ where }: any) =>
        where.id === 'quote-1'
          ? {
              id: 'quote-1',
              quoteCurrency: 'USD',
              adults: 2,
              children: 0,
              roomCount: 1,
              nightCount: 2,
              travelStartDate: null,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
            }
          : null,
      findFirst: async () => null,
    },
    supplierService: {
      findUnique: async ({ where }: any) =>
        where.id === 'hotel-service'
          ? {
              id: 'hotel-service',
              name: 'Confirmed Hotel Stay',
              category: 'Hotel',
              unitType: 'per_person',
              baseCost: 0,
              currency: 'USD',
              costBaseAmount: 0,
              costCurrency: 'USD',
              salesTaxPercent: 0,
              salesTaxIncluded: false,
              serviceChargePercent: 0,
              serviceChargeIncluded: false,
              serviceType: { name: 'Hotel', code: 'HOTEL' },
              serviceRates: [],
              ticketRateVariants: [],
            }
          : null,
    },
    itinerary: { findUnique: async () => null },
    quoteItineraryDay: { findUnique: async () => null },
    quoteOption: { findUnique: async () => null },
    hotelRate: {
      findMany: async ({ where }: any) => {
        capturedHotelRateWhere = where;
        return [
          createHotelLookupRate({
            cost: 45,
            pricingBasis: 'PER_PERSON',
            supplements: [
              {
                id: 'hb-supplement',
                type: 'EXTRA_DINNER',
                amount: 10,
                chargeBasis: 'PER_PERSON',
                isActive: true,
                isMandatory: false,
                notes: 'Season: ALL_SEASONS | Meal: HB',
              },
              {
                id: 'new-year-gala',
                type: 'NEW_YEAR_GALA_DINNER',
                amount: 99,
                chargeBasis: 'PER_PERSON',
                isActive: true,
                isMandatory: true,
                notes: 'Season: ALL_SEASONS | Meal: HB',
              },
              {
                id: 'room-category-upgrade',
                type: 'ROOM_CATEGORY_SUPPLEMENT',
                amount: 20,
                chargeBasis: 'PER_ROOM_NIGHT',
                isActive: true,
                isMandatory: true,
                notes: 'Season: ALL_SEASONS',
              },
            ],
          }),
        ];
      },
    },
  });

  const result = await (service as any).resolveQuoteItemValues({
    quoteId: 'quote-1',
    serviceId: 'hotel-service',
    serviceDate: new Date('2026-06-01T09:00:00.000Z'),
    hotelId: 'hotel-1',
    contractId: 'contract-1',
    seasonName: 'Imported',
    roomCategoryId: 'room-1',
    occupancyType: 'DBL',
    mealPlan: 'HB',
    quantity: 1,
    paxCount: 2,
    roomCount: 1,
    nightCount: 2,
    markupPercent: 0,
  });

  assert.equal(capturedHotelRateWhere.mealPlan, undefined);
  assert.equal(result.data.mealPlan, 'HB');
  assert.equal(result.data.baseCost, 220);
  assert.equal(result.data.totalCost, 220);
  assert.match(result.data.pricingDescription, /DBL \| HB/);
});

test('quote save recalculates PER_PERSON hotel stay from quote pax when existing item pax is stale', async () => {
  const service = createQuotesService({
    quote: {
      findUnique: async ({ where }: any) =>
        where.id === 'quote-1'
          ? {
              id: 'quote-1',
              quoteCurrency: 'USD',
              adults: 2,
              children: 0,
              roomCount: 1,
              nightCount: 1,
              travelStartDate: null,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
            }
          : null,
      findFirst: async () => null,
    },
    supplierService: {
      findUnique: async ({ where }: any) =>
        where.id === 'hotel-service'
          ? {
              id: 'hotel-service',
              name: 'Confirmed Hotel Stay',
              category: 'Hotel',
              unitType: 'per_room',
              baseCost: 0,
              currency: 'USD',
              costBaseAmount: 0,
              costCurrency: 'USD',
              salesTaxPercent: 0,
              salesTaxIncluded: false,
              serviceChargePercent: 0,
              serviceChargeIncluded: false,
              serviceType: { name: 'Hotel', code: 'HOTEL' },
              serviceRates: [],
              ticketRateVariants: [],
            }
          : null,
    },
    itinerary: { findUnique: async () => null },
    quoteItineraryDay: { findUnique: async () => null },
    quoteOption: { findUnique: async () => null },
    hotelRate: {
      findMany: async () => [
        createHotelLookupRate({
          cost: 45,
          pricingBasis: 'PER_PERSON',
          supplements: [],
        }),
      ],
    },
  });

  const result = await (service as any).resolveQuoteItemValues({
    quoteId: 'quote-1',
    serviceId: 'hotel-service',
    serviceDate: new Date('2026-06-01T09:00:00.000Z'),
    hotelId: 'hotel-1',
    contractId: 'contract-1',
    seasonName: 'Imported',
    roomCategoryId: 'room-1',
    occupancyType: 'DBL',
    mealPlan: 'BB',
    quantity: 1,
    paxCount: 1,
    roomCount: 1,
    nightCount: 1,
    markupPercent: 0,
  });

  assert.equal(result.data.paxCount, 2);
  assert.equal(result.data.roomCount, 1);
  assert.equal(result.data.nightCount, 1);
  assert.equal(result.data.baseCost, 90);
  assert.equal(result.data.totalCost, 90);
  assert.match(result.data.pricingDescription, /Rate USD 45\.00 x 2 pax x 1 night/);
});

test('quote save calculates PER_PERSON HB stay from per-person base plus per-person supplement', async () => {
  const service = createQuotesService({
    quote: {
      findUnique: async ({ where }: any) =>
        where.id === 'quote-1'
          ? {
              id: 'quote-1',
              quoteCurrency: 'USD',
              adults: 21,
              children: 0,
              roomCount: 10,
              nightCount: 1,
              travelStartDate: null,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
            }
          : null,
      findFirst: async () => null,
    },
    supplierService: {
      findUnique: async ({ where }: any) =>
        where.id === 'hotel-service'
          ? {
              id: 'hotel-service',
              name: 'Confirmed Hotel Stay',
              category: 'Hotel',
              unitType: 'per_person',
              baseCost: 0,
              currency: 'USD',
              costBaseAmount: 0,
              costCurrency: 'USD',
              salesTaxPercent: 0,
              salesTaxIncluded: false,
              serviceChargePercent: 0,
              serviceChargeIncluded: false,
              serviceType: { name: 'Hotel', code: 'HOTEL' },
              serviceRates: [],
              ticketRateVariants: [],
            }
          : null,
    },
    itinerary: { findUnique: async () => null },
    quoteItineraryDay: { findUnique: async () => null },
    quoteOption: { findUnique: async () => null },
    hotelRate: {
      findMany: async () => [
        createHotelLookupRate({
          cost: 45,
          pricingBasis: 'PER_PERSON',
          supplements: [
            {
              id: 'hb-supplement',
              type: 'EXTRA_DINNER',
              amount: 10,
              chargeBasis: 'PER_PERSON',
              isActive: true,
              isMandatory: false,
            },
          ],
        }),
      ],
    },
  });

  const result = await (service as any).resolveQuoteItemValues({
    quoteId: 'quote-1',
    serviceId: 'hotel-service',
    serviceDate: new Date('2026-06-01T09:00:00.000Z'),
    hotelId: 'hotel-1',
    contractId: 'contract-1',
    seasonName: 'Imported',
    roomCategoryId: 'room-1',
    occupancyType: 'DBL',
    mealPlan: 'HB',
    quantity: 1,
    paxCount: 21,
    roomCount: 10,
    nightCount: 1,
    markupPercent: 20,
  });

  assert.equal(result.data.baseCost, 1155);
  assert.equal(result.data.totalCost, 1155);
  assert.equal(result.data.totalSell, 1386);
  assert.match(result.data.pricingDescription, /Supplements USD 210\.00/);
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

test('generic service PER_PERSON ServiceRate uses pax count', async () => {
  const values = await resolveServiceRateQuoteItem({
    service: { unitType: 'per_group', baseCost: 99, costBaseAmount: 99 },
    serviceRate: {
      pricingMode: 'PER_PERSON',
      costBaseAmount: 15,
      costCurrency: 'USD',
    },
    item: { paxCount: 4, markupPercent: 20 },
  });

  assert.equal(values.data.costBaseAmount, 15);
  assert.equal(values.data.totalCost, 60);
  assert.equal(values.data.totalSell, 72);
});

test('generic service PER_DAY ServiceRate uses day count', async () => {
  const values = await resolveServiceRateQuoteItem({
    service: { unitType: 'per_group', baseCost: 99, costBaseAmount: 99 },
    serviceRate: {
      pricingMode: 'PER_DAY',
      costBaseAmount: 40,
      costCurrency: 'USD',
    },
    item: { dayCount: 3, markupPercent: 10 },
  });

  assert.equal(values.data.costBaseAmount, 40);
  assert.equal(values.data.totalCost, 120);
  assert.equal(values.data.totalSell, 132);
});

test('generic service PER_GROUP ServiceRate charges one group unit', async () => {
  const values = await resolveServiceRateQuoteItem({
    service: { unitType: 'per_person', baseCost: 12, costBaseAmount: 12 },
    serviceRate: {
      pricingMode: 'PER_GROUP',
      costBaseAmount: 100,
      costCurrency: 'USD',
    },
    item: { paxCount: 8, markupPercent: 0 },
  });

  assert.equal(values.data.costBaseAmount, 100);
  assert.equal(values.data.totalCost, 100);
  assert.equal(values.data.totalSell, 100);
});

test('generic service PER_GROUP ServiceRate capacity uses max pax per unit', async () => {
  const values = await resolveServiceRateQuoteItem({
    service: { unitType: 'per_group', baseCost: 99, costBaseAmount: 99 },
    serviceRate: {
      pricingMode: 'PER_GROUP',
      costBaseAmount: 50,
      costCurrency: 'USD',
      maxPaxPerUnit: 4,
    },
    item: { paxCount: 9, markupPercent: 20 },
  });

  assert.equal(values.data.costBaseAmount, 50);
  assert.equal(values.data.totalCost, 150);
  assert.equal(values.data.totalSell, 180);
});

test('generic service without ServiceRate falls back to SupplierService base cost', async () => {
  const values = await resolveServiceRateQuoteItem({
    service: {
      unitType: 'per_person',
      baseCost: 12,
      costBaseAmount: 12,
      costCurrency: 'USD',
    },
    serviceRate: null,
    item: { paxCount: 5, markupPercent: 0 },
  });

  assert.equal(values.data.costBaseAmount, 12);
  assert.equal(values.data.totalCost, 60);
  assert.equal(values.data.totalSell, 60);
});

test('ticketing service variant prices selected entrance ticket option', async () => {
  const values = await resolveServiceRateQuoteItem({
    quote: {
      quoteCurrency: 'JOD',
    },
    service: {
      name: 'Petra Entrance Ticket',
      category: 'ticketing',
      unitType: 'per_person',
      baseCost: 50,
      currency: 'JOD',
      costBaseAmount: 50,
      costCurrency: 'JOD',
      serviceType: { name: 'Entrance Ticket', code: 'ENTRANCE_TICKET' },
      entranceFee: {
        id: 'entrance-petra',
        siteName: 'Petra Entrance Ticket',
        foreignerFeeJod: 50,
        includedInJordanPass: true,
      },
    },
    serviceRate: null,
    ticketRateVariant: {
      id: 'ticket-variant-2-days',
      label: '2 Days',
      costPrice: 55,
      currency: 'JOD',
      pricingBasis: 'PER_PERSON',
      includedInJordanPass: true,
    },
    item: {
      ticketRateVariantId: 'ticket-variant-2-days',
      paxCount: 4,
      markupPercent: 0,
    },
  });

  assert.equal(values.data.ticketRateVariantId, 'ticket-variant-2-days');
  assert.equal(values.data.costBaseAmount, 55);
  assert.equal(values.data.costCurrency, 'JOD');
  assert.equal(values.data.totalCost, 220);
  assert.equal(values.data.totalSell, 220);
  assert.match(values.data.pricingDescription, /Petra Entrance Ticket \| 2 Days \| Entrance fee/);
});

test('ticketing per-person variant uses unit ticket cost times pax, not quantity times pax', async () => {
  const values = await resolveServiceRateQuoteItem({
    quote: {
      quoteCurrency: 'USD',
    },
    service: {
      name: 'Petra Entrance Ticket',
      category: 'ticketing',
      unitType: 'per_person',
      baseCost: 50,
      currency: 'JOD',
      costBaseAmount: 50,
      costCurrency: 'JOD',
      serviceType: { name: 'Entrance Ticket', code: 'ENTRANCE_TICKET' },
      entranceFee: {
        id: 'entrance-petra',
        siteName: 'Petra Entrance Ticket',
        foreignerFeeJod: 50,
        includedInJordanPass: false,
      },
    },
    serviceRate: null,
    ticketRateVariant: {
      id: 'ticket-variant-1-day',
      label: '1 Day',
      costPrice: 50,
      currency: 'JOD',
      pricingBasis: 'PER_PERSON',
      includedInJordanPass: false,
    },
    item: {
      ticketRateVariantId: 'ticket-variant-1-day',
      quantity: 2,
      paxCount: 2,
      markupPercent: 0,
    },
  });

  assert.equal(values.data.costBaseAmount, 50);
  assert.equal(values.data.costCurrency, 'JOD');
  assert.equal(values.data.totalCost, 141);
  assert.equal(values.data.totalSell, 141);
});

test('excursion template Petra ticket payload prices one service line by pax only', async () => {
  const values = await resolveServiceRateQuoteItem({
    quote: {
      quoteCurrency: 'JOD',
    },
    service: {
      name: 'Petra Entrance Ticket',
      category: 'ticketing',
      unitType: 'per_person',
      baseCost: 50,
      currency: 'JOD',
      costBaseAmount: 50,
      costCurrency: 'JOD',
      serviceType: { name: 'Entrance Ticket', code: 'ENTRANCE_TICKET' },
      entranceFee: {
        id: 'entrance-petra',
        siteName: 'Petra Entrance Ticket',
        foreignerFeeJod: 50,
        includedInJordanPass: false,
      },
    },
    serviceRate: null,
    ticketRateVariant: {
      id: 'ticket-variant-petra-1-day',
      label: '1 Day',
      costPrice: 50,
      currency: 'JOD',
      pricingBasis: 'PER_PERSON',
      includedInJordanPass: false,
    },
    item: {
      excursionTemplateId: 'template-petra',
      excursionTemplateComponentId: 'component-petra-ticket',
      ticketRateVariantId: 'ticket-variant-petra-1-day',
      quantity: 1,
      paxCount: 2,
      markupPercent: 0,
    },
  });

  assert.equal(values.data.quantity, 1);
  assert.equal(values.data.paxCount, 2);
  assert.equal(values.data.costBaseAmount, 50);
  assert.equal(values.data.totalCost, 100);
  assert.equal(values.data.totalSell, 100);
});

test('ticketing service without variants converts entrance fee from JOD into quote currency', async () => {
  const values = await resolveServiceRateQuoteItem({
    quote: {
      quoteCurrency: 'USD',
    },
    service: {
      name: 'Ajloun Castle & Mar Elias Entrance Ticket',
      category: 'ticketing',
      unitType: 'per_person',
      baseCost: 3,
      currency: 'JOD',
      costBaseAmount: 3,
      costCurrency: 'JOD',
      serviceType: { name: 'Entrance Ticket', code: 'ENTRANCE_TICKET' },
      entranceFee: {
        id: 'entrance-ajloun',
        siteName: 'Ajloun Castle & Mar Elias Entrance Ticket',
        foreignerFeeJod: 3,
        includedInJordanPass: true,
      },
    },
    serviceRate: null,
    item: {
      paxCount: 21,
      markupPercent: 0,
    },
  });

  assert.equal(values.data.entranceFeeId, 'entrance-ajloun');
  assert.equal(values.data.costBaseAmount, 3);
  assert.equal(values.data.costCurrency, 'JOD');
  assert.equal(values.data.quoteCurrency, 'USD');
  assert.equal(values.data.totalCost, 88.83);
  assert.equal(values.data.totalSell, 88.83);
  assert.equal(values.data.fxFromCurrency, 'JOD');
  assert.equal(values.data.fxToCurrency, 'USD');
});

test('ticketing variant can override Jordan Pass eligibility', async () => {
  const values = await resolveServiceRateQuoteItem({
    quote: {
      quoteCurrency: 'JOD',
      jordanPassType: 'EXPLORER',
    },
    service: {
      name: 'Petra Entrance Ticket',
      category: 'ticketing',
      unitType: 'per_person',
      baseCost: 50,
      currency: 'JOD',
      costBaseAmount: 50,
      costCurrency: 'JOD',
      serviceType: { name: 'Entrance Ticket', code: 'ENTRANCE_TICKET' },
      entranceFee: {
        id: 'entrance-petra',
        siteName: 'Petra Entrance Ticket',
        foreignerFeeJod: 50,
        includedInJordanPass: true,
      },
    },
    serviceRate: null,
    ticketRateVariant: {
      id: 'ticket-variant-same-day',
      label: 'Same-Day Visitor',
      costPrice: 90,
      currency: 'JOD',
      pricingBasis: 'PER_PERSON',
      includedInJordanPass: false,
    },
    item: {
      ticketRateVariantId: 'ticket-variant-same-day',
      paxCount: 2,
      markupPercent: 0,
    },
  });

  assert.equal(values.data.ticketRateVariantId, 'ticket-variant-same-day');
  assert.equal(values.data.jordanPassCovered, false);
  assert.equal(values.data.jordanPassSavingsJod, 0);
  assert.equal(values.data.totalCost, 180);
});

test('meal pricing ignores generic ServiceRate and keeps custom meal cost', async () => {
  const values = await resolveServiceRateQuoteItem({
    service: {
      name: 'Lunch template',
      category: 'Meal',
      unitType: 'per_person',
      baseCost: 99,
      costBaseAmount: 99,
      serviceType: { name: 'Meal', code: 'MEAL' },
    },
    serviceRate: {
      pricingMode: 'PER_PERSON',
      costBaseAmount: 5,
      costCurrency: 'USD',
    },
    item: {
      paxCount: 3,
      customServiceName: 'Lunch in Petra',
      unitCost: 25,
      markupPercent: 0,
    },
  });

  assert.equal(values.data.costBaseAmount, 25);
  assert.equal(values.data.totalCost, 75);
  assert.equal(values.data.totalSell, 75);
});

test('guide pricing ignores generic ServiceRate and keeps guide rate table', async () => {
  const values = await resolveServiceRateQuoteItem({
    service: {
      name: 'Guide template',
      category: 'Guide',
      unitType: 'per_group',
      baseCost: 120,
      costBaseAmount: 120,
      serviceType: { name: 'Guide', code: 'GUIDE' },
    },
    serviceRate: {
      pricingMode: 'PER_DAY',
      costBaseAmount: 20,
      costCurrency: 'USD',
    },
    item: {
      guideType: 'local',
      guideDuration: 'full_day',
      markupPercent: 0,
    },
  });

  assert.equal(values.data.totalCost, 120);
  assert.equal(values.data.totalSell, 120);
});

test('catalog-backed activity ignores generic ServiceRate and keeps Activity pricing', async () => {
  const values = await resolveServiceRateQuoteItem({
    service: {
      name: 'Activity anchor',
      category: 'Activity',
      unitType: 'per_group',
      baseCost: 99,
      costBaseAmount: 99,
      serviceType: { name: 'Activity', code: 'ACTIVITY' },
    },
    serviceRate: {
      pricingMode: 'PER_GROUP',
      costBaseAmount: 20,
      costCurrency: 'USD',
      maxPaxPerUnit: 2,
    },
    activity: {
      pricingBasis: 'PER_PERSON',
      costPrice: 35,
      sellPrice: 52.5,
    },
    item: {
      activityId: 'activity-1',
      paxCount: 4,
      markupPercent: 0,
    },
  });

  assert.equal(values.data.costBaseAmount, 35);
  assert.equal(values.data.totalCost, 140);
  assert.equal(values.data.totalSell, 210);
});

test('catalog-backed activity can price from Activity Master without legacy SupplierService bridge', async () => {
  const service = createQuotesService({
    quote: {
      findUnique: async ({ where }: any) =>
        where.id === 'quote-1'
          ? {
              id: 'quote-1',
              quoteCurrency: 'USD',
              adults: 2,
              children: 0,
              roomCount: 1,
              nightCount: 1,
              travelStartDate: null,
              createdAt: new Date('2026-04-27T00:00:00.000Z'),
              jordanPassType: 'NONE',
            }
          : null,
    },
    supplierService: {
      findUnique: async () => null,
    },
    activity: {
      findUnique: async ({ where }: any) =>
        where.id === 'activity-petra-guided'
          ? {
              id: 'activity-petra-guided',
              name: 'Petra Guided Experience',
              pricingBasis: 'PER_PERSON',
              costPrice: 35,
              sellPrice: 52.5,
              currency: 'USD',
              durationMinutes: 240,
              supplierCompany: null,
              rateVariants: [
                {
                  id: 'variant-standard',
                  activityId: 'activity-petra-guided',
                  name: 'Standard Petra Guided Visit',
                  pricingBasis: 'PER_PERSON',
                  costPrice: 35,
                  sellPrice: 52.5,
                  currency: 'USD',
                  active: true,
                },
              ],
            }
          : null,
    },
    activityRateVariant: {
      findUnique: async () => null,
    },
    itinerary: { findUnique: async () => null },
    quoteItineraryDay: { findUnique: async () => null },
    quoteOption: { findUnique: async () => null },
  });

  const values = await (service as any).resolveQuoteItemValues({
    quoteId: 'quote-1',
    serviceId: null,
    activityId: 'activity-petra-guided',
    quantity: 1,
    paxCount: 2,
    markupPercent: 0,
  });

  assert.equal(values.data.serviceId, null);
  assert.equal(values.data.activityId, 'activity-petra-guided');
  assert.equal(values.data.activityRateVariantId, 'variant-standard');
  assert.equal(values.data.totalCost, 70);
  assert.equal(values.data.totalSell, 105);
});

test('activity rate variant capacity pricing calculates required jeep units', async () => {
  const values = await resolveServiceRateQuoteItem({
    service: {
      name: 'Activity anchor',
      category: 'Activity',
      unitType: 'per_group',
      baseCost: 0,
      costBaseAmount: 0,
      serviceType: { name: 'Activity', code: 'ACTIVITY' },
    },
    activity: {
      id: 'activity-1',
      name: 'Wadi Rum Jeep Tour',
      pricingBasis: 'PER_GROUP',
      costPrice: 90,
      sellPrice: 120,
    },
    activityRateVariant: {
      id: 'variant-2h',
      activityId: 'activity-1',
      name: '2 Hours',
      pricingBasis: 'PER_GROUP',
      costPrice: 90,
      sellPrice: 120,
      maxPaxPerUnit: 6,
    },
    item: {
      activityId: 'activity-1',
      activityRateVariantId: 'variant-2h',
      participantCount: 21,
      paxCount: 21,
      markupPercent: 0,
    },
  });

  assert.equal(values.data.activityRateVariantId, 'variant-2h');
  assert.equal(values.data.quantity, 4);
  assert.equal(values.data.paxCount, 21);
  assert.equal(values.data.totalCost, 360);
  assert.equal(values.data.totalSell, 480);
  assert.match(values.data.pricingDescription, /2 Hours/);
  assert.match(values.data.pricingDescription, /Capacity 6 pax\/unit/);
  assert.match(values.data.pricingDescription, /Required units 4/);
});

test('activity rate variant sell price is not masked by zero sell override from quote add flow', async () => {
  const values = await resolveServiceRateQuoteItem({
    service: {
      name: 'Activity anchor',
      category: 'Activity',
      unitType: 'per_group',
      baseCost: 0,
      costBaseAmount: 0,
      serviceType: { name: 'Activity', code: 'ACTIVITY' },
    },
    activity: {
      id: 'activity-1',
      name: 'Wadi Rum Jeep Tour',
      pricingBasis: 'PER_GROUP',
      costPrice: 75.2,
      sellPrice: 0,
    },
    activityRateVariant: {
      id: 'variant-2h',
      activityId: 'activity-1',
      name: '2 Hours',
      pricingBasis: 'PER_GROUP',
      costPrice: 75.2,
      sellPrice: 120,
      maxPaxPerUnit: 6,
    },
    item: {
      activityId: 'activity-1',
      activityRateVariantId: 'variant-2h',
      participantCount: 18,
      paxCount: 18,
      sellPrice: 0,
      markupPercent: 0,
    },
  });

  assert.equal(values.data.activityRateVariantId, 'variant-2h');
  assert.equal(values.data.quantity, 3);
  assert.equal(values.data.costBaseAmount, 75.2);
  assert.equal(values.data.totalCost, 225.6);
  assert.equal(values.data.sellPrice, null);
  assert.equal(values.data.totalSell, 360);
});

test('fresh activity variant add ignores zero sell payload without explicit override flag', async () => {
  const values = await resolveServiceRateQuoteItem({
    quote: {
      quoteCurrency: 'USD',
    },
    service: {
      name: 'Activity anchor',
      category: 'Activity',
      unitType: 'per_group',
      baseCost: 0,
      costBaseAmount: 0,
      serviceType: { name: 'Activity', code: 'ACTIVITY' },
    },
    activity: {
      id: 'activity-1',
      name: 'Wadi Rum Jeep Tour',
      pricingBasis: 'PER_GROUP',
      costPrice: 0,
      sellPrice: 0,
      currency: 'JOD',
    },
    activityRateVariant: {
      id: 'variant-2h-rum',
      activityId: 'activity-1',
      name: '2h Rum Area',
      pricingBasis: 'PER_GROUP',
      costPrice: 40,
      sellPrice: 50,
      currency: 'JOD',
      maxPaxPerUnit: 6,
    },
    item: {
      activityId: 'activity-1',
      activityRateVariantId: 'variant-2h-rum',
      participantCount: 21,
      paxCount: 21,
      sellPrice: 0,
      markupPercent: 0,
    },
  });

  assert.equal(values.data.activityRateVariantId, 'variant-2h-rum');
  assert.equal(values.data.quantity, 4);
  assert.equal(values.data.costBaseAmount, 40);
  assert.equal(values.data.costCurrency, 'JOD');
  assert.equal(values.data.quoteCurrency, 'USD');
  assert.equal(values.data.totalCost, 225.6);
  assert.equal(values.data.sellPrice, null);
  assert.equal(values.data.totalSell, 282);
  assert.equal(Number((values.data.totalSell - values.data.totalCost).toFixed(2)), 56.4);
});

test('activity rate variant capacity uses participant count when generic pax count is stale', async () => {
  const values = await resolveServiceRateQuoteItem({
    service: {
      name: 'Activity anchor',
      category: 'Activity',
      unitType: 'per_group',
      baseCost: 0,
      costBaseAmount: 0,
      serviceType: { name: 'Activity', code: 'ACTIVITY' },
    },
    activity: {
      id: 'activity-1',
      name: 'Wadi Rum Jeep Tour',
      pricingBasis: 'PER_GROUP',
      costPrice: 90,
      sellPrice: 120,
    },
    activityRateVariant: {
      id: 'variant-2h',
      activityId: 'activity-1',
      name: '2 Hours',
      pricingBasis: 'PER_GROUP',
      costPrice: 90,
      sellPrice: 120,
      maxPaxPerUnit: 6,
    },
    item: {
      activityId: 'activity-1',
      activityRateVariantId: 'variant-2h',
      participantCount: 21,
      paxCount: 1,
      markupPercent: 0,
    },
  });

  assert.equal(values.data.quantity, 4);
  assert.equal(values.data.paxCount, 21);
  assert.equal(values.data.participantCount, 21);
  assert.equal(values.data.totalCost, 360);
  assert.equal(values.data.totalSell, 480);
});

test('activity rate variant currency wins over service currency for quote pricing', async () => {
  const values = await resolveServiceRateQuoteItem({
    quote: {
      quoteCurrency: 'USD',
    },
    service: {
      name: 'Activity anchor',
      category: 'Activity',
      unitType: 'per_group',
      baseCost: 0,
      costBaseAmount: 0,
      currency: 'USD',
      costCurrency: 'USD',
      serviceType: { name: 'Activity', code: 'ACTIVITY' },
    },
    activity: {
      id: 'activity-1',
      name: 'Wadi Rum Jeep Tour',
      pricingBasis: 'PER_GROUP',
      costPrice: 90,
      sellPrice: 120,
    },
    activityRateVariant: {
      id: 'variant-ils',
      activityId: 'activity-1',
      name: 'Sunset Jeep',
      pricingBasis: 'PER_GROUP',
      currency: 'ILS',
      costPrice: 300,
      sellPrice: 420,
      maxPaxPerUnit: 5,
    },
    item: {
      activityId: 'activity-1',
      activityRateVariantId: 'variant-ils',
      participantCount: 11,
      paxCount: 11,
      markupPercent: 0,
    },
  });

  assert.equal(values.data.activityRateVariantId, 'variant-ils');
  assert.equal(values.data.currency, 'USD');
  assert.equal(values.data.costCurrency, 'ILS');
  assert.equal(values.data.costBaseAmount, 300);
  assert.equal(values.data.totalCost, 243);
  assert.equal(values.data.totalSell, 340.2);
  assert.equal(values.data.fxFromCurrency, 'ILS');
  assert.equal(values.data.fxToCurrency, 'USD');
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
