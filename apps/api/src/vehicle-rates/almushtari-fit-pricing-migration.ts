import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { buildRouteNormalizedKey, normalizeRouteDisplayName, normalizeRouteName } from '../routes/route-normalization';

const TARGET_SUPPLIER = 'Almushtari Logistics Services';
const ALLOWED_VEHICLES = [
  { name: 'Sedan 2', maxPax: 2 },
  { name: 'Mini Van 6', maxPax: 6 },
  { name: 'Van 9', maxPax: 9 },
] as const;
const ALLOWED_PRICING_MODES = ['Airport Transfer', 'Point-to-Point', 'Border Transfer'] as const;
const DEFAULT_VALID_FROM = '2026-01-01';
const DEFAULT_VALID_TO = '2026-12-31';

type SafeFitPricingMode = (typeof ALLOWED_PRICING_MODES)[number];
type SafeFitVehicleName = (typeof ALLOWED_VEHICLES)[number]['name'];

type WorkbookRow = Record<string, unknown>;

type SafeFitMigrationPrisma = {
  supplier: {
    findFirst(args: unknown): Promise<{ id: string; name: string } | null>;
  };
  vehicle: {
    findMany(args: unknown): Promise<Array<{ id: string; name: string; maxPax: number; supplierId?: string | null; resolvedSupplierId?: string | null }>>;
  };
  transportServiceType: {
    findMany(args: unknown): Promise<Array<{ id: string; name: string; code?: string | null; classification?: string | null }>>;
  };
  route: {
    findMany(args: unknown): Promise<Array<{
      id: string;
      name: string;
      normalizedKey?: string | null;
      routeType?: string | null;
      fromPlaceId?: string | null;
      toPlaceId?: string | null;
      fromPlace?: { name?: string | null } | null;
      toPlace?: { name?: string | null } | null;
    }>>;
  };
  vehicleRate: {
    findFirst(args: unknown): Promise<{ id: string; price: number; currency: string; active: boolean } | null>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
};

export type SafeFitMigrationOptions = {
  apply?: boolean;
  validFrom?: string;
  validTo?: string;
};

export type SafeFitMigrationPreviewRow = {
  row: number;
  route: string;
  supplier: string;
  vehicle: string;
  pricingMode: string;
  cost: number | '';
  currency: string;
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'SKIP';
  warning: string;
};

export type SafeFitMigrationSummary = {
  mode: 'dry-run' | 'apply';
  rowsRead: number;
  eligibleRows: number;
  createdRates: number;
  updatedRates: number;
  unchangedRates: number;
  skippedNonAlmushtariRows: number;
  skippedBusCoachRows: number;
  unmappedRouteNames: string[];
  unmappedVehicles: string[];
  duplicateConflictingRows: string[];
  previewRows: SafeFitMigrationPreviewRow[];
};

const COLUMN_ALIASES = {
  supplier: ['Supplier', 'Supplier Name', 'Vendor', 'Vendor Name'],
  route: ['Route', 'Route Name', 'Transfer Route', 'Route / Service Area', 'Service Area'],
  origin: ['From', 'Origin', 'Pickup', 'Pickup Location'],
  destination: ['To', 'Destination', 'Dropoff', 'Drop Off', 'Drop-off Location'],
  vehicle: ['Vehicle', 'Vehicle Type', 'Vehicle Label', 'Car Type', 'Fleet'],
  pricingMode: ['Pricing Mode', 'Service', 'Service Name', 'Transfer Type', 'Mode'],
  cost: ['Cost', 'Rate', 'Price', 'Net Rate', 'Supplier Rate'],
  currency: ['Currency', 'Curr'],
  validFrom: ['Valid From', 'Contract Valid From', 'validFrom'],
  validTo: ['Valid To', 'Contract Valid To', 'validTo'],
} as const;

function normalizeKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function readField(row: WorkbookRow, aliases: readonly string[]) {
  const sourceKey = Object.keys(row).find((key) => aliases.some((alias) => normalizeKey(alias) === normalizeKey(key)));
  return normalizeText(sourceKey ? row[sourceKey] : '');
}

function normalizeCurrency(value: string) {
  return (value || 'USD').trim().toUpperCase();
}

function parseCost(value: string) {
  const numeric = Number(String(value || '').replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(numeric) ? numeric : NaN;
}

function parseDate(value: string | undefined, fallback: string) {
  const raw = normalizeText(value);
  if (!raw) return new Date(`${fallback}T00:00:00.000Z`);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date(`${fallback}T00:00:00.000Z`) : parsed;
}

function normalizeSupplier(value: string) {
  return normalizeKey(value);
}

function normalizeVehicle(value: string): SafeFitVehicleName | null {
  const normalized = normalizeKey(value);
  const explicit = ALLOWED_VEHICLES.find((vehicle) => normalizeKey(vehicle.name) === normalized);
  if (explicit) return explicit.name;

  if (normalized === 'sedan' || normalized === 'car2' || normalized === 'sedan2pax') return 'Sedan 2';
  if (normalized === 'minivan' || normalized === 'minivan5' || normalized === 'minivan5pax' || normalized === 'minivan6pax') return 'Mini Van 6';
  if (normalized === 'van' || normalized === 'van9pax') return 'Van 9';

  return null;
}

function isBusOrCoach(value: string) {
  return /\b(bus|coach|coaster|mini\s*bus|medium\s*bus|large\s*coach)\b/i.test(value);
}

function normalizePricingMode(value: string): SafeFitPricingMode | null {
  const normalized = normalizeKey(value);
  if (['airporttransfer', 'airport', 'arrivaltransfer', 'departuretransfer'].includes(normalized)) return 'Airport Transfer';
  if (['pointtopoint', 'privatetransfer', 'transfer', 'transfers', 'oneway', 'routetransfer'].includes(normalized)) return 'Point-to-Point';
  if (['bordertransfer', 'border', 'bordercrossing'].includes(normalized)) return 'Border Transfer';
  return null;
}

function rowRouteName(row: WorkbookRow) {
  const route = readField(row, COLUMN_ALIASES.route);
  const origin = readField(row, COLUMN_ALIASES.origin);
  const destination = readField(row, COLUMN_ALIASES.destination);
  return route || [origin, destination].filter(Boolean).join(' -> ');
}

function routeKeys(routeName: string, origin: string, destination: string) {
  const keys = new Set<string>();
  if (routeName) keys.add(normalizeRouteName(routeName));
  if (origin && destination) keys.add(buildRouteNormalizedKey(origin, destination));
  return keys;
}

function matchRoute(
  routes: Awaited<ReturnType<SafeFitMigrationPrisma['route']['findMany']>>,
  routeName: string,
  origin: string,
  destination: string,
) {
  const keys = routeKeys(routeName, origin, destination);
  return routes.find((route) => {
    const from = route.fromPlace?.name || '';
    const to = route.toPlace?.name || '';
    const normalizedDisplay = normalizeRouteName(normalizeRouteDisplayName(route.name, from, to));
    const normalizedKey = route.normalizedKey ? normalizeKey(route.normalizedKey) : '';
    const normalizedPairKey = from && to ? normalizeKey(buildRouteNormalizedKey(from, to)) : '';
    return keys.has(normalizedDisplay) || keys.has(route.normalizedKey || '') || Array.from(keys).some((key) => normalizeKey(key) === normalizedKey || normalizeKey(key) === normalizedPairKey);
  }) || null;
}

export function parseSafeFitMigrationWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json<WorkbookRow>(workbook.Sheets[sheetName], { defval: '', raw: false, blankrows: false });
}

export async function previewSafeFitAlmushtariPricingMigration(
  rows: WorkbookRow[],
  prisma: SafeFitMigrationPrisma,
  options: SafeFitMigrationOptions = {},
): Promise<SafeFitMigrationSummary> {
  const apply = options.apply === true;
  const summary: SafeFitMigrationSummary = {
    mode: apply ? 'apply' : 'dry-run',
    rowsRead: rows.length,
    eligibleRows: 0,
    createdRates: 0,
    updatedRates: 0,
    unchangedRates: 0,
    skippedNonAlmushtariRows: 0,
    skippedBusCoachRows: 0,
    unmappedRouteNames: [],
    unmappedVehicles: [],
    duplicateConflictingRows: [],
    previewRows: [],
  };
  const targetSupplier = await prisma.supplier.findFirst({
    where: { name: { equals: TARGET_SUPPLIER, mode: 'insensitive' }, type: { equals: 'transport', mode: 'insensitive' } },
  });
  const vehicles = await prisma.vehicle.findMany({ where: { OR: ALLOWED_VEHICLES.map((vehicle) => ({ name: { equals: vehicle.name, mode: 'insensitive' } })) } });
  const serviceTypes = await prisma.transportServiceType.findMany({
    where: {
      classification: 'ROUTE_TRANSFER',
      OR: ALLOWED_PRICING_MODES.map((mode) => ({ name: { equals: mode, mode: 'insensitive' } })),
    },
  });
  const routes = await prisma.route.findMany({
    where: { isActive: true, routeType: 'TRANSFER_ROUTE' },
    include: { fromPlace: true, toPlace: true },
  });
  const seen = new Map<string, SafeFitMigrationPreviewRow>();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const supplier = readField(row, COLUMN_ALIASES.supplier);
    const rawVehicle = readField(row, COLUMN_ALIASES.vehicle);
    const rawPricingMode = readField(row, COLUMN_ALIASES.pricingMode);
    const origin = readField(row, COLUMN_ALIASES.origin);
    const destination = readField(row, COLUMN_ALIASES.destination);
    const routeName = rowRouteName(row);
    const cost = parseCost(readField(row, COLUMN_ALIASES.cost));
    const currency = normalizeCurrency(readField(row, COLUMN_ALIASES.currency));
    const warnings: string[] = [];
    const previewRow: SafeFitMigrationPreviewRow = {
      row: rowNumber,
      route: routeName,
      supplier,
      vehicle: rawVehicle,
      pricingMode: rawPricingMode,
      cost: Number.isFinite(cost) ? cost : '',
      currency,
      action: 'SKIP',
      warning: '',
    };

    if (normalizeSupplier(supplier) !== normalizeSupplier(TARGET_SUPPLIER)) {
      summary.skippedNonAlmushtariRows += 1;
      previewRow.warning = 'Skipped non-Almushtari supplier';
      summary.previewRows.push(previewRow);
      continue;
    }
    if (!targetSupplier) {
      previewRow.warning = 'Almushtari Logistics Services supplier not found';
      summary.previewRows.push(previewRow);
      continue;
    }

    const vehicleName = normalizeVehicle(rawVehicle);
    if (!vehicleName) {
      if (isBusOrCoach(rawVehicle)) {
        summary.skippedBusCoachRows += 1;
        previewRow.warning = 'Skipped bus/coach vehicle';
      } else {
        summary.unmappedVehicles.push(rawVehicle || `row ${rowNumber}`);
        previewRow.warning = 'Unmapped or disallowed vehicle';
      }
      summary.previewRows.push(previewRow);
      continue;
    }
    const vehicleSpec = ALLOWED_VEHICLES.find((vehicle) => vehicle.name === vehicleName)!;
    const vehicle = vehicles.find((entry) => normalizeKey(entry.name) === normalizeKey(vehicleSpec.name) && Number(entry.maxPax) === vehicleSpec.maxPax);
    if (!vehicle) {
      summary.unmappedVehicles.push(vehicleName);
      previewRow.warning = 'Allowed vehicle is not mapped in ERP catalog';
      summary.previewRows.push(previewRow);
      continue;
    }

    const pricingMode = normalizePricingMode(rawPricingMode);
    if (!pricingMode) {
      previewRow.warning = 'Pricing mode not allowed for safe FIT migration';
      summary.previewRows.push(previewRow);
      continue;
    }
    const serviceType = serviceTypes.find((entry) => normalizeKey(entry.name) === normalizeKey(pricingMode) && entry.classification === 'ROUTE_TRANSFER');
    if (!serviceType) {
      previewRow.warning = `Route-transfer pricing mode not found in ERP: ${pricingMode}`;
      summary.previewRows.push(previewRow);
      continue;
    }

    const route = matchRoute(routes, routeName, origin, destination);
    if (!route) {
      summary.unmappedRouteNames.push(routeName || `row ${rowNumber}`);
      previewRow.warning = 'Unmapped transfer route';
      summary.previewRows.push(previewRow);
      continue;
    }

    if (!Number.isFinite(cost) || cost < 0) {
      previewRow.warning = 'Cost is missing or invalid';
      summary.previewRows.push(previewRow);
      continue;
    }

    const validFrom = parseDate(readField(row, COLUMN_ALIASES.validFrom), options.validFrom || DEFAULT_VALID_FROM);
    const validTo = parseDate(readField(row, COLUMN_ALIASES.validTo), options.validTo || DEFAULT_VALID_TO);
    if (!readField(row, COLUMN_ALIASES.validFrom) || !readField(row, COLUMN_ALIASES.validTo)) {
      warnings.push(`Validity defaulted to ${options.validFrom || DEFAULT_VALID_FROM}..${options.validTo || DEFAULT_VALID_TO}`);
    }
    const dedupeKey = [route.id, targetSupplier.id, vehicle.id, serviceType.id, currency, validFrom.toISOString(), validTo.toISOString()].join('|');
    const existingInWorkbook = seen.get(dedupeKey);
    if (existingInWorkbook) {
      const message = Number(existingInWorkbook.cost) === cost ? `Duplicate row ${rowNumber}` : `Conflicting row ${rowNumber}`;
      summary.duplicateConflictingRows.push(`${message}: ${route.name} | ${vehicleName} | ${pricingMode}`);
      previewRow.warning = `${message}; first row kept`;
      summary.previewRows.push(previewRow);
      continue;
    }

    const existingRate = await prisma.vehicleRate.findFirst({
      where: {
        supplierId: targetSupplier.id,
        routeId: route.id,
        vehicleId: vehicle.id,
        serviceTypeId: serviceType.id,
        minPax: 1,
        maxPax: vehicleSpec.maxPax,
        validFrom,
        validTo,
      },
    });
    previewRow.route = route.name;
    previewRow.supplier = TARGET_SUPPLIER;
    previewRow.vehicle = vehicleName;
    previewRow.pricingMode = pricingMode;
    previewRow.warning = warnings.join(' | ');

    if (!existingRate) {
      previewRow.action = 'CREATE';
      if (apply) {
        await prisma.vehicleRate.create({
          data: {
            supplierId: targetSupplier.id,
            routeId: route.id,
            fromPlaceId: route.fromPlaceId || null,
            toPlaceId: route.toPlaceId || null,
            vehicleId: vehicle.id,
            serviceTypeId: serviceType.id,
            routeName: route.name,
            minPax: 1,
            maxPax: vehicleSpec.maxPax,
            price: cost,
            currency,
            active: true,
            validFrom,
            validTo,
            notes: 'Safe FIT pricing migration: Almushtari small-vehicle transfer rate',
          },
        });
        summary.createdRates += 1;
      }
    } else if (Number(existingRate.price) === cost && String(existingRate.currency).toUpperCase() === currency && existingRate.active) {
      previewRow.action = 'UNCHANGED';
      summary.unchangedRates += 1;
    } else {
      previewRow.action = 'UPDATE';
      if (apply) {
        await prisma.vehicleRate.update({
          where: { id: existingRate.id },
          data: {
            price: cost,
            currency,
            active: true,
            routeName: route.name,
            fromPlaceId: route.fromPlaceId || null,
            toPlaceId: route.toPlaceId || null,
            notes: 'Safe FIT pricing migration: Almushtari small-vehicle transfer rate',
          },
        });
        summary.updatedRates += 1;
      }
    }

    summary.eligibleRows += 1;
    seen.set(dedupeKey, previewRow);
    summary.previewRows.push(previewRow);
  }

  summary.unmappedRouteNames = Array.from(new Set(summary.unmappedRouteNames)).filter(Boolean);
  summary.unmappedVehicles = Array.from(new Set(summary.unmappedVehicles)).filter(Boolean);
  summary.duplicateConflictingRows = Array.from(new Set(summary.duplicateConflictingRows));
  return summary;
}

