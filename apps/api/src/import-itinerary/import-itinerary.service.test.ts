import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { ImportItineraryService } from './import-itinerary.service';
import { QuotesService } from '../quotes/quotes.service';
import { mapQuoteToProposalV3 } from '../quotes/proposal-v3.mapper';

function createQuotesServiceForImportedDraft() {
  const quoteItems: any[] = [];
  const services: any[] = [];
  const dayItems: any[] = [];
  const tx = {
    company: {
      findFirst: async () => ({ id: 'company-1' }),
      create: async () => ({ id: 'company-1' }),
    },
    contact: {
      findFirst: async () => ({ id: 'contact-1' }),
      create: async () => ({ id: 'contact-1' }),
    },
    supplierService: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const service = { id: `service-${data.category}`, ...data };
        services.push(service);
        return { id: service.id };
      },
    },
    quote: {
      findFirst: async () => null,
      create: async () => ({ id: 'quote-1' }),
    },
    itinerary: {
      create: async ({ data }: any) => ({ id: `itinerary-${data.dayNumber}`, dayNumber: data.dayNumber }),
    },
    quoteItineraryDay: {
      create: async ({ data }: any) => ({ id: `day-${data.dayNumber}`, dayNumber: data.dayNumber }),
    },
    quoteItineraryDayItem: {
      createMany: async ({ data }: any) => {
        dayItems.push(...data);
        return { count: data.length };
      },
    },
    quoteItem: {
      create: async ({ data }: any) => {
        const item = { id: `quote-item-${quoteItems.length + 1}`, ...data };
        quoteItems.push(item);
        return { id: item.id };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: any) => callback(tx),
  };
  const service = new QuotesService(
    prisma as any,
    {} as any,
    { findMatchingRate: async () => null } as any,
    { evaluate: async () => null } as any,
    {} as any,
  );

  return { service, quoteItems, services, dayItems };
}

function externalPackageQuoteItem(overrides: Record<string, any> = {}) {
  return {
    id: 'external-item-1',
    itineraryId: null,
    serviceDate: new Date('2026-10-03T00:00:00.000Z'),
    service: {
      name: 'Imported External Package',
      category: 'external_package',
      serviceType: { name: 'External Package', code: 'EXTERNAL_PACKAGE' },
    },
    externalPackageCountry: 'Egypt',
    externalSupplierName: 'Cairo Partner DMC',
    externalStartDay: 3,
    externalEndDay: 5,
    externalStartDate: new Date('2026-10-03T00:00:00.000Z'),
    externalEndDate: new Date('2026-10-05T00:00:00.000Z'),
    externalPricingBasis: 'PER_PERSON',
    externalNetCost: 250,
    externalIncludes: 'Private touring',
    externalExcludes: 'International flights',
    externalInternalNotes: 'Supplier net cost is internal',
    externalClientDescription: 'Imported Cairo and Giza extension.',
    pricingDescription: 'Egypt external package | per person',
    totalCost: 1000,
    totalSell: 1200,
    ...overrides,
  };
}

test('import itinerary template parses EXTERNAL_PACKAGE rows and maps external package fields', async () => {
  const service = new ImportItineraryService();
  const rawText = [
    'serviceType|country|supplierName|startDay|endDay|startDate|endDate|pricingBasis|netCost|currency|includes|excludes|internalNotes|clientDescription|title',
    'EXTERNAL_PACKAGE|Israel|Tel Aviv DMC|3|4|2026-10-03|2026-10-04|PER_GROUP|1200|USD|Guide and transfers|Border fees|Partner net only|Jerusalem and Tel Aviv touring|Israel extension',
    'EXTERNAL_PACKAGE|Egypt|Cairo DMC|5|7|2026-10-05|2026-10-07|per person|250|EUR|Pyramids touring|Flights|Net held by ops|Cairo and Giza extension|Egypt extension',
  ].join('\n');

  const result = await service.parse({ rawText, sourceType: 'text' });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].type, 'external_package');
  assert.equal(result.items[0].serviceType, 'EXTERNAL_PACKAGE');
  assert.equal(result.items[0].country, 'Israel');
  assert.equal(result.items[0].supplierName, 'Tel Aviv DMC');
  assert.equal(result.items[0].startDay, 3);
  assert.equal(result.items[0].endDay, 4);
  assert.equal(result.items[0].startDate, '2026-10-03');
  assert.equal(result.items[0].endDate, '2026-10-04');
  assert.equal(result.items[0].pricingBasis, 'PER_GROUP');
  assert.equal(result.items[0].netCost, 1200);
  assert.equal(result.items[0].currency, 'USD');
  assert.equal(result.items[0].includes, 'Guide and transfers');
  assert.equal(result.items[0].excludes, 'Border fees');
  assert.equal(result.items[0].internalNotes, 'Partner net only');
  assert.equal(result.items[0].clientDescription, 'Jerusalem and Tel Aviv touring');
  assert.equal(result.items[1].pricingBasis, 'PER_PERSON');
});

