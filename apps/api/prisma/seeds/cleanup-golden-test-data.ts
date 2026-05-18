import { PrismaClient } from '@prisma/client';

type PrismaLike = Record<string, any>;

type CleanupLogger = Pick<Console, 'log' | 'warn'>;

type CleanupOptions = {
  dryRun?: boolean;
  logger?: CleanupLogger;
};

type CleanupSummary = {
  archivedRoutes: number;
  archivedTouringRoutes: number;
  archivedActivities: number;
  archivedActivityRateVariants: number;
  archivedExcursionTemplates: number;
  archivedPackageTemplates: number;
  archivedSupplierServices: number;
  archivedTransportPricingRules: number;
  archivedTouringRoutePricings: number;
  protectedCanonical: number;
  referenced: number;
  zeroReferenceLegacy: number;
  skippedReferenced: number;
  skippedGolden: number;
};

const GOLDEN_TRANSFER_ROUTE_KEYS = [
  'QUEEN_ALIA_INTERNATIONAL_AIRPORT_AMMAN_CITY_CENTER',
  'AMMAN_CITY_CENTER_JERASH_ARCHAEOLOGICAL_SITE',
  'JERASH_ARCHAEOLOGICAL_SITE_AMMAN_CITY_CENTER',
  'AMMAN_CITY_CENTER_PETRA_VISITOR_CENTER',
  'PETRA_VISITOR_CENTER_WADI_RUM_CAMP_AREA',
  'WADI_RUM_CAMP_AREA_AQABA_CITY_CENTER',
  'AQABA_CITY_CENTER_DEAD_SEA_RESORT_AREA',
  'DEAD_SEA_RESORT_AREA_QUEEN_ALIA_INTERNATIONAL_AIRPORT',
  'KING_HUSSEIN_INTERNATIONAL_AIRPORT_AQABA_CITY_CENTER',
];

const GOLDEN_TOURING_ROUTE_CODES = [
  'JOR-TR-NORTH-JERASH-RT',
  'JOR-TR-NORTH-JERASH-AJLOUN-RT',
  'JOR-TR-NORTH-UMM-QAIS-PELLA-RT',
  'JOR-TR-CENTRAL-MADABA-NEBO-DEAD-SEA-RT',
  'JOR-TR-CENTRAL-SALT-RT',
  'JOR-TR-CENTRAL-BETHANY-DEAD-SEA-RT',
  'JOR-TR-SOUTH-AMMAN-PETRA-ON',
  'JOR-TR-SOUTH-KERAK-PETRA-ON',
  'JOR-TR-SOUTH-PETRA-WADI-RUM-ON',
  'JOR-TR-SOUTH-LITTLE-PETRA-RT',
  'JOR-TR-SOUTH-AQABA-WADI-RUM-RT',
  'JOR-TR-ISLAMIC-BLESSED-TREE-RT',
  'JOR-TR-ISLAMIC-JORDAN-VALLEY-RT',
  'JOR-TR-ISLAMIC-MUTA-PETRA-ON',
];

const GOLDEN_ACTIVITY_CODES = [
  'ACT-PETRA-GUIDED-EXPERIENCES',
  'ACT-PETRA-HIKING-EXPERIENCES',
  'PETRA_HIKING_EXPERIENCES',
  'ACT-WADI-RUM-JEEP-EXPERIENCES',
  'ACT-WADI-RUM-DESERT-EXPERIENCES',
  'ACT-JERASH-GUIDED-EXPERIENCES',
  'ACT-AJLOUN-CASTLE-EXPERIENCES',
  'ACT-BLESSED-TREE-HERITAGE-EXPERIENCES',
  'ACT-JORDAN-VALLEY-ISLAMIC-HERITAGE-EXPERIENCES',
  'ACT-CAVE-SEVEN-SLEEPERS-EXPERIENCES',
  'ACT-BETHANY-SPIRITUAL-EXPERIENCES',
  'ACT-DEAD-SEA-RELAXATION-EXPERIENCES',
];

const GOLDEN_EXCURSION_TEMPLATE_CODES = [
  'PETRA_FULL_DAY',
  'JERASH_AJLOUN_FULL_DAY',
  'MADABA_NEBO_DEAD_SEA',
  'WADI_RUM_FULL_DAY',
  'WADI_RUM_JEEP_EXPERIENCE',
  'BLESSED_TREE_ISLAMIC_HERITAGE_TOUR',
  'JORDAN_VALLEY_ISLAMIC_HERITAGE_TOUR',
  'AMMAN_CITY_DESERT_CASTLES',
  'DEAD_SEA_RELAXATION_DAY',
];

