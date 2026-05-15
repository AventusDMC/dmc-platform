import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QuotesService } from './quotes.service';
import { QuotePricingService } from './quote-pricing.service';

function createService(template: any, duplicateComponentIds: string[] = []) {
  const createdPayloads: any[] = [];
  const prisma = {
    excursionTemplate: {
      findUnique: async () => template,
    },
    quoteItem: {
      findFirst: async ({ where }: any) =>
        duplicateComponentIds.includes(where.excursionTemplateComponentId)
          ? { id: `quote-item-${where.excursionTemplateComponentId}` }
          : null,
    },
    quoteItineraryDay: {
      findUnique: async ({ where }: any) => (where.id === 'day-1' ? { id: 'day-1', quoteId: 'quote-1' } : null),
    },
    supplierService: {
      findMany: async () => [],
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
    children: 3,
    roomCount: 10,
    nightCount: 1,
  });
  (service as any).createItem = async (payload: any) => {
    createdPayloads.push(payload);
    return {
      id: `quote-item-${payload.excursionTemplateComponentId}`,
      ...payload,
    };
  };

  return { service, createdPayloads };
}

function createTemplate() {
  return {
    id: 'template-1',
    active: true,
    components: [
      {
        id: 'component-transport',
        componentType: 'TRANSPORT',
        label: 'Transport',
        sortOrder: 20,
        isOptional: false,
        active: true,
        supplierServiceId: 'transport-service-1',
        routeId: 'route-1',
        transportServiceTypeId: 'transport-type-1',
        supplierService: { id: 'transport-service-1', name: 'Transport service', serviceType: { name: 'Transport' } },
      },
      {
        id: 'component-dining',
        componentType: 'DINING',
        label: 'Optional lunch',
        sortOrder: 40,
        isOptional: true,
        active: true,
        supplierServiceId: 'dining-service-1',
        supplierService: { id: 'dining-service-1', name: 'Lunch service', serviceType: { name: 'Meal' } },
      },
      {
        id: 'component-ticket',
        componentType: 'TICKET',
        label: 'Ticket',
        sortOrder: 10,
        isOptional: false,
        active: true,
        supplierServiceId: 'ticket-service-1',
        supplierService: { id: 'ticket-service-1', name: 'Ticket service', serviceType: { name: 'Ticket' } },
      },
      {
        id: 'component-activity',
        componentType: 'ACTIVITY',
        label: 'Optional activity',
        sortOrder: 30,
        isOptional: true,
        active: true,
        activityId: 'activity-1',
        supplierServiceId: 'activity-service-1',
        activity: { id: 'activity-1', name: 'Activity master record' },
        supplierService: { id: 'activity-service-1', name: 'Activity service', serviceType: { name: 'Activity' } },
      },
    ],
  };
}

test('expands an excursion template into ordered normal quote item payloads', async () => {
  const { service, createdPayloads } = createService(createTemplate());

  const result = await service.expandExcursionTemplateIntoQuote(
    {
      quoteId: 'quote-1',
      excursionTemplateId: 'template-1',
      itineraryId: 'day-1',
      selectedOptionalComponentIds: ['component-activity'],
      paxCount: 21,
      quantity: 1,
      markupPercent: 0,
    },
    { companyId: 'company-1' } as any,
  );

  assert.deepEqual(
    createdPayloads.map((payload) => payload.excursionTemplateComponentId),
    ['component-ticket', 'component-transport', 'component-activity'],
  );
  assert.equal(result.createdItems.length, 3);
  assert.equal(createdPayloads[0].serviceId, 'ticket-service-1');
  assert.equal(createdPayloads[0].quantity, 21);
  assert.equal(createdPayloads[1].routeId, 'route-1');
  assert.equal(createdPayloads[1].transportServiceTypeId, 'transport-type-1');
  assert.equal(createdPayloads[2].activityId, 'activity-1');
  assert.equal(createdPayloads[2].participantCount, 21);
  assert.equal(createdPayloads[2].excursionTemplateComponentOptional, true);
  assert.ok(createdPayloads.every((payload) => payload.excursionTemplateId === 'template-1'));
  assert.ok(createdPayloads.every((payload) => payload.itineraryId === 'day-1'));
});

test('does not auto-select optional components or duplicate existing component insertions', async () => {
  const { service, createdPayloads } = createService(createTemplate(), ['component-transport']);

  const result = await service.expandExcursionTemplateIntoQuote(
    {
      quoteId: 'quote-1',
      excursionTemplateId: 'template-1',
      itineraryId: 'day-1',
      selectedOptionalComponentIds: [],
      paxCount: 21,
    },
    { companyId: 'company-1' } as any,
  );

  assert.deepEqual(
    createdPayloads.map((payload) => payload.excursionTemplateComponentId),
    ['component-ticket'],
  );
  assert.deepEqual(result.skippedDuplicates, [{ componentId: 'component-transport', quoteItemId: 'quote-item-component-transport' }]);
});

test('rejects optional component ids that do not belong to the active template', async () => {
  const { service } = createService(createTemplate());

  await assert.rejects(
    () =>
      service.expandExcursionTemplateIntoQuote(
        {
          quoteId: 'quote-1',
          excursionTemplateId: 'template-1',
          itineraryId: 'day-1',
          selectedOptionalComponentIds: ['component-not-on-template'],
        },
        { companyId: 'company-1' } as any,
      ),
    /Selected optional excursion components are not available/,
  );
});

