import test = require('node:test');
import assert = require('node:assert/strict');
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VehicleRatesService } from './vehicle-rates.service';

const repoRoot = resolve(__dirname, '../../../..');
const adminTransportTableSource = readFileSync(resolve(repoRoot, 'apps/admin-web/app/transport/VehicleRatesTable.tsx'), 'utf8');
const vehicleRatesFormSource = readFileSync(resolve(repoRoot, 'apps/admin-web/app/vehicle-rates/VehicleRatesForm.tsx'), 'utf8');
const routesFormSource = readFileSync(resolve(repoRoot, 'apps/admin-web/app/routes/RoutesForm.tsx'), 'utf8');
const quoteTransportPickerSource = readFileSync(resolve(repoRoot, 'apps/admin-web/app/quotes/[id]/QuoteTransportPicker.tsx'), 'utf8');
const vehicleRatesServiceSource = readFileSync(resolve(repoRoot, 'apps/api/src/vehicle-rates/vehicle-rates.service.ts'), 'utf8');

const UUIDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  '12345678-1234-4234-8234-123456789abc',
  'abcdefab-cdef-4abc-8def-abcdefabcdef',
  'fedcbafe-dcba-4fed-8cba-fedcbafedcba',
];

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

function createTransferRoutePrismaMock() {
  let nextUuid = 0;
  const supplier = { id: 'supplier-alpha', name: 'Alpha Transport' };
  const route = {
    id: 'route-amman-petra',
    name: 'Amman -> Petra',
    fromPlaceId: 'place-amman',
    toPlaceId: 'place-petra',
    fromPlace: { id: 'place-amman', name: 'Amman' },
    toPlace: { id: 'place-petra', name: 'Petra' },
  };
  const vehicles = [
    { id: 'vehicle-sedan', name: 'Sedan 2', vehicleType: 'Sedan', maxPax: 2 },
    { id: 'vehicle-mini-van', name: 'Mini Van 6', vehicleType: 'Mini Van', maxPax: 6 },
    { id: 'vehicle-van', name: 'Van 9', vehicleType: 'Van', maxPax: 9 },
    { id: 'vehicle-coaster', name: 'Toyota Coaster / Mini Bus 17', vehicleType: 'Mini Bus', maxPax: 17 },
    { id: 'vehicle-medium-bus', name: 'Medium Bus 30', vehicleType: 'Coach', maxPax: 30 },
    { id: 'vehicle-large-coach', name: 'Large Coach 49', vehicleType: 'Coach', maxPax: 49 },
  ];
  const serviceTypes = [{ id: 'service-point-to-point', name: 'Point-to-Point', code: 'POINT_TO_POINT', classification: 'ROUTE_TRANSFER' }];
  const persistedRates: any[] = [];
  const pricingRules: any[] = [];
  const supplierServices: any[] = [];
  const deletedRates: any[] = [];

  function getUuid() {
    return UUIDS[nextUuid++] || `00000000-0000-4000-8000-${String(nextUuid).padStart(12, '0')}`;
  }

  function hydrateRate(rate: any) {
    return {
      ...rate,
      vehicle: vehicles.find((vehicle) => vehicle.id === rate.vehicleId),
      serviceType: serviceTypes.find((serviceType) => serviceType.id === rate.serviceTypeId),
      route,
      supplier,
      fromPlace: null,
      toPlace: null,
      _count: { quoteItems: 0 },
    };
  }

  const prisma = {
    supplier: {
      findUnique: async ({ where }: any) => (where.id === supplier.id ? supplier : null),
    },
    vehicle: {
      findUnique: async ({ where }: any) => vehicles.find((vehicle) => vehicle.id === where.id) || null,
    },
    transportServiceType: {
      findUnique: async ({ where }: any) => serviceTypes.find((serviceType) => serviceType.id === where.id) || null,
      findFirst: async () => serviceTypes[0],
      update: async ({ where, data }: any) => ({ ...serviceTypes.find((serviceType) => serviceType.id === where.id), ...data }),
    },
    route: {
      findUnique: async ({ where }: any) => (where.id === route.id ? route : null),
    },
    place: {
      findUnique: async () => null,
    },
    serviceType: {
      findFirst: async () => ({ id: 'catalog-transport', name: 'Transport', code: 'TRANSPORT', isActive: true }),
      create: async ({ data }: any) => ({ id: 'catalog-transport', ...data }),
    },
    supplierService: {
      findFirst: async ({ where }: any) =>
        supplierServices.find((service) => service.supplierId === where.supplierId && service.name.toLowerCase() === where.name.equals.toLowerCase()) || null,
      create: async ({ data }: any) => {
        const row = { id: getUuid(), ...data };
        supplierServices.push(row);
        return row;
      },
    },
    vehicleRate: {
      findUnique: async ({ where }: any) => {
        const rate = persistedRates.find((row) => row.id === where.id);
        return rate ? hydrateRate(rate) : null;
      },
      create: async ({ data }: any) => {
        const row = { id: getUuid(), ...data };
        persistedRates.push(row);
        return hydrateRate(row);
      },
      update: async ({ where, data }: any) => {
        const index = persistedRates.findIndex((row) => row.id === where.id);
        const definedData = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
        persistedRates[index] = { ...persistedRates[index], ...definedData };
        return hydrateRate(persistedRates[index]);
      },
      delete: async ({ where }: any) => {
        const index = persistedRates.findIndex((row) => row.id === where.id);
        const [deleted] = persistedRates.splice(index, 1);
        deletedRates.push(deleted);
        return deleted;
      },
    },
    transportPricingRule: {
      findMany: async ({ where }: any) =>
        pricingRules.filter(
          (rule) =>
            rule.supplierId === where.supplierId &&
            rule.transportServiceTypeId === where.transportServiceTypeId &&
            rule.routeId === where.routeId &&
            rule.vehicleId === where.vehicleId &&
            rule.unitCapacity === where.unitCapacity,
        ),
      create: async ({ data }: any) => {
        const row = { id: getUuid(), ...data };
        pricingRules.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const index = pricingRules.findIndex((rule) => rule.id === where.id);
        pricingRules[index] = { ...pricingRules[index], ...data };
        return pricingRules[index];
      },
    },
  };

  return { prisma, vehicles, persistedRates, pricingRules, supplierServices, deletedRates, route, supplier, serviceTypes };
}

