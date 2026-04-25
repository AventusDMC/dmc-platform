import {
  Prisma,
  PrismaClient,
  TransportPricingMode,
} from '@prisma/client';

export const ALPHA_SUPPLIER_NAME = 'Alpha Transport';
export const CURRENCY = 'USD';
export const VALID_FROM = new Date('2026-01-01T00:00:00.000Z');
export const VALID_TO = new Date('2026-12-31T23:59:59.999Z');

export type DbClient = Prisma.TransactionClient | PrismaClient;

export type AlphaVehicleInput = {
  name: string;
  maxPax: number;
  luggageCapacity?: number;
};

export type AlphaServiceCode = 'FULL_DAY' | 'HALF_DAY' | 'TRANSFER' | 'PER_HOUR';

export type AlphaRouteInput = {
  fromName: string;
  toName: string;
  fromCity: string;
  toCity: string;
  fromType: string;
  toType: string;
  routeType: string;
  durationMinutes?: number;
  distanceKm?: number;
};

export type AlphaPricingRuleInput = {
  route: AlphaRouteInput;
  serviceCode: AlphaServiceCode;
  vehicleName: string;
  minPax: number;
  maxPax: number;
  baseCost: number;
  pricingMode: 'per_vehicle' | 'capacity_unit';
  unitCapacity?: number | null;
};

export const fleetCatalog: AlphaVehicleInput[] = [
  { name: 'Mercedes V-Class VIP', maxPax: 5 },
  { name: 'Mercedes V-Class VVIP', maxPax: 5 },
  { name: 'Mercedes Sprinter VIP', maxPax: 9 },
  { name: 'Mercedes Grand Star VIP', maxPax: 29 },
  { name: 'Alpha Medium Coach 30 Pax', maxPax: 30 },
  { name: 'Hyundai H350', maxPax: 12 },
  { name: 'Toyota Coaster', maxPax: 17 },
  { name: 'Mercedes Grand Star 31 Pax', maxPax: 31 },
  { name: 'Mercedes Grand Star 49 Pax', maxPax: 49 },
  { name: 'Hyundai Staria', maxPax: 5 },
];

export const serviceTypes: Array<{ code: AlphaServiceCode; name: string }> = [
  { code: 'FULL_DAY', name: 'Full Day' },
  { code: 'HALF_DAY', name: 'Half Day' },
  { code: 'TRANSFER', name: 'Transfer' },
  { code: 'PER_HOUR', name: 'Per Hour' },
];

const cityAliases: Record<string, string> = {
  'QAIA Airport': 'Amman',
  'Queen Alia International Airport': 'Amman',
  'Marka Airport': 'Amman',
  'King Hussein Bridge': 'Jordan Borders',
  'Sheikh Hussein Border': 'Jordan Borders',
  'Allenby or Sheikh Hussein Border': 'Jordan Borders',
  'AQJ Airport-Port-South Border 1H': 'Aqaba',
  'AQJ Airport-Port-South Border 5H': 'Aqaba',
  'AQJ Airport-Port-South Border 11H': 'Aqaba',
  'Alpha Bus Extra KM': 'Amman',
  'Alpha Bus Stationary': 'Amman',
  'Alpha Bus Transfer Deduction': 'Amman',
  'Alpha Driver Overnight': 'Amman',
  Amman: 'Amman',
  Petra: 'Petra',
  'Petra 1D': 'Petra',
  'Petra 2D': 'Petra',
  'Dead Sea': 'Dead Sea',
  'Dead Sea 1D': 'Dead Sea',
  Rum: 'Wadi Rum',
  'Rum 1D': 'Wadi Rum',
  Aqaba: 'Aqaba',
  'Aqaba City': 'Aqaba',
  Borders: 'Jordan Borders',
  'Jordan Borders': 'Jordan Borders',
};

const placeTypeAliases: Record<string, string> = {
  Airport: 'Airport',
  City: 'City Center',
  'City Center': 'City Center',
  Destination: 'Destination',
  Border: 'Border',
};

export function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function routeNormalizedKey(route: Pick<AlphaRouteInput, 'fromName' | 'toName'>) {
  const normalizeRoutePart = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');

  return [normalizeRoutePart(route.fromName), normalizeRoutePart(route.toName)].filter(Boolean).join('_');
}

