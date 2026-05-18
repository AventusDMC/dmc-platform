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

function buildCleanTemplateWorkbookBuffer(rows: Array<Record<string, unknown>>) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: ['Supplier', 'Route', 'Vehicle Type', 'Pricing Mode', 'Currency', 'Rate', 'Valid From', 'Valid To'],
  });
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transport Rates');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function buildAlphaTemplateWorkbookBuffer(rows: Array<Record<string, unknown>>) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [
      'Supplier Name',
      'Rate Card Name',
      'Service Category',
      'Route / Service Area',
      'Vehicle Label',
      'Canonical Vehicle Type',
      'Pax From',
      'Pax To',
      'Pricing Mode',
      'Cost',
      'Currency',
      'Valid From',
      'Valid To',
      'Notes',
    ],
  });
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
    supplier: stores.suppliers.find((supplier) => supplier.id === rule.supplierId),
    transportServiceType: stores.transportServiceTypes.find((serviceType) => serviceType.id === rule.transportServiceTypeId),
    vehicle: stores.vehicles.find((vehicle) => vehicle.id === rule.vehicleId),
  });

  const prisma = {
    supplier: {
      findMany: async ({ where }: any = {}) =>
        stores.suppliers.filter((supplier) => !where?.type?.equals || equalsCI(supplier.type, where.type.equals)),
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
      findMany: async () => stores.vehicles,
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
      findFirst: async ({ where }: any) => {
        const route = where.name?.equals
          ? stores.routes.find((entry) => equalsCI(entry.name, where.name.equals))
          : stores.routes.find((entry) => entry.fromPlaceId === where.fromPlaceId && entry.toPlaceId === where.toPlaceId);
        return route
          ? {
              ...route,
              fromPlace: stores.places.find((place) => place.id === route.fromPlaceId),
              toPlace: stores.places.find((place) => place.id === route.toPlaceId),
            }
          : null;
      },
      findMany: async () =>
        stores.routes.map((route) => ({
          ...route,
          fromPlace: stores.places.find((place) => place.id === route.fromPlaceId),
          toPlace: stores.places.find((place) => place.id === route.toPlaceId),
        })),
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
            rate.maxPax === where.maxPax &&
            rate.currency === where.currency &&
            new Date(rate.validFrom).getTime() === new Date(where.validFrom).getTime() &&
            new Date(rate.validTo).getTime() === new Date(where.validTo).getTime(),
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

function seedImportRoute(stores: ReturnType<typeof createPrismaMock>['stores'], row: typeof activeImportRow | Record<string, unknown>) {
  const fromPlace = {
    id: `place-from-${stores.places.length + 1}`,
    name: String(row.origin || 'Origin'),
    country: String(row.country || 'Jordan'),
  };
  const toPlace = {
    id: `place-to-${stores.places.length + 1}`,
    name: String(row.destination || 'Destination'),
    country: String(row.country || 'Jordan'),
  };
  stores.places.push(fromPlace, toPlace);
  stores.routes.push({
    id: `route-${stores.routes.length + 1}`,
    fromPlaceId: fromPlace.id,
    toPlaceId: toPlace.id,
    name: String(row.routeName || (row as any).Route || 'Route'),
    normalizedKey: `route-${stores.routes.length + 1}`,
  });
}

test('transport contract import creates capacity pricing and re-import updates without duplicates', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const pricingService = new TransportPricingService(prisma as any);
  seedImportRoute(stores, activeImportRow);
  const buffer = buildWorkbookBuffer([activeImportRow]);

  const preview = await importService.previewTransportContractImport({ buffer, originalname: 'transport.xlsx' }, { allowCreateSuppliers: true });
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.previewRows[0].pricingMode, 'PER_GROUP');
  assert.equal(preview.previewRows[0].importDecision, 'NEW');
  assert.equal(preview.routeTransfers.length, 1);
  assert.deepEqual(preview.fullDay, []);
  assert.deepEqual(preview.addOns, []);

  const imported = await importService.importTransportContract({ buffer, originalname: 'transport.xlsx' }, { allowCreateSuppliers: true });
  assert.equal(imported.createdSuppliers, 1);
  assert.equal(imported.createdRoutes, 0);
  assert.equal(imported.createdServices, 1);
  assert.equal(imported.createdRates, 1);
  assert.equal(imported.updatedRates, 0);
  assert.equal(stores.vehicleRates.length, 1);
  assert.equal(stores.pricingRules.length, 1);

  const route = stores.routes[0];
  const serviceType = stores.transportServiceTypes[0];
  const priced = await pricingService.calculate({
    serviceTypeId: serviceType.id,
    routeId: route?.id || stores.routes[0].id,
    paxCount: 4,
  });
  assert.equal(priced.pricingMode, 'capacity_unit');
  assert.equal(priced.unitCapacity, 3);
  assert.equal(priced.unitCount, 2);
  assert.equal(priced.price, 90);

  const updatedBuffer = buildWorkbookBuffer([{ ...activeImportRow, cost: 50 }]);
  const updatedPreview = await importService.previewTransportContractImport({ buffer: updatedBuffer, originalname: 'transport.xlsx' }, { allowCreateSuppliers: true });
  assert.equal(updatedPreview.previewRows[0].importDecision, 'UPDATED');
  assert.deepEqual(updatedPreview.previewRows[0].changedFields, ['cost']);

  const skippedReimport = await importService.importTransportContract({ buffer: updatedBuffer, originalname: 'transport.xlsx' }, { allowCreateSuppliers: true });
  assert.equal(skippedReimport.createdRates, 0);
  assert.equal(skippedReimport.updatedRates, 0);
  assert.equal(skippedReimport.skippedRows, 1);
  assert.equal(stores.vehicleRates[0].price, 45);

  const reimported = await importService.importTransportContract(
    { buffer: updatedBuffer, originalname: 'transport.xlsx' },
    { allowCreateSuppliers: true, rowActions: { 2: 'UPDATE_EXISTING' } },
  );
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

test('transport contract preview separates touring routes from transfer rows', async () => {
  const { prisma } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const preview = await importService.previewTransportContractImport(
    {
      buffer: buildWorkbookBuffer([
        {
          ...activeImportRow,
          serviceName: 'Day Tour',
          serviceCategory: 'Touring Routes',
          routeName: 'Amman -> Petra -> Wadi Rum -> Amman',
          origin: 'Amman',
          destination: 'Amman',
          notes: '2 day touring program',
        },
      ]),
      originalname: 'touring-routes.xlsx',
    },
    { allowCreateSuppliers: true },
  );

  assert.deepEqual(preview.errors, []);
  assert.equal(preview.previewRows.length, 1);
  assert.equal(preview.previewRows[0].classification, 'TOURING_ROUTE');
  assert.equal(preview.previewRows[0].transportProductType, 'TOURING_ROUTE');
  assert.equal(preview.touringRoutes.length, 1);
  assert.equal(preview.routeTransfers.length, 0);
  assert.match(String(preview.previewRows[0].routeWarning), /Touring route row/);
});

test('transfer service labels derive point-to-point pricing mode for import and pricing lookup', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const pricingService = new TransportPricingService(prisma as any);
  const transferRow = {
    ...activeImportRow,
    serviceName: 'Private Transfer',
    pricingMode: '',
    routeName: 'Aqaba South Border -> Petra',
    origin: 'Aqaba South Border',
    destination: 'Petra',
    vehicleType: 'Medium 30',
    maxPaxPerUnit: 30,
    cost: 520,
  };
  seedImportRoute(stores, transferRow);

  const imported = await importService.importTransportContract({ buffer: buildWorkbookBuffer([transferRow]), originalname: 'private-transfer.xlsx' }, { allowCreateSuppliers: true });

  assert.deepEqual(imported.errors, []);
  assert.equal(imported.createdRates, 1);
  assert.equal(stores.transportServiceTypes[0].name, 'Point-to-Point');
  assert.equal(stores.transportServiceTypes[0].code, 'POINT_TO_POINT');
  assert.equal(stores.transportServiceTypes[0].classification, 'ROUTE_TRANSFER');

  const priced = await pricingService.calculate({
    serviceTypeId: stores.transportServiceTypes[0].id,
    routeId: stores.routes[0].id,
    paxCount: 21,
  });

  assert.equal(priced.pricingMode, 'capacity_unit');
  assert.equal(priced.unitCapacity, 30);
  assert.equal(priced.price, 520);
});

test('transport contract import creates transfer routes with canonical route type', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const transferRow = {
    ...activeImportRow,
    serviceName: 'Private Transfer',
    pricingMode: '',
    routeName: 'Amman -> Petra',
    origin: 'Amman',
    destination: 'Petra',
  };

  const resolved = await (importService as any).findOrCreateTransportImportRoute(transferRow);

  assert.equal(resolved.created, true);
  assert.equal(resolved.route.routeType, 'TRANSFER_ROUTE');
  assert.equal(stores.routes[0].routeType, 'TRANSFER_ROUTE');
});

