import { PrismaClient } from '@prisma/client';

type PrismaLike = Record<string, any>;
type Logger = Pick<Console, 'log' | 'warn'>;

type Options = {
  dryRun?: boolean;
  logger?: Logger;
};

type FleetCategory = {
  key: string;
  name: string;
  vehicleType: string;
  maxPax: number;
  aliases: string[];
};

type ReportRow = {
  canonicalVehicle: string;
  currentMatchedRows: number;
  action: string;
  count: number;
};

type Summary = {
  dryRun: boolean;
  vehiclesChecked: number;
  canonicalRowsFound: number;
  candidates: number;
  referencedPreserved: number;
  unreferencedRemapCandidates: number;
  retireCandidates: number;
  createReplacementCandidates: number;
  noAction: number;
  canonicalVehiclesCreated: number;
  canonicalVehiclesUpdated: number;
  pricingRowsRemapped: number;
  pricingRowsRetired: number;
  pricingRowsCreated: number;
  pricingRowsAlreadyCanonical: number;
  unsafeVehicleRowsPreserved: number;
  reportRows: number;
};

const CANONICAL_FLEET: FleetCategory[] = [
  { key: 'sedan', name: 'Sedan 2', vehicleType: 'Sedan', maxPax: 2, aliases: ['sedan', 'saloon', 'car', 'camry'] },
  { key: 'mini-van', name: 'Mini Van 6', vehicleType: 'Mini Van', maxPax: 6, aliases: ['mini van', 'minivan', 'h1', 'staria'] },
  { key: 'van', name: 'Van 9', vehicleType: 'Van', maxPax: 9, aliases: ['van', 'van vip', 'van 9', 'van 12', 'sprinter', 'v class', 'h350'] },
  {
    key: 'mini-bus',
    name: 'Toyota Coaster / Mini Bus 17',
    vehicleType: 'Mini Bus',
    maxPax: 17,
    aliases: ['mini bus', 'minibus', 'coaster', 'toyota coaster', 'small 17', 'mini coach'],
  },
  {
    key: 'medium-bus',
    name: 'Medium Bus 30',
    vehicleType: 'Medium Bus',
    maxPax: 30,
    aliases: ['medium bus', 'medium coach', 'medium 30', 'large vip 29', 'large vvip 29'],
  },
  { key: 'large-coach', name: 'Large Coach 49', vehicleType: 'Large Coach', maxPax: 49, aliases: ['large bus', 'large coach', 'large 49', 'large 48', 'coach 49', 'bus 49'] },
];

const CATALOG_REFERENCE_MODELS = [
  { model: 'quoteItem', field: 'vehicleId', label: 'quoteItems' },
  { model: 'bookingService', field: 'vehicleId', label: 'bookingServices' },
  { model: 'vehicleRate', field: 'vehicleId', label: 'vehicleRates' },
  { model: 'touringRoutePricing', field: 'vehicleId', label: 'touringRoutePricings' },
  { model: 'transportPricingRule', field: 'vehicleId', label: 'transportPricingRules' },
];

const GOLDEN_TOURING_PRICING_NOTE = 'Golden Touring Route Pricing Completion Phase 1';

function emptySummary(dryRun: boolean): Summary {
  return {
    dryRun,
    vehiclesChecked: 0,
    canonicalRowsFound: 0,
    candidates: 0,
    referencedPreserved: 0,
    unreferencedRemapCandidates: 0,
    retireCandidates: 0,
    createReplacementCandidates: 0,
    noAction: 0,
    canonicalVehiclesCreated: 0,
    canonicalVehiclesUpdated: 0,
    pricingRowsRemapped: 0,
    pricingRowsRetired: 0,
    pricingRowsCreated: 0,
    pricingRowsAlreadyCanonical: 0,
    unsafeVehicleRowsPreserved: 0,
    reportRows: 0,
  };
}

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function vehicleText(vehicle: any) {
  return [vehicle?.name, vehicle?.vehicleType].filter(Boolean).join(' ');
}

function capacityTarget(vehicle: any) {
  const maxPax = Number(vehicle?.maxPax || 0);
  return CANONICAL_FLEET.find((category) => maxPax > 0 && maxPax <= category.maxPax) || null;
}

function labelTarget(vehicle: any) {
  const text = normalize(vehicleText(vehicle));
  return CANONICAL_FLEET.find((category) => category.aliases.some((alias) => text.includes(normalize(alias)))) || null;
}

function canonicalTarget(vehicle: any) {
  return capacityTarget(vehicle) || labelTarget(vehicle);
}

function isCanonicalVehicle(vehicle: any, category: FleetCategory) {
  return normalize(vehicle?.name) === normalize(category.name) && Number(vehicle?.maxPax) === category.maxPax;
}

function report(logger: Logger, rows: ReportRow[]) {
  logger.log('Canonical Vehicle | Current Matched Rows | Action | Count');
  if (rows.length === 0) {
    logger.log('No fleet taxonomy changes required.');
  }
  for (const row of rows) {
    logger.log(`${row.canonicalVehicle} | ${row.currentMatchedRows} | ${row.action} | ${row.count}`);
  }
}

function addCandidate(summary: Summary) {
  summary.candidates += 1;
}

async function count(prisma: PrismaLike, model: string, where: Record<string, unknown>) {
  return prisma[model]?.count ? Number(await prisma[model].count({ where })) : 0;
}

async function referenceSummary(prisma: PrismaLike, vehicleId: string) {
  const entries: string[] = [];
  let total = 0;
  for (const reference of CATALOG_REFERENCE_MODELS) {
    if (!prisma[reference.model]?.count) continue;
    const value = await count(prisma, reference.model, { [reference.field]: vehicleId });
    total += value;
    if (value > 0) entries.push(`${reference.label}:${value}`);
  }
  return { total, label: entries.length ? entries.join(', ') : 'none' };
}