test('import itinerary template flags external package validation errors with row and field context', async () => {
  const service = new ImportItineraryService();
  const rawText = [
    'serviceType|country|supplierName|startDay|endDay|startDate|endDate|pricingBasis|netCost|currency|includes|excludes|internalNotes|clientDescription',
    'EXTERNAL_PACKAGE||Bad DMC|5|3|2026-10-08|2026-10-07|PER_DAY|abc|GBP||||',
  ].join('\n');

  const result = await service.parse({ rawText, sourceType: 'text' });
  const warnings = result.parseWarnings.join('\n');

  assert.equal(result.items.length, 0);
  assert.equal(result.unresolved.length, 1);
  assert.match(warnings, /row 2 country: required/);
  assert.match(warnings, /row 2 pricingBasis: invalid pricingBasis/);
  assert.match(warnings, /row 2 netCost: invalid netCost/);
  assert.match(warnings, /row 2 currency: invalid currency/);
  assert.match(warnings, /row 2 clientdescription: required/);
  assert.match(warnings, /row 2 endDay: cannot be before startDay/);
  assert.match(warnings, /row 2 endDate: cannot be before startDate/);
});

test('imported external package draft prices PER_PERSON and PER_GROUP without hotel items', async () => {
  const { service, quoteItems, services, dayItems } = createQuotesServiceForImportedDraft();

  const draft = await service.createDraftFromImportedItinerary({
    sourceType: 'text',
    days: [{ dayNumber: 1, title: 'Egypt', summary: 'External package only' }],
    items: [
      {
        dayNumber: 1,
        type: 'external_package',
        title: 'Egypt per person package',
        description: 'Cairo extension',
        notes: '',
        country: 'Egypt',
        supplierName: 'Cairo DMC',
        startDay: 1,
        endDay: 3,
        startDate: '2026-10-01',
        endDate: '2026-10-03',
        pricingBasis: 'PER_PERSON',
        netCost: 250,
        currency: 'USD',
        includes: 'Guide',
        excludes: 'Flights',
        internalNotes: 'Internal supplier note',
        clientDescription: 'Cairo and Giza extension.',
      },
      {
        dayNumber: 1,
        type: 'EXTERNAL_PACKAGE',
        title: 'Egypt group package',
        description: 'Group package',
        notes: '',
        country: 'Egypt',
        startDay: 1,
        endDay: 3,
        pricingBasis: 'PER_GROUP',
        netCost: 900,
        currency: 'USD',
        clientDescription: 'Group Cairo package.',
      } as any,
    ],
    unresolved: [],
  });

  assert.deepEqual(draft, { id: 'quote-1' });
  assert.equal(services.some((entry) => entry.category === 'external_package'), true);
  assert.equal(dayItems.length, 2);
  assert.equal(quoteItems.length, 2);
  assert.equal(quoteItems[0].externalPricingBasis, 'PER_PERSON');
  assert.equal(quoteItems[0].totalCost, 250);
  assert.equal(quoteItems[0].costCurrency, 'USD');
  assert.equal(quoteItems[0].externalInternalNotes, 'Internal supplier note');
  assert.equal(quoteItems[1].externalPricingBasis, 'PER_GROUP');
  assert.equal(quoteItems[1].totalCost, 900);
});