test('transport contract import matches equivalent normalized route labels without duplicating routes', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const importRow = {
    ...activeImportRow,
    routeName: 'Petra to Amman (1 day)',
    origin: 'Petra',
    destination: 'Amman',
    serviceName: 'Private Transfer',
    pricingMode: '',
  };
  seedImportRoute(stores, { ...importRow, routeName: 'Petra → Amman' });

  const imported = await importService.importTransportContract({ buffer: buildWorkbookBuffer([importRow]), originalname: 'petra-amman.xlsx' }, { allowCreateSuppliers: true });

  assert.deepEqual(imported.errors, []);
  assert.equal(imported.createdRoutes, 0);
  assert.equal(imported.createdRates, 1);
  assert.equal(stores.routes.length, 1);
  assert.equal(stores.vehicleRates[0].routeId, stores.routes[0].id);
});

test('explicit transport pricing modes are preserved over transfer fallback', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const halfDayRow = {
    ...activeImportRow,
    serviceName: 'Half Day',
    serviceCategory: 'Transfers',
    routeName: 'Petra local service',
    origin: 'Petra',
    destination: 'Petra',
    cost: 120,
  };
  seedImportRoute(stores, halfDayRow);

  const imported = await importService.importTransportContract({ buffer: buildWorkbookBuffer([halfDayRow]), originalname: 'half-day.xlsx' }, { allowCreateSuppliers: true });

  assert.deepEqual(imported.errors, []);
  assert.equal(stores.transportServiceTypes[0].name, 'Half Day');
  assert.equal(stores.transportServiceTypes[0].classification, 'HALF_DAY');
});

