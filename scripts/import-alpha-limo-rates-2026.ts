import { PrismaClient } from '@prisma/client';
import {
  AlphaPricingRuleInput,
  AlphaRouteInput,
  AlphaServiceCode,
  ensureFleet,
  ensureRoute,
  ensureServiceTypes,
  upsertPricingRule,
} from './alpha-transport-import-utils';

const prisma = new PrismaClient();

type LimoColumn = {
  vehicleName: string;
  capacity: number;
};

type LimoRateRow = {
  label: string;
  serviceCode: AlphaServiceCode;
  route: AlphaRouteInput;
  prices: number[];
};

const limoColumns: LimoColumn[] = [
  { vehicleName: 'Hyundai Staria', capacity: 5 },
  { vehicleName: 'Mercedes V-Class VIP', capacity: 5 },
  { vehicleName: 'Mercedes V-Class VVIP', capacity: 5 },
];

function route(
  fromName: string,
  toName: string,
  fromCity: string,
  toCity: string,
  routeType: string,
  fromType = 'City',
  toType = 'Destination',
): AlphaRouteInput {
  return {
    fromName,
    toName,
    fromCity,
    toCity,
    fromType,
    toType,
    routeType,
  };
}

const limoRateRows: LimoRateRow[] = [
  {
    label: 'Full day 8H',
    serviceCode: 'FULL_DAY',
    route: route('Amman', 'Alpha Limo Full Day 8H', 'Amman', 'Amman', 'full-day-disposal'),
    prices: [151, 267, 374],
  },
  {
    label: 'Half day 4H',
    serviceCode: 'HALF_DAY',
    route: route('Amman', 'Alpha Limo Half Day 4H', 'Amman', 'Amman', 'half-day-disposal'),
    prices: [90, 156, 218],
  },
  {
    label: 'Extra hour',
    serviceCode: 'PER_HOUR',
    route: route('Amman', 'Alpha Limo Extra Hour', 'Amman', 'Amman', 'extra-hour'),
    prices: [24, 36, 36],
  },
  {
    label: 'Driver overnight outside Amman',
    serviceCode: 'PER_HOUR',
    route: route(
      'Alpha Driver Overnight',
      'Driver Overnight Outside Amman',
      'Alpha Driver Overnight',
      'Amman',
      'driver-overnight',
    ),
    prices: [40, 40, 40],
  },
  {
    label: 'Amman city / QAIA Airport',
    serviceCode: 'TRANSFER',
    route: route('Amman', 'QAIA Airport', 'Amman', 'QAIA Airport', 'airport-transfer', 'City', 'Airport'),
    prices: [81, 97, 135],
  },
  {
    label: 'Amman city / King Hussein Bridge',
    serviceCode: 'TRANSFER',
    route: route(
      'Amman',
      'King Hussein Bridge',
      'Amman',
      'King Hussein Bridge',
      'border-transfer',
      'City',
      'Border',
    ),
    prices: [90, 131, 183],
  },
  {
    label: 'Amman city / Sheikh Hussein Border',
    serviceCode: 'TRANSFER',
    route: route(
      'Amman',
      'Sheikh Hussein Border',
      'Amman',
      'Sheikh Hussein Border',
      'border-transfer',
      'City',
      'Border',
    ),
    prices: [90, 156, 218],
  },
];

const limoRoutes = limoRateRows.map((row) => row.route);
const limoRates = limoRateRows.flatMap((row): AlphaPricingRuleInput[] =>
  row.prices.map((baseCost, index) => {
    const column = limoColumns[index];

    return {
      route: row.route,
      serviceCode: row.serviceCode,
      vehicleName: column.vehicleName,
      minPax: 1,
      maxPax: column.capacity,
      baseCost,
      pricingMode: 'per_vehicle',
      unitCapacity: null,
    };
  }),
);

async function main() {
  await prisma.$connect();

  try {
    const summary = await prisma.$transaction(
      async (tx) => {
        const serviceTypes = await ensureServiceTypes(tx);
        const vehicles = await ensureFleet(tx);

        for (const currentRoute of limoRoutes) {
          await ensureRoute(tx, currentRoute);
        }

        for (const rate of limoRates) {
          await upsertPricingRule(tx, rate, serviceTypes, vehicles);
        }

        return {
          supplier: 'Alpha Transport',
          currency: 'USD',
          pricingBasis: ['PER_DAY', 'PER_HOUR'],
          routes: limoRoutes.length,
          rules: limoRates.length,
        };
      },
      { timeout: 600000, maxWait: 10000 },
    );

    console.log('Alpha limo rates 2026 import complete.');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});