test('transfer route supplier rate card workflow persists vehicle rates, pax ranges, bridge rows, duplicates, and deletes', async () => {
  const { prisma, vehicles, persistedRates, pricingRules, supplierServices, deletedRates, route, supplier, serviceTypes } = createTransferRoutePrismaMock();
  const service = new VehicleRatesService(prisma as any);
  const paxRanges: Record<string, [number, number]> = {
    'vehicle-sedan': [1, 2],
    'vehicle-mini-van': [3, 6],
    'vehicle-van': [7, 9],
    'vehicle-coaster': [10, 17],
    'vehicle-medium-bus': [18, 30],
    'vehicle-large-coach': [31, 49],
  };

  for (const vehicle of vehicles) {
    const [minPax, maxPax] = paxRanges[vehicle.id];
    const created = await service.create({
      vehicleId: vehicle.id,
      serviceTypeId: serviceTypes[0].id,
      supplierId: supplier.id,
      routeId: route.id,
      minPax,
      maxPax,
      price: maxPax * 10,
      currency: 'usd',
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2026-12-31'),
    });

    assert.match(created.id, /^[0-9a-f-]{36}$/i);
    assert.equal(created.vehicleId, vehicle.id);
    assert.equal(created.minPax, minPax);
    assert.equal(created.maxPax, maxPax);
  }

  assert.equal(persistedRates.length, 6);
  assert.equal(new Set(persistedRates.map((rate) => rate.vehicleId)).size, 6);
  assert.equal(supplierServices.length, 1);
  assert.equal(supplierServices[0].supplierId, supplier.id);
  assert.equal(supplierServices[0].resolvedSupplierId, supplier.id);
  assert.equal(pricingRules.length, 6);

  for (const rate of persistedRates) {
    const [minPax, maxPax] = paxRanges[rate.vehicleId];
    const pricingRule = pricingRules.find((rule) => rule.vehicleId === rate.vehicleId);
    assert.ok(pricingRule, `Missing synced pricing rule for ${rate.vehicleId}`);
    assert.equal(pricingRule.minPax, minPax);
    assert.equal(pricingRule.unitCapacity, maxPax);
    assert.equal(pricingRule.supplierId, supplier.id);
  }

  for (const rate of [...persistedRates]) {
    const edited = await service.update(rate.id, {
      minPax: rate.minPax + 1,
      maxPax: rate.maxPax,
      price: rate.price + 5,
    });
    assert.equal(edited.vehicleId, rate.vehicleId);
    assert.equal(edited.minPax, rate.minPax + 1);

    const duplicated = await service.duplicate(rate.id);
    assert.match(duplicated.id, /^[0-9a-f-]{36}$/i);
    assert.notEqual(duplicated.id, rate.id);
    assert.equal(duplicated.vehicleId, rate.vehicleId);
    assert.equal(duplicated.routeId, route.id);
    assert.equal(duplicated.supplierId, supplier.id);
    assert.equal(duplicated.minPax, edited.minPax);

    await service.remove(rate.id);
  }

  assert.equal(deletedRates.length, 6);
  assert.equal(persistedRates.length, 6, 'Only duplicated backend rows should remain after deleting original rows');
  assert.ok(persistedRates.every((rate) => /^[0-9a-f-]{36}$/i.test(rate.id)));
});