test('transport import preview groups route transfer, disposal full day, and disposal half day separately', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const rows = [
    {
      ...activeImportRow,
      serviceCategory: 'Transfers',
      serviceName: 'Point-to-Point',
      pricingMode: 'Point-to-Point',
      routeName: 'Petra to Amman',
      origin: 'Petra',
      destination: 'Amman',
    },
    {
      ...activeImportRow,
      serviceCategory: 'Disposal',
      serviceName: 'Full Day',
      pricingMode: 'Full Day',
      routeName: 'Amman City',
      origin: 'Amman',
      destination: 'Amman',
      cost: 120,
    },
    {
      ...activeImportRow,
      serviceCategory: 'Disposal',
      serviceName: 'Half Day',
      pricingMode: 'Half Day',
      routeName: 'Amman City',
      origin: 'Amman',
      destination: 'Amman',
      cost: 80,
    },
    {
      ...activeImportRow,
      serviceCategory: 'Disposal',
      serviceName: 'Day Tour',
      pricingMode: 'Day Tour',
      routeName: 'Jerash & Ajloun Day Tour',
      origin: 'Amman',
      destination: 'Jerash',
      cost: 95,
    },
  ];
  rows.forEach((row) => seedImportRoute(stores, row));

  const preview = await importService.previewTransportContractImport({ buffer: buildWorkbookBuffer(rows), originalname: 'disposal-preview.xlsx' }, { allowCreateSuppliers: true });

  assert.deepEqual(preview.errors, []);
  assert.equal(preview.routeTransfers.length, 1);
  assert.equal(preview.routeTransfers[0].classification, 'ROUTE_TRANSFER');
  assert.equal(preview.serviceBasedTransport.length, 2);
  assert.equal(preview.fullDay.length, 1);
  assert.equal(preview.fullDay[0].classification, 'SERVICE_BASED_TRANSPORT');
  assert.equal(preview.halfDay.length, 1);
  assert.equal(preview.halfDay[0].classification, 'SERVICE_BASED_TRANSPORT');
  assert.equal(preview.dayTour.length, 0);
  assert.equal(preview.touringRoutes.length, 1);
  assert.equal(preview.touringRoutes[0].classification, 'TOURING_ROUTE');
  assert.equal(preview.touringRoutes[0].routeName, 'Jerash & Ajloun Day Tour');
  assert.equal(preview.addOns.length, 0);
  assert.equal(preview.routeTransfers.some((row) => row.serviceCategory === 'Disposal'), false);
});