const GOLDEN_PROGRAM_TEMPLATE_CODES = ['PROGRAM-CLASSIC-JORDAN-8D7N'];

const LEGACY_TEXT_PATTERNS = [
  /\blegacy\b/i,
  /\btest\b/i,
  /\bdemo\b/i,
  /\bplaceholder\b/i,
  /\bunmatched\b/i,
  /\bimported\b/i,
  /\bduplicate\b/i,
  /\bcopy of\b/i,
  /review duplicate\/similar legacy/i,
];

const ARCHIVED_SUPPLIER_SERVICE_CATEGORY = 'Archived Legacy';

const GOLDEN_EXCURSION_TEMPLATE_NAMES = ['Wadi Rum Full Day'];

function emptySummary(): CleanupSummary {
  return {
    archivedRoutes: 0,
    archivedTouringRoutes: 0,
    archivedActivities: 0,
    archivedActivityRateVariants: 0,
    archivedExcursionTemplates: 0,
    archivedPackageTemplates: 0,
    archivedSupplierServices: 0,
    archivedTransportPricingRules: 0,
    archivedTouringRoutePricings: 0,
    protectedCanonical: 0,
    referenced: 0,
    zeroReferenceLegacy: 0,
    skippedReferenced: 0,
    skippedGolden: 0,
  };
}

