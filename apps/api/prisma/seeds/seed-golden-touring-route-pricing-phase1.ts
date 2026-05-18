import { PrismaClient } from '@prisma/client';

type PrismaLike = Record<string, any>;
type Logger = Pick<Console, 'log' | 'warn'>;

type Options = {
  dryRun?: boolean;
  logger?: Logger;
};

type Summary = {
  dryRun: boolean;
  routesChecked: number;
  suggestions: number;
  created: number;
  skippedExisting: number;
  skippedMissingVehicle: number;
  validationWarnings: number;
};

type VehicleCorrectionSummary = {
  dryRun: boolean;
  rowsChecked: number;
  candidates: number;
  remapped: number;
  skippedReferenced: number;
  skippedMissingVehicle: number;
  skippedUnsupportedRange: number;
  alreadyCorrect: number;
};

type VehicleTarget = {
  label: string;
  canonicalName: string;
  canonicalVehicleType: string;
  aliases: string[];
  minPax: number;
  maxPax: number;
  multiplier: number;
};

type SuggestedPricing = {
  route: any;
  vehicleTarget: VehicleTarget;
  vehicle: any | null;
  currency: string;
  baseCost: number;
  reason: string;
};

const GOLDEN_ROUTE_CODES = [
  'JOR-TR-NORTH-JERASH-RT',
  'JOR-TR-NORTH-JERASH-AJLOUN-RT',
  'JOR-TR-CENTRAL-MADABA-NEBO-DEAD-SEA-RT',
  'JOR-TR-CENTRAL-SALT-RT',
  'JOR-TR-CENTRAL-BETHANY-DEAD-SEA-RT',
  'JOR-TR-SOUTH-PETRA-WADI-RUM-ON',
  'JOR-TR-SOUTH-LITTLE-PETRA-RT',
  'JOR-TR-SOUTH-AQABA-WADI-RUM-RT',
  'JOR-TR-ISLAMIC-BLESSED-TREE-RT',
  'JOR-TR-ISLAMIC-JORDAN-VALLEY-RT',
  'JOR-TR-ISLAMIC-MUTA-PETRA-ON',
  'JOR-TR-NORTH-UMM-QAIS-PELLA-RT',
  'JOR-TR-SOUTH-AMMAN-PETRA-ON',
  'JOR-TR-SOUTH-KERAK-PETRA-ON',
];

const VEHICLE_TARGETS: VehicleTarget[] = [
  { label: 'Sedan', canonicalName: 'Sedan 2', canonicalVehicleType: 'Sedan', aliases: ['sedan', 'car', 'saloon', 'camry'], minPax: 1, maxPax: 2, multiplier: 1 },
  { label: 'Mini Van', canonicalName: 'Mini Van 6', canonicalVehicleType: 'Mini Van', aliases: ['mini van', 'minivan', 'h1', 'staria'], minPax: 3, maxPax: 6, multiplier: 1.18 },
  { label: 'Van', canonicalName: 'Van 9', canonicalVehicleType: 'Van', aliases: ['van', 'van vip', 'van 9', 'van 12', 'sprinter', 'v class', 'h350'], minPax: 7, maxPax: 9, multiplier: 1.35 },
  { label: 'Mini Bus / Coaster', canonicalName: 'Toyota Coaster / Mini Bus 17', canonicalVehicleType: 'Mini Bus', aliases: ['mini bus', 'minibus', 'coaster', 'toyota coaster', 'small 17', 'mini coach'], minPax: 10, maxPax: 17, multiplier: 1.62 },
  { label: 'Medium Bus', canonicalName: 'Medium Bus 30', canonicalVehicleType: 'Medium Bus', aliases: ['medium bus', 'medium coach', 'medium 30', 'large vip 29', 'large vvip 29'], minPax: 18, maxPax: 30, multiplier: 2.05 },
  { label: 'Large Bus', canonicalName: 'Large Coach 49', canonicalVehicleType: 'Large Coach', aliases: ['large bus', 'large coach', 'large 49', 'large 48', 'coach 49', 'bus 49'], minPax: 31, maxPax: 49, multiplier: 2.45 },
];

