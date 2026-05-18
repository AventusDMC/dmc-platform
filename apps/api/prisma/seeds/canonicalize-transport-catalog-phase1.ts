import { PrismaClient } from '@prisma/client';

type PrismaLike = Record<string, any>;
type Logger = Pick<Console, 'log' | 'warn'>;

type CanonicalizeOptions = {
  dryRun?: boolean;
  logger?: Logger;
};

type CanonicalizeSummary = {
  dryRun: boolean;
  routeTypeCandidates: number;
  routeTypesUpdated: number;
  pricingModeCandidates: number;
  vehicleRatesUpdated: number;
  touringRoutePricingsUpdated: number;
  skippedReferencedPricing: number;
  metadataCandidates: number;
  routeMetadataUpdated: number;
  touringRouteMetadataUpdated: number;
  auditFindings: number;
};

type AuditRow = {
  routeCode: string;
  routeName: string;
  routeType: string;
  missingWhat: string;
  severity: 'INFO' | 'WARN' | 'HIGH';
  suggestedAction: string;
};

const CANONICAL_TRANSFER_ROUTE_TYPE = 'TRANSFER_ROUTE';

const LEGACY_TRANSFER_TYPES = new Set([
  'intercitytransfer',
  'intercity',
  'privatetransfer',
  'transfer',
  'pointtopoint',
  'routetransfer',
]);

const GOLDEN_TRANSFER_ESTIMATES: Record<string, { durationMinutes: number; distanceKm: number; pickupTime?: string; stationaryNote?: string }> = {
  QUEEN_ALIA_INTERNATIONAL_AIRPORT_AMMAN_CITY_CENTER: { durationMinutes: 45, distanceKm: 35 },
  AMMAN_CITY_CENTER_JERASH_ARCHAEOLOGICAL_SITE: { durationMinutes: 60, distanceKm: 50, pickupTime: '08:00' },
  JERASH_ARCHAEOLOGICAL_SITE_AMMAN_CITY_CENTER: { durationMinutes: 60, distanceKm: 50 },
  AMMAN_CITY_CENTER_PETRA_VISITOR_CENTER: { durationMinutes: 210, distanceKm: 235, pickupTime: '07:00' },
  PETRA_VISITOR_CENTER_WADI_RUM_CAMP_AREA: {
    durationMinutes: 120,
    distanceKm: 110,
    pickupTime: '09:00',
    stationaryNote: 'Stationary / Waiting may apply for Wadi Rum overnight or free-day operations.',
  },
  WADI_RUM_CAMP_AREA_AQABA_CITY_CENTER: {
    durationMinutes: 75,
    distanceKm: 70,
    pickupTime: '09:00',
    stationaryNote: 'Stationary / Waiting may apply for Aqaba overnight or free-day operations.',
  },
  AQABA_CITY_CENTER_DEAD_SEA_RESORT_AREA: { durationMinutes: 210, distanceKm: 275, pickupTime: '08:00' },
  DEAD_SEA_RESORT_AREA_QUEEN_ALIA_INTERNATIONAL_AIRPORT: {
    durationMinutes: 55,
    distanceKm: 50,
    stationaryNote: 'Dead Sea transfers near Amman/QAIA normally should not require Stationary / Waiting fees.',
  },
  KING_HUSSEIN_INTERNATIONAL_AIRPORT_AQABA_CITY_CENTER: { durationMinutes: 20, distanceKm: 12 },
};

