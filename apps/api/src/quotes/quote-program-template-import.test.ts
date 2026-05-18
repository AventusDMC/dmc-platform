import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { QuotesService } from './quotes.service';
import { QuotePricingService } from './quote-pricing.service';

function createClassicJordanTemplate() {
  const componentTypesByDay: Record<number, string> = {
    1: 'TRANSPORT',
    2: 'EXCURSION_TEMPLATE',
    3: 'SERVICE',
    4: 'HOTEL',
    5: 'DINING',
    6: 'TICKET',
    7: 'GUIDE',
    8: 'EXTERNAL_PACKAGE',
  };

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
          componentType: componentTypesByDay[dayNumber],
          dayNumber,
          label: dayNumber === 2 ? 'Jerash & Ajloun' : dayNumber === 4 ? 'Amman hotel overnight' : `Draft component ${dayNumber}`,
          sortOrder: 10,
          isOptional: false,
          active: true,
          operationalNotes: 'Template source note',
          excursionTemplateId: dayNumber === 2 ? 'excursion-template-1' : null,
          hotelContractId: dayNumber === 4 ? 'hotel-contract-1' : null,
          supplierServiceId: null,
          routeId: dayNumber === 1 ? 'route-airport-amman' : null,
          touringRouteId: dayNumber === 1 ? 'touring-route-1' : null,
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
  const createdServiceTypes: any[] = [];
  const createdSupplierServices: any[] = [];
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
    serviceType: {
      findFirst: async ({ where }: any) => {
        const code = where.code.equals;
        return createdServiceTypes.find((serviceType) => serviceType.code === code) || null;
      },
      create: async ({ data }: any) => {
        const serviceType = { id: `service-type-${createdServiceTypes.length + 1}`, ...data };
        createdServiceTypes.push(serviceType);
        return serviceType;
      },
    },
    supplierService: {
      findFirst: async ({ where }: any) =>
        createdSupplierServices.find(
          (service) => service.supplierId === where.supplierId && service.name === where.name && service.category === where.category,
        ) || null,
      create: async ({ data }: any) => {
        const service = { id: `supplier-service-${createdSupplierServices.length + 1}`, ...data };
        createdSupplierServices.push(service);
        return service;
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

  return { service, createdItineraryDays, createdQuoteDays, createdQuoteItems, createdDayItems, createdServiceTypes, createdSupplierServices };
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
  assert.match(createdQuoteItems[0].pricingDescription, /Requested hotel category: 4 star/);
  assert.match(createdQuoteItems[0].pricingDescription, /Requested guide language: English/);
});

test('program template import maps component types to quote service lanes without defaulting to external package', async () => {
  const { service, createdQuoteItems, createdSupplierServices, createdServiceTypes } = createService();

  await service.importProgramTemplateToQuote(
    'quote-1',
    {
      packageTemplateId: 'classic-jordan-template',
      startDate: '2026-05-29',
      pax: 20,
    },
    { companyId: 'company-1' } as any,
  );

  const serviceById = new Map(createdSupplierServices.map((supplierService) => [supplierService.id, supplierService]));
  const serviceTypeById = new Map(createdServiceTypes.map((serviceType) => [serviceType.id, serviceType]));
  const laneCodeForItem = (item: any) => serviceTypeById.get(serviceById.get(item.serviceId)?.serviceTypeId)?.code;

  const transport = createdQuoteItems.find((item) => item.packageTemplateComponentId === 'component-1');
  const jerashAjloun = createdQuoteItems.find((item) => item.packageTemplateComponentId === 'component-2');
  const hotel = createdQuoteItems.find((item) => item.packageTemplateComponentId === 'component-4');
  const meal = createdQuoteItems.find((item) => item.packageTemplateComponentId === 'component-5');
  const ticket = createdQuoteItems.find((item) => item.packageTemplateComponentId === 'component-6');
  const guide = createdQuoteItems.find((item) => item.packageTemplateComponentId === 'component-7');
  const externalPackage = createdQuoteItems.find((item) => item.packageTemplateComponentId === 'component-8');

  assert.equal(laneCodeForItem(jerashAjloun), 'ACTIVITY');
  assert.equal(jerashAjloun.excursionTemplateId, 'excursion-template-1');
  assert.equal(laneCodeForItem(hotel), 'HOTEL');
  assert.equal(hotel.contractId, 'hotel-contract-1');
  assert.equal(hotel.roomCount, 1);
  assert.equal(hotel.nightCount, 1);
  assert.equal(laneCodeForItem(transport), 'TRANSPORT');
  assert.equal(transport.touringRouteId, 'touring-route-1');
  assert.equal(laneCodeForItem(meal), 'MEAL');
  assert.equal(laneCodeForItem(ticket), 'ENTRANCE_TICKET');
  assert.equal(laneCodeForItem(guide), 'GUIDE');

  for (const item of createdQuoteItems.filter((quoteItem) => quoteItem.packageTemplateComponentId !== 'component-8')) {
    assert.equal(item.externalPackageName, undefined);
    assert.equal(item.externalInternalNotes, undefined);
    assert.ok(item.serviceId);
  }

  assert.equal(externalPackage.serviceId, null);
  assert.equal(externalPackage.externalPackageName, 'Draft component 8');
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
