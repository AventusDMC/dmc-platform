import { buildRouteNormalizedKey } from './route-normalization';

const ROUTE_TYPE_TRANSFER = 'TRANSFER_ROUTE';
const ROUTE_NOTE_PREFIX = 'Jordan operational transfer route library';

export type Logger = Pick<Console, 'log' | 'warn' | 'error'>;

export type JordanTransferPlace = {
  id: string;
  name: string;
  type?: string | null;
  city?: string | null;
  country?: string | null;
  isActive?: boolean | null;
};

export type JordanTransferRoute = {
  id: string;
  normalizedKey: string;
  fromPlaceId: string;
  toPlaceId: string;
  name: string;
  routeType?: string | null;
  durationMinutes?: number | null;
  distanceKm?: number | null;
  notes?: string | null;
  isActive?: boolean | null;
};

export type PrismaLike = {
  place: {
    findMany(args?: unknown): Promise<JordanTransferPlace[]>;
  };
  route: {
    findMany(args?: unknown): Promise<JordanTransferRoute[]>;
    create(args: { data: RouteWriteData }): Promise<JordanTransferRoute>;
    update(args: { where: { id: string }; data: RouteWriteData }): Promise<JordanTransferRoute>;
  };
};

export type RouteWriteData = {
  fromPlaceId: string;
  toPlaceId: string;
  name: string;
  normalizedKey: string;
  routeType: typeof ROUTE_TYPE_TRANSFER;
  durationMinutes: number;
  distanceKm: number;
  notes: string;
  isActive: boolean;
};

type PlaceDefinition = {
  key: string;
  label: string;
  code: string;
  aliases: string[];
};

type PairDefinition = {
  from: string;
  to: string;
  distanceKm: number;
  durationMinutes: number;
  notes: string;
};

export type SeedOptions = {
  dryRun?: boolean;
  logger?: Logger;
};

export type PlannedRoute = {
  code: string;
  from: string;
  to: string;
  distanceKm: number;
  durationMinutes: number;
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'SKIP_MISSING_PLACE';
  normalizedKey?: string;
};

export type SeedResult = {
  dryRun: boolean;
  planned: PlannedRoute[];
  missingPlaces: string[];
  duplicateCollisions: string[];
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
};

export const JORDAN_TRANSFER_PLACES: PlaceDefinition[] = [
  place('qaia-airport', 'QAIA Airport', 'QAIA', ['Queen Alia International Airport', 'Queen Alia Airport', 'QAIA']),
  place('amman', 'Amman', 'AMM', ['Amman City Center', 'Amman City Centre', 'Amman']),
  place('dead-sea', 'Dead Sea', 'DDS', ['Dead Sea Resort Area', 'Dead Sea Hotel Area', 'Dead Sea']),
  place('madaba', 'Madaba', 'MAD', ['Madaba']),
  place('mount-nebo', 'Mount Nebo', 'NEB', ['Mount Nebo', 'Mt Nebo']),
  place('petra', 'Petra', 'PET', ['Petra Visitor Center', 'Petra']),
  place('wadi-rum', 'Wadi Rum', 'WRM', ['Wadi Rum Camp Area', 'Wadi Rum Village', 'Wadi Rum']),
  place('aqaba', 'Aqaba', 'AQB', ['Aqaba City Center', 'Aqaba City Centre', 'Aqaba']),
  place('aqj-airport', 'AQJ Airport', 'AQJ', ['King Hussein International Airport', 'Aqaba Airport', 'AQJ Airport', 'AQJ']),
  place('aqaba-port', 'Aqaba Port', 'AQP', ['Aqaba Port', 'Port of Aqaba']),
  place('allenby-border', 'Allenby Border', 'ALN', ['Allenby Border', 'Allenby Bridge', 'King Hussein Bridge']),
  place('sheikh-hussein-border', 'Sheikh Hussein Border', 'SHB', ['Sheikh Hussein Border', 'Sheikh Hussein Bridge', 'Jordan River Crossing']),
  place('south-border', 'South Border / Wadi Araba Border', 'SWB', ['South Border', 'Wadi Araba Border', 'Arava Border', 'Yitzhak Rabin Crossing']),
  place('jerash', 'Jerash', 'JER', ['Jerash Archaeological Site', 'Jerash']),
  place('ajloun', 'Ajloun', 'AJL', ['Ajloun Castle', 'Ajloun']),
  place('umm-qais', 'Umm Qais', 'UMQ', ['Umm Qais', 'Umm Qays', 'Gadara']),
  place('pella', 'Pella', 'PEL', ['Pella']),
  place('dana', 'Dana', 'DAN', ['Dana Biosphere Reserve', 'Dana Village', 'Dana']),
  place('kerak', 'Kerak', 'KER', ['Kerak Castle', 'Karak Castle', 'Kerak', 'Karak']),
  place('shobak', 'Shobak', 'SHO', ['Shobak Castle', 'Shobak', 'Shawbak']),
  place('bethany', 'Bethany', 'BET', ['Bethany Beyond the Jordan', 'Bethany', 'Al-Maghtas']),
  place('mukawir', 'Mukawir', 'MUK', ['Mukawir', 'Machaerus']),
];