function matchedVehicles(vehicles: any[], category: FleetCategory) {
  return vehicles.filter((vehicle: any) => canonicalTarget(vehicle)?.key === category.key);
}

function addGroupedRow(rows: ReportRow[], row: ReportRow) {
  const existing = rows.find((entry) => entry.canonicalVehicle === row.canonicalVehicle && entry.action === row.action);
  if (existing) {
    existing.count += row.count;
    existing.currentMatchedRows = Math.max(existing.currentMatchedRows, row.currentMatchedRows);
    return;
  }
  rows.push(row);
}

async function ensureCanonicalVehicles(prisma: PrismaLike, options: Required<Options>, summary: Summary, rows: ReportRow[], vehicles: any[]) {
  const canonicalByKey = new Map<string, any>();

  for (const category of CANONICAL_FLEET) {
    const matchedRows = matchedVehicles(vehicles, category).length;
    const exact = vehicles.find((vehicle: any) => isCanonicalVehicle(vehicle, category));
    if (exact) {
      canonicalByKey.set(category.key, exact);
      summary.canonicalRowsFound += 1;
      summary.noAction += 1;
      continue;
    }

    addCandidate(summary);
    summary.createReplacementCandidates += 1;
    addGroupedRow(rows, {
      canonicalVehicle: category.name,
      currentMatchedRows: matchedRows,
      action: 'Create missing canonical vehicle row',
      count: 1,
    });
    if (!options.dryRun) {
      const created = await prisma.vehicle.create({
        data: {
          supplierId: 'canonical-fleet',
          supplierName: 'Canonical Fleet',
          name: category.name,
          vehicleType: category.vehicleType,
          maxPax: category.maxPax,
          luggageCapacity: category.maxPax,
        },
      });
      canonicalByKey.set(category.key, created);
      summary.canonicalVehiclesCreated += 1;
    } else {
      canonicalByKey.set(category.key, { id: `dry-run-${category.key}`, supplierId: 'canonical-fleet', name: category.name, vehicleType: category.vehicleType, maxPax: category.maxPax });
    }
  }

  return canonicalByKey;
}

function isGoldenTouringPricing(pricing: any) {
  return String(pricing?.notes || '').includes(GOLDEN_TOURING_PRICING_NOTE);
}

async function canonicalizeGoldenTouringRoutePricings(prisma: PrismaLike, options: Required<Options>, summary: Summary, rows: ReportRow[], canonicalByKey: Map<string, any>, vehicles: any[]) {
  const pricings = await prisma.touringRoutePricing.findMany({
    where: { active: true },
    include: { vehicle: true },
  });
  for (const pricing of pricings) {
    if (!isGoldenTouringPricing(pricing)) continue;
    const target = canonicalTarget(pricing.vehicle);
    const canonicalVehicle = target ? canonicalByKey.get(target.key) : null;
    if (!target || !canonicalVehicle || pricing.vehicleId === canonicalVehicle.id) {
      if (pricing.vehicleId === canonicalVehicle?.id) {
        summary.pricingRowsAlreadyCanonical += 1;
        summary.noAction += 1;
      }
      continue;
    }
    const references =
      (await count(prisma, 'quoteItem', { touringRoutePricingId: pricing.id })) +
      (await count(prisma, 'bookingService', { touringRoutePricingId: pricing.id }));
    if (references > 0) {
      summary.referencedPreserved += 1;
      summary.noAction += 1;
      continue;
    }
    addCandidate(summary);
    summary.unreferencedRemapCandidates += 1;
    addGroupedRow(rows, {
      canonicalVehicle: target.name,
      currentMatchedRows: matchedVehicles(vehicles, target).length,
      action: 'Remap unreferenced Golden touringRoutePricing rows',
      count: 1,
    });
    if (options.dryRun) continue;
    await prisma.touringRoutePricing.update({ where: { id: pricing.id }, data: { vehicleId: canonicalVehicle.id } });
    summary.pricingRowsRemapped += 1;
  }
}

export async function canonicalizeFleetTaxonomyPhase2(prisma: PrismaLike, options: Options = {}) {
  const resolvedOptions = { dryRun: true, logger: console, ...options };
  const summary = emptySummary(resolvedOptions.dryRun);
  const rows: ReportRow[] = [];

  resolvedOptions.logger.log(`Fleet taxonomy canonicalization Phase 2 starting${resolvedOptions.dryRun ? ' in dry-run mode' : ''}. No records will be deleted. Quote items and bookings will not be updated.`);

  const vehicles = await prisma.vehicle.findMany({});
  summary.vehiclesChecked = vehicles.length;
  for (const vehicle of vehicles) vehicle.__referenceCount = (await referenceSummary(prisma, vehicle.id)).total;

  const canonicalByKey = await ensureCanonicalVehicles(prisma, resolvedOptions, summary, rows, vehicles);
  await canonicalizeGoldenTouringRoutePricings(prisma, resolvedOptions, summary, rows, canonicalByKey, vehicles);

  summary.reportRows = rows.length;
  report(resolvedOptions.logger, rows);
  resolvedOptions.logger.log(`Fleet taxonomy canonicalization Phase 2 summary: ${JSON.stringify(summary, null, 2)}`);
  return summary;
}

async function main() {
  const prisma = new PrismaClient();
  const dryRun = !process.argv.includes('--apply');
  try {
    await canonicalizeFleetTaxonomyPhase2(prisma, { dryRun });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fleet taxonomy canonicalization Phase 2 failed', error);
    process.exit(1);
  });
}