function normalizeName(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function textMatchesLegacy(...values: Array<unknown>) {
  const text = values.filter((value) => value !== undefined && value !== null).map(String).join(' ');
  return LEGACY_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function isGoldenCode(code: unknown, codes: string[]) {
  return typeof code === 'string' && codes.includes(code);
}

function isGoldenTransferRoute(route: any) {
  return typeof route?.normalizedKey === 'string' && GOLDEN_TRANSFER_ROUTE_KEYS.includes(route.normalizedKey);
}

function isGoldenTouringRoute(route: any) {
  return typeof route?.code === 'string' && route.code.startsWith('JOR-TR-');
}

function isGoldenActivity(activity: any) {
  return isGoldenCode(activity?.code, GOLDEN_ACTIVITY_CODES) || /Golden Jordan canonical Activity Master/i.test(activity?.reviewNotes || '');
}

function isGoldenExcursionTemplate(template: any) {
  return (
    isGoldenCode(template?.code, GOLDEN_EXCURSION_TEMPLATE_CODES) ||
    GOLDEN_EXCURSION_TEMPLATE_NAMES.map(normalizeName).includes(normalizeName(template?.name)) ||
    /Golden Jordan canonical sellable excursion template/i.test(template?.operationalNotes || '')
  );
}

function markProtected(summary: CleanupSummary) {
  summary.protectedCanonical += 1;
  summary.skippedGolden += 1;
}

function markReferenced(summary: CleanupSummary) {
  summary.referenced += 1;
  summary.skippedReferenced += 1;
}

function markZeroReferenceLegacy(summary: CleanupSummary) {
  summary.zeroReferenceLegacy += 1;
}

async function count(prisma: PrismaLike, model: string, where: Record<string, unknown>) {
  return prisma[model]?.count ? Number(await prisma[model].count({ where })) : 0;
}

async function hasAnyReference(prisma: PrismaLike, checks: Array<[string, Record<string, unknown>]>) {
  for (const [model, where] of checks) {
    if ((await count(prisma, model, where)) > 0) return true;
  }
  return false;
}

function printCandidate(logger: CleanupLogger, label: string, record: any) {
  logger.log(`archive candidate: ${label} ${record.code || record.normalizedKey || record.id} - ${record.name || record.label || record.pricingMode || ''}`.trim());
}

async function archiveRecord(
  prisma: PrismaLike,
  options: Required<CleanupOptions>,
  model: string,
  id: string,
  data: Record<string, unknown>,
) {
  if (options.dryRun) return;
  await prisma[model].update({ where: { id }, data });
}

export async function cleanupGoldenTestData(prisma: PrismaLike, options: CleanupOptions = {}): Promise<CleanupSummary> {
  const resolvedOptions = { dryRun: false, logger: console, ...options };
  const summary = emptySummary();

  resolvedOptions.logger.log(`Golden test-data cleanup starting${resolvedOptions.dryRun ? ' in dry-run mode' : ''}. No records will be deleted.`);

  const routes = await prisma.route.findMany({ where: { isActive: true } });
  for (const route of routes) {
    if (isGoldenTransferRoute(route)) {
      markProtected(summary);
      continue;
    }
    if (!textMatchesLegacy(route.name, route.normalizedKey, route.routeType, route.notes)) continue;
    const referenced = await hasAnyReference(prisma, [
      ['quoteItem', { routeId: route.id }],
      ['vehicleRate', { routeId: route.id }],
      ['transportPricingRule', { routeId: route.id, isActive: true }],
      ['packageTemplateComponent', { routeId: route.id, active: true }],
      ['excursionTemplateComponent', { routeId: route.id, active: true }],
    ]);
    if (referenced) {
      markReferenced(summary);
      continue;
    }
    markZeroReferenceLegacy(summary);
    printCandidate(resolvedOptions.logger, 'transfer route', route);
    await archiveRecord(prisma, resolvedOptions, 'route', route.id, { isActive: false });
    summary.archivedRoutes += 1;
  }

  const touringRoutes = await prisma.touringRoute.findMany({ where: { active: true } });
  for (const route of touringRoutes) {
    if (isGoldenTouringRoute(route)) {
      markProtected(summary);
      continue;
    }
    if (!textMatchesLegacy(route.code, route.name, route.routeDescription, route.reviewNotes)) continue;
    const referenced = await hasAnyReference(prisma, [
      ['quoteItem', { touringRouteId: route.id }],
      ['bookingService', { touringRouteId: route.id }],
      ['packageTemplateComponent', { touringRouteId: route.id, active: true }],
      ['excursionTemplateComponent', { touringRouteId: route.id, active: true }],
      ['touringRoutePricing', { touringRouteId: route.id }],
    ]);
    if (referenced) {
      markReferenced(summary);
      continue;
    }
    markZeroReferenceLegacy(summary);
    printCandidate(resolvedOptions.logger, 'touring route', route);
    await archiveRecord(prisma, resolvedOptions, 'touringRoute', route.id, { active: false });
    summary.archivedTouringRoutes += 1;
  }

  const activities = await prisma.activity.findMany({ where: { active: true } });
  for (const activity of activities) {
    if (isGoldenActivity(activity)) {
      markProtected(summary);
      continue;
    }
    if (!textMatchesLegacy(activity.code, activity.name, activity.description, activity.reviewNotes, activity.operationalNotes)) continue;
    const referenced = await hasAnyReference(prisma, [
      ['quoteItem', { activityId: activity.id }],
      ['bookingService', { activityId: activity.id }],
      ['packageTemplateComponent', { activityId: activity.id, active: true }],
      ['excursionTemplateComponent', { activityId: activity.id, active: true }],
    ]);
    if (referenced) {
      markReferenced(summary);
      continue;
    }
    markZeroReferenceLegacy(summary);
    printCandidate(resolvedOptions.logger, 'activity', activity);
    await archiveRecord(prisma, resolvedOptions, 'activity', activity.id, { active: false });
    summary.archivedActivities += 1;
  }

  const activityRateVariants = await prisma.activityRateVariant.findMany({
    where: { active: true },
    include: { activity: true },
  });
  for (const variant of activityRateVariants) {
    if (isGoldenActivity(variant.activity)) {
      markProtected(summary);
      continue;
    }
    if (!textMatchesLegacy(variant.name, variant.notes, variant.operationalNotes, variant.activity?.name, variant.activity?.reviewNotes)) continue;
    const referenced = await hasAnyReference(prisma, [['quoteItem', { activityRateVariantId: variant.id }]]);
    if (referenced) {
      markReferenced(summary);
      continue;
    }
    markZeroReferenceLegacy(summary);
    printCandidate(resolvedOptions.logger, 'activity rate variant', variant);
    await archiveRecord(prisma, resolvedOptions, 'activityRateVariant', variant.id, { active: false });
    summary.archivedActivityRateVariants += 1;
  }

  const excursionTemplates = await prisma.excursionTemplate.findMany({ where: { active: true } });
  for (const template of excursionTemplates) {
    if (isGoldenExcursionTemplate(template)) {
      markProtected(summary);
      continue;
    }
    if (!textMatchesLegacy(template.code, template.name, template.description, template.operationalNotes, template.operationalWarnings)) continue;
    const referenced = await hasAnyReference(prisma, [
      ['quoteItem', { excursionTemplateId: template.id }],
      ['packageTemplateComponent', { excursionTemplateId: template.id, active: true }],
    ]);
    if (referenced) {
      markReferenced(summary);
      continue;
    }
    markZeroReferenceLegacy(summary);
    printCandidate(resolvedOptions.logger, 'excursion template', template);
    await archiveRecord(prisma, resolvedOptions, 'excursionTemplate', template.id, { active: false });
    summary.archivedExcursionTemplates += 1;
  }

  const packageTemplates = await prisma.packageTemplate.findMany({ where: { active: true } });
  for (const template of packageTemplates) {
    if (isGoldenCode(template.code, GOLDEN_PROGRAM_TEMPLATE_CODES)) {
      markProtected(summary);
      continue;
    }
    if (!textMatchesLegacy(template.code, template.name, template.summary, template.operationalNotes)) continue;
    const referenced = await hasAnyReference(prisma, [
      ['quoteItem', { packageTemplateId: template.id }],
      ['series', { packageTemplateId: template.id }],
    ]);
    if (referenced) {
      markReferenced(summary);
      continue;
    }
    markZeroReferenceLegacy(summary);
    printCandidate(resolvedOptions.logger, 'program template', template);
    await archiveRecord(prisma, resolvedOptions, 'packageTemplate', template.id, { active: false });
    summary.archivedPackageTemplates += 1;
  }

  const supplierServices = await prisma.supplierService.findMany({
    where: { category: { not: ARCHIVED_SUPPLIER_SERVICE_CATEGORY } },
  });
  for (const service of supplierServices) {
    if (!textMatchesLegacy(service.name, service.category, service.supplierId)) continue;
    const referenced = await hasAnyReference(prisma, [
      ['quoteItem', { serviceId: service.id }],
      ['quoteBlock', { defaultServiceId: service.id }],
      ['packageTemplateComponent', { supplierServiceId: service.id, active: true }],
      ['excursionTemplateComponent', { supplierServiceId: service.id, active: true }],
    ]);
    if (referenced) {
      markReferenced(summary);
      continue;
    }
    markZeroReferenceLegacy(summary);
    printCandidate(resolvedOptions.logger, 'supplier service placeholder', service);
    await archiveRecord(prisma, resolvedOptions, 'supplierService', service.id, {
      name: service.name?.startsWith('[ARCHIVED]') ? service.name : `[ARCHIVED] ${service.name}`,
      category: ARCHIVED_SUPPLIER_SERVICE_CATEGORY,
    });
    summary.archivedSupplierServices += 1;
  }

  const transportPricingRules = await prisma.transportPricingRule.findMany({ where: { isActive: true }, include: { route: true } });
  for (const rule of transportPricingRules) {
    if (isGoldenTransferRoute(rule.route)) {
      markProtected(summary);
      continue;
    }
    if (!textMatchesLegacy(rule.pricingMode, rule.route?.name, rule.route?.notes, rule.route?.normalizedKey)) continue;
    const referenced = await hasAnyReference(prisma, [
      ['route', { id: rule.routeId, isActive: true }],
      ['quoteItem', { routeId: rule.routeId }],
      ['packageTemplateComponent', { routeId: rule.routeId, active: true }],
      ['excursionTemplateComponent', { routeId: rule.routeId, active: true }],
      ['vehicleRate', { routeId: rule.routeId, vehicleId: rule.vehicleId, serviceTypeId: rule.transportServiceTypeId, active: true }],
    ]);
    if (referenced) {
      markReferenced(summary);
      continue;
    }
    markZeroReferenceLegacy(summary);
    printCandidate(resolvedOptions.logger, 'transport pricing rule', rule);
    await archiveRecord(prisma, resolvedOptions, 'transportPricingRule', rule.id, { isActive: false });
    summary.archivedTransportPricingRules += 1;
  }

  const touringRoutePricings = await prisma.touringRoutePricing.findMany({ where: { active: true }, include: { touringRoute: true } });
  for (const pricing of touringRoutePricings) {
    if (isGoldenCode(pricing.touringRoute?.code, GOLDEN_TOURING_ROUTE_CODES)) {
      markProtected(summary);
      continue;
    }
    if (!textMatchesLegacy(pricing.notes, pricing.touringRoute?.name, pricing.touringRoute?.reviewNotes)) continue;
    const referenced = await hasAnyReference(prisma, [
      ['quoteItem', { touringRoutePricingId: pricing.id }],
      ['bookingService', { touringRoutePricingId: pricing.id }],
    ]);
    if (referenced) {
      markReferenced(summary);
      continue;
    }
    markZeroReferenceLegacy(summary);
    printCandidate(resolvedOptions.logger, 'touring route pricing', pricing);
    await archiveRecord(prisma, resolvedOptions, 'touringRoutePricing', pricing.id, { active: false });
    summary.archivedTouringRoutePricings += 1;
  }

  resolvedOptions.logger.log(`Golden test-data cleanup summary: ${JSON.stringify(summary)}`);
  return summary;
}

async function main() {
  const prisma = new PrismaClient();
  const dryRun = process.argv.includes('--dry-run');
  try {
    await cleanupGoldenTestData(prisma, { dryRun });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Golden test-data cleanup failed');
    console.error(error);
    process.exit(1);
  });
}