const GOLDEN_TOURING_ESTIMATES: Record<string, { distanceKm: number; driveHours: number; pickupTime: string; stationaryNote?: string }> = {
  'JOR-TR-NORTH-JERASH-RT': { distanceKm: 105, driveHours: 2.1, pickupTime: '08:30' },
  'JOR-TR-NORTH-JERASH-AJLOUN-RT': { distanceKm: 170, driveHours: 3.6, pickupTime: '08:00' },
  'JOR-TR-NORTH-UMM-QAIS-PELLA-RT': { distanceKm: 245, driveHours: 5.1, pickupTime: '07:30' },
  'JOR-TR-CENTRAL-MADABA-NEBO-DEAD-SEA-RT': {
    distanceKm: 150,
    driveHours: 3.2,
    pickupTime: '08:30',
    stationaryNote: 'Dead Sea day touring from Amman normally should not require Stationary / Waiting fees.',
  },
  'JOR-TR-CENTRAL-SALT-RT': { distanceKm: 65, driveHours: 1.7, pickupTime: '09:00' },
  'JOR-TR-CENTRAL-BETHANY-DEAD-SEA-RT': {
    distanceKm: 130,
    driveHours: 2.8,
    pickupTime: '08:30',
    stationaryNote: 'Dead Sea day touring from Amman normally should not require Stationary / Waiting fees.',
  },
  'JOR-TR-SOUTH-AMMAN-PETRA-ON': {
    distanceKm: 240,
    driveHours: 3.4,
    pickupTime: '07:00',
    stationaryNote: 'Stationary / Waiting may apply for Petra overnight or free-day operations.',
  },
  'JOR-TR-SOUTH-KERAK-PETRA-ON': {
    distanceKm: 285,
    driveHours: 4.8,
    pickupTime: '08:00',
    stationaryNote: 'Stationary / Waiting may apply for Petra overnight or free-day operations.',
  },
  'JOR-TR-SOUTH-PETRA-WADI-RUM-ON': {
    distanceKm: 115,
    driveHours: 2.0,
    pickupTime: '09:00',
    stationaryNote: 'Stationary / Waiting may apply for Wadi Rum overnight or free-day operations.',
  },
  'JOR-TR-SOUTH-LITTLE-PETRA-RT': {
    distanceKm: 28,
    driveHours: 0.9,
    pickupTime: '09:00',
    stationaryNote: 'Stationary / Waiting may apply when the vehicle is held locally for Petra free-day operations.',
  },
  'JOR-TR-SOUTH-AQABA-WADI-RUM-RT': {
    distanceKm: 145,
    driveHours: 2.5,
    pickupTime: '08:30',
    stationaryNote: 'Stationary / Waiting may apply for Aqaba or Wadi Rum free-day operations.',
  },
  'JOR-TR-ISLAMIC-BLESSED-TREE-RT': { distanceKm: 270, driveHours: 4.7, pickupTime: '07:30' },
  'JOR-TR-ISLAMIC-JORDAN-VALLEY-RT': { distanceKm: 210, driveHours: 4.2, pickupTime: '08:00' },
  'JOR-TR-ISLAMIC-MUTA-PETRA-ON': {
    distanceKm: 300,
    driveHours: 5.0,
    pickupTime: '07:30',
    stationaryNote: 'Stationary / Waiting may apply for Petra overnight operations.',
  },
};

function emptySummary(dryRun: boolean): CanonicalizeSummary {
  return {
    dryRun,
    routeTypeCandidates: 0,
    routeTypesUpdated: 0,
    pricingModeCandidates: 0,
    vehicleRatesUpdated: 0,
    touringRoutePricingsUpdated: 0,
    skippedReferencedPricing: 0,
    metadataCandidates: 0,
    routeMetadataUpdated: 0,
    touringRouteMetadataUpdated: 0,
    auditFindings: 0,
  };
}

