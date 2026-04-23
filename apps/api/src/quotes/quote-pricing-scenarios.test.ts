import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';
import { QuotePricingService } from './quote-pricing.service';
import { calculateMultiCurrencyQuoteItemPricing } from './multi-currency-pricing';

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