export function formatSafeFitMigrationPreview(summary: SafeFitMigrationSummary) {
  const lines = [
    `Mode: ${summary.mode}`,
    'Route | Supplier | Vehicle | Pricing Mode | Cost | Currency | Action | Warning',
    ...summary.previewRows.map((row) => [row.route, row.supplier, row.vehicle, row.pricingMode, row.cost, row.currency, row.action, row.warning].join(' | ')),
    '',
    `Skipped non-Almushtari rows: ${summary.skippedNonAlmushtariRows}`,
    `Skipped bus/coach rows: ${summary.skippedBusCoachRows}`,
    `Unmapped route names: ${summary.unmappedRouteNames.join(', ') || 'none'}`,
    `Unmapped vehicles: ${summary.unmappedVehicles.join(', ') || 'none'}`,
    `Duplicate/conflicting rows: ${summary.duplicateConflictingRows.join(', ') || 'none'}`,
    `Created rates: ${summary.createdRates}`,
    `Updated rates: ${summary.updatedRates}`,
    `Unchanged rates: ${summary.unchangedRates}`,
  ];
  return lines.join('\n');
}

function parseCliArgs(argv: string[]) {
  const workbookPath = argv.find((arg) => !arg.startsWith('--'));
  return {
    workbookPath,
    apply: argv.includes('--apply'),
    validFrom: argv.find((arg) => arg.startsWith('--valid-from='))?.split('=')[1],
    validTo: argv.find((arg) => arg.startsWith('--valid-to='))?.split('=')[1],
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.workbookPath) {
    throw new Error('Usage: ts-node src/vehicle-rates/almushtari-fit-pricing-migration.ts <legacy-fit-workbook.xlsx> [--apply] [--valid-from=YYYY-MM-DD] [--valid-to=YYYY-MM-DD]');
  }

  const workbook = XLSX.readFile(args.workbookPath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const rows = sheetName ? XLSX.utils.sheet_to_json<WorkbookRow>(workbook.Sheets[sheetName], { defval: '', raw: false, blankrows: false }) : [];
  const prisma = new PrismaClient();
  try {
    const summary = await previewSafeFitAlmushtariPricingMigration(rows, prisma as unknown as SafeFitMigrationPrisma, {
      apply: args.apply,
      validFrom: args.validFrom,
      validTo: args.validTo,
    });
    console.log(formatSafeFitMigrationPreview(summary));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