function key(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isPositive(value: unknown) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function normalizePricingMode(value: unknown) {
  const normalized = key(value);
  if (['waiting', 'stationary', 'stationarywaiting', 'disposalwaiting', 'waitingdisposal'].includes(normalized)) return 'Stationary / Waiting';
  if (['fullday', 'fulldaytour', 'daytour', 'daytours', 'disposal', 'fulldaydisposal', 'dailyfd', 'dailyfullday'].includes(normalized)) return 'Daily Full Day';
  return null;
}

function normalizeRouteType(value: unknown) {
  const normalized = key(value);
  return LEGACY_TRANSFER_TYPES.has(normalized) ? CANONICAL_TRANSFER_ROUTE_TYPE : null;
}

function noteHas(notes: unknown, text: string) {
  return String(notes || '').toLowerCase().includes(text.toLowerCase());
}

function appendNote(notes: unknown, text: string) {
  const current = String(notes || '').trim();
  if (!text || noteHas(current, text)) return current || null;
  return current ? `${current}\n${text}` : text;
}

function printChange(logger: Logger, label: string, id: string, field: string, before: unknown, after: unknown) {
  logger.log(`${label} ${id} ${field}: ${JSON.stringify(before ?? null)} -> ${JSON.stringify(after ?? null)}`);
}

function hasCurrency(records: any[]) {
  return records.some((record) => typeof record.currency === 'string' && record.currency.trim().length > 0);
}

function hasSupplier(records: any[]) {
  return records.some((record) => Boolean(record.supplierId || record.supplier?.id));
}

function vehicleCoverage(records: any[]) {
  return new Set(records.map((record) => record.vehicle?.vehicleType || record.vehicleType || record.vehicleId).filter(Boolean));
}

function isStationaryRequiredForText(...values: unknown[]) {
  const text = values.map((value) => String(value || '')).join(' ').toLowerCase();
  if (/dead\s*sea/.test(text) && /amman/.test(text)) return false;
  return /\b(petra|wadi\s*rum|aqaba)\b/.test(text) && /\b(overnight|free[-\s]?day|waiting|stationary|held|hold|local)\b/.test(text);
}

function isStationaryMode(serviceType: any) {
  return normalizePricingMode(serviceType?.name) === 'Stationary / Waiting' || normalizePricingMode(serviceType?.code) === 'Stationary / Waiting';
}

function printAuditTable(logger: Logger, rows: AuditRow[]) {
  logger.log('Missing-rate audit');
  logger.log('Route Code | Route Name | Route Type | Missing What | Severity | Suggested Action');
  for (const row of rows) {
    logger.log(`${row.routeCode} | ${row.routeName} | ${row.routeType} | ${row.missingWhat} | ${row.severity} | ${row.suggestedAction}`);
  }
}

async function count(prisma: PrismaLike, model: string, where: Record<string, unknown>) {
  return prisma[model]?.count ? Number(await prisma[model].count({ where })) : 0;
}

async function ensureTransportServiceType(prisma: PrismaLike, mode: string) {
  const code = mode.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const existing = await prisma.transportServiceType.findFirst({
    where: { OR: [{ name: { equals: mode, mode: 'insensitive' } }, { code: { equals: code, mode: 'insensitive' } }] },
  });
  if (existing) return existing;
  return prisma.transportServiceType.create({
    data: {
      name: mode,
      code,
      classification: mode === 'Stationary / Waiting' ? 'ADD_ON' : 'FULL_DAY',
    },
  });
}

async function canonicalizeRouteTypes(prisma: PrismaLike, options: Required<CanonicalizeOptions>, summary: CanonicalizeSummary) {
  const routes = await prisma.route.findMany({ where: { isActive: true } });
  for (const route of routes) {
    const canonical = normalizeRouteType(route.routeType);
    if (!canonical || route.routeType === canonical) continue;
    summary.routeTypeCandidates += 1;
    printChange(options.logger, 'route', route.id, 'routeType', route.routeType, canonical);
    if (!options.dryRun) {
      await prisma.route.update({ where: { id: route.id }, data: { routeType: canonical } });
      summary.routeTypesUpdated += 1;
    }
  }
}

async function canonicalizeVehicleRateModes(prisma: PrismaLike, options: Required<CanonicalizeOptions>, summary: CanonicalizeSummary) {
  const rates = await prisma.vehicleRate.findMany({
    where: { active: true, route: { isActive: true } },
    include: { serviceType: true, route: true },
  });
  for (const rate of rates) {
    const canonical = normalizePricingMode(rate.serviceType?.name) || normalizePricingMode(rate.serviceType?.code);
    if (!canonical || rate.serviceType?.name === canonical) continue;
    summary.pricingModeCandidates += 1;
    const referenced = (await count(prisma, 'quoteItem', { appliedVehicleRateId: rate.id })) > 0;
    if (referenced) {
      summary.skippedReferencedPricing += 1;
      options.logger.warn(`skip vehicleRate ${rate.id}: referenced by quote items`);
      continue;
    }
    printChange(options.logger, 'vehicleRate', rate.id, 'serviceType', rate.serviceType?.name, canonical);
    if (!options.dryRun) {
      const serviceType = await ensureTransportServiceType(prisma, canonical);
      await prisma.vehicleRate.update({ where: { id: rate.id }, data: { serviceTypeId: serviceType.id } });
      summary.vehicleRatesUpdated += 1;
    }
  }
}

async function canonicalizeTouringPricingModes(prisma: PrismaLike, options: Required<CanonicalizeOptions>, summary: CanonicalizeSummary) {
  const pricings = await prisma.touringRoutePricing.findMany({
    where: { active: true, touringRoute: { active: true } },
    include: { transportServiceType: true, touringRoute: true },
  });
  for (const pricing of pricings) {
    const canonical = normalizePricingMode(pricing.transportServiceType?.name) || normalizePricingMode(pricing.transportServiceType?.code);
    if (!canonical || pricing.transportServiceType?.name === canonical) continue;
    summary.pricingModeCandidates += 1;
    const referenced =
      (await count(prisma, 'quoteItem', { touringRoutePricingId: pricing.id })) > 0 ||
      (await count(prisma, 'bookingService', { touringRoutePricingId: pricing.id })) > 0;
    if (referenced) {
      summary.skippedReferencedPricing += 1;
      options.logger.warn(`skip touringRoutePricing ${pricing.id}: referenced by quote/booking records`);
      continue;
    }
    printChange(options.logger, 'touringRoutePricing', pricing.id, 'transportServiceType', pricing.transportServiceType?.name, canonical);
    if (!options.dryRun) {
      const serviceType = await ensureTransportServiceType(prisma, canonical);
      await prisma.touringRoutePricing.update({ where: { id: pricing.id }, data: { transportServiceTypeId: serviceType.id } });
      summary.touringRoutePricingsUpdated += 1;
    }
  }
}

function buildRouteMetadataUpdate(route: any) {
  const estimate = GOLDEN_TRANSFER_ESTIMATES[route.normalizedKey];
  if (!estimate) return null;
  const data: Record<string, unknown> = {};
  if (!isPositive(route.durationMinutes)) data.durationMinutes = estimate.durationMinutes;
  if (!isPositive(route.distanceKm)) data.distanceKm = estimate.distanceKm;
  let notes = route.notes;
  if (estimate.pickupTime) notes = appendNote(notes, `Pickup recommendation: ${estimate.pickupTime}.`);
  if (estimate.stationaryNote) notes = appendNote(notes, estimate.stationaryNote);
  if (notes !== route.notes) data.notes = notes;
  return Object.keys(data).length ? data : null;
}

function buildTouringMetadataUpdate(route: any) {
  const estimate = GOLDEN_TOURING_ESTIMATES[route.code];
  if (!estimate) return null;
  const data: Record<string, unknown> = {};
  if (!isPositive(route.estimatedDriveHours)) data.estimatedDriveHours = estimate.driveHours;
  if (!isPositive(route.estimatedDistanceKm)) data.estimatedDistanceKm = estimate.distanceKm;
  if (!isPositive(route.includedHours)) data.includedHours = estimate.driveHours;
  if (!isPositive(route.includedKm)) data.includedKm = estimate.distanceKm;
  let reviewNotes = route.reviewNotes;
  reviewNotes = appendNote(reviewNotes, `Pickup recommendation: ${estimate.pickupTime}.`);
  if (estimate.stationaryNote) reviewNotes = appendNote(reviewNotes, estimate.stationaryNote);
  if (reviewNotes !== route.reviewNotes) data.reviewNotes = reviewNotes;
  return Object.keys(data).length ? data : null;
}

async function fillGoldenOperationalMetadata(prisma: PrismaLike, options: Required<CanonicalizeOptions>, summary: CanonicalizeSummary) {
  const routes = await prisma.route.findMany({ where: { isActive: true } });
  for (const route of routes) {
    const data = buildRouteMetadataUpdate(route);
    if (!data) continue;
    summary.metadataCandidates += 1;
    for (const [field, after] of Object.entries(data)) printChange(options.logger, 'route', route.id, field, route[field], after);
    if (!options.dryRun) {
      await prisma.route.update({ where: { id: route.id }, data });
      summary.routeMetadataUpdated += 1;
    }
  }

  const touringRoutes = await prisma.touringRoute.findMany({ where: { active: true, code: { startsWith: 'JOR-TR-' } } });
  for (const route of touringRoutes) {
    const data = buildTouringMetadataUpdate(route);
    if (!data) continue;
    summary.metadataCandidates += 1;
    for (const [field, after] of Object.entries(data)) printChange(options.logger, 'touringRoute', route.id, field, route[field], after);
    if (!options.dryRun) {
      await prisma.touringRoute.update({ where: { id: route.id }, data });
      summary.touringRouteMetadataUpdated += 1;
    }
  }
}

async function auditMissingRates(prisma: PrismaLike, options: Required<CanonicalizeOptions>, summary: CanonicalizeSummary) {
  const rows: AuditRow[] = [];
  const push = (row: AuditRow) => rows.push(row);

  const routes = await prisma.route.findMany({ where: { isActive: true } });
  const goldenRoutes = routes.filter((route: any) => Boolean(GOLDEN_TRANSFER_ESTIMATES[route.normalizedKey]));
  for (const route of goldenRoutes) {
    const rates = await prisma.vehicleRate.findMany({ where: { active: true, routeId: route.id }, include: { serviceType: true, vehicle: true, supplier: true } });
    const pricingRules = await prisma.transportPricingRule.findMany({ where: { isActive: true, routeId: route.id }, include: { transportServiceType: true, vehicle: true, supplier: true } });
    const code = route.normalizedKey || route.id;
    const routeType = route.routeType || 'TRANSFER_ROUTE';
    if (rates.length === 0) {
      push({ routeCode: code, routeName: route.name, routeType, missingWhat: 'no vehicle rates', severity: 'HIGH', suggestedAction: 'Create active supplier vehicle rates for this Golden transfer route.' });
    }
    if (pricingRules.length === 0) {
      push({ routeCode: code, routeName: route.name, routeType, missingWhat: 'no pricing rules', severity: 'WARN', suggestedAction: 'Create or backfill active transport pricing rules after confirming supplier rates.' });
    }
    if (!hasSupplier(rates) && !hasSupplier(pricingRules)) {
      push({ routeCode: code, routeName: route.name, routeType, missingWhat: 'missing supplier rate card', severity: 'WARN', suggestedAction: 'Attach supplier-backed rate card rows before operator quoting.' });
    }
    if (!hasCurrency(rates) && !hasCurrency(pricingRules)) {
      push({ routeCode: code, routeName: route.name, routeType, missingWhat: 'missing currency', severity: 'HIGH', suggestedAction: 'Set currency on active rate/rule rows.' });
    }
    if (vehicleCoverage([...rates, ...pricingRules]).size === 0) {
      push({ routeCode: code, routeName: route.name, routeType, missingWhat: 'missing vehicle type coverage', severity: 'WARN', suggestedAction: 'Add coverage for operational vehicle types used by this route.' });
    }
    if (
      isStationaryRequiredForText(route.name, route.notes, route.normalizedKey) &&
      !rates.some((rate: any) => isStationaryMode(rate.serviceType)) &&
      !pricingRules.some((rule: any) => isStationaryMode(rule.transportServiceType))
    ) {
      push({ routeCode: code, routeName: route.name, routeType, missingWhat: 'missing Stationary / Waiting rate', severity: 'HIGH', suggestedAction: 'Add Stationary / Waiting supplier rate where overnight/free-day operation requires held vehicle time.' });
    }
  }

  const touringRoutes = await prisma.touringRoute.findMany({ where: { active: true, code: { startsWith: 'JOR-TR-' } } });
  for (const route of touringRoutes) {
    const pricings = await prisma.touringRoutePricing.findMany({ where: { active: true, touringRouteId: route.id }, include: { transportServiceType: true, vehicle: true, supplier: true } });
    if (pricings.length === 0) {
      push({ routeCode: route.code, routeName: route.name, routeType: 'TOURING_ROUTE', missingWhat: 'no vehicle rates', severity: 'HIGH', suggestedAction: 'Create active touring route pricing rows for this Golden route.' });
      push({ routeCode: route.code, routeName: route.name, routeType: 'TOURING_ROUTE', missingWhat: 'no pricing rules', severity: 'WARN', suggestedAction: 'Confirm touring pricing basis and supplier cost rows.' });
    }
    if (!hasSupplier(pricings)) {
      push({ routeCode: route.code, routeName: route.name, routeType: 'TOURING_ROUTE', missingWhat: 'missing supplier rate card', severity: 'WARN', suggestedAction: 'Attach supplier-backed touring route pricing.' });
    }
    if (!hasCurrency(pricings)) {
      push({ routeCode: route.code, routeName: route.name, routeType: 'TOURING_ROUTE', missingWhat: 'missing currency', severity: 'HIGH', suggestedAction: 'Set currency on active touring pricing rows.' });
    }
    if (vehicleCoverage(pricings).size === 0) {
      push({ routeCode: route.code, routeName: route.name, routeType: 'TOURING_ROUTE', missingWhat: 'missing vehicle type coverage', severity: 'WARN', suggestedAction: 'Add vehicle coverage for sedan/van/minibus/coach as operationally required.' });
    }
    if (
      isStationaryRequiredForText(route.code, route.name, route.reviewNotes) &&
      !pricings.some((pricing: any) => isStationaryMode(pricing.transportServiceType))
    ) {
      push({ routeCode: route.code, routeName: route.name, routeType: 'TOURING_ROUTE', missingWhat: 'missing Stationary / Waiting rate', severity: 'HIGH', suggestedAction: 'Add Stationary / Waiting rate for Petra, Aqaba, or Wadi Rum overnight/free-day operations.' });
    }
  }

  summary.auditFindings = rows.length;
  printAuditTable(options.logger, rows);
}

export async function canonicalizeTransportCatalogPhase1(prisma: PrismaLike, options: CanonicalizeOptions = {}) {
  const resolvedOptions = { dryRun: true, logger: console, ...options };
  const summary = emptySummary(resolvedOptions.dryRun);
  resolvedOptions.logger.log(`Transport catalog canonicalization Phase 1 starting${resolvedOptions.dryRun ? ' in dry-run mode' : ''}. No records will be deleted.`);

  await canonicalizeRouteTypes(prisma, resolvedOptions, summary);
  await canonicalizeVehicleRateModes(prisma, resolvedOptions, summary);
  await canonicalizeTouringPricingModes(prisma, resolvedOptions, summary);
  await fillGoldenOperationalMetadata(prisma, resolvedOptions, summary);
  await auditMissingRates(prisma, resolvedOptions, summary);

  resolvedOptions.logger.log(`Transport catalog canonicalization Phase 1 summary: ${JSON.stringify(summary, null, 2)}`);
  return summary;
}

async function main() {
  const prisma = new PrismaClient();
  const dryRun = !process.argv.includes('--apply');
  try {
    await canonicalizeTransportCatalogPhase1(prisma, { dryRun });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Transport catalog canonicalization failed', error);
    process.exit(1);
  });
}
