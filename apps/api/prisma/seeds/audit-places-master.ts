import { PrismaClient } from '@prisma/client';
import { applyPlaceMasterSelectorCanonicalization, getCanonicalPlaceAliasKey, isPollutedPlaceSelectorRow, resolveCanonicalPlaceId } from '../../src/places/place-master-canonicalization';

type PrismaLike = Record<string, any>;
type Logger = Pick<Console, 'log' | 'warn'>;

type PlaceRow = {
  id: string;
  name: string;
  type?: string | null;
  city?: string | null;
  country?: string | null;
  isActive?: boolean | null;
  _count?: {
    fromRoutes?: number;
    toRoutes?: number;
    fromVehicleRates?: number;
    toVehicleRates?: number;
  };
};

type PlaceMasterFinding = {
  place: string;
  type: string;
  city: string;
  references: string;
  problem: string;
  suggestedAction: string;
};

type PlaceMasterAuditSummary = {
  placesChecked: number;
  findings: number;
  pollutedRows: number;
  duplicateAliasRows: number;
  referencedRows: number;
  unreferencedRows: number;
  canonicalMappingsApplied: number;
  selectorHiddenRows: number;
  preservedHistoricalRows: number;
};

const POLLUTED_PLACE_PATTERNS: Array<{ pattern: RegExp; problem: string }> = [
  { pattern: /\b[1-9]\s*d\b/i, problem: 'Duration/package label in place name.' },
  { pattern: /\b\d+\s*h\b/i, problem: 'Duration/service-hours label in place name.' },
  { pattern: /\bpackage\b/i, problem: 'Package/product label in place name.' },
  { pattern: /\bprogram(?:me)?\b/i, problem: 'Program label in place name.' },
  { pattern: /\bdeduction\b/i, problem: 'Deduction/pricing label in place name.' },
  { pattern: /\btransfer\s+not\s+part\b/i, problem: 'Transfer-not-part-of-program label in place name.' },
  { pattern: /\bfull\s*day\b/i, problem: 'Full-day service label in place name.' },
  { pattern: /\bhalf\s*day\b/i, problem: 'Half-day service label in place name.' },
  { pattern: /\bovernight\b/i, problem: 'Overnight operational label in place name.' },
  { pattern: /\bextra\s*(hour|hr|hrs|h)\b/i, problem: 'Extra-hour pricing label in place name.' },
  { pattern: /\bextra\s*km\b/i, problem: 'Extra-km pricing label in place name.' },
  { pattern: /\bdriver\b/i, problem: 'Driver service label in place name.' },
  { pattern: /\bstationary\b/i, problem: 'Stationary service label in place name.' },
  { pattern: /\bwaiting\b/i, problem: 'Waiting service label in place name.' },
  { pattern: /\bdisposal\b/i, problem: 'Disposal service label in place name.' },
  { pattern: /\bsupplier\s+(rate|service)\b/i, problem: 'Supplier rate/service label in place name or type.' },
  { pattern: /\b(service|pricing|rate|tariff|add\s*on)\b/i, problem: 'Operational pricing/service label in place name or type.' },
];

const SUPPLIER_PREFIX_PATTERNS = [
  /^(alpha|beta|test|demo)\s+/i,
  /^[a-z][a-z0-9&.' -]+\s+(bus|buses|limo|limousine|transport|transportation|travel|tours|tourism|coaster|coach|van)\b/i,
];

const CANONICAL_ALIAS_LABELS: Record<string, string> = {
  petra: 'Petra',
  qaiaairport: 'QAIA Airport',
  aqjairport: 'AQJ Airport',
  aqabacity: 'Aqaba City',
};

function normalize(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value: unknown) {
  return normalize(value).replace(/\s+/g, '');
}

function getReferenceCount(place: PlaceRow) {
  return (
    Number(place._count?.fromRoutes || 0) +
    Number(place._count?.toRoutes || 0) +
    Number(place._count?.fromVehicleRates || 0) +
    Number(place._count?.toVehicleRates || 0)
  );
}

function formatReferences(place: PlaceRow) {
  const counts = [
    Number(place._count?.fromRoutes || 0) + Number(place._count?.toRoutes || 0) ? `routes:${Number(place._count?.fromRoutes || 0) + Number(place._count?.toRoutes || 0)}` : '',
    Number(place._count?.fromVehicleRates || 0) + Number(place._count?.toVehicleRates || 0)
      ? `vehicleRates:${Number(place._count?.fromVehicleRates || 0) + Number(place._count?.toVehicleRates || 0)}`
      : '',
  ].filter(Boolean);
  return counts.length ? counts.join(', ') : '0';
}

function getPollutionProblems(place: PlaceRow) {
  const text = [place.name, place.type].filter(Boolean).join(' ');
  const problems = POLLUTED_PLACE_PATTERNS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.problem);
  if (SUPPLIER_PREFIX_PATTERNS.some((pattern) => pattern.test(place.name || ''))) {
    problems.push('Supplier/company prefix in place name.');
  }
  return Array.from(new Set(problems));
}