export function routeName(route: AlphaRouteInput) {
  return `${route.fromName.trim()} → ${route.toName.trim()}`;
}

const JORDAN_CITY_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  amman: { latitude: 31.9539, longitude: 35.9106 },
  petra: { latitude: 30.3285, longitude: 35.4444 },
  'wadi-rum': { latitude: 29.5321, longitude: 35.421 },
  'dead-sea': { latitude: 31.559, longitude: 35.4732 },
  aqaba: { latitude: 29.5321, longitude: 35.0063 },
  jerash: { latitude: 32.2808, longitude: 35.8997 },
  madaba: { latitude: 31.7167, longitude: 35.7939 },
  'jordan-borders': { latitude: 31.9539, longitude: 35.9106 },
};

function cityCoordinates(name: string) {
  return JORDAN_CITY_COORDINATES[normalizeKey(name)] || { latitude: 0, longitude: 0 };
}

export async function ensureAlphaSupplier(tx: DbClient) {
  const data = {
    name: ALPHA_SUPPLIER_NAME,
    type: 'transport',
    notes: 'Imported from Alpha 2026 transport contracts.',
  };

  const existing = await tx.supplier.findFirst({
    where: { name: { equals: ALPHA_SUPPLIER_NAME, mode: 'insensitive' } },
  });

  if (existing) {
    return tx.supplier.update({ where: { id: existing.id }, data });
  }

  return tx.supplier.create({ data });
}

export async function ensureServiceTypes(tx: DbClient) {
  const records = new Map<AlphaServiceCode, { id: string; name: string; code: string }>();

  for (const serviceType of serviceTypes) {
    const existing = await tx.transportServiceType.findFirst({
      where: {
        OR: [
          { code: { equals: serviceType.code, mode: 'insensitive' } },
          { name: { equals: serviceType.name, mode: 'insensitive' } },
        ],
      },
    });

    const record = existing
      ? await tx.transportServiceType.update({
          where: { id: existing.id },
          data: serviceType,
        })
      : await tx.transportServiceType.create({ data: serviceType });

    records.set(serviceType.code, record);
  }

  return records;
}

export async function ensureFleet(tx: DbClient) {
  const supplier = await ensureAlphaSupplier(tx);
  const records = new Map<string, { id: string; name: string; maxPax: number }>();

  for (const vehicle of fleetCatalog) {
    const data = {
      supplierId: supplier.id,
      name: vehicle.name,
      maxPax: vehicle.maxPax,
      luggageCapacity: vehicle.luggageCapacity ?? vehicle.maxPax,
    };

    const existing = await tx.vehicle.findFirst({
      where: {
        supplierId: supplier.id,
        name: { equals: vehicle.name, mode: 'insensitive' },
      },
    });

    const record = existing
      ? await tx.vehicle.update({ where: { id: existing.id }, data })
      : await tx.vehicle.create({ data });

    records.set(normalizeKey(vehicle.name), record);
  }

  return records;
}

export async function ensureRoute(tx: DbClient, input: AlphaRouteInput) {
  const fromPlace = await ensurePlace(tx, input.fromName, input.fromCity, input.fromType);
  const toPlace = await ensurePlace(tx, input.toName, input.toCity, input.toType);

  const existing = await tx.route.findFirst({
    where: {
      normalizedKey: routeNormalizedKey(input),
    },
  });

  const data = {
    fromPlaceId: fromPlace.id,
    toPlaceId: toPlace.id,
    name: routeName(input),
    normalizedKey: routeNormalizedKey(input),
    routeType: input.routeType,
    durationMinutes: input.durationMinutes ?? null,
    distanceKm: input.distanceKm ?? null,
    notes: 'Imported from Alpha 2026 transport contracts.',
    isActive: true,
  };

  if (existing) {
    return tx.route.update({ where: { id: existing.id }, data });
  }

  return tx.route.create({ data });
}

