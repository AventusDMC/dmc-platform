import { PrismaClient } from '@prisma/client';

type GoldenJordanTouringRouteSeed = {
  code: string;
  name: string;
  startCity: string;
  durationDays: number;
  mainDestinations: string[];
  estimatedDistanceKm: number;
  estimatedDriveHours: number;
  region: 'North' | 'Central' | 'South' | 'Islamic';
  longDistance: boolean;
  desertRoad: boolean;
  mountainRoad: boolean;
  seasonalHeatRisk: boolean;
  sicPossible: boolean;
  overnightRisk: boolean;
  stops: string[];
};

const GOLDEN_JORDAN_TOURING_ROUTES: GoldenJordanTouringRouteSeed[] = [
  {
    code: 'JOR-TR-NORTH-JERASH-RT',
    name: 'Amman – Jerash – Amman RT',
    startCity: 'Amman',
    durationDays: 1,
    mainDestinations: ['Jerash'],
    estimatedDistanceKm: 105,
    estimatedDriveHours: 2.1,
    region: 'North',
    longDistance: false,
    desertRoad: false,
    mountainRoad: false,
    seasonalHeatRisk: false,
    sicPossible: true,
    overnightRisk: false,
    stops: ['Amman', 'Jerash', 'Amman'],
  },
  {
    code: 'JOR-TR-NORTH-JERASH-AJLOUN-RT',
    name: 'Amman – Jerash – Ajloun – Amman RT',
    startCity: 'Amman',
    durationDays: 1,
    mainDestinations: ['Jerash', 'Ajloun'],
    estimatedDistanceKm: 170,
    estimatedDriveHours: 3.6,
    region: 'North',
    longDistance: false,
    desertRoad: false,
    mountainRoad: true,
    seasonalHeatRisk: false,
    sicPossible: true,
    overnightRisk: false,
    stops: ['Amman', 'Jerash', 'Ajloun', 'Amman'],
  },
  {
    code: 'JOR-TR-NORTH-UMM-QAIS-PELLA-RT',
    name: 'Amman – Umm Qais – Pella – Amman RT',
    startCity: 'Amman',
    durationDays: 1,
    mainDestinations: ['Umm Qais', 'Pella'],
    estimatedDistanceKm: 245,
    estimatedDriveHours: 5.1,
    region: 'North',
    longDistance: true,
    desertRoad: false,
    mountainRoad: true,
    seasonalHeatRisk: true,
    sicPossible: true,
    overnightRisk: false,
    stops: ['Amman', 'Umm Qais', 'Pella', 'Amman'],
  },
  {
    code: 'JOR-TR-CENTRAL-MADABA-NEBO-DEAD-SEA-RT',
    name: 'Amman – Madaba – Nebo – Dead Sea – Amman RT',
    startCity: 'Amman',
    durationDays: 1,
    mainDestinations: ['Madaba', 'Mount Nebo', 'Dead Sea'],
    estimatedDistanceKm: 150,
    estimatedDriveHours: 3.2,
    region: 'Central',
    longDistance: false,
    desertRoad: false,
    mountainRoad: true,
    seasonalHeatRisk: true,
    sicPossible: true,
    overnightRisk: false,
    stops: ['Amman', 'Madaba', 'Mount Nebo', 'Dead Sea', 'Amman'],
  },
  {
    code: 'JOR-TR-CENTRAL-SALT-RT',
    name: 'Amman – Salt – Amman RT',
    startCity: 'Amman',
    durationDays: 1,
    mainDestinations: ['Salt'],
    estimatedDistanceKm: 65,
    estimatedDriveHours: 1.7,
    region: 'Central',
    longDistance: false,
    desertRoad: false,
    mountainRoad: true,
    seasonalHeatRisk: false,
    sicPossible: true,
    overnightRisk: false,
    stops: ['Amman', 'Salt', 'Amman'],
  },
  {
    code: 'JOR-TR-CENTRAL-BETHANY-DEAD-SEA-RT',
    name: 'Amman – Bethany – Dead Sea – Amman RT',
    startCity: 'Amman',
    durationDays: 1,
    mainDestinations: ['Bethany', 'Dead Sea'],
    estimatedDistanceKm: 130,
    estimatedDriveHours: 2.8,
    region: 'Central',
    longDistance: false,
    desertRoad: false,
    mountainRoad: false,
    seasonalHeatRisk: true,
    sicPossible: true,
    overnightRisk: false,
    stops: ['Amman', 'Bethany Beyond the Jordan', 'Dead Sea', 'Amman'],
  },
  {
    code: 'JOR-TR-SOUTH-AMMAN-PETRA-ON',
    name: 'Amman – Petra ON',
    startCity: 'Amman',
    durationDays: 2,
    mainDestinations: ['Petra'],
    estimatedDistanceKm: 240,
    estimatedDriveHours: 3.4,
    region: 'South',
    longDistance: true,
    desertRoad: true,
    mountainRoad: true,
    seasonalHeatRisk: true,
    sicPossible: true,
    overnightRisk: true,
    stops: ['Amman', 'Petra'],
  },
  {
    code: 'JOR-TR-SOUTH-KERAK-PETRA-ON',
    name: 'Amman – Kerak – Petra ON',
    startCity: 'Amman',
    durationDays: 2,
    mainDestinations: ['Kerak', 'Petra'],
    estimatedDistanceKm: 285,
    estimatedDriveHours: 4.8,
    region: 'South',
    longDistance: true,
    desertRoad: true,
    mountainRoad: true,
    seasonalHeatRisk: true,
    sicPossible: true,
    overnightRisk: true,
    stops: ['Amman', 'Kerak', 'Petra'],
  },
  {
    code: 'JOR-TR-SOUTH-PETRA-WADI-RUM-ON',
    name: 'Petra – Wadi Rum ON',
    startCity: 'Petra',
    durationDays: 2,
    mainDestinations: ['Wadi Rum'],
    estimatedDistanceKm: 115,
    estimatedDriveHours: 2.0,
    region: 'South',
    longDistance: false,
    desertRoad: true,
    mountainRoad: false,
    seasonalHeatRisk: true,
    sicPossible: true,
    overnightRisk: true,
    stops: ['Petra', 'Wadi Rum'],
  },
  {
    code: 'JOR-TR-SOUTH-LITTLE-PETRA-RT',
    name: 'Petra – Little Petra – Petra RT',
    startCity: 'Petra',
    durationDays: 1,
    mainDestinations: ['Little Petra'],
    estimatedDistanceKm: 28,
    estimatedDriveHours: 0.9,
    region: 'South',
    longDistance: false,
    desertRoad: false,
    mountainRoad: true,
    seasonalHeatRisk: true,
    sicPossible: false,
    overnightRisk: false,
    stops: ['Petra', 'Little Petra', 'Petra'],
  },
  {
    code: 'JOR-TR-SOUTH-AQABA-WADI-RUM-RT',
    name: 'Aqaba – Wadi Rum – Aqaba RT',
    startCity: 'Aqaba',
    durationDays: 1,
    mainDestinations: ['Wadi Rum'],
    estimatedDistanceKm: 145,
    estimatedDriveHours: 2.5,
    region: 'South',
    longDistance: false,
    desertRoad: true,
    mountainRoad: false,
    seasonalHeatRisk: true,
    sicPossible: true,
    overnightRisk: false,
    stops: ['Aqaba', 'Wadi Rum', 'Aqaba'],
  },
  {
    code: 'JOR-TR-ISLAMIC-BLESSED-TREE-RT',
    name: 'Amman – Blessed Tree – Amman RT',
    startCity: 'Amman',
    durationDays: 1,
    mainDestinations: ['Blessed Tree'],
    estimatedDistanceKm: 270,
    estimatedDriveHours: 4.7,
    region: 'Islamic',
    longDistance: true,
    desertRoad: true,
    mountainRoad: false,
    seasonalHeatRisk: true,
    sicPossible: false,
    overnightRisk: false,
    stops: ['Amman', 'Blessed Tree', 'Amman'],
  },
  {
    code: 'JOR-TR-ISLAMIC-JORDAN-VALLEY-RT',
    name: 'Amman – Jordan Valley Islamic Sites – Amman RT',
    startCity: 'Amman',
    durationDays: 1,
    mainDestinations: ['Jordan Valley Islamic Sites'],
    estimatedDistanceKm: 210,
    estimatedDriveHours: 4.2,
    region: 'Islamic',
    longDistance: true,
    desertRoad: false,
    mountainRoad: false,
    seasonalHeatRisk: true,
    sicPossible: false,
    overnightRisk: false,
    stops: ['Amman', 'Jordan Valley Islamic Sites', 'Amman'],
  },
  {
    code: 'JOR-TR-ISLAMIC-MUTA-PETRA-ON',
    name: 'Amman – Muta – Petra ON',
    startCity: 'Amman',
    durationDays: 2,
    mainDestinations: ['Muta', 'Petra'],
    estimatedDistanceKm: 300,
    estimatedDriveHours: 5.0,
    region: 'Islamic',
    longDistance: true,
    desertRoad: true,
    mountainRoad: true,
    seasonalHeatRisk: true,
    sicPossible: false,
    overnightRisk: true,
    stops: ['Amman', 'Muta', 'Petra'],
  },
];