function isClearlyCanonicalAlias(place: PlaceRow, aliasKey: string) {
  return compact(place.name) === compact(CANONICAL_ALIAS_LABELS[aliasKey]);
}

function suggestedAction(place: PlaceRow, canonicalTarget?: string) {
  const references = getReferenceCount(place);
  const target = canonicalTarget ? ` Canonical target: ${canonicalTarget}.` : '';
  if (references > 0) {
    return `Preserve referenced row; later mark inactive/hidden if schema supports it, or add server-side selector exclusion.${target}`;
  }
  return `Unreferenced cleanup candidate; later hide/inactivate after review. Do not delete.${target}`;
}

function pushFinding(findings: PlaceMasterFinding[], place: PlaceRow, problem: string, canonicalTarget?: string) {
  findings.push({
    place: place.name || '(unnamed)',
    type: place.type || '-',
    city: place.city || '-',
    references: formatReferences(place),
    problem,
    suggestedAction: suggestedAction(place, canonicalTarget),
  });
}

function printReport(logger: Logger, findings: PlaceMasterFinding[]) {
  logger.log('Place | Type | City | References | Problem | Suggested Action');
  for (const finding of findings) {
    logger.log(`${finding.place} | ${finding.type} | ${finding.city} | ${finding.references} | ${finding.problem} | ${finding.suggestedAction}`);
  }
  if (findings.length === 0) {
    logger.log('No place master boundary findings.');
  }
}

export async function auditPlacesMaster(prisma: PrismaLike, options: { logger?: Logger } = {}) {
  const logger = options.logger || console;
  const places = (await prisma.place.findMany({
    include: {
      _count: {
        select: {
          fromRoutes: true,
          toRoutes: true,
          fromVehicleRates: true,
          toVehicleRates: true,
        },
      },
    },
    orderBy: [{ name: 'asc' }],
  })) as PlaceRow[];
  const findings: PlaceMasterFinding[] = [];
  const summary: PlaceMasterAuditSummary = {
    placesChecked: places.length,
    findings: 0,
    pollutedRows: 0,
    duplicateAliasRows: 0,
    referencedRows: 0,
    unreferencedRows: 0,
    canonicalMappingsApplied: 0,
    selectorHiddenRows: 0,
    preservedHistoricalRows: 0,
  };

  logger.log('Place Master Canonicalization Phase 2 audit. Dry run only; no records will be changed.');

  const selectorCanonicalization = applyPlaceMasterSelectorCanonicalization(places);
  summary.canonicalMappingsApplied = selectorCanonicalization.summary.canonicalMappingsApplied;
  summary.selectorHiddenRows = selectorCanonicalization.summary.selectorHiddenRows;
  summary.preservedHistoricalRows = places.filter((place) => {
    const canonicalId = resolveCanonicalPlaceId(place, places);
    const hidden = place.isActive === false || isPollutedPlaceSelectorRow(place) || canonicalId !== place.id;
    return hidden && getReferenceCount(place) > 0;
  }).length;

  const aliasGroups = new Map<string, PlaceRow[]>();
  for (const place of places) {
    const key = getCanonicalPlaceAliasKey(place);
    const group = aliasGroups.get(key) || [];
    group.push(place);
    aliasGroups.set(key, group);

    const problems = getPollutionProblems(place);
    if (problems.length > 0) {
      summary.pollutedRows += 1;
      if (getReferenceCount(place) > 0) summary.referencedRows += 1;
      else summary.unreferencedRows += 1;
      pushFinding(findings, place, problems.join(' '), CANONICAL_ALIAS_LABELS[key]);
    }
  }

  for (const [key, group] of aliasGroups) {
    if (!CANONICAL_ALIAS_LABELS[key] || group.length < 2) continue;

    const canonicalTarget = CANONICAL_ALIAS_LABELS[key];
    const canonical = group.find((place) => isClearlyCanonicalAlias(place, key)) || group[0];
    for (const place of group) {
      if (place.id === canonical.id) continue;
      summary.duplicateAliasRows += 1;
      if (getReferenceCount(place) > 0) summary.referencedRows += 1;
      else summary.unreferencedRows += 1;
      pushFinding(findings, place, `Duplicate/alias of ${canonicalTarget}.`, canonicalTarget);
    }
  }

  summary.findings = findings.length;
  printReport(logger, findings);
  logger.log(`Place Master audit summary: ${JSON.stringify(summary, null, 2)}`);
  return { summary, findings };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await auditPlacesMaster(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Place Master Canonicalization Phase 1 audit failed', error);
    process.exit(1);
  });
}