test('transport contract import accepts service-based disposal rows without transfer routes', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  stores.suppliers.push({ id: 'supplier-almushtari', name: 'Almushtari Logistics Services', type: 'transport' });
  const rows = [
    {
      ...activeImportRow,
      supplierName: 'Almushtari Logistics Services',
      serviceCategory: 'Disposal',
      routeName: 'Jordan Program',
      origin: '',
      destination: '',
      serviceName: 'Full Day',
      pricingMode: 'Full Day',
      vehicleType: 'Sedan',
      maxPaxPerUnit: 3,
      cost: 95,
    },
    {
      ...activeImportRow,
      supplierName: 'Almushtari Logistics Services',
      serviceCategory: 'Disposal',
      routeName: 'Jordan Program',
      origin: '',
      destination: '',
      serviceName: 'Half Day',
      pricingMode: 'Half Day',
      vehicleType: 'Sedan',
      maxPaxPerUnit: 3,
      cost: 65,
    },
  ];

  const preview = await importService.previewTransportContractImport({ buffer: buildWorkbookBuffer(rows), originalname: 'disposal.xlsx' });

  assert.deepEqual(preview.errors, []);
  assert.equal(preview.serviceBasedTransport.length, 2);
  assert.equal(preview.serviceBasedTransport[0].classification, 'SERVICE_BASED_TRANSPORT');
  assert.equal(preview.serviceBasedTransport[0].routeId, null);
  assert.equal(preview.serviceBasedTransport[0].routeName, 'Jordan Program');
  assert.match(String(preview.serviceBasedTransport[0].routeWarning), /no transfer route required/);

  const imported = await importService.importTransportContract({ buffer: buildWorkbookBuffer(rows), originalname: 'disposal.xlsx' });

  assert.deepEqual(imported.errors, []);
  assert.equal(imported.createdRoutes, 0);
  assert.equal(imported.createdServices, 2);
  assert.equal(imported.createdRates, 2);
  assert.equal(stores.routes.length, 0);
  assert.equal(stores.vehicleRates.length, 2);
  assert.deepEqual(
    stores.vehicleRates.map((rate) => `${rate.routeId || 'no-route'}:${rate.routeName}:${rate.price}`).sort(),
    ['no-route:Jordan Program:65', 'no-route:Jordan Program:95'],
  );
  assert.equal(stores.pricingRules.length, 0);
});

test('transport contract import accepts clean Route and Rate column aliases', async () => {
  const { prisma, stores } = createPrismaMock();
  stores.suppliers.push({ id: 'supplier-existing', name: 'Test Supplier', type: 'transport' });
  seedImportRoute(stores, activeImportRow);
  const importService = new VehicleRatesService(prisma as any);
  const buffer = buildCleanTemplateWorkbookBuffer([
    {
      Supplier: 'Test Supplier',
      Route: activeImportRow.routeName,
      'Vehicle Type': activeImportRow.vehicleType,
      'Pricing Mode': activeImportRow.serviceName,
      Currency: activeImportRow.currency,
      Rate: activeImportRow.cost,
      'Valid From': activeImportRow.contractValidFrom,
      'Valid To': activeImportRow.contractValidTo,
    },
  ]);

  const imported = await importService.importTransportContract({ buffer, originalname: 'clean-template.xlsx' });

  assert.deepEqual(imported.errors, []);
  assert.equal(imported.createdRates, 1);
  assert.equal(stores.vehicleRates[0].routeId, stores.routes[0].id);
  assert.equal(stores.vehicleRates[0].currency, 'USD');
  assert.equal(stores.vehicleRates[0].price, 45);
});