const BASE_TRANSFER_PAIRS: PairDefinition[] = [
  pair('qaia-airport', 'amman', 35, 45, 'Airport arrival/departure transfer; flight timing controls pickup buffer.'),
  pair('qaia-airport', 'dead-sea', 55, 55, 'Airport to resort-zone transfer; confirm luggage and resort access.'),
  pair('qaia-airport', 'petra', 220, 210, 'Long-distance airport transfer; preserve arrival/departure buffer.'),
  pair('amman', 'dead-sea', 55, 60, 'City to resort-zone transfer; traffic can affect Amman corridor.'),
  pair('amman', 'petra', 235, 210, 'Intercity southbound transfer via Desert Highway unless otherwise specified.'),
  pair('amman', 'wadi-rum', 320, 240, 'Long southbound desert transfer; camp handoff must be confirmed.'),
  pair('amman', 'aqaba', 330, 250, 'Long southbound transfer via Desert Highway.'),
  pair('petra', 'wadi-rum', 110, 120, 'South Jordan inter-site transfer; confirm Wadi Rum camp pickup point.'),
  pair('petra', 'aqaba', 125, 120, 'South Jordan continuation to Aqaba hotels/port area.'),
  pair('wadi-rum', 'aqaba', 70, 75, 'Short south Jordan transfer; confirm camp meeting point.'),
  pair('wadi-rum', 'dead-sea', 275, 240, 'Long northbound transfer; allow operational rest and comfort stops.'),
  pair('dead-sea', 'petra', 205, 210, 'Dead Sea to Petra transfer; Kings Highway variant must be specified separately.'),
  pair('dead-sea', 'wadi-rum', 275, 240, 'Long southbound transfer; confirm camp handoff.'),
  pair('dead-sea', 'aqaba', 275, 210, 'Long Dead Sea to Aqaba transfer; check road conditions seasonally.'),
  pair('aqaba', 'aqj-airport', 12, 20, 'Local airport transfer; flight timing controls pickup buffer.'),
  pair('aqaba', 'aqaba-port', 8, 15, 'Local port transfer; cruise/ferry timings control pickup buffer.'),
  pair('aqaba', 'south-border', 12, 20, 'Local border transfer; border processing time is external.'),
  pair('amman', 'allenby-border', 55, 70, 'Border transfer; crossing processing time is external.'),
  pair('amman', 'sheikh-hussein-border', 95, 105, 'Northern border transfer; crossing processing time is external.'),
  pair('amman', 'jerash', 50, 60, 'North Jordan point-to-point transfer.'),
  pair('amman', 'ajloun', 75, 90, 'North Jordan point-to-point transfer; mountain roads may affect coach timing.'),
  pair('amman', 'umm-qais', 120, 135, 'Far north transfer; preserve daylight and traffic buffer.'),
  pair('amman', 'pella', 95, 105, 'Jordan Valley transfer; heat and road timing can affect operations.'),
  pair('amman', 'dana', 190, 180, 'Central-to-south transfer; confirm Dana village access.'),
  pair('amman', 'kerak', 125, 135, 'Central Jordan transfer; mountain-road routing can alter timing.'),
  pair('amman', 'shobak', 210, 200, 'Southbound transfer; preserve operational comfort stops.'),
  pair('petra', 'dana', 60, 70, 'Local south Jordan transfer; confirm reserve/village access.'),
  pair('petra', 'kerak', 135, 150, 'Kings Highway transfer; mountain-road timing varies.'),
  pair('petra', 'shobak', 35, 40, 'Local Petra/Shobak transfer.'),
  pair('dead-sea', 'bethany', 12, 20, 'Short Jordan Valley transfer; site shuttle/access timing is external.'),
  pair('amman', 'bethany', 55, 65, 'City to Jordan Valley transfer; site access timing is external.'),
  pair('amman', 'mukawir', 85, 105, 'Central Jordan religious-site transfer; road and walking conditions should be confirmed.'),
];