test('imported external package draft rejects invalid fields with row context', async () => {
  const { service } = createQuotesServiceForImportedDraft();

  await assert.rejects(
    () =>
      service.createDraftFromImportedItinerary({
        sourceType: 'text',
        days: [{ dayNumber: 1, title: 'Egypt', summary: '' }],
        items: [
          {
            dayNumber: 1,
            type: 'external_package',
            title: 'Bad package',
            description: '',
            notes: '',
            country: 'Egypt',
            pricingBasis: 'PER_DAY',
            netCost: 100,
            currency: 'USD',
            clientDescription: 'Bad package',
          },
        ],
        unresolved: [],
      }),
    (error: unknown) => error instanceof BadRequestException && /row 1 pricingBasis/.test(error.message),
  );
});

test('imported external package renders in client proposal while hiding supplier net fields', () => {
  const proposal = mapQuoteToProposalV3({
    id: 'quote-1',
    quoteNumber: 'Q-2026-0001',
    quoteCurrency: 'USD',
    title: 'Imported Egypt Extension',
    description: 'External package import',
    inclusionsText: null,
    exclusionsText: null,
    termsNotesText: null,
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    travelStartDate: new Date('2026-10-01T00:00:00.000Z'),
    nightCount: 0,
    adults: 1,
    children: 0,
    totalCost: 1000,
    totalSell: 1200,
    pricePerPax: 1200,
    quoteOptions: [],
    itineraries: [],
    quoteItems: [externalPackageQuoteItem()],
  } as any);
  const renderedText = JSON.stringify(proposal);

  assert.match(renderedText, /Imported Cairo and Giza extension/);
  assert.match(renderedText, /Private touring/);
  assert.doesNotMatch(renderedText, /Cairo Partner DMC/);
  assert.doesNotMatch(renderedText, /Supplier net cost/);
  assert.doesNotMatch(renderedText, /externalNetCost/);
});

test('imported own-operation rows and external packages produce one continuous itinerary', async () => {
  const service = new ImportItineraryService();
  const rawText = [
    'serviceType|country|startDay|endDay|pricingBasis|netCost|currency|clientDescription|title',
    'activity|Jordan|1|1|PER_GROUP|0|USD|Petra touring|Petra visit',
    'EXTERNAL_PACKAGE|Israel|2|3|PER_GROUP|1200|USD|Jerusalem and Tel Aviv touring|Israel extension',
    'EXTERNAL_PACKAGE|Egypt|4|5|PER_PERSON|250|USD|Cairo and Giza extension|Egypt extension',
  ].join('\n');

  const parsed = await service.parse({ rawText, sourceType: 'text' });
  const proposal = mapQuoteToProposalV3({
    id: 'quote-1',
    quoteNumber: 'Q-2026-0002',
    quoteCurrency: 'USD',
    title: 'Imported Jordan Israel Egypt',
    description: 'Imported mixed itinerary',
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    travelStartDate: new Date('2026-10-01T00:00:00.000Z'),
    nightCount: 4,
    adults: 1,
    children: 0,
    totalCost: 2450,
    totalSell: 2450,
    pricePerPax: 2450,
    quoteOptions: [],
    itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Day 1: Jordan', description: 'Petra touring' }],
    quoteItems: [
      externalPackageQuoteItem({
        id: 'israel-package',
        externalPackageCountry: 'Israel',
        externalStartDay: 2,
        externalEndDay: 3,
        externalClientDescription: 'Jerusalem and Tel Aviv touring',
        totalCost: 1200,
        totalSell: 1200,
      }),
      externalPackageQuoteItem({
        id: 'egypt-package',
        externalPackageCountry: 'Egypt',
        externalStartDay: 4,
        externalEndDay: 5,
        externalClientDescription: 'Cairo and Giza extension',
        totalCost: 1250,
        totalSell: 1250,
      }),
    ],
  } as any);

  assert.deepEqual(parsed.days.map((day) => day.dayNumber), [1, 2, 3, 4, 5]);
  assert.deepEqual(proposal.days.map((day) => day.dayNumber), [1, 2, 3, 4, 5]);
  assert.match(JSON.stringify(proposal), /Jerusalem and Tel Aviv touring/);
  assert.match(JSON.stringify(proposal), /Cairo and Giza extension/);
  assert.equal(proposal.pricingHighlightTotal, '$2,450.00');
});
