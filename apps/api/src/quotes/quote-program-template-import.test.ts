import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { QuotesService } from './quotes.service';
import { QuotePricingService } from './quote-pricing.service';

function createClassicJordanTemplate() {
  const days = Array.from({ length: 8 }, (_, index) => {
    const dayNumber = index + 1;
    return {
      id: `template-day-${dayNumber}`,
      dayNumber,
      title: `Classic Jordan Day ${dayNumber}`,
      description: `Program structure for day ${dayNumber}`,
      active: true,
      components: [
        {
          id: `component-${dayNumber}`,
          componentType: dayNumber === 2 ? 'EXCURSION_TEMPLATE' : dayNumber === 4 ? 'HOTEL' : 'SERVICE',
          dayNumber,
          label: `Draft component ${dayNumber}`,
          sortOrder: 10,
          isOptional: false,
          active: true,
          operationalNotes: 'Template source note',
          excursionTemplateId: dayNumber === 2 ? 'excursion-template-1' : null,
          hotelContractId: dayNumber === 4 ? 'hotel-contract-1' : null,
          supplierServiceId: dayNumber === 2 || dayNumber === 4 ? null : `service-${dayNumber}`,
        },
      ],
    };
  });

  return {
    id: 'classic-jordan-template',
    code: 'PROGRAM-CLASSIC-JORDAN-8D7N',
    name: 'Classic Jordan 8D7N',
    days,
    components: days.flatMap((day) => day.components),
  };
}

function createService() {
  const createdItineraryDays: any[] = [];
  const createdQuoteDays: any[] = [];
  const createdQuoteItems: any[] = [];
  const createdDayItems: any[] = [];
  const template = createClassicJordanTemplate();

  const prisma = {
    packageTemplate: {
      findUnique: async () => template,
    },
    itinerary: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const day = { id: `itinerary-${data.dayNumber}`, ...data };
        createdItineraryDays.push(day);
        return day;
      },
      update: async ({ data }: any) => data,
    },
    quoteItineraryDay: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const day = { id: `quote-day-${data.dayNumber}`, ...data };
        createdQuoteDays.push(day);
        return day;
      },
      update: async ({ data }: any) => data,
    },
    quoteItem: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const item = { id: `quote-item-${createdQuoteItems.length + 1}`, ...data };
        createdQuoteItems.push(item);
        return item;
      },
      deleteMany: async () => {
        throw new Error('import should not delete existing quote items');
      },
    },
    quoteItineraryDayItem: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdDayItems.push(data);
        return { id: `day-item-${createdDayItems.length}`, ...data };
      },
    },
  };

  const service = new QuotesService(
    prisma as any,
    {} as any,
    {} as any,
    { evaluate: async () => null } as any,
    new QuotePricingService(),
  );
  (service as any).assertQuoteMutationAccess = async () => ({
    id: 'quote-1',
    adults: 18,
    children: 2,
    roomCount: 10,
    nightCount: 7,
    quoteCurrency: 'JOD',
  });
  (service as any).recalculateQuoteTotals = async () => null;

  return { service, createdItineraryDays, createdQuoteDays, createdQuoteItems, createdDayItems };
}

test('imports Classic Jordan 8D7N as editable draft quote itinerary components', async () => {
  const { service, createdItineraryDays, createdQuoteDays, createdQuoteItems, createdDayItems } = createService();

  const result = await service.importProgramTemplateToQuote(
    'quote-1',
    {
      packageTemplateId: 'classic-jordan-template',
      startDate: '2026-05-29',
      pax: 20,
      hotelCategory: '4 star',
      guideLanguage: 'English',
    },
    { companyId: 'company-1' } as any,
  );

  assert.equal(result.importedDays, 8);
  assert.equal(createdItineraryDays.length, 8);
  assert.equal(createdQuoteDays.length, 8);
  assert.equal(createdQuoteItems.length, 8);
  assert.equal(createdDayItems.length, 8);
  assert.ok(createdQuoteItems.every((item) => item.packageTemplateId === 'classic-jordan-template'));
  assert.ok(createdQuoteItems.every((item) => item.packageTemplateDayId));
  assert.ok(createdQuoteItems.every((item) => item.packageTemplateComponentId));
  assert.ok(createdQuoteItems.every((item) => item.totalCost === 0 && item.totalSell === 0));
  assert.ok(createdQuoteItems.every((item) => item.pricingDescription.includes('not auto-calculated')));
  assert.equal(createdQuoteItems[0].paxCount, 20);
  assert.equal(createdQuoteItems[0].currency, 'JOD');
  assert.match(createdQuoteItems[0].externalInternalNotes, /Requested hotel category: 4 star/);
  assert.match(createdQuoteItems[0].externalInternalNotes, /Requested guide language: English/);
});

test('program template quote integration is exposed without replacing package assembly', () => {
  let repoRoot = process.cwd();
  while (!existsSync(join(repoRoot, 'apps/admin-web')) && dirname(repoRoot) !== repoRoot) {
    repoRoot = dirname(repoRoot);
  }
  const controllerSource = readFileSync(join(repoRoot, 'apps/api/src/quotes/quotes.controller.ts'), 'utf8');
  const serviceSource = readFileSync(join(repoRoot, 'apps/api/src/quotes/quotes.service.ts'), 'utf8');
  const plannerSource = readFileSync(join(repoRoot, 'apps/admin-web/app/quotes/[id]/QuoteServicePlanner.tsx'), 'utf8');
  const importPanelSource = readFileSync(join(repoRoot, 'apps/admin-web/app/quotes/[id]/ProgramTemplateImportPanel.tsx'), 'utf8');

  assert.match(controllerSource, /@Post\(':id\/import-program-template'\)/);
  assert.match(serviceSource, /importProgramTemplateToQuote/);
  assert.match(importPanelSource, /Confirm Import Program Template/);
  assert.match(importPanelSource, /packageTemplateId: selectedTemplate\.id/);
  assert.match(plannerSource, /<ProgramTemplateImportPanel/);
});