test('expands only the selected excursion origin variant with touring route pricing', async () => {
  const template: any = createTemplate();
  template.name = 'Petra Full Day';
  template.components = [
    template.components[2],
    {
      id: 'component-transport-amman',
      componentType: 'TRANSPORT',
      label: 'Amman origin',
      sortOrder: 20,
      isOptional: false,
      active: true,
      supplierServiceId: 'transport-service-1',
      touringRouteId: 'touring-route-amman',
      transportServiceTypeId: 'transport-type-1',
      supplierService: { id: 'transport-service-1', name: 'Transport service', serviceType: { name: 'Transport' } },
      touringRoute: {
        id: 'touring-route-amman',
        name: 'Amman Petra Full Day',
        startCity: 'Amman',
        durationDays: 1,
        pricings: [
          {
            id: 'pricing-amman',
            active: true,
            transportServiceTypeId: 'transport-type-1',
            vehicleId: 'vehicle-sedan',
            currency: 'USD',
            baseCost: 120,
            minPax: 1,
            maxPax: 3,
            vehicle: { id: 'vehicle-sedan', name: 'Sedan' },
            supplier: { id: 'supplier-1', name: 'Supplier' },
          },
        ],
      },
    },
    {
      id: 'component-transport-dead-sea',
      componentType: 'TRANSPORT',
      label: 'Dead Sea origin',
      sortOrder: 30,
      isOptional: false,
      active: true,
      supplierServiceId: 'transport-service-1',
      touringRouteId: 'touring-route-dead-sea',
      transportServiceTypeId: 'transport-type-1',
      supplierService: { id: 'transport-service-1', name: 'Transport service', serviceType: { name: 'Transport' } },
      touringRoute: {
        id: 'touring-route-dead-sea',
        name: 'Dead Sea Petra Full Day',
        startCity: 'Dead Sea',
        durationDays: 1,
        pricings: [
          {
            id: 'pricing-dead-sea',
            active: true,
            transportServiceTypeId: 'transport-type-1',
            vehicleId: 'vehicle-van',
            currency: 'USD',
            baseCost: 180,
            minPax: 1,
            maxPax: 7,
            vehicle: { id: 'vehicle-van', name: 'Van' },
            supplier: { id: 'supplier-1', name: 'Supplier' },
          },
        ],
      },
    },
  ];
  const { service, createdPayloads } = createService(template);

  await service.expandExcursionTemplateIntoQuote(
    {
      quoteId: 'quote-1',
      excursionTemplateId: 'template-1',
      itineraryId: 'day-1',
      selectedTouringRouteId: 'touring-route-dead-sea',
      selectedTouringRoutePricingId: 'pricing-dead-sea',
      paxCount: 2,
    },
    { companyId: 'company-1' } as any,
  );

  assert.deepEqual(
    createdPayloads.map((payload) => payload.excursionTemplateComponentId),
    ['component-ticket', 'component-transport-dead-sea'],
  );
  assert.equal(createdPayloads[1].touringRouteId, 'touring-route-dead-sea');
  assert.equal(createdPayloads[1].touringRoutePricingId, 'pricing-dead-sea');
  assert.equal(createdPayloads[1].transportVehicleId, 'vehicle-van');
  assert.equal(createdPayloads[1].overrideCost, 180);
  assert.match(createdPayloads[1].overrideReason, /Excursion template: Petra Full Day/);
  assert.match(createdPayloads[1].overrideReason, /Origin: Dead Sea/);
});

test('package excursion transport mapping uses touring route pricing without regular transport rates', async () => {
  const { service } = createService(createTemplate());
  const mapping = await (service as any).resolvePackageTransportMapping(
    {
      id: 'package-component-transport',
      componentType: 'TRANSPORT',
      label: 'Dead Sea origin',
      supplierServiceId: 'transport-service-1',
      supplierService: { id: 'transport-service-1', name: 'Transport service', serviceType: { name: 'Transport' }, currency: 'USD' },
      touringRouteId: 'touring-route-dead-sea',
      touringRoute: {
        id: 'touring-route-dead-sea',
        name: 'Dead Sea Petra Full Day',
        startCity: 'Dead Sea',
        durationDays: 1,
        active: true,
        pricings: [
          {
            id: 'pricing-dead-sea',
            active: true,
            transportServiceTypeId: 'transport-type-1',
            vehicleId: 'vehicle-van',
            currency: 'USD',
            baseCost: 180,
            minPax: 1,
            maxPax: 7,
            vehicle: { id: 'vehicle-van', name: 'Van' },
            supplier: { id: 'supplier-1', name: 'Supplier' },
            transportServiceType: { id: 'transport-type-1', name: 'Touring Route' },
          },
        ],
      },
    },
    { adults: 2, children: 0 },
  );

  assert.equal(mapping.serviceId, 'transport-service-1');
  assert.equal(mapping.touringRouteId, 'touring-route-dead-sea');
  assert.equal(mapping.touringRoutePricingId, 'pricing-dead-sea');
  assert.equal(mapping.transportVehicleId, 'vehicle-van');
  assert.equal(mapping.overrideCost, 180);
  assert.equal(mapping.routeId, undefined);
  assert.equal(mapping.vehicleRateId, undefined);
});

test('quote itinerary reload includes touring route details for excursion origin variants', () => {
  const source = readFileSync(`${process.cwd()}/src/quotes/quotes.service.ts`, 'utf8');

  assert.match(
    source,
    /quoteService:\s*\{\s*include:\s*\{[\s\S]*?touringRoute:\s*\{\s*include:\s*\{\s*stops:/,
    'quote itinerary day quoteService include must hydrate touringRoute for human-readable origin variant rendering after reload',
  );
  assert.match(
    source,
    /return\s*\{\s*data:\s*\{[\s\S]*?touringRouteId:[\s\S]*?include:\s*\{[\s\S]*?touringRoute:\s*\{\s*include:\s*\{\s*stops:/,
    'newly created excursion quote items must return touringRoute details for immediate rendering',
  );
});