test('transport import template uses Alpha Bus standardized columns and sample rows', async () => {
  const { prisma, stores } = createPrismaMock();
  stores.suppliers.push({ id: 'supplier-alpha', name: 'Alpha Bus and Limo Co', type: 'transport' });
  stores.vehicles.push({ id: 'vehicle-coach', name: 'Large 49', vehicleType: 'Coach', maxPax: 49 });
  seedImportRoute(stores, { ...activeImportRow, routeName: 'Aqaba South Border -> Petra', origin: 'Aqaba South Border', destination: 'Petra' });
  const importService = new VehicleRatesService(prisma as any);

  const buffer = await importService.getTransportContractImportTemplate();
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Transport Rates']);

  assert.deepEqual(Object.keys(rows[0]), [
    'Supplier Name',
    'Rate Card Name',
    'Service Category',
    'Route / Service Area',
    'Vehicle Label',
    'Canonical Vehicle Type',
    'Pax From',
    'Pax To',
    'Pricing Mode',
    'Cost',
    'Currency',
    'Valid From',
    'Valid To',
    'Notes',
  ]);
  assert.equal(rows[0]['Supplier Name'], 'Alpha Bus and Limo Co');
  assert.equal(rows[0]['Vehicle Label'], 'Large VVIP 29');
  assert.equal(rows[0]['Canonical Vehicle Type'], 'Luxury');
  assert.equal(rows[2]['Pricing Mode'], 'Full Day (200 KM)');
  assert.equal(rows[4]['Service Category'], 'Disposal');
  assert.equal(rows[4]['Pricing Mode'], 'Day Tour');
});

