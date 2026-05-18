type PlaceLike = {
  id: string;
  name: string;
  type?: string | null;
  city?: string | null;
  country?: string | null;
  isActive?: boolean | null;
};

export type PlaceMasterCanonicalizationSummary = {
  canonicalMappingsApplied: number;
  selectorHiddenRows: number;
  preservedHistoricalRows: number;
};

const CANONICAL_ALIAS_LABELS: Record<string, string> = {
  petra: 'Petra',
  qaiaairport: 'QAIA Airport',
  aqjairport: 'AQJ Airport',
  aqabacity: 'Aqaba City',
};

const POLLUTED_SELECTOR_PATTERNS = [
  /\s(?:-|->|→)\s/,
  /\bfull\s*day\b/i,
  /\bhalf\s*day\b/i,
  /\bextra\s*km\b/i,
  /\bextra\s*(hour|hr|hrs|h)\b/i,
  /\bdriver\s+overnight\b/i,
  /\bstationary\b/i,
  /\bwaiting\b/i,
  /\bdisposal\b/i,
  /\btransfer\s+deduction\b/i,
  /\bdeduction\b/i,
  /\bprogram(?:me)?\b/i,
  /\b[1-9]\s*d\b/i,
  /\bpackage\b/i,
  /\bsupplier\s+(rate|service)\b/i,
  /\bpricing\b/i,
  /\brate\b/i,
  /\bservice\b/i,
];

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

export function getCanonicalPlaceAliasKey(place: Pick<PlaceLike, 'name' | 'type' | 'city'>) {
  const name = normalize(place.name);
  if (/^petra(\s+[1-9]\s*d)?$/.test(name)) return 'petra';
  if (/^(qaia airport|queen alia international airport)$/.test(name)) return 'qaiaairport';
  if (/^(aqj airport|king hussein international airport)$/.test(name)) return 'aqjairport';
  if (/^(aqaba city|aqaba city center|aqaba city centre)$/.test(name)) return 'aqabacity';
  return compact(place.name);
}

export function isCanonicalPlaceAliasTarget(place: Pick<PlaceLike, 'name' | 'type' | 'city'>) {
  const key = getCanonicalPlaceAliasKey(place);
  const target = CANONICAL_ALIAS_LABELS[key];
  return Boolean(target && compact(place.name) === compact(target));
}

export function resolveCanonicalPlaceId(place: Pick<PlaceLike, 'id' | 'name' | 'type' | 'city'>, places: Array<Pick<PlaceLike, 'id' | 'name' | 'type' | 'city'>>) {
  const key = getCanonicalPlaceAliasKey(place);
  const target = CANONICAL_ALIAS_LABELS[key];
  if (!target) return place.id;
  return places.find((candidate) => getCanonicalPlaceAliasKey(candidate) === key && compact(candidate.name) === compact(target))?.id || place.id;
}

export function isPollutedPlaceSelectorRow(place: Pick<PlaceLike, 'name' | 'type'>) {
  const text = [place.name, place.type].filter(Boolean).join(' ');
  return POLLUTED_SELECTOR_PATTERNS.some((pattern) => pattern.test(text));
}

export function applyPlaceMasterSelectorCanonicalization<T extends PlaceLike>(
  places: T[],
  options: { includeIds?: string[] } = {},
) {
  const includeIds = new Set((options.includeIds || []).filter(Boolean));
  const output: T[] = [];
  const outputIds = new Set<string>();
  const summary: PlaceMasterCanonicalizationSummary = {
    canonicalMappingsApplied: 0,
    selectorHiddenRows: 0,
    preservedHistoricalRows: 0,
  };

  for (const place of places) {
    const canonicalId = resolveCanonicalPlaceId(place, places);
    const isAlias = canonicalId !== place.id;
    const hidden = place.isActive === false || isPollutedPlaceSelectorRow(place) || isAlias;

    if (hidden) {
      if (isAlias) summary.canonicalMappingsApplied += 1;
      summary.selectorHiddenRows += 1;
      if (includeIds.has(place.id)) {
        summary.preservedHistoricalRows += 1;
      } else {
        continue;
      }
    }

    if (!outputIds.has(place.id)) {
      output.push({ ...place, canonicalPlaceId: canonicalId, selectorHidden: hidden } as T);
      outputIds.add(place.id);
    }
  }

  return { places: output, summary };
}