const GOLDEN_TOURING_PRICING_NOTE = 'Golden Touring Route Pricing Completion Phase 1';

function emptySummary(dryRun: boolean): Summary {
  return {
    dryRun,
    routesChecked: 0,
    suggestions: 0,
    created: 0,
    skippedExisting: 0,
    skippedMissingVehicle: 0,
    validationWarnings: 0,
  };
}

function emptyVehicleCorrectionSummary(dryRun: boolean): VehicleCorrectionSummary {
  return {
    dryRun,
    rowsChecked: 0,
    candidates: 0,
    remapped: 0,
    skippedReferenced: 0,
    skippedMissingVehicle: 0,
    skippedUnsupportedRange: 0,
    alreadyCorrect: 0,
  };
}

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeLoose(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function vehicleMatchesTarget(vehicle: any, target: VehicleTarget) {
  const text = [vehicle?.vehicleType, vehicle?.name].map(normalizeLoose).join(' ');
  const compact = normalize(text);
  const capacity = Number(vehicle?.maxPax || 0);
  return target.aliases.some((alias) => compact.includes(normalize(alias))) && capacity >= target.minPax && capacity <= target.maxPax;
}

function vehicleMatchesExactCanonicalTarget(vehicle: any, target: VehicleTarget) {
  return (
    normalize(vehicle?.name) === normalize(target.canonicalName) &&
    Number(vehicle?.maxPax || 0) === target.maxPax
  );
}

function resolveVehicle(vehicles: any[], target: VehicleTarget) {
  return vehicles.find((vehicle) => vehicleMatchesExactCanonicalTarget(vehicle, target)) || null;
}

function existingVehicleTypeCoverage(pricings: any[], target: VehicleTarget) {
  return pricings.some((pricing) => {
    if (pricing.minPax != null && pricing.maxPax != null) {
      return capacityRangeOverlaps(Number(pricing.minPax), Number(pricing.maxPax), target.minPax, target.maxPax);
    }
    return vehicleMatchesTarget(pricing.vehicle, target);
  });
}

function capacityRangeOverlaps(leftMin: number, leftMax: number, rightMin: number, rightMax: number) {
  return leftMin <= rightMax && rightMin <= leftMax;
}

function classifyVehicleByCapacity(vehicle: any) {
  const capacity = Number(vehicle?.maxPax || 0);
  return VEHICLE_TARGETS.find((target) => capacity >= target.minPax && capacity <= target.maxPax) || null;
}

function targetForPricingRange(pricing: any) {
  const minPax = Number(pricing.minPax || 0);
  const maxPax = Number(pricing.maxPax || 0);
  return VEHICLE_TARGETS.find((target) => minPax >= target.minPax && maxPax <= target.maxPax) || null;
}

function targetForExactPricingRange(pricing: any) {
  const minPax = Number(pricing.minPax || 0);
  const maxPax = Number(pricing.maxPax || 0);
  return VEHICLE_TARGETS.find((target) => minPax === target.minPax && maxPax === target.maxPax) || null;
}

function labelMatchesCapacity(vehicle: any) {
  const target = classifyVehicleByCapacity(vehicle);
  return Boolean(target && vehicleMatchesTarget(vehicle, target));
}

function hasLuxuryOrSpecialFlag(route: any) {
  return /\b(luxury|vip|vvip|special)\b/i.test([route.name, route.reviewNotes, route.notes].filter(Boolean).join(' '));
}

function validateExistingPricings(route: any, logger: Logger) {
  const warnings: string[] = [];
  const pricings = route.pricings || [];
  for (const pricing of pricings) {
    const pricingTarget = targetForPricingRange(pricing);
    if (
      pricing.vehicle &&
      (
        !labelMatchesCapacity(pricing.vehicle) ||
        (pricingTarget && !vehicleMatchesTarget(pricing.vehicle, pricingTarget)) ||
        Number(pricing.vehicle.maxPax || 0) < Number(pricing.maxPax || 0)
      )
    ) {
      warnings.push(`${route.code} | invalid vehicle label | ${pricing.vehicle.name || pricing.vehicle.vehicleType || pricing.vehicleId} cannot cover ${pricing.minPax}-${pricing.maxPax} pax`);
    }
  }

  for (let index = 0; index < pricings.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < pricings.length; otherIndex += 1) {
      const left = pricings[index];
      const right = pricings[otherIndex];
      if (capacityRangeOverlaps(Number(left.minPax || 1), Number(left.maxPax || 99), Number(right.minPax || 1), Number(right.maxPax || 99))) {
        warnings.push(`${route.code} | duplicate capacity overlap | ${left.minPax}-${left.maxPax} overlaps ${right.minPax}-${right.maxPax}`);
      }
    }
  }

  const medium = pricings.find((pricing: any) => capacityRangeOverlaps(Number(pricing.minPax || 0), Number(pricing.maxPax || 0), 18, 30));
  const large = pricings.find((pricing: any) => capacityRangeOverlaps(Number(pricing.minPax || 0), Number(pricing.maxPax || 0), 31, 49));
  if (medium && large) {
    const mediumCost = Number(medium.baseCost || 0);
    const largeCost = Number(large.baseCost || 0);
    if (largeCost < mediumCost) {
      warnings.push(`${route.code} | unrealistic hierarchy | Large Coach ${largeCost} is lower than Medium Bus ${mediumCost}`);
    }
    if (largeCost > mediumCost * 1.35 && !hasLuxuryOrSpecialFlag(route)) {
      warnings.push(`${route.code} | unrealistic hierarchy | Large Coach ${largeCost} is more than 35% above Medium Bus ${mediumCost}`);
    }
  }

  for (const warning of warnings) logger.warn(warning);
  return warnings.length;
}