test('Alpha PDF-style rows preserve supplier vehicle labels and canonical vehicle types', async () => {
  const { prisma, stores } = createPrismaMock();
  stores.suppliers.push({ id: 'supplier-alpha', name: 'Alpha Bus and Limo Co', type: 'transport' });
  const alphaRoute = {
    ...activeImportRow,
    routeName: 'Aqaba South Border -> Petra',
    origin: 'Aqaba South Border',
    destination: 'Petra',
  };
  seedImportRoute(stores, alphaRoute);
  const importService = new VehicleRatesService(prisma as any);
  const buffer = buildAlphaTemplateWorkbookBuffer([
    {
      'Supplier Name': 'Alpha Bus and Limo Co',
      'Rate Card Name': 'Alpha Bus and Limo Co 2026 Rates in USD',
      'Service Category': 'Transfers',
      'Route / Service Area': 'Aqaba South Border -> Petra',
      'Vehicle Label': 'Medium 30',
      'Canonical Vehicle Type': 'Coach',
      'Pax From': 1,
      'Pax To': 30,
      'Pricing Mode': 'Transfer rows',
      Cost: 520,
      Currency: 'USD',
      'Valid From': '2026-01-01',
      'Valid To': '2026-12-31',
      Notes: 'PDF transfer row',
    },
    {
      'Supplier Name': 'Alpha Bus and Limo Co',
      'Rate Card Name': 'Alpha Bus and Limo Co 2026 Rates in USD',
      'Service Category': 'Disposal',
      'Route / Service Area': 'Aqaba South Border -> Petra',
      'Vehicle Label': 'Large 49',
      'Canonical Vehicle Type': 'Coach',
      'Pax From': 1,
      'Pax To': 49,
      'Pricing Mode': 'Full Day (200 KM)',
      Cost: 650,
      Currency: 'USD',
      'Valid From': '2026-01-01',
      'Valid To': '2026-12-31',
      Notes: 'PDF full day row',
    },
    {
      'Supplier Name': 'Alpha Bus and Limo Co',
      'Rate Card Name': 'Alpha Bus and Limo Co 2026 Rates in USD',
      'Service Category': 'Disposal',
      'Route / Service Area': 'Aqaba South Border -> Petra',
      'Vehicle Label': 'Small 17',
      'Canonical Vehicle Type': 'Mini Bus',
      'Pax From': 1,
      'Pax To': 17,
      'Pricing Mode': 'Day Tour',
      Cost: 280,
      Currency: 'USD',
      'Valid From': '2026-01-01',
      'Valid To': '2026-12-31',
      Notes: 'PDF standalone day tour row',
    },
    {
      'Supplier Name': 'Alpha Bus and Limo Co',
      'Rate Card Name': 'Alpha Bus and Limo Co 2026 Rates in USD',
      'Service Category': 'Add-ons',
      'Route / Service Area': 'Aqaba South Border -> Petra',
      'Vehicle Label': 'Van VIP 9',
      'Canonical Vehicle Type': 'Van',
      'Pax From': 1,
      'Pax To': 9,
      'Pricing Mode': 'Stationary',
      Cost: 80,
      Currency: 'USD',
      'Valid From': '2026-01-01',
      'Valid To': '2026-12-31',
      Notes: 'PDF stationary row',
    },
  ]);

  const imported = await importService.importTransportContract({ buffer, originalname: 'alpha-2026.xlsx' });

  assert.deepEqual(imported.errors, []);
  assert.equal(imported.createdRates, 4);
  assert.equal(stores.vehicles.find((vehicle) => vehicle.name === 'Medium 30')?.vehicleType, 'Coach');
  assert.equal(stores.vehicles.find((vehicle) => vehicle.name === 'Large 49')?.vehicleType, 'Coach');
  assert.equal(stores.vehicles.find((vehicle) => vehicle.name === 'Small 17')?.vehicleType, 'Mini Bus');
  assert.equal(stores.vehicles.find((vehicle) => vehicle.name === 'Van VIP 9')?.vehicleType, 'Van');
  assert.equal(stores.vehicleRates.find((rate) => rate.maxPax === 30)?.minPax, 1);
  assert.equal(stores.transportServiceTypes.find((entry) => entry.name === 'Point-to-Point')?.classification, 'ROUTE_TRANSFER');
  assert.equal(stores.transportServiceTypes.find((entry) => entry.name === 'Daily Full Day')?.classification, 'FULL_DAY');
  assert.equal(stores.transportServiceTypes.find((entry) => entry.name === 'Stationary / Waiting')?.classification, 'ADD_ON');
});

test('transport contract import treats currency and validity as distinct duplicate and upsert keys', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  seedImportRoute(stores, activeImportRow);
  const rows = [
    activeImportRow,
    {
      ...activeImportRow,
      contractValidFrom: '2027-01-01',
      contractValidTo: '2027-12-31',
      cost: 55,
    },
    {
      ...activeImportRow,
      currency: 'JOD',
      cost: 35,
    },
  ];

  const preview = await importService.previewTransportContractImport({ buffer: buildWorkbookBuffer(rows), originalname: 'transport.xlsx' }, { allowCreateSuppliers: true });
  assert.equal(preview.previewRows[0].importDecision, 'NEW');
  assert.equal(preview.previewRows[1].importDecision, 'NEW');
  assert.equal(preview.previewRows[2].importDecision, 'NEW');

  const imported = await importService.importTransportContract(
    { buffer: buildWorkbookBuffer(rows), originalname: 'transport.xlsx' },
    { allowCreateSuppliers: true, rowActions: { 3: 'CREATE_NEW_VALIDITY_VERSION' } },
  );

  assert.deepEqual(imported.errors, []);
  assert.equal(imported.createdRates, 3);
  assert.equal(imported.updatedRates, 0);
  assert.equal(stores.vehicleRates.length, 3);
  assert.deepEqual(
    stores.vehicleRates.map((rate) => `${rate.currency}:${new Date(rate.validFrom).toISOString().slice(0, 10)}:${rate.price}`).sort(),
    ['JOD:2026-01-01:35', 'USD:2026-01-01:45', 'USD:2027-01-01:55'],
  );
});

