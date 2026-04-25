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

type BusColumn = {
  label: string;
  vehicleName: string;
  capacity: number;
};

type BusRateRow = {
  label: string;
  serviceCode: AlphaServiceCode;
  route: AlphaRouteInput;
  prices: number[];
};

const busColumns: BusColumn[] = [
  { label: 'VVIP29', vehicleName: 'Mercedes Grand Star VIP', capacity: 29 },
  { label: 'VIP31-33', vehicleName: 'Mercedes Grand Star 31 Pax', capacity: 31 },
  { label: 'Bus49', vehicleName: 'Mercedes Grand Star 49 Pax', capacity: 49 },
  { label: 'Medium30', vehicleName: 'Alpha Medium Coach 30 Pax', capacity: 30 },
  { label: 'Small17', vehicleName: 'Toyota Coaster', capacity: 17 },
  { label: 'VanVIP9', vehicleName: 'Mercedes Sprinter VIP', capacity: 9 },
  { label: 'Van12', vehicleName: 'Hyundai H350', capacity: 12 },
  { label: 'MiniVan5', vehicleName: 'Mercedes V-Class VIP', capacity: 5 },
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

const busRateRows: BusRateRow[] = [
  {
    label: 'Full day 200km',
    serviceCode: 'FULL_DAY',
    route: route('Amman', 'Alpha Bus Full Day 200km', 'Amman', 'Amman', 'full-day-disposal'),
    prices: [1038, 903, 637, 509, 324, 637, 294, 149],
  },
  {
    label: 'Half day 100km',
    serviceCode: 'HALF_DAY',
    route: route('Amman', 'Alpha Bus Half Day 100km', 'Amman', 'Amman', 'half-day-disposal'),
    prices: [655, 568, 359, 298, 245, 359, 219, 89],
  },
  {
    label: 'Extra KM',
    serviceCode: 'PER_HOUR',
    route: route('Alpha Bus Extra KM', 'Extra KM', 'Alpha Bus Extra KM', 'Amman', 'extra-km'),
    prices: [2, 2, 2, 2, 2, 2, 1, 1],
  },
  {
    label: 'Stationary',
    serviceCode: 'PER_HOUR',
    route: route('Alpha Bus Stationary', 'Stationary', 'Alpha Bus Stationary', 'Amman', 'stationary'),
    prices: [506, 441, 259, 259, 199, 259, 178, 54],
  },
  {
    label: 'Aqaba/Petra 1D',
    serviceCode: 'TRANSFER',
    route: route('Aqaba', 'Petra 1D', 'Aqaba', 'Petra 1D', 'intercity-transfer'),
    prices: [2095, 1746, 1455, 1101, 561, 1455, 425, 270],
  },
  {
    label: 'Aqaba/Petra 2D',
    serviceCode: 'TRANSFER',
    route: route('Aqaba', 'Petra 2D', 'Aqaba', 'Petra 2D', 'intercity-transfer'),
    prices: [1884, 1572, 1309, 986, 505, 1309, 378, 245],
  },
  {
    label: 'Aqaba/Rum 1D',
    serviceCode: 'TRANSFER',
    route: route('Aqaba', 'Rum 1D', 'Aqaba', 'Rum 1D', 'intercity-transfer'),
    prices: [1884, 1572, 1309, 986, 505, 1309, 378, 245],
  },
  {
    label: 'Aqaba/Dead Sea 1D',
    serviceCode: 'TRANSFER',
    route: route('Aqaba', 'Dead Sea 1D', 'Aqaba', 'Dead Sea 1D', 'intercity-transfer'),
    prices: [2672, 2225, 1857, 1523, 641, 1857, 470, 350],
  },
  {
    label: 'Amman/QAIA',
    serviceCode: 'TRANSFER',
    route: route('Amman', 'QAIA Airport', 'Amman', 'QAIA Airport', 'airport-transfer', 'City', 'Airport'),
    prices: [561, 482, 359, 298, 245, 359, 219, 79],
  },
  {
    label: 'Amman/Marka Airport',
    serviceCode: 'TRANSFER',
    route: route('Amman', 'Marka Airport', 'Amman', 'Marka Airport', 'airport-transfer', 'City', 'Airport'),
    prices: [315, 272, 209, 204, 160, 209, 144, 79],
  },
  {
    label: 'Amman/Allenby or Sheikh Hussein Border',
    serviceCode: 'TRANSFER',
    route: route(
      'Amman',
      'Allenby or Sheikh Hussein Border',
      'Amman',
      'Allenby or Sheikh Hussein Border',
      'border-transfer',
      'City',
      'Border',
    ),
    prices: [655, 568, 359, 298, 245, 359, 219, 89],
  },
  {
    label: 'Aqaba city/AQJ Airport-Port-South Border 1H',
    serviceCode: 'TRANSFER',
    route: route(
      'Aqaba City',
      'AQJ Airport-Port-South Border 1H',
      'Aqaba City',
      'AQJ Airport-Port-South Border 1H',
      'aqaba-local-transfer',
    ),
    prices: [315, 272, 209, 204, 160, 209, 144, 79],
  },
  {
    label: 'Aqaba city/AQJ Airport-Port-South Border 5H',
    serviceCode: 'TRANSFER',
    route: route(
      'Aqaba City',
      'AQJ Airport-Port-South Border 5H',
      'Aqaba City',
      'AQJ Airport-Port-South Border 5H',
      'aqaba-local-transfer',
    ),
    prices: [655, 568, 359, 298, 245, 359, 219, 89],
  },
  {
    label: 'Aqaba city/AQJ Airport-Port-South Border 11H',
    serviceCode: 'TRANSFER',
    route: route(
      'Aqaba City',
      'AQJ Airport-Port-South Border 11H',
      'Aqaba City',
      'AQJ Airport-Port-South Border 11H',
      'aqaba-local-transfer',
    ),
    prices: [1038, 903, 637, 509, 324, 637, 294, 149],
  },
  {
    label: 'If transfer not part of program deduct',
    serviceCode: 'TRANSFER',
    route: route(
      'Alpha Bus Transfer Deduction',
      'Deduct Transfer Not Part Of Program',
      'Alpha Bus Transfer Deduction',
      'Amman',
      'transfer-deduction',
    ),
    prices: [0, 0, 87, 87, 33, 87, 33, 22],
  },
];

const busRoutes = busRateRows.map((row) => row.route);
const busRates = busRateRows.flatMap((row): AlphaPricingRuleInput[] =>
  row.prices.map((baseCost, index) => {
    const column = busColumns[index];

    return {
      route: row.route,
      serviceCode: row.serviceCode,
      vehicleName: column.vehicleName,
      minPax: 1,
      maxPax: column.capacity,
      baseCost,
      pricingMode: 'capacity_unit',
      unitCapacity: column.capacity,
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

        for (const currentRoute of busRoutes) {
          await ensureRoute(tx, currentRoute);
        }

        for (const rate of busRates) {
          await upsertPricingRule(tx, rate, serviceTypes, vehicles);
        }

        return {
          supplier: 'Alpha Transport',
          currency: 'USD',
          pricingBasis: ['PER_DAY', 'PER_ROUTE', 'PER_HOUR'],
          routes: busRoutes.length,
          rules: busRates.length,
        };
      },
      { timeout: 600000, maxWait: 10000 },
    );

    console.log('Alpha bus rates 2026 import complete.');
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
