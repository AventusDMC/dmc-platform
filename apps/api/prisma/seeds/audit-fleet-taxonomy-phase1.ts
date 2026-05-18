import { PrismaClient } from '@prisma/client';

type PrismaLike = Record<string, any>;
type Logger = Pick<Console, 'log' | 'warn'>;

type Options = {
  logger?: Logger;
};

type Summary = {
  vehiclesChecked: number;
  findings: number;
  missingCanonicalRows: number;
  duplicateOperationalCapacities: number;
  invalidCapacityRanges: number;
  incorrectVehicleLabels: number;
  overlappingCanonicalCategories: number;
};

type FleetCategory = {
  label: string;
  display: string;
  minPax: number;
  maxPax: number;
  aliases: string[];
  preferredName: string;
};

type AuditRow = {
  vehicle: string;
  currentCapacity: string;
  suggestedCanonicalCategory: string;
  action: string;
};

const CANONICAL_FLEET: FleetCategory[] = [
  { label: 'Sedan', display: 'Sedan', minPax: 1, maxPax: 2, aliases: ['sedan', 'saloon', 'car', 'camry'], preferredName: 'Sedan 2' },
  { label: 'Mini Van', display: 'Mini Van', minPax: 3, maxPax: 6, aliases: ['mini van', 'minivan', 'h1', 'staria'], preferredName: 'Mini Van 6' },
  { label: 'Van', display: 'Van', minPax: 7, maxPax: 9, aliases: ['van', 'van vip', 'van 9', 'van 12', 'sprinter', 'v class', 'h350'], preferredName: 'Van 9' },
  { label: 'Mini Bus / Coaster', display: 'Toyota Coaster / Mini Bus', minPax: 10, maxPax: 17, aliases: ['mini bus', 'minibus', 'coaster', 'toyota coaster', 'small 17', 'mini coach'], preferredName: 'Toyota Coaster / Mini Bus 17' },
  { label: 'Medium Bus', display: 'Medium Bus', minPax: 18, maxPax: 30, aliases: ['medium bus', 'medium coach', 'medium 30', 'large vip 29', 'large vvip 29'], preferredName: 'Medium Bus 30' },
  { label: 'Large Bus', display: 'Large Coach / Large Bus', minPax: 31, maxPax: 49, aliases: ['large bus', 'large coach', 'large 49', 'large 48', 'coach 49', 'bus 49'], preferredName: 'Large Coach 49' },
];

function emptySummary(): Summary {
  return {
    vehiclesChecked: 0,
    findings: 0,
    missingCanonicalRows: 0,
    duplicateOperationalCapacities: 0,
    invalidCapacityRanges: 0,
    incorrectVehicleLabels: 0,
    overlappingCanonicalCategories: 0,
  };
}

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function vehicleText(vehicle: any) {
  return [vehicle.name, vehicle.vehicleType].filter(Boolean).join(' ');
}

function labelCategory(vehicle: any) {
  const compact = normalize(vehicleText(vehicle));
  return CANONICAL_FLEET.find((category) => category.aliases.some((alias) => compact.includes(normalize(alias)))) || null;
}

function capacityCategory(vehicle: any) {
  const maxPax = Number(vehicle.maxPax || 0);
  return CANONICAL_FLEET.find((category) => maxPax >= category.minPax && maxPax <= category.maxPax) || null;
}

function currentCapacity(vehicle: any) {
  const maxPax = Number(vehicle.maxPax || 0);
  return maxPax > 0 ? `1-${maxPax}` : 'missing';
}

function printRows(logger: Logger, rows: AuditRow[]) {
  logger.log('Vehicle | Current Capacity | Suggested Canonical Category | Action');
  for (const row of rows) {
    logger.log(`${row.vehicle} | ${row.currentCapacity} | ${row.suggestedCanonicalCategory} | ${row.action}`);
  }
}

function pushFinding(rows: AuditRow[], summary: Summary, row: AuditRow, counter: keyof Omit<Summary, 'vehiclesChecked' | 'findings'>) {
  rows.push(row);
  summary.findings += 1;
  summary[counter] += 1;
}

export async function auditFleetTaxonomyPhase1(prisma: PrismaLike, options: Options = {}) {
  const logger = options.logger || console;
  const summary = emptySummary();
  const rows: AuditRow[] = [];
  logger.log('Fleet taxonomy canonicalization Phase 1 dry-run audit. No records will be changed or deleted.');

  const vehicles = await prisma.vehicle.findMany({});
  summary.vehiclesChecked = vehicles.length;

  for (const vehicle of vehicles) {
    const byCapacity = capacityCategory(vehicle);
    const byLabel = labelCategory(vehicle);
    const vehicleName = vehicle.name || vehicle.id;
    const capacity = currentCapacity(vehicle);

    if (!byCapacity) {
      pushFinding(rows, summary, {
        vehicle: vehicleName,
        currentCapacity: capacity,
        suggestedCanonicalCategory: 'Manual review',
        action: 'Invalid capacity range. Retire/archive incorrect catalog row after references are reviewed; create a canonical fleet row if operationally needed.',
      }, 'invalidCapacityRanges');
      continue;
    }

    if (!byLabel) {
      pushFinding(rows, summary, {
        vehicle: vehicleName,
        currentCapacity: capacity,
        suggestedCanonicalCategory: byCapacity.display,
        action: `Incorrect or missing vehicle label. Rename/remap to ${byCapacity.preferredName}; preserve historical references.`,
      }, 'incorrectVehicleLabels');
      continue;
    }

    if (byLabel.label !== byCapacity.label) {
      pushFinding(rows, summary, {
        vehicle: vehicleName,
        currentCapacity: capacity,
        suggestedCanonicalCategory: byCapacity.display,
        action: `Overlapping canonical categories: label suggests ${byLabel.display}, capacity suggests ${byCapacity.display}. Retire/archive this row and create/use ${byCapacity.preferredName}.`,
      }, 'overlappingCanonicalCategories');
    }
  }

  for (const category of CANONICAL_FLEET) {
    const matches = vehicles.filter((vehicle: any) => capacityCategory(vehicle)?.label === category.label && labelCategory(vehicle)?.label === category.label);
    if (matches.length === 0) {
      pushFinding(rows, summary, {
        vehicle: category.preferredName,
        currentCapacity: `${category.minPax}-${category.maxPax}`,
        suggestedCanonicalCategory: category.display,
        action: `Missing canonical operational fleet row. Create ${category.preferredName}; do not reuse legacy rows.`,
      }, 'missingCanonicalRows');
    }
    if (matches.length > 1) {
      pushFinding(rows, summary, {
        vehicle: matches.map((vehicle: any) => vehicle.name || vehicle.id).join(', '),
        currentCapacity: `${category.minPax}-${category.maxPax}`,
        suggestedCanonicalCategory: category.display,
        action: 'Duplicate operational capacity. Keep one canonical active catalog row and retire/archive duplicates after reference review.',
      }, 'duplicateOperationalCapacities');
    }
  }

  printRows(logger, rows);
  logger.log(`Fleet taxonomy canonicalization summary: ${JSON.stringify(summary, null, 2)}`);
  return summary;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await auditFleetTaxonomyPhase1(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fleet taxonomy canonicalization audit failed', error);
    process.exit(1);
  });
}