test('transport contract import preview flags possible duplicate and overlap actions for existing rates', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  seedImportRoute(stores, activeImportRow);

  await importService.importTransportContract({ buffer: buildWorkbookBuffer([activeImportRow]), originalname: 'transport.xlsx' }, { allowCreateSuppliers: true });

  const possibleDuplicateRow = {
    ...activeImportRow,
    contractValidFrom: '2027-01-01',
    contractValidTo: '2027-12-31',
    cost: 55,
  };
  const overlappingRow = {
    ...activeImportRow,
    contractValidFrom: '2026-06-01',
    contractValidTo: '2027-03-31',
    cost: 60,
  };

  const preview = await importService.previewTransportContractImport(
    { buffer: buildWorkbookBuffer([possibleDuplicateRow, overlappingRow]), originalname: 'transport-update.xlsx' },
    { allowCreateSuppliers: true },
  );

  assert.equal(preview.previewRows[0].importDecision, 'POSSIBLE_DUPLICATE');
  assert.equal((preview.previewRows[0].existingRate as { cost: number }).cost, 45);
  assert.deepEqual(preview.previewRows[0].allowedActions, ['SKIP_IMPORTED_ROW', 'CREATE_NEW_VALIDITY_VERSION']);
  assert.equal(preview.previewRows[1].importDecision, 'VALIDITY_OVERLAP');
  assert.equal((preview.previewRows[1].existingRate as { cost: number }).cost, 45);
  assert.deepEqual(preview.previewRows[1].allowedActions, ['SKIP_IMPORTED_ROW', 'CREATE_NEW_VALIDITY_VERSION', 'ARCHIVE_OLD_VERSION']);

  const archivedImport = await importService.importTransportContract(
    { buffer: buildWorkbookBuffer([overlappingRow]), originalname: 'transport-overlap.xlsx' },
    { allowCreateSuppliers: true, rowActions: { 2: 'ARCHIVE_OLD_VERSION' } },
  );

  assert.deepEqual(archivedImport.errors, []);
  assert.equal(archivedImport.createdRates, 1);
  assert.equal(stores.vehicleRates.length, 2);
  assert.equal(stores.vehicleRates[0].active, false);
  assert.equal(stores.vehicleRates[1].active, true);
  assert.equal(stores.vehicleRates[1].price, 60);
});

