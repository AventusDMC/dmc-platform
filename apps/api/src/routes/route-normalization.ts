export function normalizeRouteName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s*(?:\u2194|<->|-->|->|=>|\u2192|\u2014|\u2013|-|\/|\bto\b)\s*/g, '_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function buildRouteNormalizedKey(fromPlaceName: string, toPlaceName: string) {
  return [normalizeRouteName(fromPlaceName), normalizeRouteName(toPlaceName)].filter(Boolean).join('_');
}

export function formatRouteName(fromPlaceName: string, toPlaceName: string) {
  return `${fromPlaceName.trim()} → ${toPlaceName.trim()}`;
}

export function normalizeRouteDisplayName(name: string | null | undefined, fromPlaceName: string, toPlaceName: string) {
  const raw = name?.trim() || formatRouteName(fromPlaceName, toPlaceName);

  return raw
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s*(?:\u2194|<->|-->|->|=>|\u2192|\u2014|\u2013|-|\/|\bto\b)\s*/g, ' → ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeRoutePair(fromPlaceName: string, toPlaceName: string) {
  return {
    from: normalizeRouteName(fromPlaceName),
    to: normalizeRouteName(toPlaceName),
    key: buildRouteNormalizedKey(fromPlaceName, toPlaceName),
  };
}

export function routePairsMatch(
  left: { fromPlaceName: string; toPlaceName: string },
  right: { fromPlaceName: string; toPlaceName: string },
) {
  const leftPair = normalizeRoutePair(left.fromPlaceName, left.toPlaceName);
  const rightPair = normalizeRoutePair(right.fromPlaceName, right.toPlaceName);

  return leftPair.from === rightPair.from && leftPair.to === rightPair.to;
}

