import { PrismaClient } from '@prisma/client';

type PrismaLike = Record<string, any>;
type Logger = Pick<Console, 'log' | 'warn'>;

type Severity = 'INFO' | 'WARN' | 'HIGH';

type AuditFinding = {
  area: string;
  problem: string;
  example: string;
  severity: Severity;
  suggestedFix: string;
};

type AuditSummary = {
  placesChecked: number;
  transferRoutesChecked: number;
  touringRoutesChecked: number;
  disposalRowsChecked: number;
  vehiclesChecked: number;
  quoteTransportBoundariesChecked: number;
  findings: number;
  highSeverity: number;
  warnSeverity: number;
  infoSeverity: number;
};

const CANONICAL_FLEET = [
  { name: 'Sedan 2', maxPax: 2 },
  { name: 'Mini Van 6', maxPax: 6 },
  { name: 'Van 9', maxPax: 9 },
  { name: 'Toyota Coaster / Mini Bus 17', maxPax: 17 },
  { name: 'Medium Bus 30', maxPax: 30 },
  { name: 'Large Coach 49', maxPax: 49 },
] as const;

function emptySummary(): AuditSummary {
  return {
    placesChecked: 0,
    transferRoutesChecked: 0,
    touringRoutesChecked: 0,
    disposalRowsChecked: 0,
    vehiclesChecked: 0,
    quoteTransportBoundariesChecked: 0,
    findings: 0,
    highSeverity: 0,
    warnSeverity: 0,
    infoSeverity: 0,
  };
}