function routeCurrency(pricings: any[]) {
  const existing = pricings.find((pricing) => typeof pricing.currency === 'string' && pricing.currency.trim());
  return existing?.currency?.trim().toUpperCase() || 'JOD';
}

function roundToNearestFive(value: number) {
  return Math.max(25, Math.round(value / 5) * 5);
}

function routeBaseSedanCost(route: any) {
  const distance = Number(route.estimatedDistanceKm || route.includedKm || 0);
  const hours = Number(route.estimatedDriveHours || route.includedHours || 0);
  const durationDays = Math.max(1, Number(route.durationDays || 1));
  const distanceCost = 38 + distance * 0.34;
  const timeCost = hours * 8;
  const overnightPremium = durationDays > 1 || route.overnightRisk ? 35 : 0;
  const remotePremium = route.desertRoad || route.region === 'Islamic' ? 18 : 0;
  return roundToNearestFive(distanceCost + timeCost + overnightPremium + remotePremium);
}

function suggestedCost(route: any, target: VehicleTarget) {
  return roundToNearestFive(routeBaseSedanCost(route) * target.multiplier);
}

function enforceSuggestionHierarchy(route: any, suggestions: SuggestedPricing[]) {
  const medium = suggestions.find((suggestion) => suggestion.vehicleTarget.label === 'Medium Bus');
  const large = suggestions.find((suggestion) => suggestion.vehicleTarget.label === 'Large Bus');
  if (!medium || !large) return;
  if (large.baseCost < medium.baseCost) large.baseCost = medium.baseCost;
  const maxLarge = roundToNearestFive(medium.baseCost * 1.3);
  if (large.baseCost > maxLarge && !hasLuxuryOrSpecialFlag(route)) large.baseCost = maxLarge;
}

function printSuggestion(logger: Logger, suggestion: SuggestedPricing) {
  logger.log(
    `${suggestion.route.code} | ${suggestion.vehicleTarget.label} | ${suggestion.baseCost} | ${suggestion.currency} | ${suggestion.reason}`,
  );
}