test('admin transfer route and supplier rate card UI are locked to persisted VehicleRate rows and stable actions', () => {
  expectSourceContains(routesFormSource, [
    "const TRANSFER_ROUTE_TYPE = 'TRANSFER_ROUTE';",
    "method: routeId ? 'PATCH' : 'POST'",
    'routeType: nextRouteType',
    "throw new Error(await getErrorMessage(response, 'Could not save route.'));",
    'router.refresh();',
  ]);

  expectSourceContains(vehicleRatesFormSource, [
    'const backendRateId = isBackendUuid(rateId) ? rateId : \'\';',
    "method: backendRateId ? 'PATCH' : 'POST',",
    'vehicleId,',
    'minPax: Number(minPax),',
    'maxPax: Number(maxPax),',
    'const savedRate = await response.json();',
    'await onSaved?.(savedRate);',
  ]);

  expectSourceContains(adminTransportTableSource, [
    'async function handleSaveVehicleSection(rateCard: SupplierRateCard)',
    'const selectedVehicle = findBackendVehicleForSection(selectedVehicleType);',
    "fetch(`${apiBaseUrl}/vehicle-rates`, {",
    'vehicleId: selectedVehicle.id,',
    'serviceTypeId: serviceType.id,',
    'newRates.push(await response.json() as VehicleRate);',
    'function groupRateLinesByVehicleType(rates: VehicleRate[])',
    'const vehicleId = rate.vehicleId || getRateVehicleDisplayLabel(rate);',
    '{isLocalVehicleSectionRate(rate) ? null : (',
    "onClick={() => setActiveForm({ mode: 'edit-line', rate: withRateCardSupplier(rate, rateCard) })}",
    "<DuplicateVehicleRateButton onDuplicate={() => setActiveForm({ mode: 'duplicate-line', rate: withRateCardSupplier(rate, rateCard) })} />",
    'onClick={() => handleDelete(rate)}',
    "throw new Error(await getErrorMessage(response, 'Could not save vehicle type rate row.'));",
    "setError(caughtError instanceof Error ? caughtError.message : 'Could not save vehicle type rate row.');",
    'finally {',
    'setLoadingRateCardDetailId(null);',
  ]);

  assert.equal(adminTransportTableSource.includes('id: `${LOCAL_VEHICLE_SECTION_RATE_PREFIX}-${rateCard.id}-${selectedVehicleType}'), false);
  assert.equal(adminTransportTableSource.includes('vehicleRateId:'), false);
});

test('quote transport drawer saves selected transfer route immediately from VehicleRate rows only', () => {
  expectSourceContains(quoteTransportPickerSource, [
    'const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/items`, {',
    "method: 'POST'",
    'vehicleRateId: isTouringSelection ? undefined : selectedRate.id,',
    'transportVehicleId: selectedVehicle.id,',
    'routeId: isTouringSelection ? undefined : selectedRoute.id,',
    'routeName: formatRoute(selectedRoute),',
    "throw new Error(await getErrorMessage(response, 'Could not save transport item.'));",
    'onSaved?.(savedItem);',
    'setIsSavingTransport(false);',
  ]);

  assert.equal(quoteTransportPickerSource.includes('/transport-pricing/rules'), false);
});

test('backend VehicleRate sync carries minPax and does not expose pricing-rule-only rows as editable VehicleRates', () => {
  expectSourceContains(vehicleRatesServiceSource, [
    'await this.findOrCreateQuoteTransportSupplierService({',
    'const vehicleRate = await this.prisma.vehicleRate.create({',
    'await this.syncCapacityPricingRuleForVehicleRate(this.toVehicleRatePricingSyncData(vehicleRate));',
    'const previousSyncData = this.toVehicleRatePricingSyncData(existing);',
    'minPax: rate.minPax,',
    'minPax: data.minPax ?? 1,',
    'return this.prisma.transportPricingRule.create({ data: ruleData });',
  ]);

  expectSourceContains(adminTransportTableSource, [
    "fetch(`${apiBaseUrl}/vehicle-rates/cards?${params.toString()}`",
    "fetch(`${apiBaseUrl}/vehicle-rates/cards/${encodeURIComponent(rateCardId)}`",
  ]);
  assert.equal(adminTransportTableSource.includes('/transport-pricing/rules'), false);
});
