import test = require('node:test');
import assert = require('node:assert/strict');
import * as XLSX from 'xlsx';
import { VehicleRatesService } from './vehicle-rates.service';
import { TransportPricingService } from '../transport-pricing/transport-pricing.service';

const COLUMNS = [
  'supplierName',
  'supplierContactName',
  'supplierEmail',
  'supplierPhone',
  'supplierWebsite',
  'contractName',
  'contractValidFrom',
  'contractValidTo',
  'country',
  'serviceName',
  'routeName',
  'origin',
  'destination',
  'vehicleType',
  'maxPaxPerUnit',
  'pricingMode',
  'cost',
  'currency',
  'active',
  'notes',
];

function buildWorkbookBuffer(rows: Array<Record<string, unknown>>) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transport Rates');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function equalsCI(left: unknown, right: unknown) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase();
}

function createPrismaMock() {
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${++counter}`;
  const stores = {
    suppliers: [] as any[],
    supplierServices: [] as any[],
    serviceTypes: [] as any[],
    transportServiceTypes: [] as any[],
    vehicles: [] as any[],
    places: [] as any[],
    routes: [] as any[],
    vehicleRates: [] as any[],
    pricingRules: [] as any[],
  };
  const hydrateRule = (rule: any) => ({
    ...rule,
    route: stores.routes.find((route) => route.id === rule.routeId),
    transportServiceType: stores.transportServiceTypes.find((serviceType) => serviceType.id === rule.transportServiceTypeId),
    vehicle: stores.vehicles.find((vehicle) => vehicle.id === rule.vehicleId),
  });

  const prisma = {
    supplier: {
      findFirst: async ({ where }: any) => stores.suppliers.find((supplier) => equalsCI(supplier.name, where.name.equals)) || null,
      create: async ({ data }: any) => {
        const supplier = { id: nextId('supplier'), ...data };
        stores.suppliers.push(supplier);
        return supplier;
      },
    },
    supplierService: {
      findFirst: async ({ where }: any) =>
        stores.supplierServices.find((service) => service.supplierId === where.supplierId && equalsCI(service.name, where.name.equals)) || null,
      create: async ({ data }: any) => {
        const service = { id: nextId('service'), ...data };
        stores.supplierServices.push(service);
        return service;
      },
    },
    serviceType: {
      findFirst: async () => stores.serviceTypes.find((serviceType) => serviceType.code === 'TRANSPORT') || null,
      create: async ({ data }: any) => {
        const serviceType = { id: nextId('catalog-service-type'), ...data };
        stores.serviceTypes.push(serviceType);
        return serviceType;
      },
    },
    transportServiceType: {
      findFirst: async ({ where }: any) =>
        stores.transportServiceTypes.find((serviceType) =>
          (where.OR || []).some((condition: any) => equalsCI(serviceType.name, condition.name?.equals) || equalsCI(serviceType.code, condition.code?.equals)),
        ) || null,
      findUnique: async ({ where }: any) => stores.transportServiceTypes.find((serviceType) => serviceType.id === where.id) || null,
      create: async ({ data }: any) => {
        const serviceType = { id: nextId('transport-service-type'), ...data };
        stores.transportServiceTypes.push(serviceType);
        return serviceType;
      },
    },
    vehicle: {
      findFirst: async ({ where }: any) =>
        stores.vehicles.find(
          (vehicle) =>
            equalsCI(vehicle.name, where.name.equals) &&
            vehicle.maxPax === where.maxPax &&
            (vehicle.supplierId === where.OR[0].supplierId || vehicle.resolvedSupplierId === where.OR[1].resolvedSupplierId || equalsCI(vehicle.supplierName, where.OR[2].supplierName.equals)),
        ) || null,
      findUnique: async ({ where }: any) => stores.vehicles.find((vehicle) => vehicle.id === where.id) || null,
      create: async ({ data }: any) => {
        const vehicle = { id: nextId('vehicle'), ...data };
        stores.vehicles.push(vehicle);
        return vehicle;
      },
    },
    place: {
      findFirst: async ({ where }: any) =>
        stores.places.find((place) => equalsCI(place.name, where.name.equals) && equalsCI(place.country, where.country.equals)) || null,
      findUnique: async ({ where }: any) => stores.places.find((place) => place.id === where.id) || null,
      create: async ({ data }: any) => {
        const place = { id: nextId('place'), ...data };
        stores.places.push(place);
        return place;
      },
    },
    route: {
      findFirst: async ({ where }: any) =>
        stores.routes.find((route) => route.fromPlaceId === where.fromPlaceId && route.toPlaceId === where.toPlaceId) || null,
      findUnique: async ({ where }: any) => {
        const route = where.id
          ? stores.routes.find((entry) => entry.id === where.id)
          : stores.routes.find((entry) => entry.normalizedKey === where.normalizedKey);
        return route
          ? {
              ...route,
              fromPlace: stores.places.find((place) => place.id === route.fromPlaceId),
              toPlace: stores.places.find((place) => place.id === route.toPlaceId),
            }
          : null;
      },
      create: async ({ data }: any) => {
        const route = {
          id: nextId('route'),
          ...data,
          fromPlace: stores.places.find((place) => place.id === data.fromPlaceId),
          toPlace: stores.places.find((place) => place.id === data.toPlaceId),
        };
        stores.routes.push(route);
        return route;
      },
    },
    vehicleRate: {
      findFirst: async ({ where }: any) =>
        stores.vehicleRates.find(
          (rate) =>
            rate.supplierId === where.supplierId &&
            rate.serviceTypeId === where.serviceTypeId &&
            rate.routeId === where.routeId &&
            rate.vehicleId === where.vehicleId &&
            rate.maxPax === where.maxPax,
        ) || null,
      findUnique: async ({ where }: any) => {
        const rate = stores.vehicleRates.find((entry) => entry.id === where.id);
        return rate ? { ...rate, _count: { quoteItems: 0 } } : null;
      },
      create: async ({ data }: any) => {
        const rate = { id: nextId('vehicle-rate'), ...data };
        stores.vehicleRates.push(rate);
        return rate;
      },
      update: async ({ where, data }: any) => {
        const index = stores.vehicleRates.findIndex((rate) => rate.id === where.id);
        const cleanData = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
        stores.vehicleRates[index] = { ...stores.vehicleRates[index], ...cleanData };
        return stores.vehicleRates[index];
      },
      delete: async ({ where }: any) => {
        const index = stores.vehicleRates.findIndex((rate) => rate.id === where.id);
        const [deleted] = stores.vehicleRates.splice(index, 1);
        return deleted;
      },
    },
    transportPricingRule: {
      findFirst: async ({ where }: any) => {
        const rule = stores.pricingRules.find(
          (entry) =>
            (!where.supplierId || entry.supplierId === where.supplierId) &&
            entry.transportServiceTypeId === (where.transportServiceTypeId || where.serviceTypeId) &&
            entry.routeId === where.routeId &&
            (!where.vehicleId || entry.vehicleId === where.vehicleId) &&
            (!where.pricingMode || entry.pricingMode === where.pricingMode) &&
            (where.isActive === undefined || entry.isActive === where.isActive) &&
            (where.minPax?.lte === undefined || entry.minPax <= where.minPax.lte) &&
            (where.maxPax?.gte === undefined || entry.maxPax >= where.maxPax.gte),
        );
        return rule ? hydrateRule(rule) : null;
      },
      findMany: async ({ where }: any) =>
        stores.pricingRules
          .filter(
            (entry) =>
              entry.routeId === where.routeId &&
              entry.transportServiceTypeId === where.transportServiceTypeId &&
              (where.supplierId === undefined || entry.supplierId === where.supplierId) &&
              (where.vehicleId === undefined || entry.vehicleId === where.vehicleId) &&
              (where.pricingMode === undefined || entry.pricingMode === where.pricingMode) &&
              (where.unitCapacity === undefined || entry.unitCapacity === where.unitCapacity) &&
              (where.isActive === undefined || entry.isActive === where.isActive) &&
              (where.minPax?.lte === undefined || entry.minPax <= where.minPax.lte) &&
              (where.maxPax?.gte === undefined || entry.maxPax >= where.maxPax.gte),
          )
          .map(hydrateRule),
      create: async ({ data }: any) => {
        const rule = { id: nextId('pricing-rule'), ...data };
        stores.pricingRules.push(rule);
        return rule;
      },
      update: async ({ where, data }: any) => {
        const index = stores.pricingRules.findIndex((rule) => rule.id === where.id);
        stores.pricingRules[index] = { ...stores.pricingRules[index], ...data };
        return stores.pricingRules[index];
      },
    },
  };

  return { prisma, stores };
}

const activeImportRow = {
  supplierName: 'Test Supplier',
  supplierContactName: '',
  supplierEmail: '',
  supplierPhone: '',
  supplierWebsite: '',
  contractName: 'Test Transport Contract',
  contractValidFrom: '2026-01-01',
  contractValidTo: '2026-12-31',
  country: 'Jordan',
  serviceName: 'Airport Transfer',
  routeName: 'AMM Airport to Amman',
  origin: 'AMM Airport',
  destination: 'Amman',
  vehicleType: 'Sedan',
  maxPaxPerUnit: 3,
  pricingMode: 'PER_GROUP',
  cost: 45,
  currency: 'USD',
  active: true,
  notes: '',
};

test('transport contract import creates capacity pricing and re-import updates without duplicates', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const pricingService = new TransportPricingService(prisma as any);
  const buffer = buildWorkbookBuffer([activeImportRow]);

  const preview = await importService.previewTransportContractImport({ buffer, originalname: 'transport.xlsx' });
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.previewRows[0].pricingMode, 'PER_GROUP');

  const imported = await importService.importTransportContract({ buffer, originalname: 'transport.xlsx' });
  assert.equal(imported.createdSuppliers, 1);
  assert.equal(imported.createdRoutes, 1);
  assert.equal(imported.createdServices, 1);
  assert.equal(imported.createdRates, 1);
  assert.equal(imported.updatedRates, 0);
  assert.equal(stores.vehicleRates.length, 1);
  assert.equal(stores.pricingRules.length, 1);

  const route = stores.routes[0];
  const serviceType = stores.transportServiceTypes[0];
  const priced = await pricingService.calculate({
    serviceTypeId: serviceType.id,
    routeId: route.id,
    paxCount: 4,
  });
  assert.equal(priced.pricingMode, 'capacity_unit');
  assert.equal(priced.unitCapacity, 3);
  assert.equal(priced.unitCount, 2);
  assert.equal(priced.price, 90);

  const updatedBuffer = buildWorkbookBuffer([{ ...activeImportRow, cost: 50 }]);
  const reimported = await importService.importTransportContract({ buffer: updatedBuffer, originalname: 'transport.xlsx' });
  assert.equal(reimported.createdSuppliers, 0);
  assert.equal(reimported.createdRoutes, 0);
  assert.equal(reimported.createdServices, 0);
  assert.equal(reimported.createdRates, 0);
  assert.equal(reimported.updatedRates, 1);
  assert.equal(stores.vehicleRates.length, 1);
  assert.equal(stores.pricingRules.length, 1);
  assert.equal(stores.vehicleRates[0].price, 50);
  assert.equal(stores.pricingRules[0].baseCost, 50);
});

test('inactive transport contract rows do not create active pricing rules', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const buffer = buildWorkbookBuffer([{ ...activeImportRow, active: false }]);

  const imported = await importService.importTransportContract({ buffer, originalname: 'transport.xlsx' });

  assert.equal(imported.skippedRows, 1);
  assert.equal(imported.createdRates, 0);
  assert.equal(stores.vehicleRates.length, 0);
  assert.equal(stores.pricingRules.length, 0);
});

test('vehicle rate CRUD keeps matching capacity pricing rule in sync', async () => {
  const { prisma, stores } = createPrismaMock();
  const service = new VehicleRatesService(prisma as any);

  stores.transportServiceTypes.push({ id: 'service-type-1', name: 'Airport Transfer', code: 'AIRPORT' });
  stores.vehicles.push({ id: 'vehicle-1', name: 'Sedan', maxPax: 3, luggageCapacity: 2 });
  stores.places.push({ id: 'place-1', name: 'Airport', country: 'Jordan' });
  stores.places.push({ id: 'place-2', name: 'Amman', country: 'Jordan' });
  stores.routes.push({
    id: 'route-1',
    fromPlaceId: 'place-1',
    toPlaceId: 'place-2',
    name: 'Airport -> Amman',
    normalizedKey: 'airport-amman',
  });

  const rate = await service.create({
    vehicleId: 'vehicle-1',
    serviceTypeId: 'service-type-1',
    routeId: 'route-1',
    minPax: 1,
    maxPax: 3,
    price: 45,
    currency: 'usd',
    active: true,
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2026-12-31'),
  });

  assert.equal(stores.pricingRules.length, 1);
  assert.equal(stores.pricingRules[0].unitCapacity, 3);
  assert.equal(stores.pricingRules[0].baseCost, 45);
  assert.equal(stores.pricingRules[0].pricingMode, 'capacity_unit');
  assert.equal(stores.pricingRules[0].isActive, true);

  await service.update(rate.id, { price: 50, active: false });

  assert.equal(stores.pricingRules.length, 1);
  assert.equal(stores.pricingRules[0].baseCost, 50);
  assert.equal(stores.pricingRules[0].isActive, false);

  await service.update(rate.id, { active: true });

  assert.equal(stores.pricingRules.length, 1);
  assert.equal(stores.pricingRules[0].isActive, true);

  await service.update(rate.id, { maxPax: 4 });

  const oldCapacityRule = stores.pricingRules.find((rule) => rule.unitCapacity === 3);
  const newCapacityRule = stores.pricingRules.find((rule) => rule.unitCapacity === 4);
  assert.equal(oldCapacityRule?.isActive, false);
  assert.equal(newCapacityRule?.isActive, true);
  assert.equal(newCapacityRule?.baseCost, 50);

  await service.remove(rate.id);

  assert.equal(stores.vehicleRates.length, 0);
  assert.equal(stores.pricingRules.find((rule) => rule.unitCapacity === 4)?.isActive, false);
});