async function ensureDailyFullDayServiceType(prisma: PrismaLike) {
  const existing = await prisma.transportServiceType.findFirst({
    where: { OR: [{ name: { equals: 'Daily Full Day', mode: 'insensitive' } }, { code: { equals: 'DAILY_FULL_DAY', mode: 'insensitive' } }] },
  });
  if (existing) return existing;
  return prisma.transportServiceType.create({
    data: { name: 'Daily Full Day', code: 'DAILY_FULL_DAY', classification: 'FULL_DAY' },
  });
}

async function createSuggestedPricing(prisma: PrismaLike, suggestion: SuggestedPricing, serviceTypeId: string) {
  await prisma.touringRoutePricing.create({
    data: {
      touringRouteId: suggestion.route.id,
      supplierId: suggestion.vehicle?.supplierId || null,
      vehicleId: suggestion.vehicle?.id || null,
      transportServiceTypeId: serviceTypeId,
      pricingBasis: 'PER_VEHICLE',
      minPax: suggestion.vehicleTarget.minPax,
      maxPax: suggestion.vehicleTarget.maxPax,
      currency: suggestion.currency,
      baseCost: suggestion.baseCost,
      costPerDay: suggestion.route.durationDays > 1 ? Math.round(suggestion.baseCost / suggestion.route.durationDays) : null,
      includedKm: suggestion.route.includedKm ?? suggestion.route.estimatedDistanceKm ?? null,
      includedHours: suggestion.route.includedHours ?? suggestion.route.estimatedDriveHours ?? null,
      active: true,
      notes: `${GOLDEN_TOURING_PRICING_NOTE}: ${suggestion.reason}`,
    },
  });
}

async function count(prisma: PrismaLike, model: string, where: Record<string, unknown>) {
  return prisma[model]?.count ? Number(await prisma[model].count({ where })) : 0;
}

function routeCodeForPricing(pricing: any) {
  return pricing.touringRoute?.code || pricing.route?.code || pricing.touringRouteCode || pricing.touringRouteId || 'unknown-route';
}

function vehicleLabel(vehicle: any) {
  return vehicle?.name || vehicle?.vehicleType || 'None';
}

function paxRange(pricing: any) {
  return `${pricing.minPax}-${pricing.maxPax}`;
}

function isGoldenCreatedPricing(pricing: any) {
  return String(pricing?.notes || '').includes(GOLDEN_TOURING_PRICING_NOTE);
}

export async function correctGoldenTouringRoutePricingVehicles(prisma: PrismaLike, options: Options = {}) {
  const resolved = { dryRun: true, logger: console, ...options };
  const summary = emptyVehicleCorrectionSummary(resolved.dryRun);

  resolved.logger.log(`Golden touring route pricing vehicle correction starting${resolved.dryRun ? ' in dry-run mode' : ''}.`);
  resolved.logger.log('Route Code | Pax Range | Current Vehicle | Correct Vehicle | Action');

  const [pricings, vehicles] = await Promise.all([
    prisma.touringRoutePricing.findMany({
      where: { active: true },
      include: { vehicle: true, touringRoute: true },
    }),
    prisma.vehicle.findMany({}),
  ]);

  for (const pricing of pricings.filter(isGoldenCreatedPricing)) {
    summary.rowsChecked += 1;
    const target = targetForExactPricingRange(pricing);
    if (!target) {
      summary.skippedUnsupportedRange += 1;
      resolved.logger.warn(`${routeCodeForPricing(pricing)} | ${paxRange(pricing)} | ${vehicleLabel(pricing.vehicle)} | - | Skip unsupported pax range`);
      continue;
    }

    const correctVehicle = resolveVehicle(vehicles, target);
    if (!correctVehicle) {
      summary.skippedMissingVehicle += 1;
      resolved.logger.warn(`${routeCodeForPricing(pricing)} | ${paxRange(pricing)} | ${vehicleLabel(pricing.vehicle)} | ${target.canonicalName} | Skip missing exact canonical vehicle`);
      continue;
    }

    if (pricing.vehicleId === correctVehicle.id) {
      summary.alreadyCorrect += 1;
      continue;
    }

    const references =
      (await count(prisma, 'quoteItem', { touringRoutePricingId: pricing.id })) +
      (await count(prisma, 'bookingService', { touringRoutePricingId: pricing.id }));
    if (references > 0) {
      summary.skippedReferenced += 1;
      resolved.logger.warn(`${routeCodeForPricing(pricing)} | ${paxRange(pricing)} | ${vehicleLabel(pricing.vehicle)} | ${correctVehicle.name} | Skip referenced row`);
      continue;
    }

    summary.candidates += 1;
    resolved.logger.log(`${routeCodeForPricing(pricing)} | ${paxRange(pricing)} | ${vehicleLabel(pricing.vehicle)} | ${correctVehicle.name} | ${resolved.dryRun ? 'Would remap vehicleId' : 'Remap vehicleId'}`);
    if (!resolved.dryRun) {
      await prisma.touringRoutePricing.update({ where: { id: pricing.id }, data: { vehicleId: correctVehicle.id } });
      summary.remapped += 1;
    }
  }

  resolved.logger.log(`Golden touring route pricing vehicle correction summary: ${JSON.stringify(summary, null, 2)}`);
  return summary;
}