function normalize(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function compact(value: unknown) {
  return normalize(value).replace(/\s+/g, '');
}

function routeType(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function hasAny(value: unknown, patterns: RegExp[]) {
  const text = normalize(value);
  return patterns.some((pattern) => pattern.test(text));
}

function routeText(route: any) {
  return [
    route?.name,
    route?.routeType,
    route?.normalizedKey,
    route?.notes,
    route?.fromPlace?.name,
    route?.toPlace?.name,
    route?.fromPlace?.city,
    route?.toPlace?.city,
  ]
    .filter(Boolean)
    .join(' ');
}

function touringRouteText(route: any) {
  return [route?.code, route?.name, route?.startCity, route?.routeDescription, route?.region, route?.reviewNotes, ...(Array.isArray(route?.mainDestinations) ? route.mainDestinations : [])]
    .filter(Boolean)
    .join(' ');
}

function isSameAreaRoute(route: any) {
  const fromName = compact(route?.fromPlace?.name);
  const toName = compact(route?.toPlace?.name);
  const fromCity = compact(route?.fromPlace?.city || route?.fromPlace?.name);
  const toCity = compact(route?.toPlace?.city || route?.toPlace?.name);
  return Boolean((fromName && toName && fromName === toName) || (fromCity && toCity && fromCity === toCity));
}

function isDisposalLikeRoute(route: any) {
  const text = routeText(route);
  return (
    hasAny(text, [/\bdisposal\b/, /\bstationary\b/, /\bwaiting\b/, /\bday services\b/, /\bday service\b/]) ||
    (isSameAreaRoute(route) && hasAny(text, [/\bcity\b/, /\blocal\b/, /\bservice area\b/]))
  );
}

function isTouringRouteLike(value: unknown) {
  return hasAny(value, [/\btouring\b/, /\bsightseeing\b/, /\bexcursion\b/, /\bfull day\b/, /\bhalf day\b/, /\bovernight\b/, /\bpackage\b/, /\bprogram\b/]);
}

function isCanonicalVehicle(vehicle: any) {
  return CANONICAL_FLEET.some((canonical) => compact(vehicle?.name) === compact(canonical.name) && Number(vehicle?.maxPax) === canonical.maxPax);
}

function pushFinding(findings: AuditFinding[], summary: AuditSummary, finding: AuditFinding) {
  findings.push(finding);
  summary.findings += 1;
  if (finding.severity === 'HIGH') summary.highSeverity += 1;
  if (finding.severity === 'WARN') summary.warnSeverity += 1;
  if (finding.severity === 'INFO') summary.infoSeverity += 1;
}

function printFindings(logger: Logger, findings: AuditFinding[]) {
  logger.log('Area | Problem | Example | Severity | Suggested Fix');
  for (const finding of findings) {
    logger.log(`${finding.area} | ${finding.problem} | ${finding.example} | ${finding.severity} | ${finding.suggestedFix}`);
  }
  if (findings.length === 0) {
    logger.log('No ERP product catalog integrity findings.');
  }
}

export async function auditErpProductCatalogIntegrity(prisma: PrismaLike, options: { logger?: Logger } = {}) {
  const logger = options.logger || console;
  const summary = emptySummary();
  const findings: AuditFinding[] = [];

  logger.log('ERP Product Catalog Integrity Audit. Dry run only; no records will be changed.');

  const [places, routes, touringRoutes, vehicles, vehicleRates, transportPricingRules] = await Promise.all([
    prisma.place.findMany({}),
    prisma.route.findMany({ include: { fromPlace: true, toPlace: true } }),
    prisma.touringRoute.findMany({ include: { stops: true, pricings: { include: { vehicle: true, transportServiceType: true } } } }),
    prisma.vehicle.findMany({}),
    prisma.vehicleRate.findMany({ include: { route: { include: { fromPlace: true, toPlace: true } }, fromPlace: true, toPlace: true, serviceType: true, vehicle: true } }),
    prisma.transportPricingRule.findMany({ include: { route: { include: { fromPlace: true, toPlace: true } }, transportServiceType: true, vehicle: true } }),
  ]);

  summary.placesChecked = places.length;
  summary.transferRoutesChecked = routes.length;
  summary.touringRoutesChecked = touringRoutes.length;
  summary.vehiclesChecked = vehicles.length;
  summary.disposalRowsChecked = vehicleRates.filter((rate: any) => hasAny([rate?.routeName, rate?.notes, rate?.serviceType?.name, rate?.serviceType?.code].join(' '), [/\bdisposal\b/, /\bstationary\b/, /\bwaiting\b/, /\bfull day\b/])).length;
  summary.quoteTransportBoundariesChecked = 3;

  for (const place of places.filter((entry: any) => entry.isActive !== false)) {
    const text = [place.name, place.type].filter(Boolean).join(' ');
    if (hasAny(text, [/\brate\b/, /\bpricing\b/, /\bprice\b/, /\bper vehicle\b/, /\bpoint to point\b/, /\bfull day\b/, /\bstationary\b/, /\bwaiting\b/, /\bdisposal\b/, /\badd on\b/])) {
      pushFinding(findings, summary, {
        area: 'Place selectors',
        problem: 'Active place looks like a supplier service, rate, or pricing mode.',
        example: `${place.name}${place.type ? ` (${place.type})` : ''}`,
        severity: 'HIGH',
        suggestedFix: 'Keep places geographic only. Move service/rate/pricing labels to TransportServiceType or supplier rate rows.',
      });
    }
  }

  for (const route of routes.filter((entry: any) => entry.isActive !== false)) {
    const type = routeType(route.routeType);
    const text = routeText(route);
    if (type && type !== 'TRANSFER_ROUTE') {
      pushFinding(findings, summary, {
        area: 'Transfer Routes',
        problem: 'Route table contains a non-transfer active route.',
        example: `${route.name} (${route.routeType || 'missing type'})`,
        severity: 'HIGH',
        suggestedFix: 'Keep movement A-to-B rows in routes. Move touring operations to touring_routes and sellable products to excursion templates.',
      });
    }
    if (isDisposalLikeRoute(route)) {
      pushFinding(findings, summary, {
        area: 'Transfer Routes',
        problem: 'Disposal/stationary service area is mixed into transfer routes.',
        example: route.name,
        severity: 'WARN',
        suggestedFix: 'Keep disposal and stationary operations in supplier rate/service-area flows, not as selectable movement routes.',
      });
    }
    if (isTouringRouteLike(text)) {
      pushFinding(findings, summary, {
        area: 'Transfer Routes',
        problem: 'Transfer route has touring, excursion, or supplier service signals.',
        example: route.name,
        severity: 'WARN',
        suggestedFix: 'Review taxonomy. Use Touring Routes for operational tours and Excursion Templates for sellable products.',
      });
    }
    if (!route.fromPlaceId || !route.toPlaceId || route.fromPlaceId === route.toPlaceId) {
      pushFinding(findings, summary, {
        area: 'Transfer Routes',
        problem: 'Movement route is missing distinct From/To places.',
        example: route.name,
        severity: 'HIGH',
        suggestedFix: 'Transfer routes must be canonical movement A-to-B rows with distinct geographic places.',
      });
    }
  }

  for (const route of touringRoutes.filter((entry: any) => entry.active !== false)) {
    if (!String(route.code || '').startsWith('JOR-TR-')) {
      pushFinding(findings, summary, {
        area: 'Touring Routes',
        problem: 'Active touring route code does not use JOR-TR prefix.',
        example: `${route.code || '(missing code)'} ${route.name}`,
        severity: 'HIGH',
        suggestedFix: 'Rename/code operational touring inventory with JOR-TR-* codes.',
      });
    }
    if (!route.durationDays || (!route.includedKm && !route.estimatedDistanceKm) || (!Array.isArray(route.stops) || route.stops.length === 0)) {
      pushFinding(findings, summary, {
        area: 'Touring Routes',
        problem: 'Touring route is missing duration, distance, or stops metadata.',
        example: `${route.code || route.id} ${route.name}`,
        severity: 'WARN',
        suggestedFix: 'Populate durationDays, included/estimated distance, and stops where operationally known.',
      });
    }
    if (!isTouringRouteLike(touringRouteText(route))) {
      pushFinding(findings, summary, {
        area: 'Touring Routes',
        problem: 'Touring route lacks sightseeing or overnight operational signals.',
        example: `${route.code || route.id} ${route.name}`,
        severity: 'INFO',
        suggestedFix: 'Confirm this is an operational tour. Otherwise move it to transfer/disposal catalog.',
      });
    }
  }

  for (const rate of vehicleRates.filter((entry: any) => entry.active !== false)) {
    const rateText = [rate.routeName, rate.notes, rate.serviceType?.name, rate.serviceType?.code].join(' ');
    const disposalRate = hasAny(rateText, [/\bdisposal\b/, /\bstationary\b/, /\bwaiting\b/, /\bfull day\b/]);
    if (disposalRate && rate.routeId && rate.route && !isDisposalLikeRoute(rate.route)) {
      pushFinding(findings, summary, {
        area: 'Disposal / Stationary',
        problem: 'Disposal/stationary supplier rate is attached to a movement route.',
        example: `${rate.routeName} -> ${rate.route?.name || rate.routeId}`,
        severity: 'WARN',
        suggestedFix: 'Separate disposal/stationary rates from Transfer Routes so they do not pollute movement selectors.',
      });
    }
    if ((rate.fromPlace && hasAny(rate.fromPlace.name, [/\bdisposal\b/, /\bstationary\b/, /\bwaiting\b/])) || (rate.toPlace && hasAny(rate.toPlace.name, [/\bdisposal\b/, /\bstationary\b/, /\bwaiting\b/]))) {
      pushFinding(findings, summary, {
        area: 'Disposal / Stationary',
        problem: 'Disposal/stationary label appears in place references.',
        example: `${rate.fromPlace?.name || '-'} -> ${rate.toPlace?.name || '-'}`,
        severity: 'HIGH',
        suggestedFix: 'Use canonical geographic places only; keep operational mode in service type/rate metadata.',
      });
    }
  }

  for (const canonical of CANONICAL_FLEET) {
    if (!vehicles.some((vehicle: any) => compact(vehicle.name) === compact(canonical.name) && Number(vehicle.maxPax) === canonical.maxPax)) {
      pushFinding(findings, summary, {
        area: 'Vehicle selectors',
        problem: 'Missing canonical fleet row.',
        example: `${canonical.name} maxPax ${canonical.maxPax}`,
        severity: 'HIGH',
        suggestedFix: 'Create the missing canonical vehicle row before exposing vehicle selectors.',
      });
    }
  }

  for (const vehicle of vehicles) {
    if (!isCanonicalVehicle(vehicle)) {
      pushFinding(findings, summary, {
        area: 'Vehicle selectors',
        problem: 'Vehicle catalog contains a non-canonical row that can leak into selectors.',
        example: `${vehicle.name} maxPax ${vehicle.maxPax}`,
        severity: 'WARN',
        suggestedFix: 'Keep canonical active fleet rows for selectors; preserve referenced legacy rows as inactive/legacy where supported.',
      });
    }
  }

  for (const rate of [...vehicleRates, ...transportPricingRules, ...touringRoutes.flatMap((route: any) => route.pricings || [])]) {
    if (rate.vehicle && !isCanonicalVehicle(rate.vehicle)) {
      pushFinding(findings, summary, {
        area: 'Vehicle selectors',
        problem: 'Active transport pricing points at non-canonical vehicle.',
        example: `${rate.vehicle.name} maxPax ${rate.vehicle.maxPax}`,
        severity: 'HIGH',
        suggestedFix: 'Remap forward-looking unreferenced pricing to canonical fleet rows. Do not change historical quote/bookings in this audit.',
      });
    }
  }

  const routeModeProblems = [
    {
      badRows: routes.filter((route: any) => route.isActive !== false && (routeType(route.routeType) === 'TOURING_ROUTE' || isDisposalLikeRoute(route))).length,
      problem: 'Transfer mode source includes touring or disposal candidates.',
      example: 'Quote transport Transfer mode',
      severity: 'HIGH' as Severity,
      suggestedFix: 'Fetch/filter Transfer mode from active TRANSFER_ROUTE movement rows only.',
    },
    {
      badRows: touringRoutes.filter((route: any) => route.active !== false && !String(route.code || '').startsWith('JOR-TR-')).length,
      problem: 'Touring mode source includes non-JOR-TR touring rows.',
      example: 'Quote transport Touring mode',
      severity: 'WARN' as Severity,
      suggestedFix: 'Fetch/filter Touring mode from active JOR-TR-* touring_routes only.',
    },
    {
      badRows: vehicleRates.filter((rate: any) => rate.active !== false && hasAny([rate.routeName, rate.serviceType?.name, rate.serviceType?.code].join(' '), [/\bdisposal\b/, /\bstationary\b/, /\bwaiting\b/]) && rate.routeId && rate.route && !isDisposalLikeRoute(rate.route)).length,
      problem: 'Disposal mode source is attached to movement routes.',
      example: 'Quote transport Disposal mode',
      severity: 'WARN' as Severity,
      suggestedFix: 'Filter Disposal mode from stationary/disposal service-area operations only.',
    },
  ];

  for (const problem of routeModeProblems) {
    if (problem.badRows > 0) {
      pushFinding(findings, summary, {
        area: 'Quote transport drawer',
        problem: problem.problem,
        example: `${problem.example}: ${problem.badRows} suspect rows`,
        severity: problem.severity,
        suggestedFix: problem.suggestedFix,
      });
    }
  }

  printFindings(logger, findings);
  logger.log(`ERP Product Catalog Integrity Audit summary: ${JSON.stringify(summary, null, 2)}`);
  return { summary, findings };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await auditErpProductCatalogIntegrity(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('ERP Product Catalog Integrity Audit failed', error);
    process.exit(1);
  });
}