export const JORDAN_TRANSFER_ROUTES = expandBidirectionalPairs(BASE_TRANSFER_PAIRS);
export const JORDAN_TRANSFER_ROUTE_CODES = JORDAN_TRANSFER_ROUTES.map((route) => {
  const from = requirePlaceDefinition(route.from);
  const to = requirePlaceDefinition(route.to);
  return routeCode(from, to);
});

function place(key: string, label: string, code: string, aliases: string[]): PlaceDefinition {
  return { key, label, code, aliases };
}

function pair(from: string, to: string, distanceKm: number, durationMinutes: number, notes: string): PairDefinition {
  return { from, to, distanceKm, durationMinutes, notes };
}

function expandBidirectionalPairs(pairs: PairDefinition[]) {
  const seen = new Set<string>();
  const expanded: PairDefinition[] = [];
  for (const route of pairs) {
    for (const candidate of [route, { ...route, from: route.to, to: route.from }]) {
      const key = `${candidate.from}->${candidate.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      expanded.push(candidate);
    }
  }
  return expanded;
}

function normalize(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function resolvePlaces(places: JordanTransferPlace[]) {
  const activeJordanPlaces = places.filter((candidate) => candidate.isActive !== false && normalize(candidate.country || 'Jordan') === 'jordan');
  const byAlias = new Map<string, JordanTransferPlace>();

  for (const definition of JORDAN_TRANSFER_PLACES) {
    const aliases = [definition.label, ...definition.aliases].map(normalize);
    const matches = activeJordanPlaces.filter((candidate) => aliases.includes(normalize(candidate.name)));
    if (matches.length === 0) continue;

    const canonical =
      matches.find((candidate) => normalize(candidate.name) === normalize(definition.aliases[0])) ||
      matches.find((candidate) => normalize(candidate.name) === normalize(definition.label)) ||
      matches[0];

    byAlias.set(definition.key, canonical);
  }

  return byAlias;
}

function routeCode(from: PlaceDefinition, to: PlaceDefinition) {
  return `JOR-TRF-${from.code}-${to.code}`;
}

function operationalNotes(code: string, route: PairDefinition) {
  return `${ROUTE_NOTE_PREFIX}. Route code: ${code}. ${route.notes}`;
}

function routeName(from: PlaceDefinition, to: PlaceDefinition) {
  return `${from.label} -> ${to.label}`;
}

function buildRouteData(route: PairDefinition, fromPlace: JordanTransferPlace, toPlace: JordanTransferPlace): RouteWriteData {
  const from = requirePlaceDefinition(route.from);
  const to = requirePlaceDefinition(route.to);
  const code = routeCode(from, to);
  return {
    fromPlaceId: fromPlace.id,
    toPlaceId: toPlace.id,
    name: routeName(from, to),
    normalizedKey: buildRouteNormalizedKey(fromPlace.name, toPlace.name),
    routeType: ROUTE_TYPE_TRANSFER,
    durationMinutes: route.durationMinutes,
    distanceKm: route.distanceKm,
    notes: operationalNotes(code, route),
    isActive: true,
  };
}

function requirePlaceDefinition(key: string) {
  const definition = JORDAN_TRANSFER_PLACES.find((candidate) => candidate.key === key);
  if (!definition) throw new Error(`Unknown Jordan transfer place key: ${key}`);
  return definition;
}

function isSamePersistedRoute(existing: JordanTransferRoute, data: RouteWriteData) {
  return (
    existing.fromPlaceId === data.fromPlaceId &&
    existing.toPlaceId === data.toPlaceId &&
    existing.name === data.name &&
    existing.routeType === data.routeType &&
    existing.durationMinutes === data.durationMinutes &&
    Number(existing.distanceKm) === data.distanceKm &&
    existing.notes === data.notes &&
    existing.isActive === data.isActive
  );
}

function groupRoutesByNormalizedKey(routes: JordanTransferRoute[]) {
  const grouped = new Map<string, JordanTransferRoute[]>();
  for (const route of routes) {
    const matches = grouped.get(route.normalizedKey) || [];
    matches.push(route);
    grouped.set(route.normalizedKey, matches);
  }
  return grouped;
}

function chooseCanonicalRoute(routes: JordanTransferRoute[]) {
  return (
    routes.find((route) => route.isActive !== false && route.routeType === ROUTE_TYPE_TRANSFER) ||
    routes.find((route) => route.isActive !== false) ||
    routes.find((route) => route.routeType === ROUTE_TYPE_TRANSFER) ||
    routes[0]
  );
}

function printPlan(logger: Logger, rows: PlannedRoute[]) {
  logger.log('Route Code | From | To | DistanceKm | DurationMinutes | Action');
  for (const row of rows) {
    logger.log(`${row.code} | ${row.from} | ${row.to} | ${row.distanceKm} | ${row.durationMinutes} | ${row.action}`);
  }
}

function printMissingPlaceReport(logger: Logger, missingPlaces: string[]) {
  if (missingPlaces.length === 0) return;
  logger.warn('Missing canonical places:');
  for (const label of missingPlaces) {
    logger.warn(`- ${label}`);
  }
}

export async function seedJordanTransferRouteLibrary(prisma: PrismaLike, options: SeedOptions = {}): Promise<SeedResult> {
  const dryRun = options.dryRun ?? true;
  const logger = options.logger || console;
  const places = await prisma.place.findMany({
    where: {
      isActive: true,
      country: { equals: 'Jordan', mode: 'insensitive' },
    },
  });
  const resolvedPlaces = resolvePlaces(places);
  const existingRoutes = await prisma.route.findMany({
    where: {},
  });
  const existingByKey = groupRoutesByNormalizedKey(existingRoutes);
  const missing = new Set<string>();
  const reportedDuplicateKeys = new Set<string>();
  const planned: PlannedRoute[] = [];
  const result: SeedResult = {
    dryRun,
    planned,
    missingPlaces: [],
    duplicateCollisions: [],
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
  };

  for (const route of JORDAN_TRANSFER_ROUTES) {
    const fromDefinition = requirePlaceDefinition(route.from);
    const toDefinition = requirePlaceDefinition(route.to);
    const code = routeCode(fromDefinition, toDefinition);
    const fromPlace = resolvedPlaces.get(route.from);
    const toPlace = resolvedPlaces.get(route.to);

    if (!fromPlace || !toPlace) {
      if (!fromPlace) missing.add(fromDefinition.label);
      if (!toPlace) missing.add(toDefinition.label);
      planned.push({
        code,
        from: fromDefinition.label,
        to: toDefinition.label,
        distanceKm: route.distanceKm,
        durationMinutes: route.durationMinutes,
        action: 'SKIP_MISSING_PLACE',
      });
      result.skipped += 1;
      continue;
    }

    const data = buildRouteData(route, fromPlace, toPlace);
    const existingMatches = existingByKey.get(data.normalizedKey) || [];
    const existing = chooseCanonicalRoute(existingMatches);
    if (existingMatches.length > 1 && !reportedDuplicateKeys.has(data.normalizedKey)) {
      reportedDuplicateKeys.add(data.normalizedKey);
      const collision = `${code} (${data.normalizedKey}) matched ${existingMatches.length} existing routes; updating ${existing.id}`;
      result.duplicateCollisions.push(collision);
      logger.warn(`Duplicate route normalizedKey collision: ${collision}`);
    }
    const action = existing ? (isSamePersistedRoute(existing, data) ? 'UNCHANGED' : 'UPDATE') : 'CREATE';
    planned.push({
      code,
      from: fromDefinition.label,
      to: toDefinition.label,
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      normalizedKey: data.normalizedKey,
      action,
    });

    if (action === 'UNCHANGED') {
      result.unchanged += 1;
      continue;
    }

    if (dryRun) {
      if (action === 'CREATE') result.created += 1;
      else result.updated += 1;
      continue;
    }

    if (existing) {
      await prisma.route.update({ where: { id: existing.id }, data });
      existingByKey.set(data.normalizedKey, [{ ...existing, ...data }]);
      result.updated += 1;
    } else {
      const created = await prisma.route.create({ data });
      existingByKey.set(data.normalizedKey, [created]);
      result.created += 1;
    }
  }

  result.missingPlaces = [...missing].sort();
  printPlan(logger, planned);
  printMissingPlaceReport(logger, result.missingPlaces);
  return result;
}