export async function seedGoldenTouringRoutePricingPhase1(prisma: PrismaLike, options: Options = {}) {
  const resolved = { dryRun: true, logger: console, ...options };
  const summary = emptySummary(resolved.dryRun);

  resolved.logger.log(`Golden touring route pricing completion Phase 1 starting${resolved.dryRun ? ' in dry-run mode' : ''}.`);
  resolved.logger.log('Route Code | Vehicle | Suggested Cost | Currency | Source/Reason');

  const routes = await prisma.touringRoute.findMany({
    where: { active: true, code: { in: GOLDEN_ROUTE_CODES } },
    include: { pricings: { where: { active: true }, include: { vehicle: true } } },
  });
  const vehicles = await prisma.vehicle.findMany({});
  const serviceType = resolved.dryRun ? null : await ensureDailyFullDayServiceType(prisma);

  for (const route of routes) {
    summary.routesChecked += 1;
    summary.validationWarnings += validateExistingPricings(route, resolved.logger);
    const currency = routeCurrency(route.pricings || []);
    const routeSuggestions: SuggestedPricing[] = [];
    for (const target of VEHICLE_TARGETS) {
      if (existingVehicleTypeCoverage(route.pricings || [], target)) {
        summary.skippedExisting += 1;
        continue;
      }

      const vehicle = resolveVehicle(vehicles, target);
      if (!vehicle) {
        summary.skippedMissingVehicle += 1;
        resolved.logger.warn(`${route.code} | ${target.label} | - | ${currency} | Missing exact canonical vehicle ${target.canonicalName}; create canonical fleet row before applying pricing.`);
        continue;
      }

      const suggestion: SuggestedPricing = {
        route,
        vehicleTarget: target,
        vehicle,
        currency,
        baseCost: suggestedCost(route, target),
        reason: `Conservative JOD operational estimate from ${route.estimatedDistanceKm || route.includedKm || 'unknown'}km / ${route.estimatedDriveHours || route.includedHours || 'unknown'}h Golden route metadata.`,
      };
      routeSuggestions.push(suggestion);
    }

    enforceSuggestionHierarchy(route, routeSuggestions);

    for (const suggestion of routeSuggestions) {
      summary.suggestions += 1;
      printSuggestion(resolved.logger, suggestion);

      if (!resolved.dryRun) {
        await createSuggestedPricing(prisma, suggestion, serviceType.id);
        summary.created += 1;
      }
    }
  }

  resolved.logger.log(`Golden touring route pricing completion summary: ${JSON.stringify(summary, null, 2)}`);
  return summary;
}

async function main() {
  const prisma = new PrismaClient();
  const dryRun = !process.argv.includes('--apply');
  try {
    if (process.argv.includes('--correct-vehicles')) {
      await correctGoldenTouringRoutePricingVehicles(prisma, { dryRun });
    } else {
      await seedGoldenTouringRoutePricingPhase1(prisma, { dryRun });
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Golden touring route pricing completion failed', error);
    process.exit(1);
  });
}