const CANONICAL_REVIEW_NOTE =
  'Golden Jordan canonical touring route. Operational infrastructure only; not a sellable excursion template.';

function normalizeTouringRouteReviewKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b(round\s*trip|return|rt)\b/g, 'rt')
    .replace(/\b(overnight|on)\b/g, 'on')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildRouteData(route: GoldenJordanTouringRouteSeed) {
  return {
    name: route.name,
    startCity: route.startCity,
    durationDays: route.durationDays,
    routeDescription: route.stops.join(' – '),
    mainDestinations: route.mainDestinations,
    includedKm: route.estimatedDistanceKm,
    includedHours: route.estimatedDriveHours,
    estimatedDistanceKm: route.estimatedDistanceKm,
    estimatedDriveHours: route.estimatedDriveHours,
    region: route.region,
    longDistance: route.longDistance,
    desertRoad: route.desertRoad,
    mountainRoad: route.mountainRoad,
    seasonalHeatRisk: route.seasonalHeatRisk,
    sicPossible: route.sicPossible,
    overnightRisk: route.overnightRisk,
    reviewNotes: CANONICAL_REVIEW_NOTE,
    active: true,
  };
}

async function seedGoldenJordanTouringRoutes(prisma: PrismaClient) {
  const canonicalCodes = GOLDEN_JORDAN_TOURING_ROUTES.map((route) => route.code);
  const existingCanonicalRoutes = await prisma.touringRoute.findMany({
    where: { code: { in: canonicalCodes } },
    select: { code: true },
  });
  const existingCanonicalCodes = new Set(existingCanonicalRoutes.map((route) => route.code));
  const canonicalByReviewKey = new Map(
    GOLDEN_JORDAN_TOURING_ROUTES.map((route) => [normalizeTouringRouteReviewKey(route.name), route]),
  );

  let created = 0;
  let updated = 0;
  let duplicatesFlagged = 0;

  for (const route of GOLDEN_JORDAN_TOURING_ROUTES) {
    const stopCreates = route.stops.map((stop, index) => ({
      order: index + 1,
      city: stop,
      location: stop,
      notes: index === route.stops.length - 1 && route.name.endsWith('ON') ? 'Overnight routing endpoint' : null,
    }));
    const routeData = buildRouteData(route);

    await prisma.touringRoute.upsert({
      where: { code: route.code },
      update: {
        ...routeData,
        stops: {
          deleteMany: {},
          create: stopCreates,
        },
      },
      create: {
        code: route.code,
        ...routeData,
        stops: {
          create: stopCreates,
        },
      },
    });

    if (existingCanonicalCodes.has(route.code)) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  const legacyRoutes = await prisma.touringRoute.findMany({
    where: { code: { notIn: canonicalCodes } },
    select: { id: true, code: true, name: true, routeDescription: true, reviewNotes: true },
  });

  for (const legacyRoute of legacyRoutes) {
    const matched = canonicalByReviewKey.get(
      normalizeTouringRouteReviewKey(legacyRoute.name || legacyRoute.routeDescription || ''),
    );
    if (!matched) {
      continue;
    }

    const reviewNotes = `Review duplicate/similar legacy touring route against canonical ${matched.code}. Do not delete automatically.`;
    if (legacyRoute.reviewNotes === reviewNotes) {
      continue;
    }

    await prisma.touringRoute.update({
      where: { id: legacyRoute.id },
      data: { reviewNotes },
    });
    duplicatesFlagged += 1;
  }

  const canonicalRouteCount = await prisma.touringRoute.count({
    where: { code: { in: canonicalCodes } },
  });
  if (canonicalRouteCount !== GOLDEN_JORDAN_TOURING_ROUTES.length) {
    throw new Error(
      `Golden Jordan touring route validation failed: expected ${GOLDEN_JORDAN_TOURING_ROUTES.length}, found ${canonicalRouteCount}.`,
    );
  }

  return {
    created,
    updated,
    duplicatesFlagged,
    validatedRoutes: canonicalRouteCount,
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const summary = await seedGoldenJordanTouringRoutes(prisma);
    console.log('Golden Jordan touring route seed complete');
    console.log(`created: ${summary.created}`);
    console.log(`updated: ${summary.updated}`);
    console.log(`duplicates flagged: ${summary.duplicatesFlagged}`);
    console.log(`validated route count: ${summary.validatedRoutes}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Golden Jordan touring route seed failed');
  console.error(error);
  process.exit(1);
});