export async function upsertPricingRule(
  tx: DbClient,
  input: AlphaPricingRuleInput,
  serviceTypesByCode: Map<AlphaServiceCode, { id: string }>,
  vehiclesByName: Map<string, { id: string; maxPax: number }>,
) {
  const route = await ensureRoute(tx, input.route);
  const serviceType = serviceTypesByCode.get(input.serviceCode);
  const vehicle = vehiclesByName.get(normalizeKey(input.vehicleName));

  if (!serviceType) {
    throw new Error(`Missing transport service type ${input.serviceCode}`);
  }

  if (!vehicle) {
    throw new Error(`Missing Alpha vehicle ${input.vehicleName}`);
  }

  const existing = await tx.transportPricingRule.findFirst({
    where: {
      routeId: route.id,
      transportServiceTypeId: serviceType.id,
      vehicleId: vehicle.id,
      minPax: input.minPax,
      maxPax: input.maxPax,
    },
  });

  const data = {
    routeId: route.id,
    transportServiceTypeId: serviceType.id,
    vehicleId: vehicle.id,
    pricingMode: input.pricingMode as TransportPricingMode,
    minPax: input.minPax,
    maxPax: input.maxPax,
    unitCapacity: input.unitCapacity ?? null,
    baseCost: input.baseCost,
    discountPercent: 0,
    currency: CURRENCY,
    isActive: true,
  };

  if (existing) {
    await tx.transportPricingRule.update({ where: { id: existing.id }, data });
  } else {
    await tx.transportPricingRule.create({ data });
  }

  await upsertVehicleRate(tx, {
    route,
    serviceTypeId: serviceType.id,
    vehicleId: vehicle.id,
    minPax: input.minPax,
    maxPax: input.maxPax,
    price: input.baseCost,
  });
}

async function ensurePlace(tx: DbClient, name: string, cityName: string, typeName: string) {
  const city = await ensureCity(tx, cityAliases[cityName] ?? cityName);
  const placeType = await ensurePlaceType(tx, placeTypeAliases[typeName] ?? typeName);

  const existing = await tx.place.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      cityId: city.id,
    },
  });

  const data = {
    name,
    type: placeType.name,
    city: city.name,
    country: 'Jordan',
    isActive: true,
    cityId: city.id,
    placeTypeId: placeType.id,
  };

  if (existing) {
    return tx.place.update({ where: { id: existing.id }, data });
  }

  return tx.place.create({ data });
}

async function ensureCity(tx: DbClient, name: string) {
  const existing = await tx.city.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });

  if (existing) {
    return tx.city.update({
      where: { id: existing.id },
      data: { name, country: 'Jordan', ...cityCoordinates(name), isActive: true },
    });
  }

  return tx.city.create({ data: { name, country: 'Jordan', ...cityCoordinates(name), isActive: true } });
}

async function ensurePlaceType(tx: DbClient, name: string) {
  const existing = await tx.placeType.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });

  if (existing) {
    return tx.placeType.update({ where: { id: existing.id }, data: { name, isActive: true } });
  }

  return tx.placeType.create({ data: { name, isActive: true } });
}

async function upsertVehicleRate(
  tx: DbClient,
  input: {
    route: { id: string; name: string; fromPlaceId: string; toPlaceId: string };
    serviceTypeId: string;
    vehicleId: string;
    minPax: number;
    maxPax: number;
    price: number;
  },
) {
  const existing = await tx.vehicleRate.findFirst({
    where: {
      routeId: input.route.id,
      serviceTypeId: input.serviceTypeId,
      vehicleId: input.vehicleId,
      minPax: input.minPax,
      maxPax: input.maxPax,
    },
  });

  const data = {
    vehicleId: input.vehicleId,
    serviceTypeId: input.serviceTypeId,
    routeId: input.route.id,
    fromPlaceId: input.route.fromPlaceId,
    toPlaceId: input.route.toPlaceId,
    routeName: input.route.name,
    minPax: input.minPax,
    maxPax: input.maxPax,
    price: input.price,
    currency: CURRENCY,
    validFrom: VALID_FROM,
    validTo: VALID_TO,
  };

  if (existing) {
    await tx.vehicleRate.update({ where: { id: existing.id }, data });
  } else {
    await tx.vehicleRate.create({ data });
  }
}