test('transport contract import prefers Import Compatible sheet when workbook has multiple sheets', async () => {
  const { prisma } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const buffer = buildExportStyleWorkbookBuffer([activeImportRow]);

  const preview = await importService.previewTransportContractImport({ buffer, originalname: 'exported-transport.xlsx' }, { allowCreateSuppliers: true });

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
      serviceName: 'Add-on / Supplement',
      routeName: 'Petra Driver Overnight',
      origin: 'Petra',
      destination: 'Petra',
      cost: 10,
    },
  ]);

  const preview = await importService.previewTransportContractImport({ buffer, originalname: 'transport.xlsx' }, { allowCreateSuppliers: true });

  assert.equal(preview.contractWarnings.length, 1);
  assert.equal(preview.contractWarnings[0].message, 'Multiple contract names detected for the same supplier and validity period. This will create separate rate cards.');
  assert.deepEqual(preview.contractWarnings[0].contractNames, ['Add-ons 2026 Rates', 'Transport 2026 Rates']);
  assert.equal(preview.contractWarnings[0].suggestedContractName, 'Almushtari Transport 2026 JOD');
  assert.equal(preview.previewRows[0].contractName, 'Transport 2026 Rates');

  const mergedPreview = await importService.previewTransportContractImport(
    { buffer, originalname: 'transport.xlsx' },
    { contractMergeMode: 'merge', contractNameOverride: 'Almushtari Transport 2026 JOD', allowCreateSuppliers: true },
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

  const rateCardId = [supplier.id, 'JOD', '2026-01-01', '2026-12-31'].join('|');
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

  const imported = await importService.importTransportContract({ buffer, originalname: 'transport.xlsx' }, { allowCreateSuppliers: true });

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
      serviceName: 'Full Day',
      routeName: 'Petra full day transport',
      origin: 'Petra',
      destination: 'Petra',
      cost: 100,
      currency: 'JOD',
    },
    {
      ...activeImportRow,
      supplierName: 'Almushtari',
      serviceName: 'Add-on / Supplement',
      routeName: 'Petra driver overnight',
      origin: 'Petra',
      destination: 'Petra',
      cost: 10,
      currency: 'JOD',
    },
    {
      ...activeImportRow,
      supplierName: 'Almushtari',
      serviceName: 'Stationary / Waiting',
      routeName: 'Petra stationary charge',
      origin: 'Petra',
      destination: 'Petra',
      cost: 30,
      currency: 'JOD',
    },
  ];
  rows.forEach((row) => seedImportRoute(stores, row));

  const imported = await importService.importTransportContract({ buffer: buildWorkbookBuffer(rows), originalname: 'almushtari.xlsx' }, { allowCreateSuppliers: true });
  assert.equal(imported.createdRates, 4);
  assert.equal(stores.transportServiceTypes.find((entry) => entry.name === 'Airport Transfer')?.classification, 'ROUTE_TRANSFER');
  assert.equal(stores.transportServiceTypes.find((entry) => entry.name === 'Daily Full Day')?.classification, 'FULL_DAY');
  assert.equal(stores.transportServiceTypes.find((entry) => entry.name === 'Add-on / Supplement')?.classification, 'ADD_ON');
  assert.equal(stores.transportServiceTypes.find((entry) => entry.name === 'Stationary / Waiting')?.classification, 'ADD_ON');

  const route = stores.routes.find((entry) => entry.name === 'Amman Airport → Petra');
  const transferType = stores.transportServiceTypes.find((entry) => entry.name === 'Airport Transfer');
  const priced = await pricingService.calculate({
    serviceTypeId: transferType.id,
    routeId: route?.id || stores.routes[0].id,
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

test('transport contract import skips unrecognized pricing modes', async () => {
  const { prisma, stores } = createPrismaMock();
  const importService = new VehicleRatesService(prisma as any);
  const buffer = buildWorkbookBuffer([
    {
      ...activeImportRow,
      serviceName: 'Mystery Legacy Mode',
      routeName: 'Petra mystery mode',
    },
  ]);

  const preview = await importService.previewTransportContractImport({ buffer, originalname: 'transport.xlsx' });

  assert.equal(preview.skippedRows, 1);
  assert.deepEqual(preview.errors, [{ row: 2, message: 'Pricing mode not recognized' }]);
  assert.equal(preview.previewRows.length, 0);

  const imported = await importService.importTransportContract({ buffer, originalname: 'transport.xlsx' });
  assert.equal(imported.skippedRows, 1);
  assert.deepEqual(imported.errors, [{ row: 2, message: 'Pricing mode not recognized' }]);
  assert.equal(stores.vehicleRates.length, 0);
});

test('transport contract import skips unknown suppliers by default and matches normalized names', async () => {
  const { prisma, stores } = createPrismaMock();
  stores.suppliers.push({ id: 'supplier-existing', name: 'Alpha Bus Transport', type: 'transport' });
  seedImportRoute(stores, activeImportRow);
  const importService = new VehicleRatesService(prisma as any);

  const unknownBuffer = buildWorkbookBuffer([{ ...activeImportRow, supplierName: 'New Supplier' }]);
  const unknownPreview = await importService.previewTransportContractImport({ buffer: unknownBuffer, originalname: 'transport.xlsx' });

  assert.equal(unknownPreview.skippedRows, 1);
  assert.deepEqual(unknownPreview.errors, [{ row: 2, message: 'Supplier not found' }]);
  assert.equal(stores.suppliers.length, 1);

  const matchedBuffer = buildWorkbookBuffer([{ ...activeImportRow, supplierName: ' alpha-bus   transport ' }]);
  const matchedImport = await importService.importTransportContract({ buffer: matchedBuffer, originalname: 'transport.xlsx' });

  assert.deepEqual(matchedImport.errors, []);
  assert.equal(matchedImport.createdSuppliers, 0);
  assert.equal(stores.suppliers.length, 1);
  assert.equal(stores.vehicleRates[0].supplierId, 'supplier-existing');
});
