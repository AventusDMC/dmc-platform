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

function buildExportStyleWorkbookBuffer(rows: Array<Record<string, unknown>>) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ supplierName: 'Test Supplier', contractName: 'Summary only' }]), 'Contract Summary');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: COLUMNS }), 'Import Compatible');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([]), 'Route Transfers');
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
    supplier: stores.suppliers.find((supplier) => supplier.id === rule.supplierId),
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
      update: async ({ where, data }: any) => {
        const index = stores.transportServiceTypes.findIndex((serviceType) => serviceType.id === where.id);
        stores.transportServiceTypes[index] = { ...stores.transportServiceTypes[index], ...data };
        return stores.transportServiceTypes[index];
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
      findMany: async ({ where = {} }: any = {}) =>
        stores.vehicleRates
          .filter(
            (rate) =>
              (where.active === undefined || rate.active === where.active) &&
              (where.supplierId === undefined || rate.supplierId === where.supplierId) &&
              (where.vehicleId === undefined || rate.vehicleId === where.vehicleId) &&
              (where.minPax?.lte === undefined || rate.minPax <= where.minPax.lte) &&
              (where.maxPax?.gte === undefined || rate.maxPax >= where.maxPax.gte) &&
              (!where.serviceType?.classification ||
                stores.transportServiceTypes.find((serviceType) => serviceType.id === rate.serviceTypeId)?.classification === where.serviceType.classification),
          )
          .map((rate) => ({
            ...rate,
            vehicle: stores.vehicles.find((vehicle) => vehicle.id === rate.vehicleId),
            supplier: stores.suppliers.find((supplier) => supplier.id === rate.supplierId),
            serviceType: stores.transportServiceTypes.find((serviceType) => serviceType.id === rate.serviceTypeId),
          })),
      findUnique: async ({ where }: any) => {
        const rate = stores.vehicleRates.find((entry) => entry.id === where.id);
        return rate ? { ...rate, _count: { quoteItems: 0 } } : null;
      },
      create: async ({ data }: any) => {
        const rate = { id: nextId('vehicle-rate'), ...data };
        stores.vehicleRates.push(rate);
        return {
          ...rate,
          vehicle: stores.vehicles.find((vehicle) => vehicle.id === rate.vehicleId),
          supplier: stores.suppliers.find((supplier) => supplier.id === rate.supplierId),
          serviceType: stores.transportServiceTypes.find((serviceType) => serviceType.id === rate.serviceTypeId),
          route: stores.routes.find((route) => route.id === rate.routeId),
        };
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
  assert.equal(preview.routeTransfers.length, 1);
  assert.deepEqual(preview.fullDay, []);
  assert.deepEqual(preview.addOns, []);

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

test('transport contract import prefers Import Compatible sheet when workbook has multiple sheets', async () => {
  const { prisma } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const buffer = buildExportStyleWorkbookBuffer([activeImportRow]);

  const preview = await importService.previewTransportContractImport({ buffer, originalname: 'exported-transport.xlsx' });

  assert.deepEqual(preview.errors, []);
  assert.equal(preview.previewRows.length, 1);
  assert.equal(preview.previewRows[0].supplierName, 'Test Supplier');
  assert.equal(preview.previewRows[0].pricingMode, 'PER_GROUP');
  assert.equal(preview.routeTransfers.length, 1);
  assert.deepEqual(preview.fullDay, []);
  assert.deepEqual(preview.addOns, []);
});

test('transport contract import preview warns and can merge split contract names', async () => {
  const { prisma } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const buffer = buildWorkbookBuffer([
    {
      ...activeImportRow,
      supplierName: '  Almushtari  ',
      contractName: 'Transport   2026 Rates',
      currency: 'JOD',
      serviceName: 'Airport Transfer',
      routeName: 'Airport to Amman',
      origin: 'AMM Airport',
      destination: 'Amman',
    },
    {
      ...activeImportRow,
      supplierName: 'almushtari',
      contractName: 'Add-ons 2026 Rates',
      currency: 'JOD',
      serviceName: 'Driver Overnight outside Amman',
      routeName: 'Petra Driver Overnight',
      origin: 'Petra',
      destination: 'Petra',
      cost: 10,
    },
  ]);

  const preview = await importService.previewTransportContractImport({ buffer, originalname: 'transport.xlsx' });

  assert.equal(preview.contractWarnings.length, 1);
  assert.equal(preview.contractWarnings[0].message, 'Multiple contract names detected for the same supplier and validity period. This will create separate rate cards.');
  assert.deepEqual(preview.contractWarnings[0].contractNames, ['Add-ons 2026 Rates', 'Transport 2026 Rates']);
  assert.equal(preview.contractWarnings[0].suggestedContractName, 'Almushtari Transport 2026 JOD');
  assert.equal(preview.previewRows[0].contractName, 'Transport 2026 Rates');

  const mergedPreview = await importService.previewTransportContractImport(
    { buffer, originalname: 'transport.xlsx' },
    { contractMergeMode: 'merge', contractNameOverride: 'Almushtari Transport 2026 JOD' },
  );

  assert.deepEqual(mergedPreview.previewRows.map((row) => row.contractName), ['Almushtari Transport 2026 JOD', 'Almushtari Transport 2026 JOD']);
  assert.equal(mergedPreview.contractWarnings.length, 0);
});

test('auto-fills missing transport add-ons by vehicle capacity without duplicates', async () => {
  const { prisma, stores } = createPrismaMock();
  const service = new VehicleRatesService(prisma as any);
  const supplier = { id: 'supplier-1', name: 'Almushtari', type: 'transport' };
  const validFrom = new Date('2026-01-01');
  const validTo = new Date('2026-12-31');
  stores.suppliers.push(supplier);
  stores.vehicles.push(
    { id: 'vehicle-car', supplierId: supplier.id, resolvedSupplierId: supplier.id, supplierName: supplier.name, name: 'Car', maxPax: 2 },
    { id: 'vehicle-mini', supplierId: supplier.id, resolvedSupplierId: supplier.id, supplierName: supplier.name, name: 'Mini Van', maxPax: 6 },
    { id: 'vehicle-bus', supplierId: supplier.id, resolvedSupplierId: supplier.id, supplierName: supplier.name, name: 'Bus', maxPax: 45 },
  );
  stores.transportServiceTypes.push(
    { id: 'service-transfer', name: 'Airport Transfer', code: 'AIRPORT_TRANSFER', classification: 'ROUTE_TRANSFER' },
    { id: 'service-daily', name: 'Daily FD rate minimum 3 full days', code: 'DAILY_FD', classification: 'DAILY_PACKAGE' },
    { id: 'service-overnight', name: 'Driver Overnight outside Amman', code: 'DRIVER_OVERNIGHT', classification: 'ADD_ON' },
    { id: 'service-stationary', name: 'Stationary charge Petra Wadi Rum Aqaba', code: 'STATIONARY', classification: 'ADD_ON' },
    { id: 'service-waiting', name: 'Waiting charge outside Amman', code: 'WAITING', classification: 'ADD_ON' },
  );
  stores.routes.push({ id: 'route-transfer', fromPlaceId: 'from', toPlaceId: 'to', name: 'Airport -> Amman', normalizedKey: 'airport-amman' });
  stores.routes.push({ id: 'route-addon', fromPlaceId: 'petra', toPlaceId: 'petra', name: 'Petra add-on', normalizedKey: 'petra-addon' });
  const addRate = (overrides: any) => {
    stores.vehicleRates.push({
      id: `rate-${stores.vehicleRates.length + 1}`,
      supplierId: supplier.id,
      routeId: overrides.routeId || 'route-transfer',
      fromPlaceId: 'from',
      toPlaceId: 'to',
      routeName: overrides.routeName || 'Airport -> Amman',
      minPax: 1,
      price: overrides.price || 10,
      currency: 'JOD',
      active: true,
      validFrom,
      validTo,
      ...overrides,
    });
  };

  addRate({ serviceTypeId: 'service-transfer', vehicleId: 'vehicle-car', maxPax: 2, price: 45 });
  addRate({ serviceTypeId: 'service-transfer', vehicleId: 'vehicle-mini', maxPax: 6, price: 75 });
  addRate({ serviceTypeId: 'service-transfer', vehicleId: 'vehicle-bus', maxPax: 45, price: 250 });
  addRate({ serviceTypeId: 'service-daily', vehicleId: 'vehicle-car', maxPax: 2, price: 120, routeId: 'route-addon', routeName: 'Daily full day' });
  addRate({ serviceTypeId: 'service-overnight', vehicleId: 'vehicle-bus', maxPax: 45, price: 20, routeId: 'route-addon', routeName: 'Driver overnight' });
  addRate({ serviceTypeId: 'service-stationary', vehicleId: 'vehicle-mini', maxPax: 6, price: 30, routeId: 'route-addon', routeName: 'Stationary Petra' });
  addRate({ serviceTypeId: 'service-waiting', vehicleId: 'vehicle-car', maxPax: 2, price: 15, routeId: 'route-addon', routeName: 'Waiting Petra' });

  const rateCardId = ['almushtari', 'JOD', '2026-01-01', '2026-12-31'].join('|');
  const summary = await service.autoFillTransportAddOns(rateCardId);

  assert.deepEqual(summary, {
    dailyCreated: 2,
    overnightCreated: 2,
    stationaryCreated: 2,
    waitingCreated: 2,
    skippedExisting: 4,
  });
  assert.equal(stores.vehicleRates.length, 15);
  assert.equal(stores.pricingRules.length, 8);

  const addOnKeys = stores.vehicleRates
    .filter((rate) => rate.serviceTypeId !== 'service-transfer')
    .map((rate) => `${rate.serviceTypeId}|${rate.vehicleId}|${rate.maxPax}`);
  assert.equal(new Set(addOnKeys).size, addOnKeys.length);
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

test('Almushtari-style transport rows classify services and expose smart picker add-ons', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const pricingService = new TransportPricingService(prisma as any);
  const rows = [
    {
      ...activeImportRow,
      supplierName: 'Almushtari',
      serviceName: 'Airport Transfer',
      routeName: 'Amman Airport to Petra',
      origin: 'Amman Airport',
      destination: 'Petra',
      cost: 45,
      currency: 'JOD',
    },
    {
      ...activeImportRow,
      supplierName: 'Almushtari',
      serviceName: 'Daily FD rate minimum 3 full days',
      routeName: 'Petra full day transport',
      origin: 'Petra',
      destination: 'Petra',
      cost: 100,
      currency: 'JOD',
    },
    {
      ...activeImportRow,
      supplierName: 'Almushtari',
      serviceName: 'Driver Overnight outside Amman',
      routeName: 'Petra driver overnight',
      origin: 'Petra',
      destination: 'Petra',
      cost: 10,
      currency: 'JOD',
    },
    {
      ...activeImportRow,
      supplierName: 'Almushtari',
      serviceName: 'Stationary charge Petra Wadi Rum Aqaba',
      routeName: 'Petra stationary charge',
      origin: 'Petra',
      destination: 'Petra',
      cost: 30,
      currency: 'JOD',
    },
  ];

  const imported = await importService.importTransportContract({ buffer: buildWorkbookBuffer(rows), originalname: 'almushtari.xlsx' });
  assert.equal(imported.createdRates, 4);
  assert.equal(stores.transportServiceTypes.find((entry) => entry.name === 'Airport Transfer')?.classification, 'ROUTE_TRANSFER');
  assert.equal(stores.transportServiceTypes.find((entry) => entry.name === 'Daily FD rate minimum 3 full days')?.classification, 'DAILY_PACKAGE');
  assert.equal(stores.transportServiceTypes.find((entry) => entry.name === 'Driver Overnight outside Amman')?.classification, 'ADD_ON');
  assert.equal(stores.transportServiceTypes.find((entry) => entry.name === 'Stationary charge Petra Wadi Rum Aqaba')?.classification, 'ADD_ON');

  const route = stores.routes.find((entry) => entry.name === 'Amman Airport to Petra');
  const transferType = stores.transportServiceTypes.find((entry) => entry.name === 'Airport Transfer');
  const priced = await pricingService.calculate({
    serviceTypeId: transferType.id,
    routeId: route.id,
    paxCount: 4,
  });

  assert.equal(priced.pricingMode, 'capacity_unit');
  assert.equal(priced.unitCapacity, 3);
  assert.equal(priced.unitCount, 2);
  assert.equal(priced.price, 90);
  assert.equal(priced.candidates[0].supplier?.name, 'Almushtari');
  assert.equal(priced.candidates[0].serviceType.classification, 'ROUTE_TRANSFER');
  assert.equal(priced.optionalAddOns.length, 2);

  const overnight = priced.optionalAddOns.find((entry) => entry.addOnType === 'DRIVER_OVERNIGHT');
  const stationary = priced.optionalAddOns.find((entry) => entry.addOnType === 'STATIONARY_WAITING');
  assert.ok(overnight);
  assert.ok(stationary);
  assert.equal(2 * overnight.unitCost * 2, 40);
  assert.equal(2 * stationary.unitCost * 1, 60);
});
